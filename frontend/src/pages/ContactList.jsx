import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb, fmtDate, deduplicateJobs, subscribeTable, clearCustomerContactsData, getStorageData } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/common/Pagination';
import {
  Building2,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  Edit3,
  Trash2,
  Printer,
  Check,
  X,
  List,
  Send,
  MessageSquare,
  Copy,
  ExternalLink,
  Filter,
  Eye,
  PhoneCall,
  User,
  Users,
  Megaphone,
  Share2,
  FolderDown,
  Layers,
  ArrowRight,
  Truck,
  Sparkles,
  RotateCcw
} from 'lucide-react';

const DEFAULT_COMPANY_SETTINGS = {
  name: 'RENS DYNAMICS LOGISTICS SDN. BHD.',
  regno: '950592-K',
  address: 'P.T 2140, Sri Senawang Light Industrial Centre, 70450 Seremban, Negeri Sembilan.',
  phone: '012-616 8449',
  email: 'rensdynamic.logistics@gmail.com'
};

const DEFAULT_REGIONS = [
  'KL / SHAH ALAM / KLANG',
  'MELAKA',
  'Central Zone',
  'Zone A',
  'Zone B',
  'Zone C',
  'Zone D',
  'Southern Region (Johor)',
  'Northern Region (Penang/Perak)',
  'East Coast (Pahang)'
];

export function normalizeZone(z) {
  if (!z) return 'Zone A';
  const str = String(z).trim();
  if (/^[A-Z]$/i.test(str)) return `Zone ${str.toUpperCase()}`;
  if (/^zone\s*[A-Z]$/i.test(str)) return `Zone ${str.replace(/zone\s*/i, '').toUpperCase()}`;
  return str;
}

export function detectZone(destinationStr) {
  if (!destinationStr) return 'Zone A';
  const d = String(destinationStr).trim();
  if (/^[A-Z]$/i.test(d)) return `Zone ${d.toUpperCase()}`;
  if (/^zone\s*[A-Z]$/i.test(d)) return `Zone ${d.replace(/zone\s*/i, '').toUpperCase()}`;

  const lower = d.toLowerCase();
  if (lower.includes('bangi') || lower.includes('semenyih') || lower.includes('kajang') || lower.includes('cyberjaya') || lower.includes('putrajaya') || lower.includes('sepang') || lower.includes('klia') || lower.includes('cheras')) return 'Zone B';
  if (lower.includes('klang') || lower.includes('port klang') || lower.includes('shah alam') || lower.includes('subang') || lower.includes('petaling') || lower.includes('puchong') || lower.includes('kuala lumpur') || lower.includes('kl') || lower.includes('selayang') || lower.includes('rawang') || lower.includes('batu caves') || lower.includes('sunway')) return 'Zone C';
  if (lower.includes('johor') || lower.includes('pasir gudang') || lower.includes('tangkak') || lower.includes('muar') || lower.includes('batu pahat') || lower.includes('kluang') || lower.includes('kulai') || lower.includes('ipoh') || lower.includes('penang') || lower.includes('perak') || lower.includes('kedah') || lower.includes('kuantan') || lower.includes('pahang') || lower.includes('perlis') || lower.includes('terengganu') || lower.includes('kelantan')) return 'Zone D';
  if (lower.includes('melaka') || lower.includes('nilai') || lower.includes('seremban') || lower.includes('senawang') || lower.includes('negeri sembilan') || lower.includes('rembau') || lower.includes('ayer keroh')) return 'Zone A';
  return 'Zone A';
}

export function resolveJobPickupZone(job) {
  if (!job) return 'Zone A';
  if (job.pickup_zone) return normalizeZone(job.pickup_zone);
  if (job.collection_zone) return normalizeZone(job.collection_zone);
  if (job.origin_zone) return normalizeZone(job.origin_zone);
  if (job.pickup_location) return detectZone(job.pickup_location);
  if (job.pickup) return detectZone(job.pickup);
  if (job.origin) return detectZone(job.origin);
  if (job.zone) return normalizeZone(job.zone);
  if (job.customer?.zone) return normalizeZone(job.customer.zone);
  return 'Zone A';
}

export function resolveJobDropoffZone(job) {
  if (!job) return 'Zone A';
  if (job.dropoff_zone) return normalizeZone(job.dropoff_zone);
  if (job.drop_zone) return normalizeZone(job.drop_zone);
  if (job.delivery_zone) return normalizeZone(job.delivery_zone);
  if (job.destination_zone) return normalizeZone(job.destination_zone);
  if (job.dropoff_location) return detectZone(job.dropoff_location);
  if (job.dropoff) return detectZone(job.dropoff);
  if (job.destination) return detectZone(job.destination);
  if (job.zone) return normalizeZone(job.zone);
  return 'Zone A';
}

export function getCanonicalZone(str) {
  if (!str) return 'Zone A';
  const s = String(str).trim();
  const letterMatch = s.match(/zone\s*([a-f])/i);
  if (letterMatch) return `Zone ${letterMatch[1].toUpperCase()}`;
  if (/^[a-f]$/i.test(s)) return `Zone ${s.toUpperCase()}`;
  return detectZone(s);
}

export function isLorryCustomerZoneMatch(lorryZone, customerRegionOrZone) {
  if (!lorryZone || !customerRegionOrZone) return false;
  const lz = String(lorryZone).trim();
  const cz = String(customerRegionOrZone).trim();

  // 1. Direct exact or case-insensitive match
  if (lz.toLowerCase() === cz.toLowerCase()) return true;

  // 2. Canonical zone code match (e.g. 'Zone B' vs 'Zone B', or 'KL / SHAH ALAM / KLANG' -> 'Zone C' vs 'Zone C')
  const lzCanonical = getCanonicalZone(lz);
  const czCanonical = getCanonicalZone(cz);
  if (lzCanonical && czCanonical && lzCanonical === czCanonical) return true;

  // 3. Direct substring match
  if (lz.length > 2 && cz.toLowerCase().includes(lz.toLowerCase())) return true;
  if (cz.length > 2 && lz.toLowerCase().includes(cz.toLowerCase())) return true;

  return false;
}

