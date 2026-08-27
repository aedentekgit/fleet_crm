import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { sb, fmtMoney, esc, nextJobNo, jobNoFromQuoteNo, deduplicateJobs, checkLorryScheduleConflict, subscribeTable, isContractQuotation, getStorageData } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/common/Pagination';
import {
  Search,
  X,
  List,
  LayoutGrid,
  Truck,
  User,
  Users,
  UserCheck,
  Play,
  CheckCircle2,
  Check,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Calendar,
  Clock,
  ArrowRight,
  Inbox,
  Eye,
  Building2,
  Package,
  FileText,
  ChevronRight,
  MapPin,
  Sparkles
} from 'lucide-react';

const COLS = [
  ['unassigned', 'Unassigned'],
  ['assigned', 'Assigned'],
  ['in_transit', 'In Transit'],
  ['delivered', 'Delivered']
];

export function getJobDisplayDate(card) {
  if (!card) return 'Today';
  const targetDate = card.collection_date || card.order_date || card.delivery_date || card.arrived_date;
  if (targetDate && typeof targetDate === 'string' && targetDate.trim()) {
    const parts = targetDate.trim().split(/[\/\.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      } else {
        const dt = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      }
    }
    return targetDate;
  }
  if (card.created_at) {
    const dt = new Date(card.created_at);
    if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
  return 'Today';
}

export function detectJobZone(locStr) {
  if (!locStr) return 'Zone A';
  const d = String(locStr).toLowerCase();
  if (d.includes('bangi') || d.includes('semenyih') || d.includes('kajang') || d.includes('cyberjaya') || d.includes('putrajaya') || d.includes('sepang') || d.includes('klia') || d.includes('cheras')) return 'Zone B';
  if (d.includes('klang') || d.includes('port klang') || d.includes('shah alam') || d.includes('subang') || d.includes('petaling') || d.includes('puchong') || d.includes('kuala lumpur') || d.includes('kl') || d.includes('selayang') || d.includes('rawang') || d.includes('batu caves') || d.includes('sunway')) return 'Zone C';
  if (d.includes('johor') || d.includes('pasir gudang') || d.includes('tangkak') || d.includes('muar') || d.includes('batu pahat') || d.includes('kluang') || d.includes('kulai') || d.includes('ipoh') || d.includes('penang') || d.includes('perak') || d.includes('kedah') || d.includes('kuantan') || d.includes('pahang') || d.includes('perlis') || d.includes('terengganu') || d.includes('kelantan')) return 'Zone D';
  if (d.includes('melaka') || d.includes('nilai') || d.includes('seremban') || d.includes('senawang') || d.includes('negeri sembilan') || d.includes('rembau') || d.includes('ayer keroh')) return 'Zone A';
  return 'Zone A';
}

export function isLorryZoneMatch(lorryZone, jobZone, pickupLocation) {
  if (!lorryZone) return false;
  const lz = String(lorryZone).toLowerCase().trim();
  if (!lz) return false;
  const jz = String(jobZone || '').toLowerCase().trim();
  const pl = String(pickupLocation || '').toLowerCase().trim();

  // If no specific job zone or pickup location required, consider matched
  if (!jz && !pl) return true;

  // 1. Direct contains either way
  if (jz && (lz.includes(jz) || jz.includes(lz))) return true;

  // 2. Zone letter match (e.g. Zone A <-> Zone A, Zone A <-> a)
  const lzLetter = lz.match(/zone\s*([a-f])/i)?.[1]?.toLowerCase() || (lz.length === 1 ? lz : null);
  const jzLetter = jz.match(/zone\s*([a-f])/i)?.[1]?.toLowerCase() || (jz.length === 1 ? jz : null);
  if (lzLetter && jzLetter && lzLetter === jzLetter) return true;

  // 3. Match against detected zone from pickup location
  if (pl) {
    const detected = detectJobZone(pl).toLowerCase();
    if (lz.includes(detected) || detected.includes(lz)) return true;
    const detLetter = detected.match(/zone\s*([a-f])/i)?.[1]?.toLowerCase();
    if (lzLetter && detLetter && lzLetter === detLetter) return true;

    // 4. City / region keyword match
    const locKeywords = ['senawang', 'nilai', 'seremban', 'melaka', 'klang', 'shah alam', 'subang', 'puchong', 'kajang', 'bangi', 'johor', 'tangkak', 'muar', 'ipoh', 'penang', 'kuantan'];
    for (const kw of locKeywords) {
      if (pl.includes(kw) && lz.includes(kw)) return true;
    }
  }

  return false;
}

export function isLorrySpecMatch(lorryCapacity, jobSpec, jobWeight, jobCargo) {
  const reqStr = [jobSpec, jobWeight, jobCargo].filter(Boolean).join(' ').toLowerCase().trim();
  if (!reqStr) return true; // If customer has no specific spec requirement, consider matched

  const lCap = String(lorryCapacity || '').toLowerCase().trim();
  if (!lCap) return false;

  const normReq = reqStr.replace(/\s+/g, ' ');
  const normLCap = lCap.replace(/\s+/g, ' ');

  // 1. Direct contains either way
  if (normLCap.includes(normReq) || normReq.includes(normLCap)) return true;

  // 2. Extract tonnage numbers (e.g. 1 ton, 3 ton, 5 ton, 3-5 ton, 3 & 5 ton, 10 ton, 14 ton, 20 ton)
  const extractTons = (s) => {
    const matches = [];
    const re = /\b(\d+)(?:\s*(?:-|&|to|\/)\s*(\d+))?\s*tons?/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m[1]) matches.push(parseInt(m[1], 10));
      if (m[2]) matches.push(parseInt(m[2], 10));
    }
    return matches;
  };

  // 3. Extract feet length numbers (e.g. 9ft, 9 ft, 10ft, 14ft, 17ft, 18ft, 20ft, 24ft, 30ft, 40ft, 50ft)
  const extractFt = (s) => {
    const matches = [];
    const re = /\b(\d+)\s*(?:ft|feet|')/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m[1]) matches.push(parseInt(m[1], 10));
    }
    return matches;
  };

  const reqTons = extractTons(normReq);
  const lCapTons = extractTons(normLCap);
  const reqFt = extractFt(normReq);
  const lCapFt = extractFt(normLCap);

  // If both have tonnage specified, they MUST match tonnage
  let tonMatched = null;
  if (reqTons.length > 0 && lCapTons.length > 0) {
    tonMatched = reqTons.some(t => lCapTons.includes(t));
    if (!tonMatched) return false; // Ton conflict (e.g. 1 ton vs 20 ton)
  }

  // If both have feet specified, they MUST match feet
  let ftMatched = null;
  if (reqFt.length > 0 && lCapFt.length > 0) {
    ftMatched = reqFt.some(f => lCapFt.includes(f));
    if (!ftMatched) return false; // Ft conflict (e.g. 9ft vs 40ft)
  }

  if (tonMatched === true || ftMatched === true) return true;

  // 4. Key spec / feet / trailer tokens
  const keyTokens = [
    '50ft', '40ft', '30ft', '24ft', '20ft', '18ft', '17ft', '14ft', '10ft', '9ft', '9 ft',
    'curtain sider', 'curtain', 'side curtain', 'box trailer', 'box truck', 'trailer', 'bonded',
    '20 ton', '14 ton', '10 ton', '5 ton', '3 ton', '1 ton'
  ];

  for (const tok of keyTokens) {
    if (normReq.includes(tok) && normLCap.includes(tok)) return true;
  }

  return false;
}

