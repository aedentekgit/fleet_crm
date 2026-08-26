import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb, fmtMoney, jobNoFromQuoteNo, deduplicateJobs, subscribeTable, getStorageData } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/common/Pagination';
import {
  Search,
  X,
  List,
  LayoutGrid,
  Truck,
  User,
  CheckCircle2,
  Check,
  RefreshCw,
  AlertTriangle,
  Calendar,
  ArrowRight,
  Inbox,
  Eye,
  Send,
  CheckCheck
} from 'lucide-react';
import {
  AssignModal,
  JobDetailModal,
  getJobDisplayDate
} from './JobBoard';

const FINALIZE_FILTER_TABS = [
  ['all', 'Total Assigned'],
  ['pending_finalize', 'Pending Finalize'],
  ['dispatched', 'Dispatched to Driver'],
  ['in_transit', 'In Transit'],
  ['delivered', 'Delivered']
];

export default function Finalize() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [jobs, setJobs] = useState(() => getStorageData('jobs'));
  const [lorries, setLorries] = useState(() => getStorageData('lorries'));
  const [drivers, setDrivers] = useState(() => getStorageData('drivers'));
  const [focusId, setFocusId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  // Modals
  const [assignModalJob, setAssignModalJob] = useState(null);
  const [viewJobModal, setViewJobModal] = useState(null);
  const [finalizeConfirmJob, setFinalizeConfirmJob] = useState(null);
  const [isSubmittingFinalize, setIsSubmittingFinalize] = useState(false);

  // Filters & search
  const [viewMode, setViewMode] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [urgentFilter, setUrgentFilter] = useState('all');
  const [lorryFilter, setLorryFilter] = useState('all');

  // Load database and local storage jobs
  const loadData = useCallback(async () => {
    let j = [], l = [], d = [], allQuotes = [];
    if (sb) {
      try {
        const res = await Promise.all([
          sb.from('jobs').select('*, customer:customers(company_name, phone), job_crew(role, driver:drivers(id,name,phone))').order('created_at', { ascending: false }),
          sb.from('lorries').select('*'),
          sb.from('drivers').select('*').order('name'),
          sb.from('quotations').select('*, customer:customers(company_name, phone)').order('created_at', { ascending: false })
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

        // Enrich database jobs
        j = j.map(job => {
          const linkedQ = quoteMap.get(String(job.quotation_id || '')) ||
                          quoteMap.get(String(job.job_no || '')) ||
                          quoteMap.get(String(job.customer_ref || '').replace('Quotation ', '')) ||
                          quoteMap.get(String(job.customer_ref || ''));
          let cDate = job.collection_date || job.order_date || '';
          let dDate = job.delivery_date || job.arrived_date || '';
          let pTime = job.pickup_time || '';
          let dTime = job.dropoff_time || '';

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
          }

          return {
            ...job,
            job_no: resolvedJobNo,
            quote_no: linkedQ?.quote_no || job.quote_no || resolvedJobNo,
            collection_date: cDate,
            delivery_date: dDate,
            pickup_time: pTime,
            dropoff_time: dTime,
            customer: job.customer || (linkedQ ? linkedQ.customer : null)
          };
        });
      } catch (e) {
        console.warn('Finalize page load error:', e);
      }
    }

    // Merge with localStorage if present
    try {
      const rawStored = localStorage.getItem('rens_db_jobs');
      if (rawStored) {
        const parsed = JSON.parse(rawStored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          j = [...j, ...parsed];
        }
      }
    } catch (_) {}

    // Deduplicate jobs comprehensively
    const dedupedAll = deduplicateJobs(j);

    // We filter down to orders that have been assigned a lorry or crew
    const assignedJobs = dedupedAll.filter(item => {
      const hasLorryOrCrew = Boolean(item.lorry_id || item.driver_id || (item.job_crew && item.job_crew.length > 0));
      const isAssignedStatus = item.status === 'assigned' || item.status === 'in_transit' || item.status === 'delivered';
      return (hasLorryOrCrew || isAssignedStatus) && item.status !== 'cancelled';
    });

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

    l = (l || []).map((item) => {
      if (!item) return item;
      const pNorm = (item.plate_no || '').replace(/\s+/g, '').toUpperCase();
      const targetZone = salesZoneMap.get(pNorm) || (item.zone ? item.zone : null);
      return {
        ...item,
        zone: targetZone || null
      };
    });

    setJobs(assignedJobs);
    setLorries(l);
    setDrivers(d);
  }, []);

  useEffect(() => {
    loadData();
    const unsub1 = subscribeTable('jobs', loadData);
    const unsub2 = subscribeTable('lorries', loadData);
    const unsub3 = subscribeTable('job_crew', loadData);
    const unsub4 = subscribeTable('quotations', loadData);
    return () => {
      unsub1(); unsub2(); unsub3(); unsub4();
    };
  }, [loadData]);

  // Helper to check if job is finalized
  const isJobFinalized = (job) => {
    if (!job) return false;
    return Boolean(job.is_finalized === 1 || job.is_finalized === true || job.finalized_at || job.status === 'in_transit' || job.status === 'delivered');
  };

  // Filtered jobs list
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const finalized = isJobFinalized(job);

      if (activeFilter === 'pending_finalize') {
        if (finalized) return false;
      } else if (activeFilter === 'dispatched') {
        if (!finalized || job.status === 'in_transit' || job.status === 'delivered') return false;
      } else if (activeFilter === 'in_transit') {
        if (job.status !== 'in_transit') return false;
      } else if (activeFilter === 'delivered') {
        if (job.status !== 'delivered') return false;
      }

      if (urgentFilter === 'urgent_only' && !job.urgent) return false;
      if (lorryFilter !== 'all' && job.lorry_id !== lorryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const jNo = (job.job_no || '').toLowerCase();
        const cust = (job.customer?.company_name || job.customer_name || '').toLowerCase();
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
  }, [jobs, activeFilter, urgentFilter, lorryFilter, searchQuery, lorries]);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
  }, [activeFilter, urgentFilter, lorryFilter, searchQuery]);

  const paginatedJobs = useMemo(() => {
    return filteredJobs.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredJobs, page, pageSize]);

  // Execute Finalize & Dispatch action
  const handleConfirmFinalize = async (jobToFinalize) => {
    if (!jobToFinalize || isSubmittingFinalize) return;
    setIsSubmittingFinalize(true);

    const nowIso = new Date().toISOString();
    const patch = {
      is_finalized: 1,
      finalized_at: nowIso,
      status: jobToFinalize.status === 'unassigned' ? 'assigned' : jobToFinalize.status
    };

    if (sb) {
      try {
        if (jobToFinalize.id) await sb.from('jobs').update(patch).eq('id', jobToFinalize.id);
        if (jobToFinalize.job_no) await sb.from('jobs').update(patch).eq('job_no', jobToFinalize.job_no);
        if (jobToFinalize.quotation_id) await sb.from('jobs').update(patch).eq('quotation_id', jobToFinalize.quotation_id);
      } catch (e) {
        console.warn('Finalize database update error:', e);
      }
    }

    // Update localStorage
    try {
      const raw = localStorage.getItem('rens_db_jobs');
      if (raw) {
        const parsed = JSON.parse(raw);
        const updated = parsed.map(j => {
          if (j.id === jobToFinalize.id || (jobToFinalize.job_no && j.job_no === jobToFinalize.job_no)) {
            return { ...j, is_finalized: 1, finalized_at: nowIso };
          }
          return j;
        });
        localStorage.setItem('rens_db_jobs', JSON.stringify(updated));
      }
    } catch (_) {}

    // Update state
    setJobs(prev => prev.map(j => {
      if (j.id === jobToFinalize.id || (jobToFinalize.job_no && j.job_no === jobToFinalize.job_no)) {
        return { ...j, is_finalized: 1, finalized_at: nowIso };
      }
      return j;
    }));

    if (viewJobModal?.id === jobToFinalize.id) {
      setViewJobModal(prev => prev ? { ...prev, is_finalized: 1, finalized_at: nowIso } : null);
    }

    // Trigger driver notification API
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobToFinalize.id, event: 'job_finalized_dispatched' })
      });
    } catch (_) {}

    const driverName = jobToFinalize.job_crew?.find(c => c.role === 'driver')?.driver?.name || 'Assigned Driver';
    toast(`Job ${jobToFinalize.job_no || ''} finalized & dispatched to ${driverName}! Now visible on Driver App.`, 'ok');

    setIsSubmittingFinalize(false);
    setFinalizeConfirmJob(null);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (isInput || assignModalJob || finalizeConfirmJob || viewJobModal) return;

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
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        const f = filteredJobs.find(j => j.id === focusId);
        if (f && !isJobFinalized(f)) {
          setFinalizeConfirmJob(f);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const f = filteredJobs.find(j => j.id === focusId);
        if (f) setAssignModalJob(f);
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        const f = filteredJobs.find(j => j.id === focusId);
        if (f) setViewJobModal(f);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredJobs, focusId, assignModalJob, finalizeConfirmJob, viewJobModal]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    const total = jobs.length;
    const pending = jobs.filter(j => !isJobFinalized(j)).length;
    const dispatched = jobs.filter(j => isJobFinalized(j) && j.status !== 'in_transit' && j.status !== 'delivered').length;
    const inTransit = jobs.filter(j => j.status === 'in_transit').length;
    const delivered = jobs.filter(j => j.status === 'delivered').length;
    return {
      all: total,
      pending_finalize: pending,
      dispatched: dispatched,
      in_transit: inTransit,
      delivered: delivered
    };
  }, [jobs]);

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
      {/* Header */}
      <div className="pagehead">
        <div>
          <h1>
            Finalize
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--orange-700)', background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.3)', padding: '4px 12px', borderRadius: '99px' }}>
              Driver Dispatch Confirmation
            </span>
          </h1>
          <div className="sub" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>Review assigned orders and finalize to dispatch trips directly to driver PWA</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span><kbd>J</kbd><kbd>K</kbd> Navigate</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span><kbd>F</kbd> Finalize Dispatch</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span><kbd>R</kbd> Reassign</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span><kbd>V</kbd> View</span>
          </div>
        </div>
        <div className="tools" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn gh" onClick={() => navigate('/board')}>
            Job Board <kbd>G</kbd><kbd>B</kbd>
          </button>
          <button
            className="btn pri"
            onClick={() => {
              const activeDispatchedJob = jobs.find(j => j.id === focusId && isJobFinalized(j)) || jobs.find(j => isJobFinalized(j)) || jobs[0];
              const drvId = activeDispatchedJob?.driver_id || activeDispatchedJob?.job_crew?.find(c => c.role === 'driver')?.driver_id || activeDispatchedJob?.job_crew?.[0]?.driver_id;
              navigate(drvId ? `/driver?driver=${drvId}` : (activeDispatchedJob?.job_no ? `/driver?job_no=${activeDispatchedJob.job_no}` : '/driver'));
            }}
            title="Open Driver PWA for assigned driver"
          >
            Driver App (PWA) <kbd>G</kbd><kbd>P</kbd>
          </button>
        </div>
      </div>

      {/* Filter Status Chips */}
      <div className="statsrow" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
        {FINALIZE_FILTER_TABS.map(([k, label]) => {
          const count = tabCounts[k] || 0;
          return (
            <span
              key={k}
              className={`statchip ${activeFilter === k ? 'on' : ''}`}
              onClick={() => setActiveFilter(k)}
              style={{ cursor: 'pointer' }}
            >
              {label} <b>{count}</b>
            </span>
          );
        })}
      </div>

      {/* Search & Controls Filter Bar */}
      <div
        className="filter-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          margin: '16px 0 20px',
          background: '#FFFFFF',
          padding: '12px 16px',
          borderRadius: '14px',
          border: '1px solid var(--line)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          flexWrap: 'wrap'
        }}
      >
        {/* Search input */}
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={16} strokeWidth={2.2} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search job #, customer, route, vehicle plate, driver…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              fontSize: '0.84rem',
              outline: 'none',
              background: '#F8FAFC'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Lorry filter dropdown */}
        <select
          value={lorryFilter}
          onChange={(e) => setLorryFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            fontSize: '0.82rem',
            background: '#FFFFFF',
            fontWeight: 600,
            color: 'var(--navy-900)'
          }}
        >
          <option value="all">All Vehicles</option>
          {lorries.map(l => (
            <option key={l.id} value={l.id}>{l.plate_no} ({l.capacity_desc || l.model || 'Lorry'})</option>
          ))}
        </select>

        {/* Urgent filter dropdown */}
        <select
          value={urgentFilter}
          onChange={(e) => setUrgentFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            fontSize: '0.82rem',
            background: '#FFFFFF',
            fontWeight: 600,
            color: 'var(--navy-900)'
          }}
        >
          <option value="all">All Priorities</option>
          <option value="urgent_only">⚡ Urgent Only</option>
        </select>

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRadius: '8px', padding: '3px' }}>
          <button
            onClick={() => setViewMode('list')}
            style={{
              border: 'none',
              background: viewMode === 'list' ? '#F97316' : 'transparent',
              color: viewMode === 'list' ? '#FFFFFF' : 'var(--slate)',
              padding: '6px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.78rem',
              fontWeight: 700
            }}
          >
            <List size={14} strokeWidth={2.4} /> List View
          </button>
          
        </div>
      </div>

      {/* Main List / Table View */}
      {viewMode === 'list' ? (
        <div className="desktop-table-container">
          <div className="tablecard tab-fade-in" style={{ width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
            <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '11%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Order / Job # &amp; Date</th>
                  <th style={{ width: '13%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Customer</th>
                  <th style={{ width: '11%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Route</th>
                  <th style={{ width: '11%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Cargo / Specs</th>
                  <th style={{ width: '13%', padding: '10px 6px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Vehicle &amp; Crew</th>
                  <th style={{ width: '8%', textAlign: 'right', padding: '10px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Rate</th>
                  <th style={{ width: '14%', textAlign: 'center', padding: '10px 6px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Dispatch Status</th>
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
                    const finalized = isJobFinalized(card);

                    // Dispatch status badge
                    let statusBadge = null;
                    if (!finalized) {
                      statusBadge = (
                        <span
                          className="badge amber"
                          style={{
                            fontSize: '0.66rem',
                            padding: '3px 8px',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#FEF3C7',
                            color: '#92400E',
                            border: '1px solid #FCD34D'
                          }}
                        >
                          <span className="dot-pulse" style={{ color: '#F59E0B' }}></span>
                          Pending Finalize
                        </span>
                      );
                    } else if (card.status === 'in_transit') {
                      statusBadge = (
                        <span className="badge ok" style={{ fontSize: '0.64rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                          <span className="dot-pulse" style={{ color: '#10B981' }}></span> In Transit
                        </span>
                      );
                    } else if (card.status === 'delivered') {
                      statusBadge = (
                        <span className="badge green" style={{ fontSize: '0.64rem', padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={10} strokeWidth={2.4} /> Delivered
                        </span>
                      );
                    } else {
                      statusBadge = (
                        <span
                          className="badge green"
                          style={{
                            fontSize: '0.66rem',
                            padding: '3px 8px',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#ECFDF5',
                            color: '#065F46',
                            border: '1px solid #6EE7B7'
                          }}
                        >
                          <CheckCheck size={11} strokeWidth={2.4} />
                          Dispatched to Driver
                        </span>
                      );
                    }

                    return (
                      <tr
                        key={card.id}
                        className={isFocused ? 'focus' : ''}
                        onClick={() => setFocusId(card.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Job # & Date */}
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

                        {/* Customer */}
                        <td style={{ verticalAlign: 'middle', padding: '8px 6px', textAlign: 'left', overflow: 'hidden' }}>
                          <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={customerName}>
                            {customerName}
                          </div>
                          {card.customer_ref && <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ref: {card.customer_ref}</div>}
                        </td>

                        {/* Route */}
                        <td style={{ verticalAlign: 'middle', padding: '8px 6px', textAlign: 'left', overflow: 'hidden' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#F8FAFC', padding: '2px 5px', borderRadius: '6px', border: '1px solid #E2E8F0', maxWidth: '100%' }}>
                            <span className="r-dot pickup" style={{ flexShrink: 0 }}></span>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '52px' }} title={pickup}>{pickup}</span>
                            <ArrowRight size={10} strokeWidth={2.4} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                            <span className="r-dot dropoff" style={{ flexShrink: 0 }}></span>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '52px' }} title={dropoff}>{dropoff}</span>
                          </div>
                        </td>

                        {/* Cargo / Specs */}
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

                        {/* Vehicle & Crew */}
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
                                  <span>{c.driver?.name || c.name || ''}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.74rem', color: 'var(--slate)', fontStyle: 'italic' }}>— No Lorry Assigned —</span>
                          )}
                        </td>

                        {/* Rate */}
                        <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '8px 8px', whiteSpace: 'nowrap' }}>
                          <div style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.82rem' }}>
                            {rateText}
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ verticalAlign: 'middle', textAlign: 'center', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                            {statusBadge}
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '8px 8px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', flexWrap: 'nowrap' }}>
                            {/* View Button */}
                            <button
                              className="btn gh sm"
                              style={{ height: '26px', padding: '0 6px', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}
                              onClick={(e) => { e.stopPropagation(); setViewJobModal(card); }}
                              title="View Full Job Details"
                            >
                              <Eye size={11} strokeWidth={2.2} />
                              View
                            </button>

                            {/* Finalize Button (Shown prominently if not finalized) */}
                            {!finalized ? (
                              <button
                                className="btn pri sm"
                                style={{
                                  height: '26px',
                                  padding: '0 8px',
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  flexShrink: 0,
                                  background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)'
                                }}
                                onClick={(e) => { e.stopPropagation(); setFinalizeConfirmJob(card); }}
                                title="Finalize and dispatch trip to driver app"
                              >
                                <Send size={11} strokeWidth={2.4} />
                                Finalize
                              </button>
                            ) : (
                              <button
                                className="btn sm gh"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const drvId = card.driver_id || card.job_crew?.find(c => c.role === 'driver')?.driver_id || card.job_crew?.[0]?.driver_id;
                                  navigate(drvId ? `/driver?driver=${drvId}` : `/driver?job_no=${card.job_no}`);
                                }}
                                style={{
                                  fontSize: '0.66rem',
                                  fontWeight: 800,
                                  color: '#059669',
                                  background: '#ECFDF5',
                                  border: '1px solid #A7F3D0',
                                  padding: '0 8px',
                                  height: '26px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  cursor: 'pointer'
                                }}
                                title="Open Driver PWA for this driver"
                              >
                                <Check size={12} strokeWidth={2.8} /> Dispatched
                              </button>
                            )}

                            {/* Reassign Button */}
                            <button
                              className="btn-act-reassign"
                              onClick={(e) => { e.stopPropagation(); setAssignModalJob(card); }}
                              style={{ height: '26px', padding: '0 6px', fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}
                              title="Reassign lorry plate and driver crew"
                            >
                              <RefreshCw size={10} strokeWidth={2.2} />
                              Reassign
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--slate)', fontSize: '0.9rem' }}>
                      <Inbox size={32} strokeWidth={1.8} style={{ opacity: 0.4, display: 'block', margin: '0 auto 8px' }} />
                      No assigned orders found matching your search or filters.
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
              itemName="assigned orders"
            />
          </div>
        </div>
      ) : (
        /* Board View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {filteredJobs.length > 0 ? (
            filteredJobs.map(card => {
              const crew = (card.job_crew || []).sort((a, b) => a.role === 'driver' ? -1 : 1);
              const lorry = lorries.find(l => l.id === card.lorry_id);
              const pickup = card.pickup_location || card.origin || 'Port Klang';
              const dropoff = card.dropoff_location || card.destination || 'Ipoh Depot';
              const customerName = resolveCustomerName(card);
              const rateText = card.rate_amount ? fmtMoney(card.rate_amount) : 'RM 0.00';
              const weightText = card.weight_desc || card.cargo_summary || 'General Cargo';
              const isFocused = focusId === card.id;
              const finalized = isJobFinalized(card);

              return (
                <div
                  key={card.id}
                  className={`jobcard ${isFocused ? 'focus' : ''}`}
                  onClick={() => setFocusId(card.id)}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: isFocused ? '2px solid var(--orange)' : '1px solid var(--line)',
                    padding: '16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="jno-pill">{card.job_no}</span>
                        {Boolean(card.urgent) && (
                          <span className="badge urgent" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
                            Urgent
                          </span>
                        )}
                      </div>
                      <span className="rate-tag" style={{ fontWeight: 800, color: 'var(--navy-900)' }}>{rateText}</span>
                    </div>

                    {/* Customer */}
                    <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--navy-900)', marginBottom: '6px' }}>
                      {customerName}
                    </div>

                    {/* Route */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '10px' }}>
                      <span className="r-dot pickup"></span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-900)' }}>{pickup}</span>
                      <ArrowRight size={12} strokeWidth={2.4} style={{ color: 'var(--orange)' }} />
                      <span className="r-dot dropoff"></span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-900)' }}>{dropoff}</span>
                    </div>

                    {/* Vehicle & Crew Box */}
                    <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>Assigned Vehicle</span>
                        {lorry ? (
                          <span className="plate-badge" style={{ fontSize: '0.72rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Truck size={11} strokeWidth={2.2} /> {lorry.plate_no}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: 'var(--slate)' }}>Unassigned</span>
                        )}
                      </div>
                      {crew.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {crew.map((c, idx) => (
                            <span key={idx} style={{ fontSize: '0.74rem', color: 'var(--navy-800)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <User size={11} strokeWidth={2.2} /> {c.driver?.name || c.name || ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer status & actions */}
                  <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div>
                      {!finalized ? (
                        <span className="badge amber" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Pending Finalize</span>
                      ) : (
                        <span className="badge green" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>Dispatched</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button className="btn gh sm" onClick={() => setViewJobModal(card)}>
                        View
                      </button>
                      {!finalized && (
                        <button className="btn pri sm" onClick={() => setFinalizeConfirmJob(card)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Send size={11} strokeWidth={2.4} /> Finalize
                        </button>
                      )}
                      <button className="btn-act-reassign" onClick={() => setAssignModalJob(card)}>
                        Reassign
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', color: 'var(--slate)' }}>
              No jobs matching filters.
            </div>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <Pagination
              currentPage={page}
              totalItems={filteredJobs.length}
              pageSize={pageSize}
              onPageChange={setPage}
              itemName="assigned orders"
              style={{ borderRadius: '14px', border: '1px solid var(--line)' }}
            />
          </div>
        </div>
      )}

      {/* Finalize Confirmation Modal */}
      {finalizeConfirmJob && (
        <FinalizeConfirmationModal
          job={finalizeConfirmJob}
          lorries={lorries}
          drivers={drivers}
          isSubmitting={isSubmittingFinalize}
          onClose={() => setFinalizeConfirmJob(null)}
          onConfirm={() => handleConfirmFinalize(finalizeConfirmJob)}
        />
      )}

      {/* Reassign Lorry & Crew Modal */}
      {assignModalJob && (
        <AssignModal
          job={assignModalJob}
          lorries={lorries}
          drivers={drivers}
          allJobs={jobs}
          onClose={() => setAssignModalJob(null)}
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
            toast('Reassigned to ' + (assignedLorry.plate_no || 'Lorry'), 'ok');
            setAssignModalJob(null);
          }}
        />
      )}

      {/* Full Job Details View Modal */}
      {viewJobModal && (
        <JobDetailModal
          job={viewJobModal}
          lorries={lorries}
          drivers={drivers}
          onClose={() => setViewJobModal(null)}
          onAssign={(card) => {
            setViewJobModal(null);
            setAssignModalJob(card);
          }}
          onStatusChange={(id, st) => {
            setJobs(prev => prev.map(j => j.id === id ? { ...j, status: st } : j));
            setViewJobModal(prev => prev ? { ...prev, status: st } : null);
          }}
          onCancel={(id) => {
            setViewJobModal(null);
            setJobs(prev => prev.filter(j => j.id !== id));
          }}
        />
      )}
    </div>
  );
}

// Confirmation Modal for Finalize & Dispatching trip to Driver App
function FinalizeConfirmationModal({ job, lorries = [], drivers = [], isSubmitting, onClose, onConfirm }) {
  const crew = (job.job_crew || []).sort((a, b) => a.role === 'driver' ? -1 : 1);
  const primaryDriver = crew.find(c => c.role === 'driver') || crew[0] || (drivers[0] || { name: 'Assigned Driver' });
  const lorry = lorries.find(l => l.id === job.lorry_id) || { plate_no: 'Assigned Lorry', capacity_desc: job.lorry_spec || 'Standard' };
  const customerName = job.customer?.company_name || job.customer_name || 'Direct Customer';
  const pickup = job.pickup_location || job.origin || 'Pickup Location';
  const dropoff = job.dropoff_location || job.destination || 'Dropoff Location';
  const displayDate = getJobDisplayDate(job);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!isSubmitting) onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onConfirm, isSubmitting]);

  const modalEl = (
    <div
      className="overlay open"
      id="finalizeConfirmOv"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'finalizeConfirmOv' && onClose()}
    >
      <div
        className="cmdbox"
        style={{
          maxWidth: '580px',
          width: '100%',
          margin: 'auto',
          background: '#FFFFFF',
          borderRadius: '20px',
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
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.18) 0%, rgba(234, 88, 12, 0.3) 100%)',
                color: 'var(--orange-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Send size={24} strokeWidth={2.4} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Finalize &amp; Dispatch Order
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate)', marginTop: '2px' }}>
                Release trip to driver's mobile PWA for execution
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

        {/* Content Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Job & Customer Summary Card */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span className="jno-pill" style={{ fontSize: '0.9rem', padding: '2px 8px' }}>{job.job_no}</span>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--navy-900)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={13} strokeWidth={2.2} style={{ color: 'var(--slate)' }} />
                {displayDate}
              </span>
            </div>

            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)' }}>
              {customerName}
            </div>

            {/* Route */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#FFFFFF', padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', width: '100%', boxSizing: 'border-box' }}>
              <span className="r-dot pickup" style={{ flexShrink: 0 }}></span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)' }}>{pickup}</span>
              <ArrowRight size={14} strokeWidth={2.4} style={{ color: 'var(--orange)', margin: '0 4px', flexShrink: 0 }} />
              <span className="r-dot dropoff" style={{ flexShrink: 0 }}></span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)' }}>{dropoff}</span>
            </div>
          </div>

          {/* Assigned Driver & Vehicle Confirmation Box */}
          <div
            style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
              color: '#FFFFFF',
              borderRadius: '12px',
              padding: '14px 16px',
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)'
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#F97316', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Dispatching To Vehicle &amp; Driver
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase' }}>Assigned Lorry</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                  <Truck size={15} strokeWidth={2.2} color="#F97316" />
                  {lorry.plate_no}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '1px' }}>{lorry.capacity_desc || 'Standard'}</div>
              </div>

              <div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase' }}>Primary Driver</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                  <User size={15} strokeWidth={2.2} color="#34D399" />
                  {primaryDriver.driver?.name || primaryDriver.name || 'Driver'}
                </div>
                {primaryDriver.driver?.phone && (
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '1px' }}>{primaryDriver.driver.phone}</div>
                )}
              </div>
            </div>
          </div>

          {/* Callout Notice */}
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
              <b>Driver Visibility Activation:</b> Once you click <b>Confirm &amp; Dispatch</b>, this trip will immediately appear in the <b>Driver App</b> for {primaryDriver.driver?.name || primaryDriver.name || 'the driver'} to start the trip.
            </div>
          </div>
        </div>

        {/* Footer */}
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
            onClick={onConfirm}
            disabled={isSubmitting}
            style={{
              background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isSubmitting ? 'Dispatching…' : (
              <>
                <Send size={14} strokeWidth={2.6} />
                Confirm &amp; Dispatch to Driver <kbd className="hot">↵</kbd>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalEl, document.body);
}