export default function ContactList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const printRef = useRef(null);

  const [contacts, setContacts] = useState(() => getStorageData('customer_contacts'));
  const [lorries, setLorries] = useState(() => getStorageData('lorries'));
  const [jobs, setJobs] = useState(() => getStorageData('jobs'));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'kl' | 'melaka' | 'other'

  // Filter & Search
  const [regionFilter, setRegionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Available Lorry Outreach Modal State
  const [isOutreachOpen, setIsOutreachOpen] = useState(false);
  const [outreachZone, setOutreachZone] = useState('all');
  const [selectedLorryId, setSelectedLorryId] = useState('');
  const [outreachAudience, setOutreachAudience] = useState('un_giving'); // 'all' | 'un_giving'
  const [outreachModalCustomer, setOutreachModalCustomer] = useState(null);
  const [editedPitchText, setEditedPitchText] = useState('');
  const [isPitchCustomized, setIsPitchCustomized] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState(null);
  const [formNo, setFormNo] = useState('');
  const [formRegion, setFormRegion] = useState('');
  const [formCustomRegion, setFormCustomRegion] = useState('');
  const [formZone, setFormZone] = useState('');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formContactNo, setFormContactNo] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Modals
  const [viewingContact, setViewingContact] = useState(null);
  const [deletingContact, setDeletingContact] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Company settings
  const [settings] = useState(() => {
    try {
      const s = localStorage.getItem('rens_letterhead_settings_v2');
      return s ? JSON.parse(s) : DEFAULT_COMPANY_SETTINGS;
    } catch {
      return DEFAULT_COMPANY_SETTINGS;
    }
  });

  // Load All Data (Contacts, Lorries, Jobs)
  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [cRes, lRes, jRes] = await Promise.all([
        sb.from('customer_contacts').select('*').order('no', { ascending: true }),
        sb.from('lorries').select('*').order('plate_no', { ascending: true }),
        sb.from('jobs').select('*, lorry:lorries(id, plate_no, capacity_desc, lorry_type, zone), customer:customers(company_name, phone, email, zone)').order('created_at', { ascending: false })
      ]);

      if (cRes.data) {
        // Strip out any legacy demo contact seed items (cc-1 through cc-23)
        const nonDemo = (cRes.data || []).filter(c => {
          if (String(c.id).startsWith('cc-') && Number(c.no) >= 1 && Number(c.no) <= 23 && c.created_at === '2025-02-01T00:00:00.000Z') {
            return false;
          }
          if (String(c.id).match(/^cc-[1-9]$|^cc-1[0-9]$|^cc-2[0-3]$/)) {
            return false;
          }
          return true;
        });

        if (nonDemo.length !== (cRes.data || []).length) {
          localStorage.setItem('rens_db_customer_contacts', JSON.stringify(nonDemo));
        }

        const sorted = nonDemo.slice().sort((a, b) => (Number(a.no) || 999) - (Number(b.no) || 999));
        setContacts(sorted);
      }
      if (lRes.data) setLorries(lRes.data);
      if (jRes.data) setJobs(deduplicateJobs(jRes.data));
    } catch (e) {
      console.error('Error in loadAllData:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear all customer contacts on this page
  const handleClearAllContacts = async () => {
    if (!window.confirm('Are you sure you want to delete all customer contacts on this page? This action cannot be undone.')) {
      return;
    }
    try {
      setLoading(true);
      await clearCustomerContactsData();
      setContacts([]);
      toast('All customer contact records have been deleted', 'warn');
    } catch (e) {
      console.error('Error clearing contacts:', e);
      toast('Failed to clear contacts', 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    const unsub1 = subscribeTable('customer_contacts', loadAllData);
    const unsub2 = subscribeTable('lorries', loadAllData);
    const unsub3 = subscribeTable('jobs', loadAllData);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [loadAllData]);

  // Derived unique regions
  const allRegions = useMemo(() => {
    const set = new Set(DEFAULT_REGIONS);
    contacts.forEach(c => {
      if (c.region && c.region.trim()) set.add(c.region.trim());
    });
    return Array.from(set);
  }, [contacts]);

  // Available Lorries with resolved live/current last-zone (matching Sales & Targets)
  const availableLorries = useMemo(() => {
    let savedFleet = [];
    try {
      const saved = localStorage.getItem('rens_fleet_sales_records_v10');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) savedFleet = parsed;
      }
    } catch (_) {}

    // Track active jobs and stats for all lorries
    const lorryStatsMap = {};

    (jobs || []).forEach(j => {
      if (!j || j.status === 'cancelled' || j.status === 'unassigned') return;
      let plate = j.lorry?.plate_no || j.plate_no || '';
      if (!plate && j.lorry_id) {
        const matched = lorries.find(l => String(l.id) === String(j.lorry_id) || (l.plate_no || '').replace(/\s+/g, '').toUpperCase() === String(j.lorry_id).replace(/\s+/g, '').toUpperCase());
        if (matched?.plate_no) plate = matched.plate_no;
        else if (!String(j.lorry_id).startsWith('lorry-') && !String(j.lorry_id).startsWith('live_')) plate = j.lorry_id;
      }
      if (!plate && j.lorry_spec) {
        const matched = lorries.find(l => (l.plate_no || '').replace(/\s+/g, '').toUpperCase() === (j.lorry_spec || '').replace(/\s+/g, '').toUpperCase());
        if (matched?.plate_no) plate = matched.plate_no;
      }

      const pNorm = (plate || '').replace(/\s+/g, '').toUpperCase();
      if (!pNorm) return;

      if (!lorryStatsMap[pNorm]) {
        lorryStatsMap[pNorm] = {
          plate_no: plate,
          assigned_count: 0,
          in_transit_count: 0,
          delivered_count: 0,
          jobs: []
        };
      }

      if (j.status === 'assigned') {
        lorryStatsMap[pNorm].assigned_count += 1;
      } else if (j.status === 'in_transit') {
        lorryStatsMap[pNorm].in_transit_count += 1;
      } else if (j.status === 'delivered') {
        lorryStatsMap[pNorm].delivered_count += 1;
      }

      lorryStatsMap[pNorm].jobs.push(j);
    });

    // Find active & latest delivered jobs for each lorry
    Object.values(lorryStatsMap).forEach(stats => {
      stats.activeJob = stats.jobs.slice().reverse().find(j => j.status === 'in_transit' || j.status === 'assigned') || null;
      stats.latestDelivered = stats.jobs.slice().reverse().find(j => j.status === 'delivered') || null;
    });

    // Determine the base fleet: if savedFleet from Sales & Targets exists, use savedFleet; else use lorries from DB / active jobs
    const baseList = [];
    const seenPlates = new Set();

    if (savedFleet.length > 0) {
      savedFleet.forEach(f => {
        const pNorm = (f.plate_no || '').replace(/\s+/g, '').toUpperCase();
        if (!pNorm || seenPlates.has(pNorm)) return;
        seenPlates.add(pNorm);
        baseList.push(f);
      });
    }

    // Auto-append any lorry from jobs with active or delivered trips (matches Sales & Targets)
    Object.entries(lorryStatsMap).forEach(([pNorm, stats]) => {
      if (!seenPlates.has(pNorm)) {
        seenPlates.add(pNorm);
        const dbMatched = lorries.find(l => (l.plate_no || '').replace(/\s+/g, '').toUpperCase() === pNorm);
        baseList.push({
          id: dbMatched?.id || `live_${pNorm}`,
          plate_no: stats.plate_no || pNorm,
          capacity_desc: dbMatched?.capacity_desc || dbMatched?.lorry_type || 'Fleet Lorry',
          zone: dbMatched?.zone || 'Zone A',
          status: 'Available'
        });
      }
    });

    // If still no base list (clean fresh state), fall back to DB lorries
    if (baseList.length === 0) {
      lorries.forEach(l => {
        const pNorm = (l.plate_no || '').replace(/\s+/g, '').toUpperCase();
        if (!pNorm || seenPlates.has(pNorm)) return;
        seenPlates.add(pNorm);
        baseList.push(l);
      });
    }

    // Compute effective operational status and current zone for each lorry
    const result = [];
    baseList.forEach(item => {
      const pNorm = (item.plate_no || '').replace(/\s+/g, '').toUpperCase();
      const stats = lorryStatsMap[pNorm];
      const dbMatched = lorries.find(l => (l.plate_no || '').replace(/\s+/g, '').toUpperCase() === pNorm);

      let effectiveStatus = 'Available';
      if (stats) {
        if (stats.in_transit_count > 0) {
          effectiveStatus = 'In Transit';
        } else if (stats.assigned_count > 0) {
          effectiveStatus = 'On Job';
        } else {
          effectiveStatus = 'Available';
        }
      } else if (item.status === 'Maintenance' || item.status === 'Off Duty') {
        effectiveStatus = item.status;
      }

      // If lorry is busy on an assigned/in_transit order or in maintenance, it is not available for new outreach
      if (effectiveStatus !== 'Available') return;

      // Determine current location zone (matches Sales & Targets)
      let currentZone = null;
      let latestDestination = '';
      if (stats?.activeJob) {
        currentZone = resolveJobPickupZone(stats.activeJob);
        latestDestination = stats.activeJob.dropoff_location || '';
      } else if (stats?.latestDelivered) {
        currentZone = resolveJobDropoffZone(stats.latestDelivered);
        latestDestination = stats.latestDelivered.dropoff_location || '';
      } else if (item.zone) {
        currentZone = normalizeZone(item.zone);
      } else if (dbMatched?.zone) {
        currentZone = normalizeZone(dbMatched.zone);
      }

      result.push({
        ...item,
        id: item.id || `lorry-${pNorm}`,
        plate_no: item.plate_no,
        capacity_desc: item.capacity_desc || dbMatched?.capacity_desc || dbMatched?.lorry_type || 'Fleet Lorry',
        current_zone: currentZone,
        last_zone: currentZone,
        latest_destination: latestDestination,
        status: 'Available',
        is_available: true
      });
    });

    return result;
  }, [lorries, jobs]);

  // Available lorries strictly filtered by selected target operating zone
  const displayedFleetLorries = useMemo(() => {
    if (outreachZone === 'all') return availableLorries;
    return availableLorries.filter(l => isLorryCustomerZoneMatch(l.current_zone, outreachZone));
  }, [availableLorries, outreachZone]);

  // Stats
  const stats = useMemo(() => {
    const total = contacts.length;
    const klKlangCount = contacts.filter(c => (c.region || '').toUpperCase().includes('KL') || (c.region || '').toUpperCase().includes('KLANG')).length;
    const melakaCount = contacts.filter(c => (c.region || '').toUpperCase().includes('MELAKA')).length;
    const otherCount = total - klKlangCount - melakaCount;
    return { total, klKlangCount, melakaCount, otherCount };
  }, [contacts]);

  // Copy Contact Info
  const handleCopyContact = (c) => {
    if (!c) return;
    const lines = [
      c.customer_name,
      c.zone ? `Zone: ${c.zone}` : (c.region ? `Region: ${c.region}` : ''),
      c.address ? `Address: ${c.address}` : '',
      c.contact_person ? `Contact Person: ${c.contact_person}` : '',
      c.contact_no ? `Phone: ${c.contact_no}` : '',
      c.email ? `Email: ${c.email}` : '',
      c.notes ? `Notes: ${c.notes}` : ''
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      toast('Contact details copied to clipboard', 'ok');
    }).catch(() => {
      toast('Failed to copy to clipboard', 'err');
    });
  };

  // Direct Call helper
  const handleCall = (c) => {
    const phoneRaw = c?.contact_no || c?.phone || '';
    const phones = phoneRaw.match(/01[0-9]-?[0-9]{7,8}|03-?[0-9]{7,8}/g) || [];
    const targetPhone = phones[0] || phoneRaw.replace(/[^\d+]/g, '');
    if (!targetPhone) {
      toast('No phone number available to call', 'err');
      return;
    }
    window.open(`tel:${targetPhone}`, '_self');
  };

  // Reset form
  const resetForm = () => {
    setEditingId(null);
    setFormNo('');
    setFormRegion('');
    setFormCustomRegion('');
    setFormZone('');
    setFormCustomerName('');
    setFormAddress('');
    setFormContactPerson('');
    setFormContactNo('');
    setFormEmail('');
    setFormNotes('');
  };

  // Populate form for edit
  const handleEditContact = (c) => {
    setEditingId(c.id);
    setFormNo(c.no !== undefined && c.no !== null ? String(c.no) : '');
    setFormRegion(c.region || '');
    setFormCustomRegion('');
    setFormZone(c.zone || (c.region ? detectZone(c.region) : ''));
    setFormCustomerName(c.customer_name || '');
    setFormAddress(c.address || '');
    setFormContactPerson(c.contact_person || '');
    setFormContactNo(c.contact_no || '');
    setFormEmail(c.email || '');
    setFormNotes(c.notes || '');
    setShowForm(true);
    window.scrollTo({ top: 180, behavior: 'smooth' });
  };

  // Save / Insert / Update contact
  const handleSaveContact = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const name = formCustomerName.trim();
    if (!name) {
      toast('Customer / Company name is required', 'err');
      return;
    }

    const targetRegion = (formRegion || '').trim() || (formCustomRegion || '').trim() || 'General';
    const targetZone = formZone.trim() || (targetRegion ? detectZone(targetRegion) : 'Zone A');

    let nextNoVal = Number(formNo);
    if (!nextNoVal || isNaN(nextNoVal)) {
      const maxNo = contacts.reduce((max, c) => Math.max(max, Number(c.no) || 0), 0);
      nextNoVal = maxNo + 1;
    }

    const payload = {
      no: nextNoVal,
      region: targetRegion,
      zone: targetZone,
      customer_name: name,
      address: formAddress.trim(),
      contact_person: formContactPerson.trim(),
      contact_no: formContactNo.trim(),
      email: formEmail.trim(),
      notes: formNotes.trim(),
      updated_at: new Date().toISOString()
    };

    try {
      if (editingId) {
        const { error } = await sb.from('customer_contacts').update(payload).eq('id', editingId);
        if (error) {
          // Schema fallback if zone or address column not in table yet
          const fb = { ...payload };
          delete fb.zone;
          delete fb.address;
          await sb.from('customer_contacts').update(fb).eq('id', editingId);
        }
        toast(`Updated contact for ${name}`, 'ok');
      } else {
        payload.id = 'cc-' + Date.now();
        payload.created_at = new Date().toISOString();
        const { error } = await sb.from('customer_contacts').insert([payload]);
        if (error) {
          // Schema fallback
          const fb = { ...payload };
          delete fb.zone;
          delete fb.address;
          await sb.from('customer_contacts').insert([fb]);
        }
        toast(`New contact ${name} added`, 'ok');
      }

      resetForm();
      setShowForm(false);
      loadAllData();
    } catch (err) {
      console.error('Error saving contact:', err);
      toast('Failed to save contact. Please try again.', 'err');
    }
  };

  // Delete contact
  const confirmDelete = async () => {
    if (!deletingContact) return;
    try {
      const { error } = await sb.from('customer_contacts').delete().eq('id', deletingContact.id);
      if (error) throw error;
      toast(`Deleted contact ${deletingContact.customer_name}`, 'warn');
      setDeletingContact(null);
      loadAllData();
    } catch (err) {
      console.error('Error deleting contact:', err);
      toast('Failed to delete contact', 'err');
    }
  };

  // Generate tailored WhatsApp text for customer pitch matching lorry & zone
  const generateWhatsAppText = useCallback((customer, lorry) => {
    const custName = customer?.customer_name || customer?.company_name || 'Valued Customer';
    const contact = (customer?.contact_person || customer?.attn || 'Logistics / Dispatch Team').split('\n')[0].trim();
    const zoneName = lorry?.current_zone || customer?.pickup_zone || customer?.region || customer?.zone || (outreachZone === 'all' ? 'your area' : outreachZone);
    const lorryInfo = lorry ? `${lorry.plate_no} (${lorry.capacity_desc || lorry.lorry_type || 'Fleet Lorry'})` : 'Fleet Cargo Lorries';
    const custAddress = (customer?.address || customer?.factory_location || customer?.pickup_location || '').trim();

    return `🚚 *RENS DYNAMICS LOGISTICS — FLEET AVAILABILITY NOTICE*\n\n` +
      `Salam / Dear *${contact}* (${custName}),\n\n` +
      (custAddress ? `📍 *Customer / Factory Address:*\n${custAddress}\n\n` : '') +
      `We currently have an available fleet unit stationed in *${zoneName}*, ready for prompt loading and immediate dispatch today:\n\n` +
      `• *Available Lorry:* ${lorryInfo}\n` +
      `• *Current Operating Zone:* ${zoneName}\n` +
      `• *Operational Status:* Available & Ready for Immediate Dispatch\n` +
      `• *Service Offer:* Direct Point-to-Point Freight / Special Prompt Rates\n\n` +
      `If you have any outbound cargo, urgent collections, or shipments scheduled for pickup in ${zoneName}, we can offer priority allocation and competitive prompt dispatch rates.\n\n` +
      `Please reply directly to this message or call our dispatch desk at *${settings.phone || '012-616 8449'}* to secure this unit for your delivery.\n\n` +
      `Thank you & Best regards,\n` +
      `*${settings.name || 'Rens Dynamics Logistics Sdn Bhd'}*`;
  }, [outreachZone, settings]);

  // Generate Email Subject & Body for customer pitch matching lorry & zone
  const generateEmailContent = useCallback((customer, lorry) => {
    const custName = customer?.customer_name || customer?.company_name || 'Valued Customer';
    const contact = (customer?.contact_person || customer?.attn || 'Logistics Team').split('\n')[0].trim();
    const zoneName = lorry?.current_zone || customer?.pickup_zone || customer?.region || customer?.zone || (outreachZone === 'all' ? 'your area' : outreachZone);
    const lorryInfo = lorry ? `${lorry.plate_no} (${lorry.capacity_desc || lorry.lorry_type || 'Fleet Lorry'})` : 'Heavy Haulage & Box Lorries';
    const custAddress = (customer?.address || customer?.factory_location || customer?.pickup_location || '').trim();

    const subject = `Fleet Availability Notice — Available Lorry Unit in ${zoneName} Ready for Booking (${lorry?.plate_no || 'Fleet Unit'})`;
    const body = `Dear ${contact},\n\n` +
      `${custName}\n` +
      (custAddress ? `Address / Location: ${custAddress}\n\n` : '\n') +
      `Good day.\n\n` +
      `We would like to inform you that Rens Dynamics Logistics currently has available lorry capacity stationed in ${zoneName} ready for prompt booking and cargo haulage:\n\n` +
      `• Available Lorry Unit: ${lorryInfo}\n` +
      `• Current Operating Zone: ${zoneName}\n` +
      `• Operational Status: Ready for Immediate Loading & Dispatch\n` +
      `• Service Offer: Direct Point-to-Point Haulage & Priority Transport\n\n` +
      `If you have pending outbound cargo, collections, or delivery requirements in ${zoneName} today or this week, kindly let us know your requirements. We can arrange swift loading and seamless transportation at competitive rates.\n\n` +
      `For bookings or inquiries, please reply directly to this email or reach our operations team at ${settings.phone || '012-616 8449'} / ${settings.email || 'rensdynamic.logistics@gmail.com'}.\n\n` +
      `Thank you for your continued partnership.\n\n` +
      `Best regards,\n` +
      `Logistics & Dispatch Operations\n` +
      `${settings.name || 'Rens Dynamics Logistics Sdn Bhd'}\n` +
      `${settings.address || ''}`;

    return { subject, body };
  }, [outreachZone, settings]);

  // Handle WhatsApp action
  const handleSendWhatsApp = useCallback((customer, lorry, customText) => {
    const phoneRaw = customer?.contact_no || customer?.phone || '';
    const phones = phoneRaw.match(/01[0-9]-?[0-9]{7,8}|03-?[0-9]{7,8}/g) || [];
    let targetPhone = phones[0] || phoneRaw.replace(/[^\d+]/g, '');
    let cleanPhone = targetPhone.replace(/[^\d]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '60' + cleanPhone.slice(1);

    if (!cleanPhone) {
      toast('No valid phone number for ' + (customer?.customer_name || customer?.company_name || 'customer'), 'err');
      return;
    }
    const text = (customText !== undefined && customText !== null && customText.trim() !== '') ? customText : generateWhatsAppText(customer, lorry);
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    toast(`Opening WhatsApp for ${customer?.customer_name || customer?.company_name}`, 'ok');
  }, [generateWhatsAppText, toast]);

  // Handle Email action
  const handleSendEmail = useCallback((customer, lorry, customBody) => {
    const email = (customer?.email || '').trim();
    if (!email) {
      toast('No email address registered for ' + (customer?.customer_name || customer?.company_name || 'customer'), 'err');
      return;
    }
    const { subject, body } = generateEmailContent(customer, lorry);
    const finalBody = (customBody !== undefined && customBody !== null && customBody.trim() !== '') ? customBody : body;
    const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
    window.location.href = mailto;
    toast(`Opening email client for ${customer?.customer_name || customer?.company_name}`, 'ok');
  }, [generateEmailContent, toast]);

  // Filtered contacts for main table
  const filteredContacts = useMemo(() => {
    let list = [...contacts];

    // Tab filtering
    if (activeTab === 'kl') {
      list = list.filter(c => (c.region || '').toUpperCase().includes('KL') || (c.region || '').toUpperCase().includes('KLANG'));
    } else if (activeTab === 'melaka') {
      list = list.filter(c => (c.region || '').toUpperCase().includes('MELAKA'));
    } else if (activeTab === 'other') {
      list = list.filter(c => !(c.region || '').toUpperCase().includes('KL') && !(c.region || '').toUpperCase().includes('MELAKA'));
    }

    // Dropdown Region filter
    if (regionFilter !== 'all') {
      list = list.filter(c => (c.region || '').toLowerCase() === regionFilter.toLowerCase());
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c =>
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.contact_person || '').toLowerCase().includes(q) ||
        (c.contact_no || '').toLowerCase().includes(q) ||
        (c.region || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q) ||
        String(c.no).includes(q)
      );
    }

    return list;
  }, [contacts, activeTab, regionFilter, searchQuery]);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
  }, [activeTab, regionFilter, searchQuery]);

  const paginatedContacts = useMemo(() => {
    return filteredContacts.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredContacts, page, pageSize]);

  // Target customers for Active Outreach Modal strictly matched with Lorry Last Zone
  const outreachTargetCustomers = useMemo(() => {
    // Determine chosen lorry if selected
    const chosenLorry = selectedLorryId ? availableLorries.find(l => String(l.id) === String(selectedLorryId)) : null;

    let list = contacts.map(c => {
      const custPickupZone = c.region || c.zone || 'Zone A';
      
      // Count active running/assigned jobs for this customer
      const activeJobsCount = jobs.filter(j => 
        (j.status === 'assigned' || j.status === 'in_transit') &&
        ((j.customer_name && c.customer_name && j.customer_name.toLowerCase().trim() === c.customer_name.toLowerCase().trim()) ||
         (j.customer_id && String(j.customer_id) === String(c.id)))
      ).length;

      // Find best matched available lorry for this customer's pickup zone
      let matchedLorry = chosenLorry;
      if (!matchedLorry) {
        matchedLorry = availableLorries.find(l => isLorryCustomerZoneMatch(l.current_zone, custPickupZone)) || null;
      }

      const isZoneMatched = matchedLorry ? isLorryCustomerZoneMatch(matchedLorry.current_zone, custPickupZone) : false;

      return {
        ...c,
        pickup_zone: custPickupZone,
        activeJobsCount,
        matchedLorry,
        isZoneMatched
      };
    });

    // 1. If a specific lorry is chosen: ONLY show customers whose pickup zone matches this lorry's last zone
    if (chosenLorry) {
      list = list.filter(c => isLorryCustomerZoneMatch(chosenLorry.current_zone, c.pickup_zone));
    } else if (outreachZone !== 'all') {
      // 2. If a specific operating zone is selected: ONLY show customers matching that zone AND have available lorry
      list = list.filter(c => isLorryCustomerZoneMatch(outreachZone, c.pickup_zone));
    } else {
      // 3. All Operating Zones + Auto: Show customers that have a matching available lorry in their zone
      if (outreachAudience === 'un_giving') {
        list = list.filter(c => c.isZoneMatched && Boolean(c.matchedLorry));
      }
    }

    // 4. Target audience filter (No Active Orders vs All Customers)
    if (outreachAudience === 'un_giving') {
      list = list.filter(c => c.activeJobsCount === 0);
    }

    return list;
  }, [contacts, jobs, availableLorries, selectedLorryId, outreachZone, outreachAudience]);

  // Active target customer in outreach modal
  const activeOutreachCustomer = useMemo(() => {
    return outreachModalCustomer || outreachTargetCustomers[0] || contacts[0] || null;
  }, [outreachModalCustomer, outreachTargetCustomers, contacts]);

  const activeOutreachLorry = useMemo(() => {
    if (selectedLorryId) {
      return availableLorries.find(l => String(l.id) === String(selectedLorryId)) || availableLorries[0] || null;
    }
    if (activeOutreachCustomer?.matchedLorry) {
      return activeOutreachCustomer.matchedLorry;
    }
    if (outreachZone !== 'all') {
      const zoneLorry = availableLorries.find(l => isLorryCustomerZoneMatch(l.current_zone, outreachZone));
      if (zoneLorry) return zoneLorry;
    }
    return availableLorries[0] || null;
  }, [availableLorries, selectedLorryId, activeOutreachCustomer, outreachZone]);

  // Keep edited pitch text synchronized when active customer or lorry changes and not manually customized
  useEffect(() => {
    if (isOutreachOpen && !isPitchCustomized && activeOutreachCustomer) {
      setEditedPitchText(generateWhatsAppText(activeOutreachCustomer, activeOutreachLorry));
    }
  }, [isOutreachOpen, activeOutreachCustomer, activeOutreachLorry, isPitchCustomized, generateWhatsAppText]);

  // Grouped by region for grouped table view
  const groupedContacts = useMemo(() => {
    const groups = {};
    filteredContacts.forEach(c => {
      const reg = (c.region || 'OTHER REGIONS').trim().toUpperCase();
      if (!groups[reg]) groups[reg] = [];
      groups[reg].push(c);
    });
    return groups;
  }, [filteredContacts]);

  // Trigger browser print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page contact-list-page">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div className="pagehead">
        <div>
          <h1>Customer Contact Registry</h1>
          <div className="sub">
            {settings.regno ? `${settings.regno} • ` : ''}Customer directory, regional contact personnel &amp; fast communication records.
          </div>
        </div>

        <div className="tools" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {contacts.length > 0 && (
            <button
              type="button"
              className="btn gh"
              onClick={handleClearAllContacts}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#EF4444', borderColor: '#FCA5A5' }}
              title="Delete all customer contacts on this page"
            >
              <Trash2 size={15} />
              <span>Clear Contacts</span>
            </button>
          )}

          <button
            type="button"
            className="btn gh"
            onClick={() => setShowPrintModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title="Preview & Print Customer Contact Sheet"
          >
            <Printer size={15} />
            <span>Print Contact Sheet</span>
          </button>

          <button
            type="button"
            className={`btn ${showForm ? 'gh' : 'pri'}`}
            onClick={() => {
              if (showForm) resetForm();
              setShowForm(!showForm);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {showForm ? (
              <>
                <List size={15} />
                <span>Show List Only</span>
              </>
            ) : (
              <>
                <Plus size={15} strokeWidth={2.4} />
                <span>Show Form &amp; Register</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Top KPI Stat Cards ─────────────────────────────────── */}
      <div className="kpis" style={{ marginBottom: '24px' }}>
        <div className="kpi">
          <div className="k">Total Contacts</div>
          <div className="v">{stats.total}</div>
          <div className="d up">{stats.total} Registered Accounts</div>
        </div>

        <div className="kpi">
          <div className="k">KL / Shah Alam / Klang</div>
          <div className="v" style={{ color: '#2563EB' }}>{stats.klKlangCount}</div>
          <div className="d">Central Zone directory</div>
        </div>

        <div className="kpi">
          <div className="k">Melaka Region</div>
          <div className="v" style={{ color: '#10B981' }}>{stats.melakaCount}</div>
          <div className="d up">Southern Zone directory</div>
        </div>

        <div className="kpi">
          <div className="k">Fleet Ready Units</div>
          <div className="v" style={{ color: 'var(--orange)' }}>{availableLorries.length} Units</div>
          <div className="d">Ready for Immediate Dispatch</div>
        </div>
      </div>

      {/* ── Top Navigation Tabs / Chips ────────────────────────── */}
      <div className="statsrow" style={{ marginBottom: '24px' }}>
        <button
          className={`statchip ${activeTab === 'all' ? 'on' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          ALL CONTACTS <b>{stats.total}</b>
        </button>
      </div>

      {/* ── Available Lorry Customer Outreach Quick Bar ──────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
          border: '1px solid #334155',
          borderRadius: '16px',
          padding: '16px 20px',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '24px',
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(249, 115, 22, 0.15)',
              border: '1px solid rgba(249, 115, 22, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--orange)',
              flexShrink: 0
            }}
          >
            <Megaphone size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Available Lorry Customer Outreach</span>
              <span style={{ fontSize: '0.72rem', background: '#10B981', color: '#FFFFFF', padding: '2px 8px', borderRadius: '999px', fontWeight: 800 }}>
                {availableLorries.length} Units Ready
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '2px' }}>
              Instantly notify customers in specific zones with no active orders via WhatsApp &amp; Email to book available lorries.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Quick Zone Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.08)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)' }}>
            <MapPin size={14} style={{ color: 'var(--orange)' }} />
            <select
              value={outreachZone}
              onChange={(e) => setOutreachZone(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#F8FAFC',
                fontSize: '0.82rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all" style={{ background: '#1E293B', color: '#FFF' }}>All Operating Zones</option>
              {allRegions.map(z => (
                <option key={z} value={z} style={{ background: '#1E293B', color: '#FFF' }}>{z}</option>
              ))}
            </select>
          </div>

          {/* Launch Zone Outreach Modal Button */}
          <button
            type="button"
            className="btn pri"
            onClick={() => {
              setOutreachModalCustomer(null);
              setIsOutreachOpen(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 16px', fontSize: '0.82rem', fontWeight: 700 }}
          >
            <Send size={14} />
            <span>Launch Zone Outreach</span>
          </button>
        </div>
      </div>

      {/* ── Form: Register / Edit Contact Panel ───────────────── */}
      {showForm && (
        <div
          className="panel"
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '24px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', margin: 0 }}>
              {editingId ? `Edit Contact — ${formCustomerName}` : 'Register New Customer Contact'}
            </h2>
            <button
              type="button"
              className="btn sm gh"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
            >
              <X size={14} />
            </button>
          </div>

          <form onSubmit={handleSaveContact}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px 20px', fontSize: '0.86rem' }}>
              {/* Row 1: Customer Name & Operating Region */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Customer / Company Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. TOPAZ EVERGREEN SDN. BHD."
                  value={formCustomerName}
                  onChange={(e) => setFormCustomerName(e.target.value)}
                  required
                  style={{ width: '100%', height: '42px', borderRadius: '10px' }}
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Operating Region / Territory *
                </label>
                <input
                  type="text"
                  placeholder="e.g. KL / Shah Alam / Klang, Melaka, Johor..."
                  value={formRegion}
                  onChange={(e) => {
                    const r = e.target.value;
                    setFormRegion(r);
                    const detected = detectZone(r);
                    if (detected) setFormZone(detected);
                  }}
                  required
                  style={{ width: '100%', height: '42px', borderRadius: '10px' }}
                />
              </div>

              {/* Row 2: Contact Person & Contact No */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Contact Person(s)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Mr K.H Tan&#10;Mawi"
                  value={formContactPerson}
                  onChange={(e) => setFormContactPerson(e.target.value)}
                  style={{ width: '100%', minHeight: '68px', borderRadius: '10px', padding: '10px 12px' }}
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Contact No(s) / Phone (H/P, Tel, Off) *
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. H/P: 012-379 5663&#10;H/P: 012-6462011"
                  value={formContactNo}
                  onChange={(e) => setFormContactNo(e.target.value)}
                  style={{ width: '100%', minHeight: '68px', borderRadius: '10px', padding: '10px 12px' }}
                />
              </div>

              {/* Row 3: Email & Notes */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="contact@company.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  style={{ width: '100%', height: '42px', borderRadius: '10px' }}
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Notes / Factory Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Gate 3 collection, call 1 hour before arrival"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  style={{ width: '100%', height: '42px', borderRadius: '10px' }}
                />
              </div>

              {/* Row 4: Address / Factory Location (Full width) */}
              <div className="field" style={{ gridColumn: '1 / -1', margin: 0 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Address / Factory Location (Street, Industrial Estate, Postcode, City)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Lot 2140, Sri Senawang Light Industrial Centre, 70450 Seremban, Negeri Sembilan"
                  value={formAddress}
                  onChange={(e) => {
                    const addr = e.target.value;
                    setFormAddress(addr);
                    if (!formZone || formZone === 'Zone A') {
                      const detected = detectZone(addr);
                      if (detected) setFormZone(detected);
                    }
                  }}
                  style={{ width: '100%', minHeight: '62px', borderRadius: '10px', padding: '10px 12px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '22px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <button type="submit" className="btn pri" style={{ fontWeight: 700, height: '40px', padding: '0 20px', fontSize: '0.84rem' }}>
                {editingId ? 'Save Changes' : 'Register Contact'}
              </button>
              <button
                type="button"
                className="btn gh"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                style={{ height: '40px', padding: '0 18px', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Registered Contacts Directory Table Panel ───────── */}
      <div
        className="panel"
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--line)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {/* Table Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', margin: 0 }}>
              Registered Contacts
            </h2>
            <span className="badge" style={{ background: '#F1F5F9', color: 'var(--navy-900)', fontWeight: 800, padding: '3px 10px', borderRadius: '12px' }}>
              {filteredContacts.length} {filteredContacts.length === 1 ? 'Contact' : 'Contacts'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Region Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', border: '1px solid var(--line)', borderRadius: '8px', padding: '0 8px', height: '34px' }}>
              <MapPin size={13} style={{ color: 'var(--orange)' }} />
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--navy-900)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Regions</option>
                {allRegions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', width: '240px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)' }} />
              <input
                type="text"
                placeholder="Search company, person, phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: '32px', height: '34px', fontSize: '0.84rem', background: '#FFF', border: '1px solid var(--line)', borderRadius: '8px' }}
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        {filteredContacts.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--slate)', border: '1px dashed var(--line)', borderRadius: '12px' }}>
            <Building2 size={32} style={{ color: 'var(--slate)', opacity: 0.5, marginBottom: '8px' }} />
            <div style={{ fontWeight: 700, fontSize: '0.94rem' }}>No contacts found</div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>Try adjusting your search query or region filter.</div>
          </div>
        ) : (
          /* Table View */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', color: 'var(--slate)', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '12px 14px', width: '50px', textAlign: 'center' }}>NO.</th>
                  <th style={{ padding: '12px 14px' }}>CUSTOMER / COMPANY</th>
                  <th style={{ padding: '12px 14px' }}>REGION</th>
                  <th style={{ padding: '12px 14px' }}>CONTACT PERSON</th>
                  <th style={{ padding: '12px 14px' }}>CONTACT NO.</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {paginatedContacts.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--slate)' }}>
                      {c.no || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'var(--navy-900)', fontSize: '0.9rem' }}>{c.customer_name}</strong>
                        {c.zone && (
                          <span style={{ fontSize: '0.68rem', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                            {c.zone}
                          </span>
                        )}
                      </div>
                      {c.address && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                          <MapPin size={11} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                          <span>{c.address}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '0.72rem', background: '#F1F5F9', color: 'var(--navy-900)', padding: '2px 7px', borderRadius: '5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={11} style={{ color: 'var(--orange)' }} />
                        {c.region || 'General'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--navy-900)', fontWeight: 600, whiteSpace: 'pre-line' }}>
                      {c.contact_person || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#0F172A', fontWeight: 600, fontSize: '0.84rem', whiteSpace: 'pre-line' }}>
                      {c.contact_no || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => setViewingContact(c)}
                        style={{ marginRight: '5px', height: '30px', padding: '0 9px', background: '#F1F5F9', color: 'var(--navy-900)', border: '1px solid var(--line)', fontSize: '0.76rem', fontWeight: 800 }}
                      >
                        <Eye size={13} style={{ color: '#2563EB', marginRight: '4px' }} />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        className="btn sm gh"
                        onClick={() => handleEditContact(c)}
                        style={{ marginRight: '5px', height: '30px', padding: '0 8px' }}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn sm gh"
                        onClick={() => setDeletingContact(c)}
                        style={{ height: '30px', padding: '0 8px', color: '#DC2626' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              currentPage={page}
              totalItems={filteredContacts.length}
              pageSize={pageSize}
              onPageChange={setPage}
              itemName="contacts"
            />
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════
          MODAL: AVAILABLE LORRY CUSTOMER OUTREACH & DISPATCH PITCH
      ═════════════════════════════════════════════════════════════ */}
      {isOutreachOpen && createPortal(
        <div
          className="overlay open"
          onClick={() => {
            setIsOutreachOpen(false);
            setOutreachModalCustomer(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
            zIndex: 99999
          }}
        >
          <div
            className="cmdbox"
            style={{
              maxWidth: '1280px',
              width: '96vw',
              height: '88vh',
              maxHeight: '880px',
              background: '#FFFFFF',
              borderRadius: '22px',
              padding: '0',
              margin: 'auto',
              boxShadow: '0 30px 80px -15px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.1)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              textAlign: 'left'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. Sleek Modern Header */}
            <div
              style={{
                padding: '16px 26px',
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                color: '#FFFFFF',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.3), rgba(249, 115, 22, 0.1))',
                    border: '1px solid rgba(249, 115, 22, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--orange)',
                    boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)',
                    flexShrink: 0
                  }}
                >
                  <Megaphone size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.16rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.2px' }}>
                      Available Lorry Outreach &amp; Dispatch Pitch Studio
                    </h3>
                    <span style={{ fontSize: '0.72rem', background: '#10B981', color: '#FFF', padding: '2px 10px', borderRadius: '999px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FFF' }}></span>
                      {availableLorries.length} Units Ready
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '2px' }}>
                    Match available fleet capacity in specific zones with customers to broadcast instant tailored WhatsApp &amp; Email pitches.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsOutreachOpen(false);
                  setOutreachModalCustomer(null);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '50%',
                  width: '34px',
                  height: '34px',
                  color: '#CBD5E1',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                  e.currentTarget.style.color = '#FFF';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = '#CBD5E1';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* 2. Compact Control Toolbar */}
            <div
              style={{
                padding: '12px 24px',
                background: '#F8FAFC',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
                flexWrap: 'wrap',
                flexShrink: 0
              }}
            >
              {/* Controls Left */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                {/* 1. Zone Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '10px', padding: '0 12px', height: '36px', boxShadow: 'var(--shadow-sm)' }}>
                  <MapPin size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase' }}>Zone:</span>
                  <select
                    value={outreachZone}
                    onChange={(e) => {
                      const newZone = e.target.value;
                      setOutreachZone(newZone);
                      if (selectedLorryId) {
                        const currentL = availableLorries.find(l => String(l.id) === String(selectedLorryId));
                        if (currentL && newZone !== 'all' && !isLorryCustomerZoneMatch(currentL.current_zone, newZone)) {
                          const zoneMatchLorry = availableLorries.find(l => isLorryCustomerZoneMatch(l.current_zone, newZone));
                          setSelectedLorryId(zoneMatchLorry ? zoneMatchLorry.id : '');
                        }
                      }
                    }}
                    style={{ border: 'none', background: 'transparent', fontSize: '0.84rem', fontWeight: 700, color: 'var(--navy-900)', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="all">All Operating Zones</option>
                    {allRegions.map(z => {
                      const readyCount = availableLorries.filter(l => isLorryCustomerZoneMatch(l.current_zone, z)).length;
                      return (
                        <option key={z} value={z}>
                          {z} {readyCount > 0 ? `(${readyCount} Ready)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2. Audience Switcher */}
                <div style={{ display: 'flex', background: '#E2E8F0', padding: '3px', borderRadius: '10px', height: '36px', boxSizing: 'border-box' }}>
                  <button
                    type="button"
                    onClick={() => setOutreachAudience('un_giving')}
                    style={{
                      border: 'none',
                      background: outreachAudience === 'un_giving' ? '#FFFFFF' : 'transparent',
                      color: outreachAudience === 'un_giving' ? 'var(--orange)' : 'var(--navy-800)',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      padding: '0 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: outreachAudience === 'un_giving' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>⚡ No Active Orders</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutreachAudience('all')}
                    style={{
                      border: 'none',
                      background: outreachAudience === 'all' ? '#FFFFFF' : 'transparent',
                      color: outreachAudience === 'all' ? 'var(--navy-900)' : 'var(--navy-800)',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      padding: '0 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      boxShadow: outreachAudience === 'all' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>👥 All Accounts</span>
                  </button>
                </div>
              </div>

              {/* Status Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--slate)' }}>
                <Truck size={14} style={{ color: '#059669' }} />
                <span><strong>{displayedFleetLorries.length}</strong> lorries matching current filter</span>
              </div>
            </div>

            {/* 3. Horizontal Fleet Lorry Selector Bar */}
            <div
              style={{
                padding: '9px 24px',
                background: '#FFFFFF',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflowX: 'auto',
                flexShrink: 0,
                scrollbarWidth: 'thin'
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>Fleet Units:</span>
              </div>

              {/* Auto Match Button */}
              <div
                onClick={() => setSelectedLorryId('')}
                style={{
                  padding: '5px 12px',
                  background: !selectedLorryId ? '#FFFBEB' : '#F8FAFC',
                  border: !selectedLorryId ? '1.5px solid var(--orange)' : '1px solid var(--line)',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  boxShadow: !selectedLorryId ? '0 2px 6px rgba(249, 115, 22, 0.15)' : 'none'
                }}
              >
                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: !selectedLorryId ? 'var(--orange)' : 'var(--navy-900)' }}>
                  ⚡ Auto Match (All Fleet)
                </span>
                {!selectedLorryId && <Check size={12} style={{ color: 'var(--orange)' }} />}
              </div>

              {/* Individual Lorry Pills */}
              {displayedFleetLorries.map(lorry => {
                const isSelected = String(lorry.id) === String(selectedLorryId);
                const zoneColor = lorry.current_zone === 'Zone B'
                  ? { bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' }
                  : lorry.current_zone === 'Zone C'
                  ? { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' }
                  : lorry.current_zone === 'Zone D'
                  ? { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' }
                  : { bg: '#F3E8FF', color: '#6B21A8', border: '#E9D5FF' };

                return (
                  <div
                    key={lorry.id}
                    onClick={() => {
                      setSelectedLorryId(lorry.id);
                      if (lorry.current_zone) {
                        setOutreachZone(lorry.current_zone);
                      }
                    }}
                    style={{
                      padding: '4px 10px',
                      background: isSelected ? '#FFFBEB' : '#FFFFFF',
                      border: isSelected ? '1.5px solid var(--orange)' : '1px solid var(--line)',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 6px rgba(249, 115, 22, 0.18)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }}></span>
                      <strong style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: isSelected ? 'var(--orange)' : 'var(--navy-900)' }}>
                        {lorry.plate_no}
                      </strong>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--slate)' }}>
                      {lorry.capacity_desc || lorry.lorry_type || 'Fleet'}
                    </span>
                    <span style={{ fontSize: '0.66rem', background: zoneColor.bg, color: zoneColor.color, border: `1px solid ${zoneColor.border}`, padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                      {lorry.current_zone || 'Zone A'}
                    </span>
                    {isSelected && <Check size={11} style={{ color: 'var(--orange)' }} />}
                  </div>
                );
              })}
            </div>

            {/* 4. Split-Screen Main Content Body */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
                background: '#F1F5F9',
                overflow: 'hidden'
              }}
            >
              {/* ── Left Column: Target Customers List ── */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden',
                  borderRight: '1px solid var(--line)',
                  background: '#FFFFFF'
                }}
              >
                {/* Left Sub-Header */}
                <div
                  style={{
                    padding: '10px 20px',
                    borderBottom: '1px solid var(--line)',
                    background: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                      Target Customers in {outreachZone === 'all' ? 'All Operating Zones' : outreachZone}
                    </span>
                    <span style={{ fontSize: '0.7rem', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '1px 7px', borderRadius: '999px', fontWeight: 800 }}>
                      {outreachTargetCustomers.length} Accounts
                    </span>
                  </div>

                  <span style={{ fontSize: '0.72rem', color: 'var(--slate)' }}>
                    Click card to preview pitch
                  </span>
                </div>

                {/* Customer Cards List Container */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  {outreachTargetCustomers.length === 0 ? (
                    <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--slate)', background: '#F8FAFC', borderRadius: '16px', border: '1px dashed var(--line)', margin: 'auto 0' }}>
                      <Truck size={34} style={{ color: '#CBD5E1', marginBottom: '8px' }} />
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--navy-900)' }}>No Zone Matched Customers Found</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: '4px', maxWidth: '340px', margin: '4px auto 12px auto', lineHeight: '1.4' }}>
                        No customers found matching the selected zone and lorry criteria.
                      </div>
                      <button
                        type="button"
                        className="btn sm gh"
                        onClick={() => {
                          setSelectedLorryId('');
                          setOutreachZone('all');
                          setOutreachAudience('all');
                        }}
                      >
                        Reset All Filters
                      </button>
                    </div>
                  ) : (
                    outreachTargetCustomers.map((cust) => {
                      const custMatchedLorry = cust.matchedLorry || (selectedLorryId ? availableLorries.find(l => String(l.id) === String(selectedLorryId)) : availableLorries[0]);
                      const isSpecific = (outreachModalCustomer && outreachModalCustomer.id === cust.id) || (!outreachModalCustomer && activeOutreachCustomer?.id === cust.id);

                      return (
                        <div
                          key={cust.id}
                          onClick={() => {
                            setOutreachModalCustomer(cust);
                            setIsPitchCustomized(false);
                            setEditedPitchText(generateWhatsAppText(cust, custMatchedLorry));
                          }}
                          style={{
                            padding: '12px 14px',
                            background: isSpecific ? '#FFFDF5' : '#FFFFFF',
                            border: isSpecific ? '1.5px solid var(--orange)' : '1px solid var(--line)',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            boxShadow: isSpecific ? '0 3px 12px rgba(249, 115, 22, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                            transition: 'all 0.15s ease',
                            position: 'relative'
                          }}
                          onMouseEnter={(e) => { if (!isSpecific) e.currentTarget.style.borderColor = '#94A3B8'; }}
                          onMouseLeave={(e) => { if (!isSpecific) e.currentTarget.style.borderColor = 'var(--line)'; }}
                        >
                          {/* Top: Customer Name + Badges */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <strong style={{ color: isSpecific ? 'var(--orange)' : 'var(--navy-900)', fontSize: '0.9rem', lineHeight: '1.2' }}>
                                  {cust.customer_name}
                                </strong>
                                <span style={{ fontSize: '0.68rem', background: '#F1F5F9', color: 'var(--navy-900)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                  📍 {cust.pickup_zone || cust.region || 'Zone A'}
                                </span>
                                {cust.activeJobsCount === 0 && (
                                  <span style={{ fontSize: '0.66rem', background: '#FEF3C7', color: '#D97706', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                                    ⚡ 0 Active
                                  </span>
                                )}
                              </div>
                            </div>

                            {isSpecific && (
                              <span style={{ fontSize: '0.66rem', background: 'var(--orange)', color: '#FFF', padding: '2px 7px', borderRadius: '999px', fontWeight: 800, flexShrink: 0 }}>
                                Active Preview
                              </span>
                            )}
                          </div>

                          {/* Matched Lorry Ribbon */}
                          {custMatchedLorry ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                              <Truck size={12} style={{ color: '#059669', flexShrink: 0 }} />
                              <span>Matched: <strong>{custMatchedLorry.plate_no}</strong> ({custMatchedLorry.capacity_desc || custMatchedLorry.lorry_type || 'Fleet'}) &bull; In {custMatchedLorry.current_zone}</span>
                            </div>
                          ) : null}

                          {/* Address Info if present */}
                          {cust.address && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '0.72rem', color: 'var(--slate)', lineHeight: 1.35 }}>
                              <MapPin size={11} style={{ color: '#F97316', flexShrink: 0, marginTop: '2px' }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {cust.address}
                              </span>
                            </div>
                          )}

                          {/* Contact Info & Actions Bar */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px dashed #F1F5F9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--slate)', flexWrap: 'wrap' }}>
                              <span>Attn: <strong style={{ color: 'var(--navy-800)' }}>{(cust.contact_person || 'Logistics').split('\n')[0]}</strong></span>
                              <span>Tel: <strong style={{ color: 'var(--navy-800)' }}>{cust.contact_no || cust.phone || '—'}</strong></span>
                            </div>

                            {/* Quick Dispatch Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleSendWhatsApp(cust, custMatchedLorry)}
                                style={{
                                  border: 'none',
                                  background: '#10B981',
                                  color: '#FFFFFF',
                                  padding: '4px 9px',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 1px 4px rgba(16, 185, 129, 0.25)',
                                  transition: 'all 0.15s ease'
                                }}
                                title={`Open WhatsApp chat with ${cust.customer_name}`}
                              >
                                <Phone size={11} />
                                <span>WhatsApp</span>
                              </button>

                              {cust.email && (
                                <button
                                  type="button"
                                  onClick={() => handleSendEmail(cust, custMatchedLorry)}
                                  style={{
                                    border: 'none',
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    padding: '4px 9px',
                                    borderRadius: '6px',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 4px rgba(37, 99, 235, 0.25)',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title={`Send Email to ${cust.customer_name}`}
                                >
                                  <Mail size={11} />
                                  <span>Email</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Right Column: Live Message Pitch Studio ── */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden',
                  background: '#F8FAFC'
                }}
              >
                {/* Studio Header & Channel Tabs */}
                <div
                  style={{
                    padding: '10px 18px',
                    borderBottom: '1px solid var(--line)',
                    background: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={15} style={{ color: 'var(--orange)' }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--navy-900)', textTransform: 'uppercase' }}>
                      Pitch Studio
                    </span>
                  </div>

                  {/* Editor Action Tools */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPitchCustomized(false);
                        setEditedPitchText(generateWhatsAppText(activeOutreachCustomer, activeOutreachLorry));
                        toast('Message reset to auto-generated template', 'ok');
                      }}
                      style={{
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: 'var(--slate)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Reset customized text back to default generated template"
                    >
                      <RotateCcw size={11} />
                      <span>Reset</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const msg = editedPitchText || generateWhatsAppText(activeOutreachCustomer, activeOutreachLorry);
                        navigator.clipboard.writeText(msg);
                        toast('Pitch copied to clipboard!', 'ok');
                      }}
                      style={{
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: 'var(--navy-900)',
                        padding: '4px 9px',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      <Copy size={11} />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>

                {/* Studio Body (Scrollable Editor & Dispatch) */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  {/* Active Target Banner */}
                  <div
                    style={{
                      padding: '9px 12px',
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      fontSize: '0.76rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={13} style={{ color: '#2563EB', flexShrink: 0 }} />
                        <span>To: <strong style={{ color: 'var(--navy-900)' }}>{activeOutreachCustomer?.customer_name || 'Customer'}</strong></span>
                      </div>
                      {activeOutreachCustomer?.region && (
                        <span style={{ fontSize: '0.68rem', background: '#DBEAFE', color: '#1D4ED8', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                          📍 Pickup: {activeOutreachCustomer.region}
                        </span>
                      )}
                    </div>

                    {activeOutreachCustomer?.address && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '0.72rem', color: 'var(--slate)' }}>
                        <MapPin size={12} style={{ color: '#2563EB', flexShrink: 0, marginTop: '1px' }} />
                        <span style={{ color: 'var(--navy-800)', lineHeight: 1.3 }}>{activeOutreachCustomer.address}</span>
                      </div>
                    )}

                    {activeOutreachLorry && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#047857' }}>
                        <Truck size={12} style={{ color: '#059669' }} />
                        <span>Unit: <strong>{activeOutreachLorry.plate_no}</strong> ({activeOutreachLorry.capacity_desc || activeOutreachLorry.lorry_type || 'Fleet Lorry'}) &bull; <strong>Now in {activeOutreachLorry.current_zone || 'Zone A'}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Live Editable Textarea Box */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '200px' }}>
                    <textarea
                      value={editedPitchText}
                      onChange={(e) => {
                        setEditedPitchText(e.target.value);
                        setIsPitchCustomized(true);
                      }}
                      placeholder="Type or customize your outreach dispatch pitch here..."
                      style={{
                        width: '100%',
                        flex: 1,
                        minHeight: '200px',
                        background: '#FFFFFF',
                        border: isPitchCustomized ? '1.5px solid var(--orange)' : '1px solid #CBD5E1',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        fontSize: '0.8rem',
                        lineHeight: '1.5',
                        color: 'var(--navy-900)',
                        fontFamily: 'inherit',
                        outline: 'none',
                        resize: 'none',
                        boxSizing: 'border-box',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)'
                      }}
                    />
                  </div>

                  {/* Direct Action Dispatch Bar */}
                  <div style={{ display: 'grid', gridTemplateColumns: activeOutreachCustomer?.email ? '1fr 1fr' : '1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(activeOutreachCustomer, activeOutreachLorry, editedPitchText)}
                      style={{
                        border: 'none',
                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        color: '#FFFFFF',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 3px 12px rgba(16, 185, 129, 0.3)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Phone size={15} />
                      <span>Send WhatsApp</span>
                    </button>

                    {activeOutreachCustomer?.email && (
                      <button
                        type="button"
                        onClick={() => handleSendEmail(activeOutreachCustomer, activeOutreachLorry, editedPitchText)}
                        style={{
                          border: 'none',
                          background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                          color: '#FFFFFF',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 3px 12px rgba(37, 99, 235, 0.3)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Mail size={15} />
                        <span>Send Email</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Sleek Footer */}
            <div
              style={{
                padding: '10px 24px',
                background: '#FFFFFF',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
              }}
            >
              <div style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>
                Showing <strong>{outreachTargetCustomers.length}</strong> target accounts in <strong>{outreachZone === 'all' ? 'All Operating Zones' : outreachZone}</strong>
              </div>

              <button
                type="button"
                className="btn gh"
                onClick={() => {
                  setIsOutreachOpen(false);
                  setOutreachModalCustomer(null);
                }}
                style={{ height: '32px', padding: '0 16px', fontWeight: 700, fontSize: '0.78rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL: VIEW FULL CONTACT DETAILS POPUP ────────────── */}
      {viewingContact && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => setViewingContact(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '560px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--line)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                color: '#FFFFFF',
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--orange)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>
                  {viewingContact.region || 'Customer Contact'}
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#F8FAFC', marginTop: '2px' }}>
                  {viewingContact.customer_name}
                </div>
              </div>
              <button
                type="button"
                className="btn sm gh"
                onClick={() => setViewingContact(null)}
                style={{ color: '#94A3B8', border: 'none' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>SEQUENCE NO</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)', marginTop: '4px' }}>
                    #{viewingContact.no || '—'}
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>OPERATING ZONE / REGION</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--navy-900)', marginTop: '4px' }}>
                    {viewingContact.zone ? `${viewingContact.zone} • ` : ''}{viewingContact.region || 'General'}
                  </div>
                </div>
              </div>

              {viewingContact.address && (
                <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <MapPin size={13} style={{ color: 'var(--orange)' }} />
                    <span>FACTORY / BILLING ADDRESS</span>
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--navy-900)', marginTop: '4px', whiteSpace: 'pre-line' }}>
                    {viewingContact.address}
                  </div>
                </div>
              )}

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>CONTACT PERSON(S)</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--navy-900)', marginTop: '4px', whiteSpace: 'pre-line' }}>
                  {viewingContact.contact_person || '—'}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>CONTACT NUMBER(S)</div>
                <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0F172A', marginTop: '4px', whiteSpace: 'pre-line' }}>
                  {viewingContact.contact_no || '—'}
                </div>
              </div>

              {viewingContact.email && (
                <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>EMAIL</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#2563EB', marginTop: '4px' }}>
                    {viewingContact.email}
                  </div>
                </div>
              )}

              {viewingContact.notes && (
                <div style={{ background: '#FFFBEB', padding: '12px 16px', borderRadius: '10px', border: '1px solid #FDE68A' }}>
                  <div style={{ fontSize: '0.74rem', color: '#92400E', fontWeight: 700 }}>NOTES &amp; SPECIAL INSTRUCTIONS</div>
                  <div style={{ fontSize: '0.84rem', color: '#78350F', marginTop: '4px' }}>
                    {viewingContact.notes}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div
              style={{
                background: '#F8FAFC',
                borderTop: '1px solid var(--line)',
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap'
              }}
            >
              <button
                type="button"
                className="btn gh"
                onClick={() => handleCopyContact(viewingContact)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
              >
                <Copy size={14} />
                <span>Copy Details</span>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleCall(viewingContact)}
                  style={{ background: '#0284C7', color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}
                >
                  <PhoneCall size={14} />
                  <span>Call Phone</span>
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    handleSendWhatsApp(viewingContact, availableLorries[0]);
                    setViewingContact(null);
                  }}
                  style={{ background: '#10B981', color: '#FFF', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}
                >
                  <MessageSquare size={14} />
                  <span>Send WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL: DELETE CONFIRMATION ──────────────────────── */}
      {deletingContact && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => setDeletingContact(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid var(--line)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#DC2626' }}>
              Delete Customer Contact?
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.86rem', color: 'var(--slate)', lineHeight: 1.5 }}>
              Are you sure you want to remove <strong>{deletingContact.customer_name}</strong> from the customer contact list? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn gh" onClick={() => setDeletingContact(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={confirmDelete}
                style={{ background: '#DC2626', color: '#FFF', fontWeight: 700 }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL: PRINTABLE DOCUMENT PREVIEW MODAL ─────────── */}
      {showPrintModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => setShowPrintModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar */}
            <div
              style={{
                background: '#0F172A',
                color: '#FFFFFF',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Printer size={18} style={{ color: 'var(--orange)' }} />
                <span style={{ fontWeight: 800, fontSize: '0.94rem' }}>Customer Contact List — Official Print Preview</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn pri sm"
                  onClick={handlePrint}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                >
                  <Printer size={13} />
                  <span>Print Document</span>
                </button>
                <button
                  type="button"
                  className="btn gh sm"
                  onClick={() => setShowPrintModal(false)}
                  style={{ color: '#FFF' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Printable Document Body (Matches physical sheet layout from Image 2) */}
            <div
              ref={printRef}
              style={{
                padding: '30px',
                overflowY: 'auto',
                background: '#FFFFFF',
                color: '#000000',
                fontFamily: 'Arial, sans-serif'
              }}
            >
              {/* Document Header */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 4px 0', textDecoration: 'underline', textTransform: 'uppercase' }}>
                  CUSTOMER CONTACT LIST
                </h2>
                <div style={{ fontSize: '0.82rem', color: '#555' }}>
                  {settings.name || 'RENS DYNAMICS LOGISTICS SDN. BHD.'} {settings.regno ? `(${settings.regno})` : ''}
                </div>
              </div>

              {/* Physical Sheet Table Format */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', border: '2px solid #000000' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #000000' }}>
                    <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '50px', textAlign: 'center', fontWeight: 'bold' }}>No.</th>
                    <th style={{ border: '1px solid #000000', padding: '6px 10px', width: '38%', textAlign: 'center', fontWeight: 'bold' }}>Customer</th>
                    <th style={{ border: '1px solid #000000', padding: '6px 10px', width: '28%', textAlign: 'center', fontWeight: 'bold' }}>Contact Person</th>
                    <th style={{ border: '1px solid #000000', padding: '6px 10px', width: '28%', textAlign: 'center', fontWeight: 'bold' }}>Contact No.</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedContacts).map(([regionName, items]) => (
                    <React.Fragment key={regionName}>
                      {/* Region Category Subheader */}
                      <tr style={{ background: '#E2E8F0', borderTop: '2px solid #000000', borderBottom: '2px solid #000000' }}>
                        <td colSpan={4} style={{ border: '1px solid #000000', padding: '6px 10px', textAlign: 'center', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          {regionName}
                        </td>
                      </tr>

                      {/* Region Rows */}
                      {items.map((c) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #666' }}>
                          <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>
                            {c.no || '—'}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '6px 10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            {c.customer_name}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '6px 10px', whiteSpace: 'pre-line' }}>
                            {c.contact_person || '—'}
                          </td>
                          <td style={{ border: '1px solid #000000', padding: '6px 10px', whiteSpace: 'pre-line' }}>
                            {c.contact_no || '—'}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              {/* Document Footer */}
              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#555', borderTop: '1px solid #CCC', paddingTop: '10px' }}>
                <div>Printed on: {new Date().toLocaleDateString('en-GB')}</div>
                <div>Total Records: {contacts.length}</div>
                <div>Rens Dynamics Logistics Operations ERP</div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