export default function JobBoard({ onRequestConfirm }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [jobs, setJobs] = useState(() => getStorageData('jobs'));
  const [lorries, setLorries] = useState(() => getStorageData('lorries'));
  const [drivers, setDrivers] = useState(() => getStorageData('drivers'));
  const [focusId, setFocusId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [assignModalJob, setAssignModalJob] = useState(null);
  const [approveModalJob, setApproveModalJob] = useState(null);
  const [viewJobModal, setViewJobModal] = useState(null);

  // View switch and filter states
  const [viewMode, setViewMode] = useState('list'); // Default to 'list' view first
  const [searchQuery, setSearchQuery] = useState('');
  const [urgentFilter, setUrgentFilter] = useState('all'); // 'all' | 'urgent_only'
  const [lorryFilter, setLorryFilter] = useState('all'); // 'all' | 'unassigned' | lorry_id

  const loadData = useCallback(async () => {
    let j = [], l = [], d = [], allQuotes = [];
    if (sb) {
      try {
        const res = await Promise.all([
          sb.from('jobs').select('*, customer:customers(company_name), job_crew(role, driver:drivers(id,name))').order('created_at', { ascending: false }),
          sb.from('lorries').select('*'),
          sb.from('drivers').select('*').order('name'),
          sb.from('quotations').select('*, customer:customers(company_name)').order('created_at', { ascending: false })
        ]);
        j = (res[0].data || []).filter(item => item && item.status !== 'cancelled');
        l = res[1].data || [];
        d = res[2].data || [];
        allQuotes = res[3].data || [];

        const quoteMap = new Map();
        allQuotes.forEach(q => {
          if (q.id) quoteMap.set(String(q.id), q);
          if (q.quote_no) quoteMap.set(String(q.quote_no), q);
          if (q.quote_no) quoteMap.set(String(q.quote_no).replace('RJ-Q-', 'RJ-'), q);
        });

        // Enrich all database jobs with customer & dates from linked quotes
        j = j.map(job => {
          const linkedQ = quoteMap.get(String(job.quotation_id || '')) ||
                          quoteMap.get(String(job.job_no || '')) ||
                          quoteMap.get(String(job.customer_ref || '').replace('Quotation ', '')) ||
                          quoteMap.get(String(job.customer_ref || ''));
          let cDate = job.collection_date || job.order_date || '';
          let dDate = job.delivery_date || job.arrived_date || '';
          let pTime = job.pickup_time || '';
          let dTime = job.dropoff_time || '';

          let customer = job.customer;
          let customer_id = job.customer_id;
          let pickup = job.pickup_location;
          let dropoff = job.dropoff_location;
          let rate = job.rate_amount;
          let spec = job.lorry_spec;
          let special = job.special_instructions;

          let resolvedJobNo = linkedQ?.quote_no || job.job_no;
          if (linkedQ && linkedQ.quote_no) {
            const syncd = jobNoFromQuoteNo(linkedQ.quote_no);
            if (syncd) resolvedJobNo = syncd;
          } else if (job.job_no) {
            const syncd = jobNoFromQuoteNo(job.job_no);
            if (syncd) resolvedJobNo = syncd;
          }

          if (linkedQ) {
            if (!cDate) cDate = linkedQ.collection_date || linkedQ.order_date || '';
            if (!dDate) dDate = linkedQ.delivery_date || linkedQ.arrived_date || linkedQ.collection_date || '';
            if (!pTime) pTime = linkedQ.pickup_time || '';
            if (!dTime) dTime = linkedQ.dropoff_time || '';

            if (linkedQ.customer?.company_name) {
              customer = linkedQ.customer;
              customer_id = linkedQ.customer_id || customer_id;
            } else if (linkedQ.customer_name) {
              customer = { company_name: linkedQ.customer_name };
              customer_id = linkedQ.customer_id || customer_id;
            }

            if (!special && linkedQ.special_instructions) {
              special = linkedQ.special_instructions;
            }
          }

          return {
            ...job,
            job_no: resolvedJobNo,
            quote_no: linkedQ?.quote_no || job.quote_no || resolvedJobNo,
            is_approved: job.is_approved === 1 || job.is_approved === true || Boolean(job.approved_at) ? 1 : 0,
            customer: customer || job.customer,
            customer_id: customer_id || job.customer_id,
            pickup_location: pickup || job.pickup_location,
            dropoff_location: dropoff || job.dropoff_location,
            pickup_zone: job.pickup_zone || linkedQ?.pickup_zone || linkedQ?.collection_zone || (pickup ? detectJobZone(pickup) : '') || 'Zone A',
            dropoff_zone: job.dropoff_zone || linkedQ?.dropoff_zone || linkedQ?.unloading_zone || (dropoff ? detectJobZone(dropoff) : '') || 'Zone B',
            zone: job.zone || linkedQ?.zone || linkedQ?.pickup_zone || (pickup ? detectJobZone(pickup) : '') || 'Zone A',
            rate_amount: rate !== undefined ? rate : job.rate_amount,
            lorry_spec: spec || linkedQ?.lorry_spec || job.lorry_spec,
            special_instructions: special || job.special_instructions,
            collection_date: cDate,
            delivery_date: dDate || cDate,
            pickup_time: pTime,
            dropoff_time: dTime
          };
        });

        // Filter out contract rate card records and cancelled jobs from active job list
        j = j.filter(job => {
          if (!job) return false;
          if (job.status === 'cancelled') return false;
          if (isContractQuotation(job)) return false;
          if (job.is_contract === true || job.is_contract === 1 || job.quote_type === 'contract') return false;
          if (job.special_instructions && typeof job.special_instructions === 'string' && job.special_instructions.startsWith('{')) {
            try {
              const parsed = JSON.parse(job.special_instructions);
              if (parsed.routes && Array.isArray(parsed.routes)) {
                return false;
              }
            } catch (_) {}
          }
          return true;
        });

        // Combine approved trip quotations that do not yet have a job record
        const existingQuoteIds = new Set(j.map(job => String(job.quotation_id || '')).filter(Boolean));
        const existingJobNos = new Set(j.map(job => String(job.job_no || '')).filter(Boolean));

        const isTripQuote = (q) => {
          if (!q) return false;
          if (isContractQuotation(q)) return false;
          if (q.is_contract === true || q.is_contract === 1 || q.quote_type === 'contract') return false;
          if (q.special_instructions && typeof q.special_instructions === 'string' && q.special_instructions.startsWith('{')) {
            return false;
          }
          if (!q.collection_date && !q.order_date && !q.pickup_time) return false;
          return true;
        };

        const approvedQuotes = allQuotes.filter(q => q && isTripQuote(q) && (q.status === 'approved' || (q.owner_approved_at && q.status !== 'assigned' && q.status !== 'in_transit' && q.status !== 'delivered' && q.status !== 'cancelled')));

        for (const q of approvedQuotes) {
          const qIdStr = String(q.id || '');
          const qQuoteNoStr = String(q.quote_no || '');
          const virtualJobNo = q.quote_no || jobNoFromQuoteNo(q.quote_no) || (qQuoteNoStr ? qQuoteNoStr.replace('RJ-Q-', 'RJ-') : ('RJ-' + qIdStr.slice(-4)));

          if (qIdStr && !existingQuoteIds.has(qIdStr) && !existingJobNos.has(virtualJobNo) && !existingJobNos.has(qQuoteNoStr)) {
            const custName = q.customer?.company_name || q.customer_name || (q.pickup_location && !q.pickup_location.toLowerCase().startsWith('pt ') && !q.pickup_location.toLowerCase().startsWith('no') ? q.pickup_location.split(',')[0].trim() : null) || 'Direct Customer';
            j.unshift({
              id: q.id || ('q_job_' + Date.now()),
              job_no: virtualJobNo,
              quote_no: q.quote_no || virtualJobNo,
              quotation_id: q.id,
              customer_id: q.customer_id || null,
              customer: q.customer || { company_name: custName },
              customer_ref: q.customer_ref || ('Quotation ' + (q.quote_no || qIdStr)),
              pickup_location: q.pickup_location || q.pickup || 'Pickup Location',
              dropoff_location: q.dropoff_location || q.dropoff || 'Dropoff Location',
              pickup_zone: q.pickup_zone || q.collection_zone || q.zone || '',
              dropoff_zone: q.dropoff_zone || q.unloading_zone || q.zone || '',
              zone: q.zone || q.pickup_zone || '',
              cargo_desc: q.cargo_desc || q.weight_desc || q.lorry_spec || 'General Cargo',
              lorry_spec: q.lorry_spec || '',
              weight_desc: q.weight_desc || '',
              rate_amount: q.rate_amount || q.quoted_rate || 0,
              urgent: q.urgent ? 1 : 0,
              special_instructions: q.special_instructions || '',
              collection_date: q.collection_date || q.order_date || '',
              delivery_date: q.delivery_date || q.arrived_date || q.collection_date || '',
              pickup_time: q.pickup_time || '',
              dropoff_time: q.dropoff_time || '',
              status: 'unassigned',
              is_approved: 1,
              approved_at: q.owner_approved_at || q.created_at || new Date().toISOString(),
              billed_status: 'pending',
              created_at: q.created_at || new Date().toISOString()
            });
            existingQuoteIds.add(qIdStr);
            existingJobNos.add(virtualJobNo);
          }
        }

        // Deduplicate in-memory view with canonical key matcher
        j = deduplicateJobs(j);

        // Build Sales & Targets lorry zone map (zone strictly depends ONLY on Sales & Targets & active/delivered orders)
        let fleetSalesList = [];
        try {
          const rawFleet = localStorage.getItem('rens_fleet_sales_records_v10');
          if (rawFleet) fleetSalesList = JSON.parse(rawFleet);
        } catch (_) {}

        const salesZoneMap = new Map();
        if (Array.isArray(fleetSalesList) && fleetSalesList.length > 0) {
          fleetSalesList.forEach(fs => {
            if (fs && fs.plate_no && fs.zone) {
              salesZoneMap.set((fs.plate_no || '').replace(/\s+/g, '').toUpperCase(), fs.zone);
            }
          });
        }

        // Live trips in jobs override / provide real-time zone
        (j || []).forEach(job => {
          if (!job || job.status === 'cancelled' || job.status === 'unassigned') return;
          let plate = job.lorry?.plate_no || job.plate_no || '';
          if (!plate && job.lorry_id) {
            const matched = (l || []).find(itm => String(itm.id) === String(job.lorry_id));
            if (matched?.plate_no) plate = matched.plate_no;
            else if (!String(job.lorry_id).startsWith('lorry-') && !String(job.lorry_id).startsWith('live_')) plate = job.lorry_id;
          }
          const pNorm = (plate || '').replace(/\s+/g, '').toUpperCase();
          if (!pNorm) return;

          if (job.status === 'in_transit' || job.status === 'assigned') {
            const pz = job.pickup_zone || job.collection_zone || job.origin_zone || job.zone;
            if (pz) salesZoneMap.set(pNorm, pz);
          } else if (job.status === 'delivered') {
            const dz = job.dropoff_zone || job.delivery_zone || job.destination_zone || job.zone;
            if (dz) salesZoneMap.set(pNorm, dz);
          }
        });

        // Set lorry zone ONLY if the lorry exists in Sales & Targets / active orders (no fallback for new lorries)
        l = (l || []).map((item) => {
          if (!item) return item;
          const pNorm = (item.plate_no || '').replace(/\s+/g, '').toUpperCase();
          const targetZone = salesZoneMap.get(pNorm) || (item.zone ? item.zone : null);
          return {
            ...item,
            zone: targetZone || null
          };
        });

        // Ensure any lorry configured in Sales & Targets is present in the list
        const lorryMapByPlate = new Map();
        (l || []).forEach(item => {
          if (item && item.plate_no) {
            lorryMapByPlate.set((item.plate_no || '').replace(/\s+/g, '').toUpperCase(), item);
          }
        });

        if (Array.isArray(fleetSalesList) && fleetSalesList.length > 0) {
          fleetSalesList.forEach((fs, idx) => {
            const normP = (fs.plate_no || '').replace(/\s+/g, '').toUpperCase();
            if (!lorryMapByPlate.has(normP)) {
              const newLorry = {
                id: fs.id ? `lorry-${fs.id}` : `lorry-${idx + 1}`,
                plate_no: fs.plate_no,
                capacity_desc: fs.capacity_desc || '10 ton / 24ft Curtain Sider',
                status: (fs.status || 'Available').toLowerCase().replace(' ', '_'),
                zone: fs.zone || salesZoneMap.get(normP) || null,
                roadtax_expiry: '2027-04-15',
                puspakom_expiry: '2026-11-20',
                insurance_expiry: '2027-04-15'
              };
              l.push(newLorry);
              lorryMapByPlate.set(normP, newLorry);
            } else {
              const existing = lorryMapByPlate.get(normP);
              if (fs.zone) existing.zone = fs.zone;
              if (fs.capacity_desc && !existing.capacity_desc) existing.capacity_desc = fs.capacity_desc;
            }
          });
        }
      } catch (e) {
        console.warn('JobBoard load error:', e);
      }
    }
    setJobs(j);
    setLorries(l);
    setDrivers(d);
  }, []);

  useEffect(() => {
    loadData();
    // Subscribe to local event bus for cross-page reactivity
    const unsub1 = subscribeTable('jobs', loadData);
    const unsub2 = subscribeTable('lorries', loadData);
    const unsub3 = subscribeTable('job_crew', loadData);
    const unsub4 = subscribeTable('quotations', loadData);
    let ch = null;
    if (sb && typeof sb.channel === 'function') {
      ch = sb.channel('board')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quotations' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lorries' }, loadData)
        .subscribe();
    }
    return () => {
      unsub1(); unsub2(); unsub3(); unsub4();
      if (ch && typeof ch.unsubscribe === 'function') {
        try { ch.unsubscribe(); } catch (e) {}
      }
      if (sb && typeof sb.removeChannel === 'function') {
        try { sb.removeChannel(ch); } catch (e) {}
      }
    };
  }, [loadData]);

  const autoAssignHandledRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const jobNo = params.get('job_no');
    const autoAssign = params.get('assign');
    if ((jobNo || autoAssign) && jobs.length > 0) {
      let targetJob = null;
      if (jobNo) {
        targetJob = jobs.find(j => j.job_no === jobNo || j.id === jobNo);
      }
      if (!targetJob && autoAssign) {
        targetJob = jobs.find(j => j.status === 'unassigned');
      }
      if (targetJob) {
        setFocusId(targetJob.id);
        if (autoAssign && !autoAssignHandledRef.current) {
          autoAssignHandledRef.current = true;
          // Clear query params immediately so re-renders/navigation never re-trigger popup
          navigate('/board', { replace: true });
          if (targetJob.status === 'unassigned' && !assignModalJob) {
            setAssignModalJob(targetJob);
            toast(`Authorised order ${targetJob.job_no || ''} ready for driver & lorry assignment!`, 'ok');
          }
        }
      }
    }
  }, [location.search, jobs, navigate]);

  // Filtered jobs logic
  const filteredJobs = jobs.filter(job => {
    if (activeFilter !== 'all' && job.status !== activeFilter) return false;
    if (urgentFilter === 'urgent_only' && !job.urgent) return false;
    if (lorryFilter === 'unassigned') {
      if (job.lorry_id) return false;
    } else if (lorryFilter !== 'all') {
      if (job.lorry_id !== lorryFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const jNo = (job.job_no || '').toLowerCase();
      const cust = (job.customer?.company_name || '').toLowerCase();
      const pickup = (job.pickup_location || job.origin || '').toLowerCase();
      const dropoff = (job.dropoff_location || job.destination || '').toLowerCase();
      const lorry = lorries.find(l => l.id === job.lorry_id);
      const lorryPlate = (lorry?.plate_no || '').toLowerCase();
      const crewNames = (job.job_crew || []).map(c => (c.driver?.name || '').toLowerCase()).join(' ');

      const matches = jNo.includes(q) || cust.includes(q) || pickup.includes(q) || dropoff.includes(q) || lorryPlate.includes(q) || crewNames.includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
  }, [activeFilter, urgentFilter, lorryFilter, searchQuery]);

  const paginatedJobs = useMemo(() => {
    return filteredJobs.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredJobs, page, pageSize]);

  // Single key shortcuts binding
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (isInput || assignModalJob) return;

      const flat = filteredJobs.map(x => x.id);
      if (!flat.length) return;

      let curCard = filteredJobs.find(j => j.id === focusId);
      if (!curCard && flat.length) {
        setFocusId(flat[0]);
        curCard = filteredJobs.find(j => j.id === flat[0]);
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        let curIdx = flat.indexOf(focusId);
        const next = (curIdx + 1) % flat.length;
        setFocusId(flat[next]);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        let curIdx = flat.indexOf(focusId);
        const prev = (curIdx - 1 + flat.length) % flat.length;
        setFocusId(flat[prev]);
      } else if (e.key === 'h' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (curCard && viewMode === 'board') {
          const colKeys = COLS.map(([k]) => k);
          let curColIdx = colKeys.indexOf(curCard.status);
          if (curColIdx > 0) {
            let targetColIdx = curColIdx - 1;
            while (targetColIdx >= 0) {
              const matches = filteredJobs.filter(x => x.status === colKeys[targetColIdx]);
              if (matches.length > 0) {
                setFocusId(matches[0].id);
                break;
              }
              targetColIdx--;
            }
          }
        }
      } else if (e.key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (curCard && viewMode === 'board') {
          const colKeys = COLS.map(([k]) => k);
          let curColIdx = colKeys.indexOf(curCard.status);
          if (curColIdx < colKeys.length - 1) {
            let targetColIdx = curColIdx + 1;
            while (targetColIdx < colKeys.length) {
              const matches = filteredJobs.filter(x => x.status === colKeys[targetColIdx]);
              if (matches.length > 0) {
                setFocusId(matches[0].id);
                break;
              }
              targetColIdx++;
            }
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const f = filteredJobs.find(j => j.id === focusId);
        if (f) {
          if (f.status === 'unassigned') setAssignModalJob(f);
          else if (f.status === 'assigned') setStatus(f.id, 'in_transit');
          else if (f.status === 'in_transit') setStatus(f.id, 'delivered');
        }
      } else if (e.key === 'a') {
        e.preventDefault();
        const f = filteredJobs.find(j => j.id === focusId);
        if (f && f.status === 'unassigned') {
          setAssignModalJob(f);
        }
      } else if (e.key === 's') {
        e.preventDefault();
        const f = filteredJobs.find(j => j.id === focusId);
        if (f && f.status === 'assigned') setStatus(f.id, 'in_transit');
      } else if (e.key === 'v') {
        e.preventDefault();
        const f = filteredJobs.find(j => j.id === focusId);
        if (f && f.status === 'in_transit') setStatus(f.id, 'delivered');
      } else if (e.key === 'x') {
        e.preventDefault();
        const f = filteredJobs.find(j => j.id === focusId);
        if (f) cancelJob(f.id);
      } else if (e.key === 'n') {
        e.preventDefault();
        navigate('/quotations?new=1');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredJobs, focusId, assignModalJob, approveModalJob, navigate, viewMode]);

  const isJobApproved = (card) => {
    if (!card) return false;
    return Boolean(card.is_approved === 1 || card.is_approved === true || card.approved_at || card.lorry_id || card.driver_id || card.status === 'assigned' || card.status === 'in_transit' || card.status === 'delivered');
  };

  const handleConfirmApproveJob = async (jobToApprove) => {
    if (!jobToApprove) return;
    const id = jobToApprove.id;
    const nowIso = new Date().toISOString();
    const patch = {
      is_approved: 1,
      approved_at: nowIso
    };

    if (sb) {
      try {
        await sb.from('jobs').update(patch).eq('id', id);
        if (jobToApprove.job_no) {
          await sb.from('jobs').update(patch).eq('job_no', jobToApprove.job_no);
        }
        if (jobToApprove.quotation_id) {
          await sb.from('jobs').update(patch).eq('quotation_id', jobToApprove.quotation_id);
        }

        const qPatch = { status: 'approved', owner_approved_at: nowIso };
        if (jobToApprove.quotation_id) {
          await sb.from('quotations').update(qPatch).eq('id', jobToApprove.quotation_id);
        }
        if (jobToApprove.id) {
          await sb.from('quotations').update(qPatch).eq('id', jobToApprove.id);
        }
        if (jobToApprove.job_no) {
          const qNo = jobToApprove.job_no.replace('RJ-', 'RJ-Q-');
          await sb.from('quotations').update(qPatch).eq('quote_no', qNo);
        }
      } catch (e) {
        console.warn('Job approval update error:', e);
      }
    }

    try {
      const raw = localStorage.getItem('rens_db_jobs');
      if (raw) {
        const parsed = JSON.parse(raw);
        const updated = parsed.map(j => {
          if (j.id === id || (jobToApprove.job_no && j.job_no === jobToApprove.job_no)) {
            return { ...j, is_approved: 1, approved_at: nowIso };
          }
          return j;
        });
        localStorage.setItem('rens_db_jobs', JSON.stringify(updated));
      }
    } catch (_) {}

    try {
      const rawQ = localStorage.getItem('rens_db_quotations');
      if (rawQ) {
        const parsedQ = JSON.parse(rawQ);
        const updatedQ = parsedQ.map(q => {
          if (q.id === jobToApprove.quotation_id || q.id === id || (jobToApprove.job_no && q.quote_no === jobToApprove.job_no.replace('RJ-', 'RJ-Q-'))) {
            return { ...q, status: 'approved', owner_approved_at: nowIso };
          }
          return q;
        });
        localStorage.setItem('rens_db_quotations', JSON.stringify(updatedQ));
      }
    } catch (_) {}

    setJobs(prev => prev.map(j => {
      if (j.id === id || (jobToApprove.job_no && j.job_no === jobToApprove.job_no)) {
        return { ...j, is_approved: 1, approved_at: nowIso };
      }
      return j;
    }));

    if (viewJobModal?.id === id) {
      setViewJobModal(prev => prev ? { ...prev, is_approved: 1, approved_at: nowIso } : null);
    }

    setApproveModalJob(null);
    toast(`Job ${jobToApprove.job_no || ''} approved! Assign button is now active.`, 'ok');
  };

  const notifyApi = async (jobId) => {
    try {
      await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId }) });
    } catch (e) {}
  };

  const setStatus = (id, status) => {
    const job = jobs.find(j => j.id === id);
    const title = status === 'in_transit' ? 'Start Trip?' : (status === 'delivered' ? 'Mark Delivered?' : 'Update Status?');
    const message = status === 'in_transit'
      ? `Start trip for job ${job ? job.job_no : id}?`
      : (status === 'delivered' ? `Confirm that cargo for ${job ? job.job_no : id} has been delivered?` : `Update status to ${status}?`);
    const confirmText = status === 'in_transit' ? 'Start Trip' : (status === 'delivered' ? 'Mark Delivered' : 'Confirm');

    onRequestConfirm({
      title,
      message,
      confirmText,
      cancelText: 'Cancel',
      type: 'pri',
      onConfirm: async () => {
        const patch = { status };
        if (status === 'in_transit') patch.started_at = new Date().toISOString();
        if (status === 'delivered') patch.delivered_at = new Date().toISOString();
        if (sb) {
          try {
            await sb.from('jobs').update(patch).eq('id', id);
            if (job && job.job_no) {
              await sb.from('jobs').update(patch).eq('job_no', job.job_no);
            }
            if (job && job.quotation_id) {
              await sb.from('jobs').update(patch).eq('quotation_id', job.quotation_id);
            }
            if (status === 'delivered' && job && job.lorry_id) {
              const dropLoc = job.dropoff_location || job.dropoff || job.destination || '';
              const deliveredZone = job.dropoff_zone || job.drop_zone || (dropLoc ? detectJobZone(dropLoc) : '') || 'Zone A';
              await sb.from('lorries').update({ status: 'available', zone: deliveredZone }).eq('id', job.lorry_id);
            }
          } catch (e) {}
        }
        setJobs(prev => prev.map(j => {
          if (j.id === id) {
            return { ...j, status };
          }
          return j;
        }));
        if (status === 'delivered' && job && job.lorry_id) {
          const dropLoc = job.dropoff_location || job.dropoff || job.destination || '';
          const deliveredZone = job.dropoff_zone || job.drop_zone || (dropLoc ? detectJobZone(dropLoc) : '') || 'Zone A';
          setLorries(prev => prev.map(l => l.id === job.lorry_id ? { ...l, status: 'available', zone: deliveredZone } : l));
        }
        toast(status === 'in_transit' ? 'Trip started' : (status === 'delivered' ? 'Marked delivered' : 'Updated'), 'ok');
        notifyApi(id);
      }
    });
  };

  const cancelJob = (id) => {
    const job = jobs.find(j => j.id === id);
    onRequestConfirm({
      title: 'Cancel Job?',
      message: `Are you sure you want to cancel job ${job ? job.job_no : id}? This action cannot be undone.`,
      confirmText: 'Cancel Job',
      cancelText: 'Keep Job',
      type: 'danger',
      onConfirm: async () => {
        if (sb) {
          try {
            await sb.from('jobs').delete().eq('id', id);
            if (job && job.job_no) await sb.from('jobs').delete().eq('job_no', job.job_no);
            if (job && job.quotation_id) await sb.from('jobs').delete().eq('quotation_id', job.quotation_id);
            if (job && job.lorry_id) await sb.from('lorries').update({ status: 'available' }).eq('id', job.lorry_id);
          } catch (e) {}
        }
        try {
          const stored = localStorage.getItem('rens_db_jobs');
          if (stored) {
            const parsed = JSON.parse(stored);
            const cleaned = parsed.filter(j => j.id !== id && j.job_no !== job?.job_no);
            localStorage.setItem('rens_db_jobs', JSON.stringify(cleaned));
          }
        } catch (_) {}
        setJobs(prev => prev.filter(j => j.id !== id && j.job_no !== job?.job_no));
        toast('Job cancelled and removed', 'warn');
        loadAll();
      }
    });
  };

  const counts = {};
  COLS.forEach(([k]) => counts[k] = jobs.filter(x => x.status === k).length);
  const displayCols = activeFilter === 'all' ? COLS : COLS.filter(([k]) => k === activeFilter);

  const resolveCustomerName = (card) => {
    if (!card) return 'Direct Customer';
    return card.customer?.company_name ||
           card.customer_name ||
           (card.pickup_location && !card.pickup_location.toLowerCase().startsWith('pt ') && !card.pickup_location.toLowerCase().startsWith('no') ? card.pickup_location.split(',')[0].trim() : null) ||
           card.customer_ref?.split('|')[0]?.trim() ||
           'Direct Customer';
  };

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>
            Job Board
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--slate)', background: '#FFFFFF', padding: '4px 12px', borderRadius: '99px', border: '1px solid var(--line)' }}>
              Dispatch Operations
            </span>
          </h1>
          <div className="sub" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>Navigate cards with <kbd>J</kbd><kbd>K</kbd><kbd>H</kbd><kbd>L</kbd></span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span><kbd>A</kbd> Assign</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span><kbd>S</kbd> Start Trip</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span><kbd>V</kbd> Mark Delivered</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span><kbd>X</kbd> Cancel</span>
          </div>
        </div>
        <div className="tools" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn gh" onClick={() => navigate('/quotations')}>
            Quotations <kbd>G</kbd><kbd>Q</kbd>
          </button>
          <button className="btn pri" onClick={() => navigate('/quotations?new=1')}>
            New booking <kbd>N</kbd>
          </button>
        </div>
      </div>

      {/* Filter Status Chips Row */}
      <div className="statsrow" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
        <span className={`statchip ${activeFilter === 'all' ? 'on' : ''}`} onClick={() => setActiveFilter('all')}>
          Total<b>{jobs.length}</b>
        </span>
        {COLS.map(([k, label]) => (
          <span key={k} className={`statchip ${activeFilter === k ? 'on' : ''}`} onClick={() => setActiveFilter(k)}>
            {label}<b>{counts[k]}</b>
          </span>
        ))}
      </div>

      {/* Toolbar for Search, Filters, and View Switcher */}
      <div className="board-toolbar">
        {/* Left: Quick Search */}
        <div className="board-toolbar-left">
          <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search job #, customer, route, vehicle, driver..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '38px',
                padding: '0 32px 0 36px',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                fontSize: '0.88rem',
                outline: 'none',
                background: '#FAFAFA',
                boxSizing: 'border-box'
              }}
            />
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
              <Search size={15} strokeWidth={2.2} />
            </span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', opacity: 0.6, display: 'flex', alignItems: 'center', padding: 0 }}
                aria-label="Clear search"
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>

        {/* Right: Dropdowns & View Switch */}
        <div className="board-toolbar-right">
          {/* Lorry Assignment Filter */}
          <select
            value={lorryFilter}
            onChange={e => setLorryFilter(e.target.value)}
            style={{ height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '0.84rem', background: '#FAFAFA', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' }}
          >
            <option value="all">All Vehicles</option>
            <option value="unassigned">Unassigned Only</option>
            {lorries.map(l => (
              <option key={l.id} value={l.id}>{l.plate_no} ({l.capacity_desc || 'Vehicle'})</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={urgentFilter}
            onChange={e => setUrgentFilter(e.target.value)}
            style={{ height: '38px', padding: '0 12px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '0.84rem', background: '#FAFAFA', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' }}
          >
            <option value="all">All Priorities</option>
            <option value="urgent_only">Urgent Only</option>
          </select>

          {/* Reset Filters button */}
          {(searchQuery || lorryFilter !== 'all' || urgentFilter !== 'all' || activeFilter !== 'all') && (
            <button
              className="btn gh sm"
              onClick={() => { setSearchQuery(''); setLorryFilter('all'); setUrgentFilter('all'); setActiveFilter('all'); }}
              style={{ height: '38px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center' }}
            >
              Clear Filters
            </button>
          )}

          {/* View Switch Buttons */}
          <div className="view-switch-group">
            <button
              onClick={() => setViewMode('list')}
              className={`btn sm ${viewMode === 'list' ? 'pri' : 'gh'}`}
              style={{ borderRadius: '7px', height: '30px', padding: '0 12px', fontSize: '0.82rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <List size={14} strokeWidth={2.2} />
              List View
            </button>

          </div>
        </div>
      </div>

      {/* Main View Display (List View vs Board View) */}
      {viewMode === 'list' ? (
        <>
          {/* Desktop Table View */}
          <div className="desktop-table-container">
            <div className="tablecard tab-fade-in" style={{ width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
              <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ width: '11%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Order / Job # &amp; Date</th>
                    <th style={{ width: '13%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Customer</th>
                    <th style={{ width: '11%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Route</th>
                    <th style={{ width: '11%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Cargo / Specs</th>
                    <th style={{ width: '12%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Vehicle &amp; Crew</th>
                    <th style={{ width: '9%', textAlign: 'right', padding: '10px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Rate</th>
                    <th style={{ width: '14%', textAlign: 'center', padding: '10px 6px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Status</th>
                    <th style={{ width: '19%', textAlign: 'right', padding: '10px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.length > 0 ? (
                    paginatedJobs.map(card => {
                      const crew = (card.job_crew || []).sort((a, b) => a.role === 'driver' ? -1 : 1);
                      const lorry = lorries.find(l => l.id === card.lorry_id);
                      const pickup = card.pickup_location || card.origin || 'Port Klang';
                      const dropoff = card.dropoff_location || card.destination || 'Ipoh Depot';
                      const customerName = resolveCustomerName(card);
                      const rateText = card.rate_amount !== undefined && card.rate_amount !== null && card.rate_amount !== '' ? fmtMoney(card.rate_amount) : 'RM 0.00';
                      const weightText = card.weight_desc || card.cargo_summary || 'General Cargo';
                      const isFocused = focusId === card.id;

                      const isAppr = isJobApproved(card);

                      let statusBadge = null;
                      if (card.status === 'unassigned') {
                        statusBadge = <span className="badge amber" style={{ fontSize: '0.62rem', padding: '2px 6px', whiteSpace: 'nowrap' }}>Unassigned</span>;
                      } else if (card.status === 'assigned') {
                        statusBadge = <span className="badge blue" style={{ fontSize: '0.62rem', padding: '2px 6px', whiteSpace: 'nowrap' }}>Assigned</span>;
                      } else if (card.status === 'in_transit') {
                        statusBadge = <span className="badge ok" style={{ fontSize: '0.62rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}><span className="dot-pulse" style={{ color: '#F97316' }}></span> In Transit</span>;
                      } else if (card.status === 'delivered') {
                        statusBadge = <span className="badge green" style={{ fontSize: '0.62rem', padding: '2px 6px', whiteSpace: 'nowrap' }}>Delivered</span>;
                      }

                      let acts = null;
                      if (card.status === 'unassigned') {
                        acts = (
                          <button
                            className="btn pri sm"
                            style={{ height: '24px', padding: '0 6px', fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}
                            onClick={(e) => { e.stopPropagation(); setAssignModalJob(card); }}
                          >
                            <UserCheck size={10} strokeWidth={2.2} />
                            Assign
                          </button>
                        );
                      } else if (card.status === 'assigned') {
                        acts = (
                          <button className="btn navy sm" style={{ height: '24px', padding: '0 8px', fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setStatus(card.id, 'in_transit'); }}>
                            <Play size={9} strokeWidth={2.4} />
                            Start
                          </button>
                        );
                      } else if (card.status === 'in_transit') {
                        acts = (
                          <button className="btn navy sm" style={{ height: '24px', padding: '0 6px', fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setStatus(card.id, 'delivered'); }}>
                            <CheckCircle2 size={10} strokeWidth={2.2} />
                            Delivered
                          </button>
                        );
                      } else if (card.status === 'delivered') {
                        acts = <span className={`badge ${card.billed_status === 'sent' ? 'green' : 'amber'}`} style={{ fontSize: '0.62rem', padding: '2px 5px', flexShrink: 0 }}>{card.billed_status === 'sent' ? 'Billed' : 'To bill'}</span>;
                      }

                      return (
                        <tr
                          key={card.id}
                          className={isFocused ? 'focus' : ''}
                          onClick={() => setFocusId(card.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ verticalAlign: 'middle', padding: '8px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                              <span className="jno-pill" style={{ fontSize: '0.72rem', padding: '1px 4px' }}>{card.quote_no || card.job_no}</span>
                              {Boolean(card.urgent) && (
                                <span className="badge urgent" style={{ fontSize: '0.54rem', padding: '1px 3px', width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                  <AlertTriangle size={8} strokeWidth={2.5} />
                                  Urgent
                                </span>
                              )}
                              <div style={{ fontSize: '0.7rem', color: 'var(--navy-900)', fontWeight: 700 }}>
                                {getJobDisplayDate(card)}
                              </div>
                            </div>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '8px 6px', textAlign: 'left', overflow: 'hidden' }}>
                            <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={customerName}>
                              {customerName}
                            </div>
                            {card.customer_ref && <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ref: {card.customer_ref}</div>}
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '8px 6px', textAlign: 'left', overflow: 'hidden' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#F8FAFC', padding: '2px 5px', borderRadius: '6px', border: '1px solid #E2E8F0', maxWidth: '100%' }}>
                              <span className="r-dot pickup" style={{ flexShrink: 0 }}></span>
                              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '52px' }} title={pickup}>{pickup}</span>
                              <ArrowRight size={10} strokeWidth={2.4} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                              <span className="r-dot dropoff" style={{ flexShrink: 0 }}></span>
                              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '52px' }} title={dropoff}>{dropoff}</span>
                            </div>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '8px 6px', textAlign: 'left', overflow: 'hidden' }}>
                            <div className="cargo-spec-pill" style={{ display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontSize: '0.7rem', padding: '2px 5px' }} title={weightText}>
                              {weightText}
                            </div>
                            {card.special_instructions && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--orange-600)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={card.special_instructions.startsWith('{') ? 'Contract Rate Card Details' : card.special_instructions}>
                                <AlertTriangle size={10} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                                <span>{card.special_instructions.startsWith('{') ? 'Contract Rate Card' : card.special_instructions}</span>
                              </div>
                            )}
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '8px 6px', textAlign: 'left', overflow: 'hidden' }}>
                            {(lorry || crew.length > 0) ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start', maxWidth: '100%' }}>
                                {lorry && (
                                  <span className="plate-badge" style={{ fontSize: '0.68rem', padding: '1px 4px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Truck size={10} strokeWidth={2.2} />
                                    {lorry.plate_no}
                                  </span>
                                )}
                                {crew.map((c, idx) => (
                                  <span key={idx} style={{ fontSize: '0.7rem', color: 'var(--navy-800)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                    <User size={10} strokeWidth={2.2} />
                                    <span>{c.driver?.name || ''}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.74rem', color: 'var(--slate)', fontStyle: 'italic' }}>— Unassigned —</span>
                            )}
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '8px 8px', whiteSpace: 'nowrap' }}>
                            <div style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.82rem' }}>
                              {rateText}
                            </div>
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'center', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                              {statusBadge}
                            </div>
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '8px 8px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', flexWrap: 'nowrap' }}>
                              <button
                                className="btn gh sm"
                                style={{ height: '24px', padding: '0 5px', fontSize: '0.65rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
                                onClick={(e) => { e.stopPropagation(); setViewJobModal(card); }}
                                title="View Full Job Details"
                              >
                                <Eye size={10} strokeWidth={2.2} />
                                View
                              </button>
                              {acts}
                              <button className="btn-act-cancel" style={{ height: '24px', padding: '0 5px', fontSize: '0.65rem', flexShrink: 0 }} title="Cancel Job" onClick={(e) => { e.stopPropagation(); cancelJob(card.id); }}>
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--slate)', fontSize: '0.9rem' }}>
                        No jobs found matching your search or filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <Pagination
                currentPage={page}
                totalItems={filteredJobs.length}
                pageSize={pageSize}
                onPageChange={setPage}
                itemName="jobs"
              />
            </div>
          </div>

          {/* Native Mobile Cards View (Zero Horizontal Scroll) */}
          <div className="mobile-cards-container">
            {filteredJobs.length > 0 ? (
              paginatedJobs.map(card => {
                const crew = (card.job_crew || []).sort((a, b) => a.role === 'driver' ? -1 : 1);
                const lorry = lorries.find(l => l.id === card.lorry_id);
                const pickup = card.pickup_location || card.origin || 'Port Klang';
                const dropoff = card.dropoff_location || card.destination || 'Ipoh Depot';
                const customerName = resolveCustomerName(card);
                const rateText = card.rate_amount ? fmtMoney(card.rate_amount) : 'RM 1,850.00';
                const weightText = card.weight_desc || card.cargo_summary || 'General Cargo';
                const isFocused = focusId === card.id;

                const isAppr = isJobApproved(card);

                let statusBadge = null;
                if (card.status === 'unassigned') {
                  statusBadge = <span className="badge amber" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>Unassigned</span>;
                } else if (card.status === 'assigned') {
                  statusBadge = <span className="badge blue" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>Assigned</span>;
                } else if (card.status === 'in_transit') {
                  statusBadge = <span className="badge ok" style={{ fontSize: '0.68rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><span className="dot-pulse" style={{ color: '#F97316' }}></span> In Transit</span>;
                } else if (card.status === 'delivered') {
                  statusBadge = <span className="badge green" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>Delivered</span>;
                }

                let acts = null;
                if (card.status === 'unassigned') {
                  acts = (
                    <button className="btn pri sm" style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%' }} onClick={() => setAssignModalJob(card)}>
                      <UserCheck size={14} strokeWidth={2.2} />
                      Assign
                    </button>
                  );
                } else if (card.status === 'assigned') {
                  acts = (
                    <button className="btn navy sm" style={{ height: '36px', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%' }} onClick={() => setStatus(card.id, 'in_transit')}>
                      <Play size={12} strokeWidth={2.4} />
                      Start
                    </button>
                  );
                } else if (card.status === 'in_transit') {
                  acts = (
                    <button className="btn navy sm" style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%' }} onClick={() => setStatus(card.id, 'delivered')}>
                      <CheckCircle2 size={14} strokeWidth={2.2} />
                      Delivered
                    </button>
                  );
                } else if (card.status === 'delivered') {
                  acts = (
                    <span className={`badge ${card.billed_status === 'sent' ? 'green' : 'amber'}`} style={{ width: '100%', textAlign: 'center', padding: '8px 12px', fontSize: '0.78rem' }}>
                      {card.billed_status === 'sent' ? 'Invoice Billed' : 'Ready to Bill'}
                    </span>
                  );
                }

                return (
                  <div
                    key={card.id}
                    className={`mobile-card ${isFocused ? 'focus' : ''}`}
                    onClick={() => setFocusId(card.id)}
                  >
                    {/* Top Row: Job #, Date, Status, Urgent */}
                    <div className="mobile-card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span className="jno-pill" style={{ fontSize: '0.82rem', padding: '2px 8px', fontWeight: 800 }}>{card.quote_no || card.job_no}</span>
                        {Boolean(card.urgent) && (
                          <span className="badge urgent" style={{ fontSize: '0.62rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <AlertTriangle size={10} strokeWidth={2.5} /> Urgent
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--navy-900)', fontWeight: 700 }}>
                          {getJobDisplayDate(card)}
                        </span>
                        {statusBadge}
                      </div>
                    </div>

                    {/* Customer & Ref */}
                    <div>
                      <div className="mobile-card-title">{customerName}</div>
                      {card.customer_ref && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 600 }}>Ref / Contact:</span> {card.customer_ref}
                        </div>
                      )}
                    </div>

                    {/* Route Box (Full 2-Step Display) */}
                    <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem' }}>
                        <span className="r-dot pickup" style={{ flexShrink: 0, marginTop: '4px' }}></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ color: '#16A34A', fontSize: '0.68rem', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Origin Pickup</span>
                          <span style={{ fontWeight: 700, color: 'var(--navy-900)', wordBreak: 'break-word', display: 'block' }}>{pickup}</span>
                        </div>
                      </div>
                      <div style={{ height: '1px', background: '#E2E8F0', margin: '2px 0 2px 18px' }} />
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem' }}>
                        <span className="r-dot dropoff" style={{ flexShrink: 0, marginTop: '4px' }}></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ color: '#DC2626', fontSize: '0.68rem', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Destination Dropoff</span>
                          <span style={{ fontWeight: 700, color: 'var(--navy-900)', wordBreak: 'break-word', display: 'block' }}>{dropoff}</span>
                        </div>
                      </div>
                    </div>

                    {/* Cargo Specs & Special Instructions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span className="cargo-spec-pill" style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
                          {weightText}
                        </span>
                        <b style={{ fontSize: '0.95rem', color: 'var(--navy-900)' }}>{rateText}</b>
                      </div>
                      {card.special_instructions && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--orange-700)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <AlertTriangle size={11} strokeWidth={2.2} />
                          <span>{card.special_instructions.startsWith('{') ? 'Contract Rate Card' : card.special_instructions}</span>
                        </div>
                      )}
                    </div>

                    {/* Assigned Vehicle & Driver */}
                    {(lorry || crew.length > 0) && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: '#F8FAFC', padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        {lorry ? (
                          <span className="plate-badge" style={{ fontSize: '0.76rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Truck size={12} strokeWidth={2.2} />
                            {lorry.plate_no}
                          </span>
                        ) : <span style={{ fontSize: '0.72rem', color: 'var(--slate)' }}>No vehicle</span>}
                        {crew.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--navy-900)', fontWeight: 600 }}>
                            <User size={12} strokeWidth={2.2} />
                            <span>{crew.map(c => c.driver?.name).filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons Row */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                      <button
                        className="btn gh sm"
                        style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flex: '0 0 auto', padding: '0 12px' }}
                        onClick={() => setViewJobModal(card)}
                      >
                        <Eye size={13} strokeWidth={2.2} />
                        View
                      </button>
                      <div style={{ flex: 1 }}>
                        {acts}
                      </div>
                      <button
                        className="btn-act-cancel"
                        style={{ height: '36px', padding: '0 12px', fontSize: '0.78rem' }}
                        onClick={() => cancelJob(card.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--slate)', fontSize: '0.88rem', background: '#FFFFFF', borderRadius: '12px', border: '1px solid var(--line)' }}>
                No jobs found matching your search.
              </div>
            )}
            <Pagination
              currentPage={page}
              totalItems={filteredJobs.length}
              pageSize={pageSize}
              onPageChange={setPage}
              itemName="jobs"
              style={{ borderRadius: '12px', border: '1px solid var(--line)', marginTop: '12px' }}
            />
          </div>
        </>
      ) : (
        /* Board View (Kanban) */
        <div className="board grid4">
          {displayCols.map(([k, label]) => {
            const list = filteredJobs.filter(x => x.status === k);
            return (
              <div
                key={k}
                className="col"
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(k)}
              >
                <div className="colhead">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`c-tag ${k}`}>{label}</span>
                    <span className="cnt">{list.length}</span>
                  </div>
                </div>

                <div className="colbody">
                  {list.length > 0 ? (
                    list.map(card => {
                      const crew = (card.job_crew || []).sort((a, b) => a.role === 'driver' ? -1 : 1);
                      const lorry = lorries.find(l => l.id === card.lorry_id);
                      const pickup = card.pickup_location || card.origin || 'Port Klang';
                      const dropoff = card.dropoff_location || card.destination || 'Ipoh Depot';
                      const customerName = resolveCustomerName(card);
                      const rateText = card.rate_amount ? fmtMoney(card.rate_amount) : 'RM 1,850.00';
                      const weightText = card.weight_desc || card.cargo_summary || 'General Cargo';
                      const isFocused = focusId === card.id;

                      const isAppr = isJobApproved(card);

                      let acts = null;
                      if (card.status === 'unassigned') {
                        acts = (
                          <button className="btn pri sm" onClick={() => setAssignModalJob(card)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <UserCheck size={12} strokeWidth={2.2} />
                            Assign <kbd>A</kbd>
                          </button>
                        );
                      } else if (card.status === 'assigned') {
                        acts = (
                          <button className="btn navy sm" onClick={() => setStatus(card.id, 'in_transit')} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Play size={11} strokeWidth={2.4} />
                            Start <kbd>S</kbd>
                          </button>
                        );
                      } else if (card.status === 'in_transit') {
                        acts = (
                          <button className="btn navy sm" onClick={() => setStatus(card.id, 'delivered')} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} strokeWidth={2.2} />
                            Delivered <kbd>V</kbd>
                          </button>
                        );
                      } else if (card.status === 'delivered') {
                        acts = <span className={`badge ${card.billed_status === 'sent' ? 'green' : 'amber'}`}>{card.billed_status === 'sent' ? 'Billed' : 'To bill'}</span>;
                      }

                      return (
                        <div
                          key={card.id}
                          className={`jobcard ${isFocused ? 'focus' : ''}`}
                          data-job={card.id}
                          onClick={() => setFocusId(card.id)}
                        >
                          <div className="cardtop">
                            {/* Top Header Meta Row */}
                            <div className="card-meta-row">
                              <div className="card-meta-left">
                                <span className="jno-pill">{card.job_no}</span>
                                {Boolean(card.urgent) && (
                                  <span className="badge urgent" style={{ fontSize: '0.64rem', padding: '2px 6px', lineHeight: 1.2, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <AlertTriangle size={10} strokeWidth={2.5} />
                                    Urgent
                                  </span>
                                )}
                              </div>
                              <span className="rate-tag">{rateText}</span>
                            </div>

                            {/* Clean Route Bar Visualization */}
                            <div className="route-bar">
                              <div className="route-node">
                                <span className="r-dot pickup"></span>
                                <span className="r-name" title={pickup}>{pickup}</span>
                              </div>
                              <div className="route-connector">
                                <ArrowRight size={12} strokeWidth={2.4} style={{ color: 'var(--orange)' }} />
                              </div>
                              <div className="route-node">
                                <span className="r-dot dropoff"></span>
                                <span className="r-name" title={dropoff}>{dropoff}</span>
                              </div>
                            </div>

                            {/* Customer & Cargo Specs */}
                            <div className="card-client-block">
                              <div className="client-name">{customerName}</div>
                              <div className="cargo-spec-pill" title={weightText}>{weightText}</div>
                            </div>

                            {/* Schedule & Time Badges */}
                            {(card.collection_date || card.pickup_time || card.dropoff_time) && (
                              <div style={{ fontSize: '0.73rem', color: 'var(--navy-800)', fontWeight: 600, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '4px 8px', borderRadius: '6px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                {card.collection_date && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Calendar size={11} strokeWidth={2.2} />
                                    {card.collection_date}
                                  </span>
                                )}
                                {card.pickup_time && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Clock size={11} strokeWidth={2.2} />
                                    Ready: {card.pickup_time}
                                  </span>
                                )}
                                {card.dropoff_time && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Clock size={11} strokeWidth={2.2} />
                                    Deadline: {card.dropoff_time}
                                  </span>
                                )}
                              </div>
                            )}

                            {card.special_instructions && (
                              <div className="si" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <AlertTriangle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                                <span>{card.special_instructions.startsWith('{') ? 'Contract Rate Card' : card.special_instructions}</span>
                              </div>
                            )}

                            {(lorry || crew.length > 0) && (
                              <div className="crew">
                                {lorry && (
                                  <span className="plate-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    <Truck size={12} strokeWidth={2.2} />
                                    {lorry.plate_no}
                                  </span>
                                )}
                                {crew.map((c, idx) => (
                                  <span key={idx} className="m" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <User size={12} strokeWidth={2.2} />
                                    <span>{c.driver?.name || ''}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="cardacts">
                            <button
                              className="btn gh sm"
                              onClick={(e) => { e.stopPropagation(); setViewJobModal(card); }}
                              title="View Full Job Details"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Eye size={12} strokeWidth={2.2} />
                              View
                            </button>
                            {acts}
                            <button className="btn-act-cancel" onClick={() => cancelJob(card.id)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="kbcol-empty">
                      <Inbox size={26} strokeWidth={1.8} style={{ opacity: 0.5, marginBottom: '6px' }} />
                      <div>No jobs in status</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {assignModalJob && (
        <AssignModal
          job={assignModalJob}
          lorries={lorries}
          drivers={drivers}
          allJobs={jobs}
          onClose={() => {
            setAssignModalJob(null);
            navigate('/board', { replace: true });
          }}
          onAssigned={(assignedLorry, assignedCrew) => {
            const prevLorryId = assignModalJob?.lorry_id;
            setJobs(prev => prev.map(j => {
              if (j.id === assignModalJob.id || (assignModalJob.job_no && j.job_no === assignModalJob.job_no)) {
                return {
                  ...j,
                  lorry_id: assignedLorry.id,
                  status: 'assigned',
                  job_crew: assignedCrew.map(c => ({ role: c.role, driver: drivers.find(d => String(d.id) === String(c.id)) || { id: c.id, name: c.name || 'Driver' } }))
                };
              }
              return j;
            }));
            setLorries(prev => prev.map(l => {
              if (l.id === assignedLorry.id) return { ...l, status: 'on_job' };
              if (prevLorryId && (l.id === prevLorryId || l.plate_no === prevLorryId)) return { ...l, status: 'available' };
              return l;
            }));
            toast('Assigned ' + (assignedLorry.plate_no || 'Lorry'), 'ok');
            setAssignModalJob(null);
            notifyApi(assignModalJob.id);
            navigate('/board', { replace: true });
          }}
        />
      )}

      {/* Full Job Details Modal Popup */}
      {viewJobModal && (
        <JobDetailModal
          job={viewJobModal}
          lorries={lorries}
          drivers={drivers}
          onClose={() => setViewJobModal(null)}
          onApprove={(card) => {
            setViewJobModal(null);
            setApproveModalJob(card);
          }}
          onAssign={(card) => {
            setViewJobModal(null);
            setAssignModalJob(card);
          }}
          onStatusChange={(id, st) => {
            setStatus(id, st);
            setViewJobModal(prev => prev ? { ...prev, status: st } : null);
          }}
          onCancel={(id) => {
            setViewJobModal(null);
            cancelJob(id);
          }}
        />
      )}

      {/* Confirmation Modal for Approving Order */}
      {approveModalJob && (
        <ApproveJobConfirmationModal
          job={approveModalJob}
          onClose={() => setApproveModalJob(null)}
          onConfirm={() => handleConfirmApproveJob(approveModalJob)}
        />
      )}
    </div>
  );
}

// Rich Modal Popup for Complete Job Information
export function JobDetailModal({ job, lorries = [], drivers = [], onClose, onApprove, onAssign, onStatusChange, onCancel, onEdit }) {
  const { toast } = useToast();
  if (!job) return null;
  const crew = (job.job_crew || []).sort((a, b) => a.role === 'driver' ? -1 : 1);
  const lorry = (lorries || []).find(l => l && (l.id === job.lorry_id || l.plate_no === job.lorry_id));
  const pickup = job.pickup_location || job.origin || 'Port Klang';
  const dropoff = job.dropoff_location || job.destination || 'Ipoh Depot';
  const customerName = job.customer?.company_name || 'Direct Customer';
  const rateText = job.rate_amount ? fmtMoney(job.rate_amount) : 'RM 1,850.00';
  const weightText = job.weight_desc || job.cargo_summary || 'General Cargo';

  const normalizeZoneStr = (z) => {
    if (!z) return null;
    const str = String(z).trim();
    if (/^[A-Z]$/i.test(str)) return `Zone ${str.toUpperCase()}`;
    if (/^zone\s*[A-Z]$/i.test(str)) return `Zone ${str.replace(/zone\s*/i, '').toUpperCase()}`;
    return str;
  };

  const pickupZone = normalizeZoneStr(job.pickup_zone || job.collection_zone || job.origin_zone || job.zone) || (pickup ? detectJobZone(pickup) : 'Zone A');
  const dropoffZone = normalizeZoneStr(job.dropoff_zone || job.drop_zone || job.delivery_zone || job.destination_zone) || (dropoff ? detectJobZone(dropoff) : 'Zone B');

  const resolvedPickupTime = job.pickup_time || job.loading_time || '08:00 AM';
  let resolvedDropoffTime = job.dropoff_time || job.unloading_time;

  if (!resolvedDropoffTime || resolvedDropoffTime.trim() === '' || resolvedDropoffTime.toLowerCase() === 'same day' || resolvedDropoffTime.toLowerCase() === 'today') {
    if (job.special_instructions) {
      const matchUnloading = job.special_instructions.match(/unloading:\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
      if (matchUnloading) {
        resolvedDropoffTime = matchUnloading[1];
      }
    }
    if (!resolvedDropoffTime || resolvedDropoffTime.toLowerCase() === 'same day') {
      if (job.delivery_date && job.collection_date && job.delivery_date !== job.collection_date) {
        resolvedDropoffTime = '10:00 AM';
      } else {
        const match = resolvedPickupTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const min = match[2];
          const ampm = (match[3] || 'AM').toUpperCase();
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          let newH = (h + 4) % 24;
          const newAmPm = newH >= 12 ? 'PM' : 'AM';
          let dispH = newH % 12;
          if (dispH === 0) dispH = 12;
          resolvedDropoffTime = `${String(dispH).padStart(2, '0')}:${min} ${newAmPm}`;
        } else {
          resolvedDropoffTime = '05:30 PM';
        }
      }
    }
  }

  let parsedSpecial = null;
  try {
    if (job.special_instructions && typeof job.special_instructions === 'string' && job.special_instructions.startsWith('{')) {
      parsedSpecial = JSON.parse(job.special_instructions);
    }
  } catch (_) {}

  const handleCopy = () => {
    const text = `JOB #${job.job_no}
Customer: ${customerName}
Reference: ${job.customer_ref || '—'}
Origin Pickup: ${pickup} (Zone: ${pickupZone})
Collection Date & Time: ${job.collection_date || 'Today'} @ ${resolvedPickupTime}
Destination Dropoff: ${dropoff} (Zone: ${dropoffZone})
Delivery Date & Time: ${job.delivery_date || job.collection_date || 'Today'} @ ${resolvedDropoffTime}
Status: ${job.status.toUpperCase()}
Vehicle: ${lorry ? lorry.plate_no : 'Unassigned'}
Lorry Spec: ${job.lorry_spec || 'Standard'}
Rate: ${rateText}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast('Job summary copied to clipboard', 'ok');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const modalEl = (
    <div
      className="overlay open"
      id="jobViewOverlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.68)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'jobViewOverlay' && onClose()}
    >
      <div
        className="modalbox tab-fade-in"
        style={{
          maxWidth: parsedSpecial?.routes?.length ? '880px' : '740px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
          borderRadius: '20px',
          overflow: 'hidden',
          background: '#FFFFFF'
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="jno-pill" style={{ fontSize: '0.88rem', padding: '4px 10px', fontWeight: 800 }}>
              {job.job_no}
            </span>
            <span className={`badge ${job.status === 'unassigned' ? 'amber' : (job.status === 'delivered' ? 'green' : 'blue')}`} style={{ fontSize: '0.74rem', padding: '3px 8px', fontWeight: 700 }}>
              {job.status === 'in_transit' ? 'IN TRANSIT' : job.status.toUpperCase()}
            </span>
            {Boolean(job.urgent) && (
              <span className="badge urgent" style={{ fontSize: '0.68rem', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <AlertTriangle size={10} strokeWidth={2.5} />
                Urgent
              </span>
            )}
          </div>
          <button className="kbtn" onClick={onClose} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Close <kbd>esc</kbd>
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Customer & Billing Info */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                Customer Account
              </div>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={18} strokeWidth={2.2} style={{ color: 'var(--orange)' }} />
                {customerName}
              </div>
              {job.customer_ref && (
                <div style={{ fontSize: '0.82rem', color: 'var(--slate)', marginTop: '2px', fontWeight: 600 }}>
                  Reference No: <b style={{ color: 'var(--navy-800)' }}>{job.customer_ref}</b>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--slate)', display: 'block' }}>Trip Rate</span>
              <b style={{ fontSize: '1.2rem', color: 'var(--orange)' }}>{rateText}</b>
              <div style={{ marginTop: '2px' }}>
                <span className={`badge ${job.billed_status === 'sent' ? 'green' : 'amber'}`} style={{ fontSize: '0.66rem' }}>
                  {job.billed_status === 'sent' ? 'Invoice Billed' : 'Pending Billing'}
                </span>
              </div>
            </div>
          </div>

          {/* Route & Schedule Section */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 18px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
              Logistics Route &amp; Schedule
            </div>

            <div className="modal-route-grid" style={{ marginBottom: '14px' }}>
              {/* Origin Pickup */}
              <div style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 800, color: '#166534' }}>
                    <span className="r-dot pickup"></span> ORIGIN PICKUP
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#DCFCE7', border: '1px solid #86EFAC', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, color: '#15803D' }}>
                    <MapPin size={11} style={{ color: '#16A34A', flexShrink: 0 }} />
                    {pickupZone}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.94rem', wordBreak: 'break-word', marginTop: '2px' }}>
                  {pickup}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.74rem', color: '#166534' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700 }}>
                    <Calendar size={12} strokeWidth={2.2} /> {job.collection_date || 'Today'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 800, background: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #BBF7D0' }}>
                    <Clock size={12} strokeWidth={2.2} /> Loading: {resolvedPickupTime}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                <ArrowRight size={22} strokeWidth={2.5} style={{ color: 'var(--orange)' }} />
              </div>

              {/* Destination Dropoff */}
              <div style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 800, color: '#9A3412' }}>
                    <span className="r-dot dropoff"></span> DESTINATION DROPOFF
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#FFEDD5', border: '1px solid #FDBA74', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, color: '#C2410C' }}>
                    <MapPin size={11} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                    {dropoffZone}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.94rem', wordBreak: 'break-word', marginTop: '2px' }}>
                  {dropoff}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.74rem', color: '#9A3412' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700 }}>
                    <Calendar size={12} strokeWidth={2.2} /> {job.delivery_date || job.collection_date || 'Today'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 800, background: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FED7AA' }}>
                    <Clock size={12} strokeWidth={2.2} /> Unloading: {resolvedDropoffTime}
                  </span>
                </div>
              </div>
            </div>

            {/* Structured 4-Tile Schedule Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '9px 12px', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                  <Calendar size={11} strokeWidth={2.2} /> Collection Date
                </span>
                <b style={{ fontSize: '0.84rem', color: 'var(--navy-900)', marginTop: '2px', display: 'block' }}>
                  {job.collection_date || 'Today / Same Day'}
                </b>
              </div>

              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '9px 12px', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.68rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 800 }}>
                  <Clock size={11} strokeWidth={2.2} /> Loading / Pickup Time
                </span>
                <b style={{ fontSize: '0.88rem', color: '#15803D', marginTop: '2px', display: 'block' }}>
                  {resolvedPickupTime}
                </b>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '9px 12px', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                  <Calendar size={11} strokeWidth={2.2} /> Delivery Date
                </span>
                <b style={{ fontSize: '0.84rem', color: 'var(--navy-900)', marginTop: '2px', display: 'block' }}>
                  {job.delivery_date || job.collection_date || 'Same Day'}
                </b>
              </div>

              <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', padding: '9px 12px', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.68rem', color: '#9A3412', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 800 }}>
                  <Clock size={11} strokeWidth={2.2} /> Dropoff / Unloading Time
                </span>
                <b style={{ fontSize: '0.88rem', color: '#C2410C', marginTop: '2px', display: 'block' }}>
                  {resolvedDropoffTime}
                </b>
              </div>
            </div>
          </div>

          {/* Logistics Resources Allocation */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 18px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
              Resource Allocation &amp; Assignment
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {/* Lorry Info */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--slate)', display: 'block', marginBottom: '4px' }}>Assigned Lorry</span>
                {lorry ? (
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Truck size={16} strokeWidth={2.2} style={{ color: 'var(--orange)' }} />
                      {lorry.plate_no}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px' }}>
                      {lorry.capacity_desc || lorry.lorry_type || 'Standard Haulage'}
                    </div>
                  </div>
                ) : (
                  <span className="badge amber" style={{ fontSize: '0.76rem', padding: '4px 8px' }}>
                    No vehicle assigned yet
                  </span>
                )}
              </div>

              {/* Crew Info */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--slate)', display: 'block', marginBottom: '6px' }}>Assigned Personnel</span>
                {crew.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {crew.map((c, idx) => (
                      <div key={idx} style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={13} strokeWidth={2.2} />
                        <span>{c.driver?.name || 'Driver'}</span>
                        <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', background: c.role === 'driver' ? '#EFF6FF' : '#F1F5F9', color: c.role === 'driver' ? '#2563EB' : '#64748B', fontWeight: 800 }}>
                          {c.role}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.76rem', color: 'var(--slate)', fontStyle: 'italic' }}>
                    No driver / crew attached
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Cargo Specs & Special Instructions */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 18px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
              Cargo Description &amp; Handling
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: job.special_instructions ? '12px' : '0' }}>
              <span className="cargo-spec-pill" style={{ fontSize: '0.82rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Package size={14} strokeWidth={2.2} />
                <b>Cargo:</b> {weightText}
              </span>
              {job.lorry_spec && (
                <span className="cargo-spec-pill" style={{ fontSize: '0.82rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Truck size={14} strokeWidth={2.2} />
                  <b>Spec:</b> {job.lorry_spec}
                </span>
              )}
            </div>

            {job.special_instructions && (
              parsedSpecial && (parsedSpecial.routes || parsedSpecial.terms || parsedSpecial.ref) ? (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--navy-900)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Quotation Rate Card &amp; Contract Details
                    </div>
                    {parsedSpecial.itemNo && (
                      <span style={{ fontSize: '0.72rem', background: 'rgba(249, 115, 22, 0.1)', color: 'var(--orange-700)', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        Item No: {parsedSpecial.itemNo}
                      </span>
                    )}
                  </div>

                  {/* Contract Specs Header Bar */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '0.76rem' }}>
                    {parsedSpecial.ref && (
                      <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '3px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
                        <b>Our Ref:</b> {parsedSpecial.ref}
                      </span>
                    )}
                    {parsedSpecial.rev && (
                      <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '3px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
                        <b>Rev:</b> {parsedSpecial.rev}
                      </span>
                    )}
                    {parsedSpecial.date && (
                      <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '3px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
                        <b>Date:</b> {parsedSpecial.date}
                      </span>
                    )}
                    {parsedSpecial.sender && (
                      <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '3px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
                        <b>Sender:</b> {parsedSpecial.sender} {parsedSpecial.senderPhone ? `(${parsedSpecial.senderPhone})` : ''}
                      </span>
                    )}
                  </div>

                  {/* Rates Table in Clean Crisp Format */}
                  {parsedSpecial.routes && parsedSpecial.routes.length > 0 && (
                    <div style={{ overflowX: 'auto', border: '1px solid #CBD5E1', borderRadius: '8px', marginBottom: '12px', background: '#FFFFFF' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', color: 'var(--navy-900)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                            <th style={{ padding: '8px 10px', width: '36px', textAlign: 'center', borderRight: '1px solid #E2E8F0' }}>#</th>
                            <th style={{ padding: '8px 12px', borderRight: '1px solid #E2E8F0' }}>Route / Destination</th>
                            {(parsedSpecial.lorryTypes || ['Rate']).map((lt, idx) => (
                              <th key={idx} style={{ padding: '8px 10px', textAlign: 'right', borderRight: idx < (parsedSpecial.lorryTypes?.length || 1) - 1 ? '1px solid #E2E8F0' : 'none', whiteSpace: 'nowrap' }}>
                                {lt}<br /><span style={{ fontSize: '0.66rem', color: 'var(--slate)' }}>(RM)</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parsedSpecial.routes.map((r, rIdx) => {
                            const label = r.isDropoint
                              ? `Dropoint — ${r.collection || 'Dropoint'}`
                              : (r.collection && r.unloading ? `${r.collection} ➔ ${r.unloading}` : (r.collection || r.unloading || 'Route'));
                            return (
                              <tr
                                key={rIdx}
                                style={{ borderBottom: '1px solid #E2E8F0', background: rIdx % 2 === 1 ? '#F8FAFC' : '#FFFFFF' }}
                              >
                                <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--slate)', borderRight: '1px solid #E2E8F0' }}>
                                  {rIdx + 1}
                                </td>
                                <td style={{ padding: '7px 12px', borderRight: '1px solid #E2E8F0' }}>
                                  <div style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{label}</div>
                                  {r.code_word && (
                                    <div style={{ fontSize: '0.68rem', color: 'var(--orange-700)', fontWeight: 600, marginTop: '1px' }}>
                                      {r.code_word}
                                    </div>
                                  )}
                                </td>
                                {(parsedSpecial.lorryTypes || ['Rate']).map((lt, ltIdx) => {
                                  const val = r.rates ? r.rates[lt] : null;
                                  return (
                                    <td key={ltIdx} style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: val ? 'var(--navy-900)' : 'var(--slate)', borderRight: ltIdx < (parsedSpecial.lorryTypes?.length || 1) - 1 ? '1px solid #E2E8F0' : 'none' }}>
                                      {val ? (isNaN(Number(val)) ? val : `${Number(val).toFixed(2)}`) : '—'}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Terms & Conditions */}
                  {parsedSpecial.terms && (
                    <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '10px 12px', color: '#92400E', fontSize: '0.76rem', lineHeight: 1.45 }}>
                      <b>Terms &amp; Conditions:</b>
                      <div style={{ whiteSpace: 'pre-wrap', marginTop: '2px' }}>{parsedSpecial.terms}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '12px 14px', color: '#92400E', fontSize: '0.82rem', lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <AlertTriangle size={16} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <b style={{ display: 'block', marginBottom: '2px' }}>Special Instructions:</b>
                    {job.special_instructions}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn gh sm" onClick={handleCopy} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={13} strokeWidth={2.2} />
            Copy Details
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {job.status === 'unassigned' && (
              <button className="btn pri sm" onClick={() => onAssign(job)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <UserCheck size={13} strokeWidth={2.2} />
                Assign Lorry &amp; Crew
              </button>
            )}

            {job.status === 'assigned' && (
              <button className="btn navy sm" onClick={() => onStatusChange(job.id, 'in_transit')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Play size={12} strokeWidth={2.4} />
                Start In Transit
              </button>
            )}

            {job.status === 'in_transit' && (
              <button className="btn navy sm" onClick={() => onStatusChange(job.id, 'delivered')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle2 size={13} strokeWidth={2.2} />
                Mark Delivered
              </button>
            )}

            <button className="btn pri sm" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalEl, document.body);
}

// Modal popover for assigning Lorry & Crew with smart Zone & Fleet Spec matching
export function AssignModal({ job, lorries = [], drivers = [], allJobs = [], onClose, onAssigned }) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [chosenLorry, setChosenLorry] = useState(null);
  const [chosenCrew, setChosenCrew] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real registered drivers specifically assigned to the chosen vehicle
  const selectedLorryDrivers = useMemo(() => {
    if (!chosenLorry) return [];

    // Find fresh lorry data if available in localStorage to guarantee latest assigned roster
    let freshLorry = chosenLorry;
    try {
      const rawStoredLorries = localStorage.getItem('rens_db_lorries');
      if (rawStoredLorries) {
        const parsed = JSON.parse(rawStoredLorries);
        if (Array.isArray(parsed)) {
          const found = parsed.find(item => String(item.id) === String(chosenLorry.id) || item.plate_no === chosenLorry.plate_no);
          if (found) freshLorry = { ...chosenLorry, ...found };
        }
      }
    } catch (_) {}

    const rawAssigned = Array.isArray(freshLorry.assigned_driver_ids)
      ? freshLorry.assigned_driver_ids
      : (Array.isArray(freshLorry.driver_ids)
        ? freshLorry.driver_ids
        : []);

    let crewDriverIds = [];
    try {
      const rawLC = localStorage.getItem('rens_db_lorry_crew');
      if (rawLC) {
        const parsedLC = JSON.parse(rawLC);
        if (Array.isArray(parsedLC)) {
          crewDriverIds = parsedLC
            .filter(lc => String(lc.lorry_id) === String(freshLorry.id) || String(lc.lorry_id) === String(freshLorry.plate_no))
            .map(lc => lc.driver_id);
        }
      }
    } catch (_) {}

    const assignedIds = Array.from(new Set([
      ...(freshLorry.default_driver_id ? [String(freshLorry.default_driver_id)] : []),
      ...rawAssigned.map(String),
      ...crewDriverIds.map(String)
    ])).filter(Boolean);

    // If specific drivers are assigned to this lorry, show ONLY those assigned drivers!
    if (assignedIds.length > 0) {
      const matched = (drivers || []).filter(d => assignedIds.includes(String(d.id)));
      if (matched.length > 0) {
        // Sort so default_driver_id is first (Primary Driver)
        matched.sort((a, b) => {
          if (String(a.id) === String(freshLorry.default_driver_id)) return -1;
          if (String(b.id) === String(freshLorry.default_driver_id)) return 1;
          return 0;
        });
        return matched;
      }
    }

    // Fallback: If no driver roster was ever configured for this vehicle, return default driver or all drivers
    if (freshLorry.default_driver_id) {
      const def = (drivers || []).find(d => String(d.id) === String(freshLorry.default_driver_id));
      if (def) return [def];
    }
    return drivers || [];
  }, [chosenLorry, drivers]);

  const customerName = job?.customer?.company_name || job?.customer_name || 'Direct Customer';
  const jobNo = job?.job_no || 'Job';
  const pickupLoc = job?.pickup_location || job?.origin || 'Pickup Location';
  const dropoffLoc = job?.dropoff_location || job?.dropoff || job?.destination || 'Dropoff Location';
  const customerPickupZone = job?.pickup_zone || job?.zone || job?.customer?.zone || (pickupLoc ? detectJobZone(pickupLoc) : 'Zone A');
  const customerRequiredSpec = (job?.lorry_spec || job?.capacity_desc || job?.weight_desc || job?.cargo_desc || '').trim();

  // Match and score each lorry with real-time schedule conflict check
  const scoredLorries = useMemo(() => {
    // 1. Resolve live zones strictly from Sales & Targets (rens_fleet_sales_records_v10 & active/delivered orders)
    let fleetSalesList = [];
    try {
      const rawFleet = localStorage.getItem('rens_fleet_sales_records_v10');
      if (rawFleet) fleetSalesList = JSON.parse(rawFleet);
    } catch (_) {}

    const salesZoneMap = new Map();
    if (Array.isArray(fleetSalesList) && fleetSalesList.length > 0) {
      fleetSalesList.forEach(fs => {
        if (fs && fs.plate_no && fs.zone) {
          salesZoneMap.set((fs.plate_no || '').replace(/\s+/g, '').toUpperCase(), fs.zone);
        }
      });
    }

    // Active / delivered jobs live zone
    (allJobs || []).forEach(j => {
      if (!j || j.status === 'cancelled' || j.status === 'unassigned') return;
      let plate = j.lorry?.plate_no || j.plate_no || '';
      if (!plate && j.lorry_id) {
        const matched = (lorries || []).find(itm => String(itm.id) === String(j.lorry_id));
        if (matched?.plate_no) plate = matched.plate_no;
        else if (!String(j.lorry_id).startsWith('lorry-') && !String(j.lorry_id).startsWith('live_')) plate = j.lorry_id;
      }
      const pNorm = (plate || '').replace(/\s+/g, '').toUpperCase();
      if (!pNorm) return;

      if (j.status === 'in_transit' || j.status === 'assigned') {
        const pz = j.pickup_zone || j.collection_zone || j.origin_zone || j.zone;
        if (pz) salesZoneMap.set(pNorm, pz);
      } else if (j.status === 'delivered') {
        const dz = j.dropoff_zone || j.delivery_zone || j.destination_zone || j.zone;
        if (dz) salesZoneMap.set(pNorm, dz);
      }
    });

    return (lorries || []).map((l, idx) => {
      if (!l) return null;
      const cleanPlate = (l.plate_no || '').replace(/\s+/g, '').toUpperCase();
      const resolvedZone = salesZoneMap.get(cleanPlate) || null; // Strictly from Sales & Targets table ONLY!

      const statusLower = String(l.status || 'available').toLowerCase().replace(' ', '_');
      const conflict = checkLorryScheduleConflict(l, job, allJobs);
      const isAvail = (statusLower === 'available' || statusLower === 'standby' || !l.status) && !conflict;
      const zoneMatched = Boolean(resolvedZone) && isLorryZoneMatch(resolvedZone, customerPickupZone, pickupLoc);
      const specMatched = isLorrySpecMatch(l.capacity_desc || l.model, customerRequiredSpec, job?.weight_desc, job?.cargo_desc);
      const isBestMatch = isAvail && Boolean(resolvedZone) && zoneMatched && (customerRequiredSpec ? specMatched : true);

      let score = 0;
      if (isBestMatch) score += 100;
      else if (isAvail && zoneMatched) score += 50;
      else if (isAvail && specMatched) score += 30;
      else if (isAvail) score += 10;
      else score += 0;

      return {
        ...l,
        zone: resolvedZone, // Force zone to be strictly from Sales & Targets (or null)
        _idx: idx,
        statusLower,
        isAvail,
        conflict,
        busyReason: conflict ? conflict.reason : null,
        zoneMatched,
        specMatched,
        isBestMatch,
        score
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score || (a.plate_no || '').localeCompare(b.plate_no || ''));
  }, [lorries, customerPickupZone, pickupLoc, customerRequiredSpec, job, allJobs]);

  const bestCount = useMemo(() => scoredLorries.filter(l => l.isBestMatch).length, [scoredLorries]);
  const zoneCount = useMemo(() => scoredLorries.filter(l => l.isAvail && l.zoneMatched).length, [scoredLorries]);
  const specCount = useMemo(() => scoredLorries.filter(l => l.isAvail && l.specMatched).length, [scoredLorries]);
  const availCount = useMemo(() => scoredLorries.filter(l => l.isAvail).length, [scoredLorries]);
  const totalCount = scoredLorries.length;

  // Determine initial filter tab: always default to 'best' (matching available lorry + customer fleet spec + customer pickup zone)
  const [filterTab, setFilterTab] = useState('best');

  const [selIdx, setSelIdx] = useState(0);

  // Filtered list based on tab and search query
  const filteredLorries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoredLorries.filter(l => {
      // Tab filter: 'best' strictly shows best match; if bestCount is 0, gracefully show available lorries sorted by match score
      if (filterTab === 'best') {
        if (bestCount > 0) return l.isBestMatch;
        return l.isAvail;
      }
      if (filterTab === 'zone' && !(l.isAvail && l.zoneMatched)) return false;
      if (filterTab === 'spec' && !(l.isAvail && l.specMatched)) return false;
      if (filterTab === 'available' && !l.isAvail) return false;

      // Search query filter
      if (!q) return true;
      const plate = (l.plate_no || '').toLowerCase();
      const cap = (l.capacity_desc || l.model || '').toLowerCase();
      const zone = (l.zone || '').toLowerCase();
      const st = (l.status || '').toLowerCase();
      return plate.includes(q) || cap.includes(q) || zone.includes(q) || st.includes(q);
    });
  }, [scoredLorries, filterTab, query, bestCount]);

  // Handle lorry selection & assign default driver if available
  const handleChooseLorry = useCallback((l, idx) => {
    if (!l) return;
    if (!l.isAvail && l.busyReason) {
      toast(`⚠️ Lorry ${l.plate_no} is ${l.busyReason}. Please select an available vehicle or wait until delivery is completed.`, 'err');
      return;
    }
    setChosenLorry(l);
    if (typeof idx === 'number') setSelIdx(idx);
    
    // Resolve fresh lorry properties to get assigned drivers
    let freshLorry = l;
    try {
      const rawStored = localStorage.getItem('rens_db_lorries');
      if (rawStored) {
        const parsed = JSON.parse(rawStored);
        if (Array.isArray(parsed)) {
          const found = parsed.find(item => String(item.id) === String(l.id) || item.plate_no === l.plate_no);
          if (found) freshLorry = { ...l, ...found };
        }
      }
    } catch (_) {}

    const rawAssigned = Array.isArray(freshLorry.assigned_driver_ids)
      ? freshLorry.assigned_driver_ids
      : (Array.isArray(freshLorry.driver_ids) ? freshLorry.driver_ids : []);
    
    let crewDriverIds = [];
    try {
      const rawLC = localStorage.getItem('rens_db_lorry_crew');
      if (rawLC) {
        const parsedLC = JSON.parse(rawLC);
        if (Array.isArray(parsedLC)) {
          crewDriverIds = parsedLC
            .filter(lc => String(lc.lorry_id) === String(freshLorry.id) || String(lc.lorry_id) === String(freshLorry.plate_no))
            .map(lc => lc.driver_id);
        }
      }
    } catch (_) {}

    const assignedIds = Array.from(new Set([
      ...(freshLorry.default_driver_id ? [String(freshLorry.default_driver_id)] : []),
      ...rawAssigned.map(String),
      ...crewDriverIds.map(String)
    ])).filter(Boolean);

    let primary = null;
    if (freshLorry.default_driver_id) {
      primary = (drivers || []).find(d => String(d.id) === String(freshLorry.default_driver_id));
    }
    if (!primary && assignedIds.length > 0) {
      primary = (drivers || []).find(d => assignedIds.includes(String(d.id)));
    }
    if (!primary && drivers && drivers.length > 0) {
      primary = drivers[0];
    }

    if (primary) {
      setChosenCrew([{ id: primary.id, name: primary.name, role: 'driver' }]);
    } else {
      setChosenCrew([]);
    }
  }, [drivers, toast]);

  // Automatically select the first available lorry in the filtered list
  useEffect(() => {
    if (filteredLorries.length > 0) {
      const availInList = filteredLorries.find(l => l.isAvail);
      const alreadyInList = chosenLorry && filteredLorries.some(l => (l.id === chosenLorry.id || l.plate_no === chosenLorry.plate_no) && l.isAvail);
      if (!alreadyInList && availInList) {
        handleChooseLorry(availInList, filteredLorries.indexOf(availInList));
      } else if (!alreadyInList) {
        setChosenLorry(null);
        setChosenCrew([]);
      }
    }
  }, [filteredLorries, chosenLorry, handleChooseLorry]);

  const toggleCrew = (id) => {
    const isAlreadyChosen = chosenCrew.some(c => String(c.id) === String(id));
    if (isAlreadyChosen) {
      if (chosenCrew.length === 1) {
        const other = selectedLorryDrivers.find(d => String(d.id) !== String(id));
        if (other) {
          setChosenCrew([{ id: other.id, name: other.name, role: 'driver' }]);
          return;
        }
      }
      setChosenCrew(prev => prev.filter(c => String(c.id) !== String(id)));
    } else {
      const d = selectedLorryDrivers.find(x => String(x.id) === String(id)) || (drivers || []).find(x => String(x.id) === String(id));
      if (!d) return;
      if (chosenCrew.length === 0) {
        setChosenCrew([{ id: d.id, name: d.name, role: 'driver' }]);
      } else {
        setChosenCrew(prev => [...prev, { id: d.id, name: d.name, role: 'co_driver' }]);
      }
    }
  };

  const handleConfirm = async () => {
    if (!chosenLorry || isSubmitting) return;
    setIsSubmitting(true);
    const driver = chosenCrew.find(c => c.role === 'driver') || chosenCrew[0] || ((drivers || [])[0] ? { id: drivers[0].id, name: drivers[0].name, role: 'driver' } : { id: 'default_driver', name: 'Primary Driver', role: 'driver' });
    const finalCrew = chosenCrew.length > 0 ? chosenCrew : [driver];

    if (sb) {
      try {
        const patch = {
          lorry_id: chosenLorry.id,
          driver_id: driver?.id || null,
          status: 'assigned',
          lorry_spec: chosenLorry.capacity_desc || job.lorry_spec || ''
        };

        const isVirtualId = !job.id || String(job.id).startsWith('q_job_') || String(job.id).startsWith('quo-') || String(job.id).startsWith('id_');
        let actualJobId = job.id;

        if (isVirtualId) {
          // Check if already in jobs table
          const { data: existingDbJob } = await sb.from('jobs').select('id, job_no').eq('job_no', job.job_no).maybeSingle();
          if (existingDbJob && existingDbJob.id) {
            actualJobId = existingDbJob.id;
            await sb.from('jobs').update(patch).eq('id', actualJobId);
          } else {
            const fullJobPayload = {
              id: ('job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
              job_no: job.job_no,
              quotation_id: job.quotation_id || job.id,
              customer_id: job.customer_id || null,
              customer_ref: job.customer_ref || null,
              rate_amount: job.rate_amount || 0,
              pickup_location: job.pickup_location || 'Pickup Location',
              dropoff_location: job.dropoff_location || 'Dropoff Location',
              pickup_zone: customerPickupZone,
              dropoff_zone: job?.dropoff_zone || job?.drop_zone || (dropoffLoc ? detectJobZone(dropoffLoc) : 'Zone B'),
              cargo_desc: job.cargo_desc || job.weight_desc || job.lorry_spec || 'General Cargo',
              lorry_spec: chosenLorry.capacity_desc || job.lorry_spec || '',
              weight_desc: job.weight_desc || '',
              urgent: job.urgent ? 1 : 0,
              special_instructions: job.special_instructions || '',
              lorry_id: chosenLorry.id,
              driver_id: driver?.id || null,
              status: 'assigned',
              billed_status: job.billed_status || 'pending',
              created_at: job.created_at || new Date().toISOString()
            };
            await sb.from('jobs').insert(fullJobPayload);
            actualJobId = fullJobPayload.id;
          }
        } else {
          await sb.from('jobs').update(patch).eq('id', job.id);
        }

        // Update quotation references
        if (job.quotation_id) {
          await sb.from('quotations').update({ status: 'assigned' }).eq('id', job.quotation_id);
        }
        if (job.id) {
          await sb.from('quotations').update({ status: 'assigned' }).eq('id', job.id);
        }
        if (job.job_no) {
          const qNo = job.job_no.replace('RJ-', 'RJ-Q-');
          await sb.from('quotations').update({ status: 'assigned' }).eq('quote_no', qNo);
        }

        // Update crew & lorry status
        if (actualJobId) {
          await sb.from('job_crew').delete().eq('job_id', actualJobId);
          await sb.from('job_crew').insert(finalCrew.map(c => ({ job_id: actualJobId, driver_id: c.id, role: c.role || 'crew' })));
        }
        
        // If reassigning, release the previously assigned lorry
        const prevLorryId = job?.lorry_id;
        if (prevLorryId && String(prevLorryId) !== String(chosenLorry.id)) {
          await sb.from('lorries').update({ status: 'available' }).eq('id', prevLorryId);
        }
        await sb.from('lorries').update({ status: 'on_job' }).eq('id', chosenLorry.id);
      } catch (e) {
        console.error('Assignment save error:', e);
      }
    }
    onAssigned(chosenLorry, finalCrew);
  };

  const canConfirm = Boolean(chosenLorry);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelIdx(i => {
          const next = Math.min(i + 1, filteredLorries.length - 1);
          if (filteredLorries[next]) handleChooseLorry(filteredLorries[next], next);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelIdx(i => {
          const prev = Math.max(i - 1, 0);
          if (filteredLorries[prev]) handleChooseLorry(filteredLorries[prev], prev);
          return prev;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (canConfirm) {
          handleConfirm();
        } else if (filteredLorries[selIdx]) {
          handleChooseLorry(filteredLorries[selIdx], selIdx);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredLorries, selIdx, canConfirm, chosenLorry, chosenCrew, onClose, handleChooseLorry]);

  const modalEl = (
    <div
      className="overlay open"
      id="assignOv"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'assignOv' && onClose()}
    >
      <div
        className="cmdbox assignpop"
        style={{
          maxWidth: '680px',
          width: '100%',
          margin: 'auto',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
          borderRadius: '18px',
          overflow: 'hidden',
          background: '#FFFFFF'
        }}
      >
        {/* Customer & Job Requirement Header Card */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            color: '#FFFFFF',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#F97316', background: 'rgba(249, 115, 22, 0.15)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
                Assign Lorry & Crew
              </span>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#E2E8F0' }}>
                Job #{jobNo}
              </span>
            </div>
            <kbd className="dark" onClick={onClose} style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' }}>esc</kbd>
          </div>

          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF', marginBottom: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {customerName}
          </div>

          {/* Customer Requirements Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
            {/* Pickup Zone Requirement */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '8px',
                padding: '7px 10px'
              }}
            >
              <MapPin size={15} color="#34D399" strokeWidth={2.4} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#6EE7B7', letterSpacing: '0.04em' }}>
                  Customer Pickup Zone
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {customerPickupZone} <span style={{ opacity: 0.75, fontWeight: 500, fontSize: '0.76rem' }}>({pickupLoc.split(',')[0].trim()})</span>
                </div>
              </div>
            </div>

            {/* Fleet Lorry Spec Requirement */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                borderRadius: '8px',
                padding: '7px 10px'
              }}
            >
              <Truck size={15} color="#60A5FA" strokeWidth={2.4} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#93C5FD', letterSpacing: '0.04em' }}>
                  Customer Required Fleet
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {customerRequiredSpec || 'Any Available Fleet Lorry'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Pills for Quick Matching */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px 6px',
            background: '#F8FAFC',
            borderBottom: '1px solid var(--line)',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <button
            type="button"
            onClick={() => { setFilterTab('best'); setSelIdx(0); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterTab === 'best' ? '1px solid #D97706' : '1px solid #FCD34D',
              background: filterTab === 'best' ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' : '#FEF3C7',
              color: filterTab === 'best' ? '#FFFFFF' : '#92400E',
              boxShadow: filterTab === 'best' ? '0 2px 8px rgba(217, 119, 6, 0.25)' : 'none',
              whiteSpace: 'nowrap'
            }}
          >
            <Sparkles size={12} strokeWidth={2.5} />
            🎯 Matched Fleet &amp; Zone ({bestCount})
          </button>

          {zoneCount > 0 && customerRequiredSpec && (
            <button
              type="button"
              onClick={() => { setFilterTab('zone'); setSelIdx(0); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 11px',
                borderRadius: '20px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: filterTab === 'zone' ? '1px solid #059669' : '1px solid #A7F3D0',
                background: filterTab === 'zone' ? '#059669' : '#ECFDF5',
                color: filterTab === 'zone' ? '#FFFFFF' : '#065F46',
                boxShadow: filterTab === 'zone' ? '0 2px 8px rgba(5, 150, 105, 0.2)' : 'none',
                whiteSpace: 'nowrap'
              }}
            >
              <MapPin size={11} strokeWidth={2.5} />
              {customerPickupZone} Only ({zoneCount})
            </button>
          )}

          {customerRequiredSpec && specCount > 0 && (
            <button
              type="button"
              onClick={() => { setFilterTab('spec'); setSelIdx(0); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 11px',
                borderRadius: '20px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: filterTab === 'spec' ? '1px solid #2563EB' : '1px solid #BFDBFE',
                background: filterTab === 'spec' ? '#2563EB' : '#EFF6FF',
                color: filterTab === 'spec' ? '#FFFFFF' : '#1E40AF',
                boxShadow: filterTab === 'spec' ? '0 2px 8px rgba(37, 99, 235, 0.2)' : 'none',
                whiteSpace: 'nowrap'
              }}
            >
              <Truck size={11} strokeWidth={2.5} />
              {customerRequiredSpec} Only ({specCount})
            </button>
          )}

          <button
            type="button"
            onClick={() => { setFilterTab('available'); setSelIdx(0); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 11px',
              borderRadius: '20px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: filterTab === 'available' ? '1px solid var(--navy-900)' : '1px solid #E2E8F0',
              background: filterTab === 'available' ? 'var(--navy-900)' : '#FFFFFF',
              color: filterTab === 'available' ? '#FFFFFF' : 'var(--navy-800)',
              boxShadow: filterTab === 'available' ? '0 2px 8px rgba(15, 23, 42, 0.2)' : 'none',
              whiteSpace: 'nowrap'
            }}
          >
            🟢 All Available ({availCount})
          </button>

          <button
            type="button"
            onClick={() => { setFilterTab('all'); setSelIdx(0); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 11px',
              borderRadius: '20px',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: filterTab === 'all' ? '1px solid var(--navy-900)' : '1px solid #E2E8F0',
              background: filterTab === 'all' ? 'var(--navy-900)' : '#FFFFFF',
              color: filterTab === 'all' ? '#FFFFFF' : 'var(--slate)',
              whiteSpace: 'nowrap'
            }}
          >
            All Fleet ({totalCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="cin" style={{ border: 0, padding: '10px 16px 6px' }}>
          <span className="mag" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Search size={16} strokeWidth={2.2} />
          </span>
          <input
            id="lq"
            placeholder="Type a lorry plate, spec, or zone…"
            autoComplete="off"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelIdx(0); }}
            autoFocus
            style={{ fontSize: '0.94rem' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex', alignItems: 'center' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Lorries List with Rich Match Indicators */}
        <div style={{ padding: '0 16px 16px' }}>
          {filterTab === 'best' && bestCount === 0 && customerRequiredSpec && (
            <div style={{ padding: '7px 12px', background: '#FEF3C7', borderRadius: '8px', border: '1px solid #FCD34D', color: '#92400E', fontSize: '0.74rem', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={13} color="#D97706" style={{ flexShrink: 0 }} />
              <span>No exact dual match in <b>{customerPickupZone}</b> for <b>{customerRequiredSpec}</b>. Showing available fleet sorted by closest match:</span>
            </div>
          )}
          <div className="po" id="lopt" style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {filteredLorries.length > 0 ? (
              filteredLorries.map((l, i) => {
                const isSelected = chosenLorry ? (chosenLorry.id === l.id || chosenLorry.plate_no === l.plate_no) : i === selIdx;
                const statusStr = (l.status || 'available').replace('_', ' ').toUpperCase();
                const isAvailable = l.isAvail;

                return (
                  <div
                    key={l.id || l.plate_no}
                    className={`oitem ${isSelected ? 'sel' : ''}`}
                    onClick={() => handleChooseLorry(l, i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      opacity: isAvailable ? 1 : 0.65
                    }}
                  >
                    {/* Plate Number */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 800, flexShrink: 0 }}>
                      <Truck size={15} strokeWidth={2.2} />
                      {l.plate_no}
                    </span>

                    {/* Capacity / Spec */}
                    <span style={{ opacity: isSelected ? 0.95 : 0.85, fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
                      • {l.capacity_desc || l.model || 'Standard Specs'}
                    </span>

                    {/* Badges Container */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {/* Best Match Badge */}
                      {l.isBestMatch && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: isSelected ? 'rgba(255, 255, 255, 0.3)' : '#FEF3C7',
                            color: isSelected ? '#FFFFFF' : '#B45309',
                            border: isSelected ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid #FCD34D',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <Sparkles size={10} strokeWidth={2.8} />
                          BEST MATCH
                        </span>
                      )}

                      {/* Zone Match Badge */}
                      {l.zoneMatched && l.zone ? (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: isSelected ? 'rgba(255, 255, 255, 0.25)' : '#ECFDF5',
                            color: isSelected ? '#FFFFFF' : '#059669',
                            border: isSelected ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid #A7F3D0',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                          title={`Lorry zone matches customer pickup zone (${customerPickupZone})`}
                        >
                          <MapPin size={9} strokeWidth={2.5} />
                          {l.zone}
                        </span>
                      ) : (
                        l.zone ? (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '6px',
                              background: isSelected ? 'rgba(255, 255, 255, 0.15)' : '#F1F5F9',
                              color: isSelected ? '#FFFFFF' : 'var(--slate)',
                              border: isSelected ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #E2E8F0'
                            }}
                          >
                            {l.zone}
                          </span>
                        ) : null
                      )}

                      {/* Spec Match Badge (if not already Best Match) */}
                      {!l.isBestMatch && l.specMatched && customerRequiredSpec && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: isSelected ? 'rgba(255, 255, 255, 0.25)' : '#EFF6FF',
                            color: isSelected ? '#FFFFFF' : '#2563EB',
                            border: isSelected ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid #BFDBFE'
                          }}
                        >
                          ✓ Fleet Match
                        </span>
                      )}

                      {/* Status Tag */}
                      {l.conflict ? (
                        <span
                          className="tag"
                          style={{
                            textTransform: 'uppercase',
                            flexShrink: 0,
                            background: '#FEE2E2',
                            color: '#B91C1C',
                            border: '1px solid #FCA5A5',
                            fontSize: '0.68rem',
                            fontWeight: 800
                          }}
                          title={l.busyReason}
                        >
                          🔴 ON TRIP ({l.conflict.conflictingJob?.job_no || 'BUSY'})
                        </span>
                      ) : (
                        <span className="tag" style={{ textTransform: 'uppercase', flexShrink: 0 }}>
                          {statusStr}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '28px 16px', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #CBD5E1', margin: '8px 0' }}>
                <div style={{ display: 'inline-flex', padding: '10px', background: '#FEF3C7', borderRadius: '50%', color: '#D97706', marginBottom: '8px' }}>
                  <AlertTriangle size={20} strokeWidth={2.4} />
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--navy-900)', marginBottom: '4px' }}>
                  {filterTab === 'best' ? 'No matching available lorry found' : 'No lorry found for this filter'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B', maxWidth: '420px', margin: '0 auto 12px', lineHeight: 1.45 }}>
                  {filterTab === 'best' ? (
                    <>No available lorry matches both customer pickup zone <b>({customerPickupZone})</b> and fleet spec <b>({customerRequiredSpec || 'Any'})</b>.</>
                  ) : (
                    <>Try clearing search query or choosing another fleet tab.</>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {zoneCount > 0 && filterTab !== 'zone' && (
                    <button type="button" className="btn sm" onClick={() => { setFilterTab('zone'); setSelIdx(0); }} style={{ background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', fontSize: '0.74rem', fontWeight: 700, borderRadius: '16px' }}>
                      <MapPin size={11} style={{ marginRight: '4px' }} /> View {customerPickupZone} ({zoneCount})
                    </button>
                  )}
                  {specCount > 0 && filterTab !== 'spec' && (
                    <button type="button" className="btn sm" onClick={() => { setFilterTab('spec'); setSelIdx(0); }} style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', fontSize: '0.74rem', fontWeight: 700, borderRadius: '16px' }}>
                      <Truck size={11} style={{ marginRight: '4px' }} /> View {customerRequiredSpec} ({specCount})
                    </button>
                  )}
                  {filterTab !== 'available' && (
                    <button type="button" className="btn sm gh" onClick={() => { setFilterTab('available'); setSelIdx(0); }} style={{ fontSize: '0.74rem', fontWeight: 700, borderRadius: '16px' }}>
                      🟢 All Available ({availCount})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Assigned Lorry Drivers Section (2 Drivers per Lorry Only) */}
          {chosenLorry && (
            <div className="crewpick" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
              <div className="lab" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--navy-900)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assigned Lorry Drivers
                </span>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--orange)', textTransform: 'none' }}>
                  Lorry: <b>{chosenLorry.plate_no}</b>
                </span>
              </div>

              {/* Display available drivers */}
              <div className="chiprow" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {selectedLorryDrivers.length > 0 ? (
                  selectedLorryDrivers.map((d, dIdx) => {
                    const c = chosenCrew.find(x => String(x.id) === String(d.id));
                    const isSelected = Boolean(c);
                    const isPrimary = String(d.id) === String(chosenLorry.default_driver_id) || (!chosenLorry.default_driver_id && dIdx === 0);
                    const roleLabel = c ? (c.role === 'driver' ? 'Primary Driver' : 'Co-Driver') : (isPrimary ? 'Primary Driver' : 'Relief Driver');

                    return (
                      <span
                        key={d.id || d.name}
                        className={`pchip ${isSelected ? 'on' : ''}`}
                        onClick={() => toggleCrew(d.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 16px',
                          fontSize: '0.86rem',
                          fontWeight: 700,
                          borderRadius: '10px',
                          cursor: 'pointer'
                        }}
                      >
                        <UserCheck size={15} strokeWidth={2.4} />
                        {d.name} <span style={{ opacity: 0.85, fontSize: '0.75rem', fontWeight: 600 }}>• {roleLabel}</span>
                      </span>
                    );
                  })
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--slate)' }}>
                    No drivers specifically assigned to lorry {chosenLorry.plate_no}. Assign drivers in Fleet &amp; Assets.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <button
            className="btn pri"
            style={{ marginTop: '14px', width: '100%', justifyContent: 'center', height: '42px', fontSize: '0.92rem', fontWeight: 800 }}
            disabled={!canConfirm || isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting ? 'Saving assignment…' : (
              <>Confirm assignment {chosenLorry ? `(${chosenLorry.plate_no})` : ''} <kbd className="hot" style={{ marginLeft: '6px' }}>↵</kbd></>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalEl, document.body);
}

// Popup confirmation modal for approving a job before assigning
function ApproveJobConfirmationModal({ job, onClose, onConfirm }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customerName = job.customer?.company_name || job.customer_name || 'Direct Customer';
  const pickup = job.pickup_location || job.origin || 'Pickup Location';
  const dropoff = job.dropoff_location || job.destination || 'Dropoff Location';
  const rateText = job.rate_amount ? fmtMoney(job.rate_amount) : 'RM 0.00';
  const weightText = job.weight_desc || job.cargo_desc || job.lorry_spec || 'General Cargo';
  const displayDate = getJobDisplayDate(job);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleApprove();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  const handleApprove = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await onConfirm();
  };

  const modalEl = (
    <div
      className="overlay open"
      id="approveJobOv"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'approveJobOv' && onClose()}
    >
      <div
        className="cmdbox"
        style={{
          maxWidth: '560px',
          width: '100%',
          margin: 'auto',
          background: '#FFFFFF',
          borderRadius: '18px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 18px',
            borderBottom: '1px solid var(--line)',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.25) 100%)',
                color: 'var(--orange-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <ShieldCheck size={24} strokeWidth={2.4} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Approve Order for Dispatch
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate)', marginTop: '2px' }}>
                Confirm authorization to unlock vehicle and driver assignment
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--slate)'
            }}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Order Details Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Top Job & Reference Card */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '2px' }}>
                Job Number
              </span>
              <span className="jno-pill" style={{ fontSize: '0.88rem', padding: '2px 8px' }}>
                {job.job_no}
              </span>
            </div>

            {job.customer_ref && (
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '2px' }}>
                  Reference
                </span>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                  {job.customer_ref}
                </span>
              </div>
            )}

            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '2px' }}>
                Date
              </span>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--navy-900)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={13} strokeWidth={2.2} style={{ color: 'var(--slate)' }} />
                {displayDate}
              </span>
            </div>
          </div>

          {/* Customer & Route Details */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', background: '#FFFFFF' }}>
            {/* Customer Name */}
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '3px' }}>
                Customer Company
              </span>
              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={16} strokeWidth={2.2} style={{ color: 'var(--slate)', flexShrink: 0 }} />
                <span>{customerName}</span>
              </div>
            </div>

            {/* Route */}
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Haulage Route
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', width: '100%', boxSizing: 'border-box' }}>
                <span className="r-dot pickup" style={{ flexShrink: 0 }}></span>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--navy-900)' }}>{pickup}</span>
                <ArrowRight size={14} strokeWidth={2.4} style={{ color: 'var(--orange)', margin: '0 4px', flexShrink: 0 }} />
                <span className="r-dot dropoff" style={{ flexShrink: 0 }}></span>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--navy-900)' }}>{dropoff}</span>
              </div>
            </div>

            {/* Cargo & Rate Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                  Cargo / Specs
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                  {weightText}
                </span>
              </div>
              <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                  Trip Rate
                </span>
                <span style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                  {rateText}
                </span>
              </div>
            </div>
          </div>

          {/* Informational Callout */}
          <div
            style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: '10px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              fontSize: '0.78rem',
              color: '#92400E',
              lineHeight: 1.45
            }}
          >
            <CheckCircle2 size={16} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: '2px', color: '#D97706' }} />
            <div>
              <b>Ready for Assignment:</b> Once approved, the <b>Assign</b> button will be unlocked on the Job Board to assign lorry plate, driver, and crew members.
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--line)',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px'
          }}
        >
          <button className="btn gh" onClick={onClose} disabled={isSubmitting}>
            Cancel <kbd>Esc</kbd>
          </button>
          <button
            className="btn pri"
            onClick={handleApprove}
            disabled={isSubmitting}
            style={{
              background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isSubmitting ? 'Approving…' : (
              <>
                <Check size={15} strokeWidth={2.8} />
                Confirm &amp; Approve Order <kbd className="hot">↵</kbd>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalEl, document.body);
}
