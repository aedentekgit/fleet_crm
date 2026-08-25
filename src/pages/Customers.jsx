import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb, fmtMoney, fmtDate, deduplicateJobs, subscribeTable, isContractQuotation, getStorageData } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import {
  Building2,
  FileText,
  Tag,
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
  Truck,
  RotateCcw,
  List,
  Send,
  MessageSquare,
  Share2,
  Radio,
  Megaphone,
  Copy,
  ExternalLink,
  Filter,
  Sparkles,
  Eye
} from 'lucide-react';
import logoImg from '../assets/WhatsApp Image 2026-07-09 at 2.19.49 PM-Photoroom-BQJKJGof-Bld4xBKC.png';

const DEFAULT_COMPANY_SETTINGS = {
  name: 'RENS DYNAMICS LOGISTICS SDN. BHD.',
  regno: '950592-K',
  address: 'P.T 2140, Sri Senawang Light Industrial Centre, 70450 Seremban, Negeri Sembilan.',
  phone: '012-616 8449',
  email: 'rensdynamic.logistics@gmail.com'
};

const DEFAULT_LORRY_TYPES = [
  "1 ton 9 ft",
  "3 & 5 ton 17 ft",
  "10 ton 24ft",
  "14 ton 30ft",
  "20 ton 40ft"
];

const DEFAULT_TERMS = '';

export function normalizeZone(z) {
  if (!z) return 'Zone A';
  const str = String(z).trim();
  if (/^[A-Z]$/i.test(str)) return `Zone ${str.toUpperCase()}`;
  if (/^zone\s*[A-Z]$/i.test(str)) return `Zone ${str.replace(/zone\s*/i, '').toUpperCase()}`;
  return str;
}

export function isValidEmail(email) {
  if (!email || !email.trim()) return true;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

export function isValidPhone(phone) {
  if (!phone || !phone.trim()) return true;
  const trimmed = phone.trim();
  const validChars = /^[0-9+\s\-()]+$/.test(trimmed);
  const digits = trimmed.replace(/\D/g, '');
  return validChars && digits.length >= 8 && digits.length <= 15;
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

export default function Customers() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [customers, setCustomers] = useState(() => getStorageData('customers'));
  const [contacts, setContacts] = useState(() => getStorageData('customer_contacts'));
  const [quotations, setQuotations] = useState(() => getStorageData('quotations'));
  const [jobs, setJobs] = useState(() => getStorageData('jobs'));
  const [lorries, setLorries] = useState(() => getStorageData('lorries'));
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('customers'); // 'customers' | 'quotations' | 'settings'
  const [showForm, setShowForm] = useState(false);

  // Customer Filtering State
  const [custZoneFilter, setCustZoneFilter] = useState('all'); // 'all' | 'Zone A' | 'Zone B' ...
  const [custActivityFilter, setCustActivityFilter] = useState('all'); // 'all' | 'un_giving' | 'active'

  // Available Lorry Outreach State
  const [isOutreachOpen, setIsOutreachOpen] = useState(false);
  const [outreachZone, setOutreachZone] = useState('Zone A');
  const [selectedLorryId, setSelectedLorryId] = useState('');
  const [outreachAudience, setOutreachAudience] = useState('un_giving'); // 'un_giving' | 'all'
  const [outreachModalCustomer, setOutreachModalCustomer] = useState(null);
  const [pitchTab, setPitchTab] = useState('whatsapp'); // 'whatsapp' | 'email'
  const [editedPitchText, setEditedPitchText] = useState('');
  const [isPitchCustomized, setIsPitchCustomized] = useState(false);

  // Customer Form State
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [custSearch, setCustSearch] = useState('');
  const [cName, setCName] = useState('');
  const [cRegNo, setCRegNo] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cAttn, setCAttn] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cTerms, setCTerms] = useState('');
  const [cZone, setCZone] = useState('Zone A');
  const [cNotes, setCNotes] = useState('');

  // Quotation State
  const [editingQuoId, setEditingQuoId] = useState(null);
  const [quoSearch, setQuoSearch] = useState('');
  const [qCustomer, setQCustomer] = useState('');
  const [qZone, setQZone] = useState('Zone A');
  const [qRef, setQRef] = useState(() => {
    const now = new Date();
    return `Rens${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}01`;
  });
  const [qDate, setQDate] = useState(new Date().toISOString().split('T')[0]);
  const [qRev, setQRev] = useState('');
  const [qSender, setQSender] = useState('');
  const [qSenderPhone, setQSenderPhone] = useState('');
  const [qItemNo, setQItemNo] = useState('');
  const [qIncludeDiesel, setQIncludeDiesel] = useState(false);
  const [qDieselPrice, setQDieselPrice] = useState('');
  const [qLorryTypes, setQLorryTypes] = useState(DEFAULT_LORRY_TYPES);
  const [qRoutes, setQRoutes] = useState([]); // { collection, collection_zone, unloading, unloading_zone, code_word, isDropoint, rates: {} }
  const [qTerms, setQTerms] = useState('');

  // Helper to compute next quotation ref: RensYYYYMM## (e.g. Rens20260801)
  const getNextQuotationRef = useCallback((quoList = quotations) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `Rens${year}${month}`;

    let maxSeq = 0;
    const list = Array.isArray(quoList) ? quoList : [];
    list.forEach(q => {
      let refStr = '';
      if (typeof q === 'string') {
        refStr = q;
      } else if (q) {
        let parsed = null;
        try {
          if (q.special_instructions && q.special_instructions.startsWith('{')) parsed = JSON.parse(q.special_instructions);
          else if (q.notes && q.notes.startsWith('{')) parsed = JSON.parse(q.notes);
        } catch (_) {}
        refStr = parsed?.ref || q.quote_no || q.customer_ref || '';
      }
      if (refStr) {
        const match = String(refStr).trim().match(new RegExp(`^${prefix}(\\d+)`, 'i'));
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
    });

    const nextSeq = maxSeq + 1;
    return `${prefix}${String(nextSeq).padStart(2, '0')}`;
  }, [quotations]);

  // Settings State
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('rens_letterhead_settings_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name && parsed.name.trim()) return parsed;
      }
    } catch (_) {}
    return DEFAULT_COMPANY_SETTINGS;
  });

  // Modal states
  const [previewQuotation, setPreviewQuotation] = useState(null);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [deletingQuotation, setDeletingQuotation] = useState(null);

  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingQuotation, setSavingQuotation] = useState(false);

  // Load Data
  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [cRes, ccRes, qRes, jRes, lRes] = await Promise.all([
        sb.from('customers').select('*').order('company_name', { ascending: true }),
        sb.from('customer_contacts').select('*').order('customer_name', { ascending: true }),
        sb.from('quotations').select('*, customer:customers(company_name, registration_no, billing_address, contact_person, phone)').order('created_at', { ascending: false }),
        sb.from('jobs').select('*, lorry:lorries(id, plate_no, capacity_desc, lorry_type, zone), customer:customers(company_name, phone, email, zone)').order('created_at', { ascending: false }),
        sb.from('lorries').select('*').order('plate_no', { ascending: true })
      ]);

      const rawCustomers = cRes.data || [];
      const allContacts = ccRes.data || [];
      const rawQuotations = (qRes.data || []).filter(isContractQuotation);

      // Deduplicate customers by company_name
      const dedupedCustomers = [];
      const seenCustNames = new Set();
      rawCustomers.forEach(c => {
        const norm = (c.company_name || c.id || '').toLowerCase().trim();
        if (norm && !seenCustNames.has(norm)) {
          seenCustNames.add(norm);
          dedupedCustomers.push(c);
        } else if (!norm) {
          dedupedCustomers.push(c);
        }
      });

      // Synchronize back to local database if duplicate records existed
      if (dedupedCustomers.length !== rawCustomers.length) {
        try {
          localStorage.setItem('rens_db_customers', JSON.stringify(dedupedCustomers));
        } catch (_) {}
      }

      // Deduplicate quotations by quote_no / id only
      const dedupedQuotations = [];
      const seenQuoKeys = new Set();

      rawQuotations.forEach(q => {
        const quoKey = (q.quote_no || q.id || '').toLowerCase().trim();
        if (quoKey && !seenQuoKeys.has(quoKey)) {
          seenQuoKeys.add(quoKey);
          dedupedQuotations.push(q);
        } else if (!quoKey) {
          dedupedQuotations.push(q);
        }
      });

      setCustomers(dedupedCustomers);
      setContacts(allContacts);
      setQuotations(dedupedQuotations);
      setJobs(deduplicateJobs(jRes.data || []));
      setLorries(lRes.data || []);

      if (!editingQuoId && !qCustomer) {
        setQRef(getNextQuotationRef(dedupedQuotations));
      }
    } catch (err) {
      console.error('Error loading customer registry:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
    const unsub1 = subscribeTable('customers', loadAllData);
    const unsub2 = subscribeTable('customer_contacts', loadAllData);
    const unsub3 = subscribeTable('quotations', loadAllData);
    const unsub4 = subscribeTable('jobs', loadAllData);
    const unsub5 = subscribeTable('lorries', loadAllData);
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
    };
  }, [loadAllData]);

  // Dynamic unlimited zones derived from customers, quotations, and defaults
  const allAvailableZones = useMemo(() => {
    const set = new Set(['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E', 'Zone F', 'Central Zone', 'Southern Region (Johor)', 'Northern Region (Penang/Perak)', 'East Coast (Pahang)']);
    customers.forEach(c => { if (c.zone) set.add(c.zone); });
    quotations.forEach(q => {
      if (q.zone) set.add(q.zone);
      try {
        if (q.special_instructions && q.special_instructions.startsWith('{')) {
          const parsed = JSON.parse(q.special_instructions);
          if (parsed.zone) set.add(parsed.zone);
        }
      } catch (_) {}
    });
    return Array.from(set);
  }, [customers, quotations]);

  // Reset Customer Form
  const resetCustomerForm = () => {
    setEditingCustomerId(null);
    setCName('');
    setCRegNo('');
    setCAddress('');
    setCAttn('');
    setCPhone('');
    setCEmail('');
    setCTerms('');
    setCZone('Zone A');
    setCNotes('');
  };

  // Edit Customer
  const handleEditCustomer = (c) => {
    setEditingCustomerId(c.id);
    setCName(c.company_name || '');
    setCRegNo(c.registration_no || '');
    setCAddress(c.billing_address || '');
    setCAttn(c.contact_person || '');
    setCPhone(c.phone || '');
    setCEmail(c.email || '');
    setCTerms(c.payment_terms || '');
    setCZone(c.zone || 'Zone A');
    setCNotes(c.notes || '');
    setShowForm(true);
    window.scrollTo({ top: 160, behavior: 'smooth' });
  };

  // Save Customer
  const handleSaveCustomer = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (savingCustomer) return;

    const name = cName.trim();
    if (!name) {
      toast('Company name is required', 'err');
      return;
    }

    if (cPhone.trim() && !isValidPhone(cPhone)) {
      toast('Please enter a valid phone number (min 8 digits, e.g. 012-3456789)', 'err');
      return;
    }

    if (cEmail.trim() && !isValidEmail(cEmail)) {
      toast('Please enter a valid email address (e.g. name@company.com)', 'err');
      return;
    }

    const normName = name.toLowerCase();
    const existingCust = customers.find(c =>
      String(c.id) !== String(editingCustomerId) &&
      (c.company_name || '').trim().toLowerCase() === normName
    );

    if (existingCust) {
      toast(`A customer named "${name}" is already registered! Please edit the existing entry.`, 'err');
      return;
    }

    try {
      setSavingCustomer(true);
      const payload = {
        company_name: name,
        registration_no: cRegNo.trim(),
        billing_address: cAddress.trim(),
        contact_person: cAttn.trim(),
        phone: cPhone.trim(),
        email: cEmail.trim(),
        payment_terms: cTerms.trim(),
        zone: cZone || 'Zone A',
        notes: cNotes.trim(),
        status: 'active'
      };

      if (editingCustomerId) {
        const { error } = await sb.from('customers').update(payload).eq('id', editingCustomerId);
        if (error) {
          // Schema fallback if zone column not in supabase yet
          const fb = { ...payload };
          delete fb.zone;
          await sb.from('customers').update(fb).eq('id', editingCustomerId);
        }
        toast(`Updated customer ${name}`, 'ok');
      } else {
        const { error } = await sb.from('customers').insert([payload]);
        if (error) {
          // Schema fallback if zone column not in supabase yet
          const fb = { ...payload };
          delete fb.zone;
          await sb.from('customers').insert([fb]);
        }
        toast(`Customer ${name} saved`, 'ok');
      }

      resetCustomerForm();
      loadAllData();
    } catch (err) {
      toast('Failed to save customer', 'err');
    } finally {
      setSavingCustomer(false);
    }
  };

  // Delete Customer
  const confirmDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    try {
      if (sb) {
        await sb.from('customers').delete().eq('id', deletingCustomer.id);
      }
      try {
        const stored = localStorage.getItem('rens_db_customers');
        if (stored) {
          const parsed = JSON.parse(stored);
          const filtered = parsed.filter(c => String(c.id) !== String(deletingCustomer.id));
          localStorage.setItem('rens_db_customers', JSON.stringify(filtered));
        }
      } catch (_) {}

      toast(`Deleted customer ${deletingCustomer.company_name}`, 'warn');
      setDeletingCustomer(null);
      loadAllData();
    } catch (err) {
      toast('Failed to delete customer', 'err');
    }
  };

  // Clear all demo/test customers
  const handleClearAllCustomers = async () => {
    if (window.confirm(`Are you sure you want to delete all ${customers.length} customer records and reset the table?`)) {
      try {
        if (sb) {
          for (const c of customers) {
            try { await sb.from('customers').delete().eq('id', c.id); } catch (_) {}
          }
        }
        localStorage.setItem('rens_db_customers', '[]');
        toast('All customer records cleared! Starting clean.', 'ok');
        loadAllData();
      } catch (err) {
        toast('Failed to clear customer records', 'err');
      }
    }
  };

  // Reset Quotation Form
  const resetQuotationForm = (customQuoList) => {
    setEditingQuoId(null);
    setQCustomer('');
    setQZone('Zone A');
    setQRef(getNextQuotationRef(customQuoList || quotations));
    setQDate(new Date().toISOString().split('T')[0]);
    setQRev('');
    setQSender('');
    setQSenderPhone('');
    setQItemNo('');
    setQIncludeDiesel(false);
    setQDieselPrice('');
    setQLorryTypes(DEFAULT_LORRY_TYPES);
    setQRoutes([]);
    setQTerms('');
  };

  // Select Customer & Auto-populate Quotation Form
  const handleSelectQuotationCustomer = (selectedCustId) => {
    setQCustomer(selectedCustId);
    if (!selectedCustId) {
      resetQuotationForm();
      return;
    }

    const custObj = customers.find(c => String(c.id) === String(selectedCustId));
    if (!custObj) return;

    // Auto-populate customer's zone
    setQZone(custObj.zone || 'Zone A');

    // Check if this customer has an existing saved quotation
    const existingQuo = quotations.find(q =>
      String(q.customer_id) === String(selectedCustId) ||
      (q.customer && String(q.customer.id) === String(selectedCustId)) ||
      (q.customer?.company_name && custObj.company_name && q.customer.company_name.toLowerCase().trim() === custObj.company_name.toLowerCase().trim())
    );

    if (existingQuo) {
      setEditingQuoId(existingQuo.id);
      let parsed = null;
      try {
        if (existingQuo.special_instructions && existingQuo.special_instructions.startsWith('{')) {
          parsed = JSON.parse(existingQuo.special_instructions);
        } else if (existingQuo.notes && existingQuo.notes.startsWith('{')) {
          parsed = JSON.parse(existingQuo.notes);
        }
      } catch (_) {}

      const existingRef = (parsed?.ref || existingQuo.quote_no || existingQuo.customer_ref || '').trim();
      setQRef(existingRef || getNextQuotationRef(quotations));
      setQDate(parsed?.date || existingQuo.collection_date || new Date().toISOString().split('T')[0]);
      setQRev(parsed?.rev || '');
      setQSender(parsed?.sender || '');
      setQSenderPhone(parsed?.senderPhone || '');
      setQItemNo(parsed?.itemNo || '');
      setQIncludeDiesel(parsed?.includeDiesel !== undefined ? parsed.includeDiesel : false);
      setQDieselPrice(parsed?.dieselPrice || '');
      setQLorryTypes(parsed?.lorryTypes || (existingQuo.lorry_spec ? existingQuo.lorry_spec.split(' | ') : DEFAULT_LORRY_TYPES));
      setQRoutes(parsed?.routes || [
        {
          collection: existingQuo.pickup_location || '',
          collection_zone: parsed?.zone || existingQuo.zone || 'Zone A',
          unloading: existingQuo.dropoff_location || '',
          unloading_zone: 'Zone A',
          code_word: '',
          isDropoint: false,
          rates: { [DEFAULT_LORRY_TYPES[0]]: existingQuo.rate_amount }
        }
      ]);
      setQTerms(parsed?.terms || (custObj.payment_terms ? `Payment term: ${custObj.payment_terms} credit from date of invoice.` : ''));
      toast(`Loaded quotation details & rate card for ${custObj.company_name}`, 'ok');
    } else {
      // New customer with no quotation yet: clean empty starting quotation form with auto-generated next ref
      setEditingQuoId(null);
      setQRef(getNextQuotationRef(quotations));
      setQDate(new Date().toISOString().split('T')[0]);
      setQRev('');
      setQSender('');
      setQSenderPhone('');
      setQItemNo('');
      setQIncludeDiesel(false);
      setQDieselPrice('');
      setQLorryTypes(DEFAULT_LORRY_TYPES);
      setQRoutes([]);
      setQTerms(custObj.payment_terms ? `Payment term: ${custObj.payment_terms} credit from date of invoice.` : '');
      toast(`Ready to register quotation for ${custObj.company_name}`, 'ok');
    }
  };

  // Edit Quotation
  const handleEditQuotation = (quo) => {
    let parsed = null;
    try {
      if (quo.special_instructions && quo.special_instructions.startsWith('{')) {
        parsed = JSON.parse(quo.special_instructions);
      } else if (quo.notes && quo.notes.startsWith('{')) {
        parsed = JSON.parse(quo.notes);
      }
    } catch (_) {}

    setEditingQuoId(quo.id);
    setQCustomer(quo.customer_id || '');
    setQZone(parsed?.zone || quo.zone || 'Zone A');
    setQRef(parsed?.ref || quo.quote_no || quo.customer_ref || '');
    setQDate(parsed?.date || quo.collection_date || new Date().toISOString().split('T')[0]);
    setQRev(parsed?.rev || '1 0');
    setQSender(parsed?.sender || 'Rauf Rao');
    setQSenderPhone(parsed?.senderPhone || '012-6078449');
    setQItemNo(parsed?.itemNo || '');
    setQIncludeDiesel(parsed?.includeDiesel !== undefined ? parsed.includeDiesel : true);
    setQDieselPrice(parsed?.dieselPrice || '2.00 - 2.18');
    setQLorryTypes(parsed?.lorryTypes || (quo.lorry_spec ? quo.lorry_spec.split(' | ') : DEFAULT_LORRY_TYPES));
    setQRoutes(parsed?.routes || [
      { collection: quo.pickup_location || '', unloading: quo.dropoff_location || '', isDropoint: false, rates: { [DEFAULT_LORRY_TYPES[0]]: quo.rate_amount } }
    ]);
    setQTerms(parsed?.terms || DEFAULT_TERMS);
    setShowForm(true);
    window.scrollTo({ top: 160, behavior: 'smooth' });
  };

  // Save Quotation
  const handleSaveQuotation = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (savingQuotation) return;
    if (!qCustomer) {
      toast('Select a registered customer first', 'err');
      return;
    }
    if (qSenderPhone.trim() && !isValidPhone(qSenderPhone)) {
      toast('Please enter a valid sender phone number (min 8 digits, e.g. 012-6078449)', 'err');
      return;
    }
    if (!qRoutes.length) {
      toast('Add at least one route or dropoint row', 'err');
      return;
    }

    try {
      setSavingQuotation(true);
      const custObj = customers.find(c => String(c.id) === String(qCustomer));
      const firstRoute = qRoutes[0] || {};
      const primaryRate = Object.values(firstRoute.rates || {})[0] || '0';
      const finalRef = (qRef || '').trim() || getNextQuotationRef(quotations);

      const payload = {
        customer_id: qCustomer,
        customer_name: custObj?.company_name || '',
        zone: qZone || 'Zone A',
        quote_no: finalRef,
        customer_ref: finalRef,
        pickup_location: firstRoute.collection || 'Collection Location',
        dropoff_location: firstRoute.unloading || 'Unloading Location',
        rate_amount: parseFloat(primaryRate) || 0,
        lorry_spec: qLorryTypes.join(' | '),
        special_instructions: JSON.stringify({
          ref: finalRef,
          date: qDate,
          rev: qRev,
          sender: qSender,
          senderPhone: qSenderPhone,
          zone: qZone || 'Zone A',
          itemNo: qItemNo,
          includeDiesel: qIncludeDiesel,
          dieselPrice: qIncludeDiesel ? qDieselPrice : null,
          terms: qTerms,
          lorryTypes: qLorryTypes,
          routes: qRoutes
        }),
        status: 'waiting',
        is_contract: true,
        quote_type: 'contract',
        created_at: new Date().toISOString()
      };

      // Check if updating or if an existing quote for this customer exists
      const existingMatch = !editingQuoId ? quotations.find(q =>
        (qCustomer && String(q.customer_id) === String(qCustomer)) ||
        (custObj?.company_name && (q.customer_name || q.customer?.company_name || '').trim().toLowerCase() === custObj.company_name.trim().toLowerCase())
      ) : null;

      let targetQuoId = editingQuoId || (existingMatch ? existingMatch.id : null);
      if (existingMatch && !editingQuoId && existingMatch.quote_no) {
        payload.quote_no = existingMatch.quote_no;
        payload.customer_ref = existingMatch.quote_no;
      }

      if (targetQuoId) {
        payload.id = targetQuoId;
        const { error } = await sb.from('quotations').update(payload).eq('id', targetQuoId);
        if (error) {
          const fb = { ...payload };
          delete fb.zone;
          await sb.from('quotations').update(fb).eq('id', targetQuoId);
        }
      } else {
        targetQuoId = 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        payload.id = targetQuoId;
        const { error } = await sb.from('quotations').insert([payload]);
        if (error) {
          const fb = { ...payload };
          delete fb.zone;
          await sb.from('quotations').insert([fb]);
        }
      }

      // Automatically queue in approvals table for manual owner authorization
      if (sb) {
        try {
          const apprPayload = {
            id: 'appr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            kind: 'quotation',
            ref_id: targetQuoId,
            title: `Quotation ${finalRef} - ${custObj?.company_name || 'Customer'}`,
            amount: parseFloat(primaryRate) || 0,
            status: 'waiting',
            flagged: 1,
            created_at: new Date().toISOString()
          };
          const { data: existAppr } = await sb.from('approvals').select('id').eq('ref_id', targetQuoId).maybeSingle();
          if (existAppr) {
            await sb.from('approvals').update({ status: 'waiting', amount: parseFloat(primaryRate) || 0, title: apprPayload.title }).eq('id', existAppr.id);
          } else {
            await sb.from('approvals').insert([apprPayload]);
          }
        } catch (e) {
          console.error('Error adding approval request:', e);
        }
      }

      const updatedList = [...quotations.filter(q => q.id !== targetQuoId), { ...payload, id: targetQuoId }];
      resetQuotationForm(updatedList);
      setShowForm(false);
      setActiveTab('quotations');
      loadAllData();

      toast(`Quotation saved (${finalRef}) & submitted for Approval!`, 'ok');
    } catch (err) {
      toast('Failed to save quotation', 'err');
    } finally {
      setSavingQuotation(false);
    }
  };

  // Delete Quotation
  const confirmDeleteQuotation = async (quo) => {
    const target = quo || deletingQuotation;
    if (!target) return;
    try {
      if (sb) {
        await sb.from('quotations').delete().eq('id', target.id);
        if (target.quote_no) {
          await sb.from('quotations').delete().eq('quote_no', target.quote_no);
        }
        await sb.from('approvals').delete().eq('ref_id', target.id);
        if (target.quote_no) {
          await sb.from('approvals').delete().eq('ref_id', target.quote_no);
        }
      }
      try {
        const stored = localStorage.getItem('rens_db_quotations');
        if (stored) {
          const parsed = JSON.parse(stored);
          const filtered = parsed.filter(q => String(q.id) !== String(target.id));
          localStorage.setItem('rens_db_quotations', JSON.stringify(filtered));
        }
      } catch (_) {}

      toast(`Deleted quotation ${target.quote_no || target.customer_ref || target.id}`, 'warn');
      setDeletingQuotation(null);
      loadAllData();
    } catch (err) {
      toast('Failed to delete quotation', 'err');
    }
  };

  // Clear all saved quotations
  const handleClearAllQuotations = async () => {
    if (window.confirm(`Are you sure you want to delete all ${quotations.length} saved quotation records?`)) {
      try {
        if (sb) {
          for (const q of quotations) {
            try {
              await sb.from('quotations').delete().eq('id', q.id);
              await sb.from('approvals').delete().eq('ref_id', q.id);
              if (q.quote_no) await sb.from('approvals').delete().eq('ref_id', q.quote_no);
            } catch (_) {}
          }
        }
        localStorage.setItem('rens_db_quotations', '[]');
        toast('All quotation records cleared!', 'ok');
        loadAllData();
      } catch (err) {
        toast('Failed to clear quotation records', 'err');
      }
    }
  };

  // View / Print Quotation Letterhead
  const handleViewQuotation = (quo) => {
    let parsedData = null;
    try {
      if (quo.special_instructions && quo.special_instructions.startsWith('{')) {
        parsedData = JSON.parse(quo.special_instructions);
      }
    } catch (_) {}

    const custObj = quo.customer || customers.find(c => String(c.id) === String(quo.customer_id));

    setPreviewQuotation({
      ...quo,
      customer: custObj,
      ref: parsedData?.ref !== undefined ? parsedData.ref : (quo.quote_no || quo.customer_ref),
      date: parsedData?.date || quo.collection_date || fmtDate(quo.created_at),
      rev: parsedData?.rev || '1 0',
      sender: parsedData?.sender || 'Rauf Rao',
      senderPhone: parsedData?.senderPhone || '012-6078449',
      itemNo: parsedData?.itemNo || '',
      includeDiesel: parsedData?.includeDiesel !== undefined ? parsedData.includeDiesel : true,
      dieselPrice: parsedData?.dieselPrice || '2.00 - 2.18',
      subNote: parsedData?.subNote !== undefined ? parsedData.subNote : (custObj?.company_name?.includes('TOKOPAK') ? 'Note :- Lorry No :-) BEP6261 is 30ft lorry\nii) 19ft charges as 17ft' : ''),
      terms: parsedData?.terms || DEFAULT_TERMS,
      lorryTypes: parsedData?.lorryTypes || (quo.lorry_spec ? quo.lorry_spec.split(' | ') : DEFAULT_LORRY_TYPES),
      routes: parsedData?.routes || [
        { collection: quo.pickup_location, unloading: quo.dropoff_location, isDropoint: false, rates: { [DEFAULT_LORRY_TYPES[0]]: quo.rate_amount } }
      ]
    });
  };



  // Save Settings
  const handleSaveSettings = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (settings.phone && settings.phone.trim() && !isValidPhone(settings.phone)) {
      toast('Please enter a valid company phone number', 'err');
      return;
    }
    if (settings.email && settings.email.trim() && !isValidEmail(settings.email)) {
      toast('Please enter a valid company email address', 'err');
      return;
    }
    try {
      localStorage.setItem('rens_letterhead_settings_v2', JSON.stringify(settings));
      toast('Company details saved', 'ok');
    } catch (_) {}
  };

  // Send Specific Quotation via WhatsApp
  const handleSendQuotationWhatsApp = useCallback((q) => {
    if (!q) return;
    const company = q.customer?.company_name || q.customer_name || 'Valued Customer';
    const attn = q.customer?.contact_person || q.contact_person || '';
    let targetPhone = (q.customer?.phone || q.phone || '').trim();

    if (!targetPhone) {
      targetPhone = window.prompt(`Enter WhatsApp mobile phone for ${company}:`, '');
      if (!targetPhone) return;
    }

    const rawPhone = targetPhone.replace(/[^\d+]/g, '');
    let cleanPhone = rawPhone;
    if (cleanPhone.startsWith('0')) cleanPhone = '60' + cleanPhone.slice(1);
    if (!cleanPhone) {
      toast('Invalid phone number provided.', 'err');
      return;
    }

    const refNo = q.ref || q.quote_no || 'Quotation';
    const dateStr = q.date || (q.created_at ? fmtDate(q.created_at) : new Date().toLocaleDateString('en-GB'));
    const sender = q.sender || 'Rauf Rao';
    const senderPhone = q.senderPhone || '012-6078449';

    // Format routes & rates
    const lorryTypes = q.lorryTypes || DEFAULT_LORRY_TYPES;
    let routesText = '';
    (q.routes || []).forEach((r, idx) => {
      const routeLabel = r.isDropoint
        ? `Dropoint: ${r.collection || 'Dropoint'}`
        : `${r.collection || 'Pickup'} ➔ ${r.unloading || 'Dropoff'}`;
      routesText += `\n*${idx + 1}. ${routeLabel}*\n`;
      if (r.code_word) routesText += `   _Code:_ ${r.code_word}\n`;
      lorryTypes.forEach(lt => {
        const rateVal = r.rates ? r.rates[lt] : null;
        if (rateVal) {
          routesText += `   • ${lt}: RM ${isNaN(Number(rateVal)) ? rateVal : Number(rateVal).toFixed(2)}\n`;
        }
      });
    });

    const text = 
`📄 *OFFICIAL TRANSPORT QUOTATION*
*${settings.name || 'RENS DYNAMICS LOGISTICS SDN. BHD.'}*

*To:* ${company}
${attn ? `*Attn:* ${attn}\n` : ''}*Our Ref:* ${refNo}
*Date:* ${dateStr}

*TRANSPORT RATES & DESTINATIONS:*${routesText}
${q.includeDiesel !== false && q.dieselPrice ? `*Diesel Benchmark:* RM ${q.dieselPrice}\n` : ''}
*Terms & Conditions:*
${q.terms || DEFAULT_TERMS || 'Standard transport terms apply.'}

We are pleased to submit our competitive transport rates for your kind perusal and consideration. Looking forward to your valuable support!

*Sender / Logistics Dept:* ${sender} (${senderPhone})
*${settings.name || 'Rens Dynamics Logistics Sdn. Bhd.'}*`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    toast(`Opening WhatsApp quotation for ${company}`, 'ok');
  }, [settings, toast]);

  // Send Specific Quotation via Email
  const handleSendQuotationEmail = useCallback((q) => {
    if (!q) return;
    const company = q.customer?.company_name || q.customer_name || 'Valued Customer';
    const attn = q.customer?.contact_person || q.contact_person || '';
    let targetEmail = (q.customer?.email || q.email || '').trim();

    if (!targetEmail) {
      targetEmail = window.prompt(`Enter recipient email address for ${company}:`, '');
      if (!targetEmail) return;
    }

    const refNo = q.ref || q.quote_no || 'Quotation';
    const dateStr = q.date || (q.created_at ? fmtDate(q.created_at) : new Date().toLocaleDateString('en-GB'));
    const sender = q.sender || 'Rauf Rao';
    const senderPhone = q.senderPhone || '012-6078449';

    // Format routes & rates
    const lorryTypes = q.lorryTypes || DEFAULT_LORRY_TYPES;
    let routesText = '';
    (q.routes || []).forEach((r, idx) => {
      const routeLabel = r.isDropoint
        ? `Dropoint: ${r.collection || 'Dropoint'}`
        : `${r.collection || 'Pickup'} -> ${r.unloading || 'Dropoff'}`;
      routesText += `\n${idx + 1}. ${routeLabel}\n`;
      if (r.code_word) routesText += `   Code: ${r.code_word}\n`;
      lorryTypes.forEach(lt => {
        const rateVal = r.rates ? r.rates[lt] : null;
        if (rateVal) {
          routesText += `   - ${lt}: RM ${isNaN(Number(rateVal)) ? rateVal : Number(rateVal).toFixed(2)}\n`;
        }
      });
    });

    const subject = `Transport Quotation: ${refNo} - ${company} [${settings.name || 'Rens Dynamics Logistics'}]`;
    const body = 
`Dear ${attn || company},

With regards to the subject matter, we are pleased to submit our competitive transport rates for your kind perusal and consideration.

Our Ref: ${refNo}
Date: ${dateStr}

TRANSPORT RATES & DESTINATIONS:
${routesText}
${q.includeDiesel !== false && q.dieselPrice ? `Diesel Benchmark: RM ${q.dieselPrice}\n` : ''}
Terms & Conditions:
${q.terms || DEFAULT_TERMS || 'Standard transport terms apply.'}

We trust the above price meets your requirements and look forward to your valuable confirmation. We assure you of our prompt service at all times.

Thank you in advance.

Best regards,
${sender}
${settings.name || 'RENS DYNAMICS LOGISTICS SDN. BHD.'}
H/P: ${senderPhone}
Email: ${settings.email || 'rensdynamic.logistics@gmail.com'}`;

    const mailto = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    toast(`Opening email client for ${company}`, 'ok');
  }, [settings, toast]);

  const handleZoneFilterChange = useCallback((zone) => {
    setCustZoneFilter(zone);
    setOutreachZone(zone);
  }, []);

  // Filtered Customer List with Deduplication & Activity Filtering
  const filteredCustomers = useMemo(() => {
    // Deduplicate customer entries
    const dedupedMap = new Map();
    (customers || []).forEach(c => {
      const key = (c.company_name || c.id || '').toLowerCase().trim();
      if (!key) return;
      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, c);
      }
    });

    let list = Array.from(dedupedMap.values()).map(c => {
      let attn = (c.contact_person || c.attn || '').trim();
      let phone = (c.phone || c.tel || c.telephone || '').trim();
      let terms = (c.payment_terms || c.terms || '').trim();
      let email = (c.email || '').trim();

      if (!attn || !phone || !terms || !email) {
        const linkedQuotes = quotations.filter(q => 
          String(q.customer_id) === String(c.id) ||
          (q.customer && q.customer.company_name && q.customer.company_name.toLowerCase().trim() === (c.company_name || '').toLowerCase().trim()) ||
          (q.pickup_location && (c.company_name || '').toLowerCase().includes(q.pickup_location.split(',')[0].trim().toLowerCase()))
        );

        for (const q of linkedQuotes) {
          if (!attn && q.customer?.contact_person) attn = q.customer.contact_person.trim();
          if (!phone && q.customer?.phone) phone = q.customer.phone.trim();
          if (!email && q.customer?.email) email = q.customer.email.trim();

          let qSpecial = null;
          try {
            if (q.special_instructions && q.special_instructions.startsWith('{')) qSpecial = JSON.parse(q.special_instructions);
            else if (q.notes && q.notes.startsWith('{')) qSpecial = JSON.parse(q.notes);
          } catch (_) {}

          if (!phone && qSpecial?.senderPhone) phone = qSpecial.senderPhone.trim();
          if (!attn && qSpecial?.sender) attn = qSpecial.sender.trim();
          if (!terms && qSpecial?.terms) {
            const tMatch = qSpecial.terms.match(/(\d+\s*days(?:\s*credit)?)/i);
            terms = tMatch ? tMatch[1] : qSpecial.terms.split('\n')[0].replace(/^~?\s*Payment term\s*:\s*/i, '').trim();
          }

          const combinedText = `${q.raw_message || ''} ${q.customer_ref || ''} ${q.special_instructions || ''}`;
          if (!phone) {
            const pM = combinedText.match(/\b(01\d{1}[\s\-]?\d{7,8}|0[3-9]\d{1}[\s\-]?\d{7,8})\b/);
            if (pM) phone = pM[1].trim();
          }
          if (!email) {
            const eM = combinedText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
            if (eM) email = eM[0].trim();
          }
          if (!attn) {
            const aM = combinedText.match(/(?:Mr\.|Ms\.|Mrs\.|Encik|Puan|Attn:?)\s*([A-Za-z\s\/]+?)(?=\s*\(|\s*\||\s*[\d\n]|$)/i);
            if (aM) attn = aM[0].replace(/Attn:?\s*/i, '').trim();
          }
          if (!terms) {
            const tMatch2 = combinedText.match(/(\d+\s*days(?:\s*credit)?)/i);
            if (tMatch2) terms = tMatch2[1].trim();
          }
        }
      }

      if (!terms) terms = '30 days credit';

      const activeJobsCount = jobs.filter(j => String(j.customer_id) === String(c.id) && (j.status === 'in_transit' || j.status === 'assigned')).length;
      const totalJobsCount = jobs.filter(j => String(j.customer_id) === String(c.id)).length;

      return {
        ...c,
        contact_person: attn || c.contact_person || '—',
        phone: phone || c.phone || '—',
        email: email || c.email || '',
        payment_terms: terms || c.payment_terms || '30 days credit',
        activeJobsCount,
        totalJobsCount
      };
    });

    // Filter by Activity (un_giving = no active orders / ready for outreach)
    if (custActivityFilter === 'un_giving') {
      list = list.filter(c => c.activeJobsCount === 0);
    } else if (custActivityFilter === 'active') {
      list = list.filter(c => c.activeJobsCount > 0);
    }

    if (!custSearch.trim()) return list;
    const q = custSearch.toLowerCase().trim();
    return list.filter(c =>
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.contact_person || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.registration_no || '').toLowerCase().includes(q) ||
      (c.payment_terms || '').toLowerCase().includes(q)
    );
  }, [customers, quotations, jobs, custSearch, custActivityFilter]);

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

  // Generate tailored WhatsApp text for customer pitch
  const generateWhatsAppText = useCallback((customer, lorry) => {
    const custName = customer?.company_name || customer?.customer_name || 'Valued Customer';
    const contact = (customer?.contact_person || customer?.attn || 'Logistics / Dispatch Team').split('\n')[0].trim();
    const zoneName = lorry?.current_zone || customer?.pickup_zone || customer?.zone || customer?.region || (outreachZone === 'all' ? 'your area' : outreachZone);
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

  // Generate Email Subject & Body for customer pitch
  const generateEmailContent = useCallback((customer, lorry) => {
    const custName = customer?.company_name || customer?.customer_name || 'Valued Customer';
    const contact = (customer?.contact_person || customer?.attn || 'Logistics Team').split('\n')[0].trim();
    const zoneName = lorry?.current_zone || customer?.pickup_zone || customer?.zone || customer?.region || (outreachZone === 'all' ? 'your area' : outreachZone);
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
    const phoneRaw = customer?.phone || customer?.contact_no || '';
    const phones = phoneRaw.match(/01[0-9]-?[0-9]{7,8}|03-?[0-9]{7,8}/g) || [];
    let targetPhone = phones[0] || phoneRaw.replace(/[^\d+]/g, '');
    let cleanPhone = targetPhone.replace(/[^\d]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '60' + cleanPhone.slice(1);

    if (!cleanPhone) {
      toast('No valid phone number for ' + (customer?.company_name || customer?.customer_name || 'customer'), 'err');
      return;
    }
    const text = (customText !== undefined && customText !== null && customText.trim() !== '') ? customText : generateWhatsAppText(customer, lorry);
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    toast(`Opening WhatsApp for ${customer?.company_name || customer?.customer_name}`, 'ok');
  }, [generateWhatsAppText, toast]);

  // Handle Email action
  const handleSendEmail = useCallback((customer, lorry, customBody) => {
    const email = (customer?.email || '').trim();
    if (!email) {
      toast('No email address registered for ' + (customer?.company_name || customer?.customer_name || 'customer'), 'err');
      return;
    }
    const { subject, body } = generateEmailContent(customer, lorry);
    const finalBody = (customBody !== undefined && customBody !== null && customBody.trim() !== '') ? customBody : body;
    const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
    window.location.href = mailto;
    toast(`Opening email client for ${customer?.company_name || customer?.customer_name}`, 'ok');
  }, [generateEmailContent, toast]);

  // Available lorries strictly filtered by selected target operating zone
  const displayedFleetLorries = useMemo(() => {
    if (outreachZone === 'all') return availableLorries;
    return availableLorries.filter(l => isLorryCustomerZoneMatch(l.current_zone, outreachZone));
  }, [availableLorries, outreachZone]);

  // Target customers & registered contacts for active outreach in chosen zone strictly matched with lorry last zone
  const outreachTargetCustomers = useMemo(() => {
    const chosenLorry = selectedLorryId ? availableLorries.find(l => String(l.id) === String(selectedLorryId)) : null;

    // Combine registered customers and contact list
    const customerMap = new Map();

    (customers || []).forEach(c => {
      const key = (c.company_name || c.id || '').toLowerCase().trim();
      if (!key) return;
      customerMap.set(key, {
        id: c.id,
        company_name: c.company_name,
        contact_person: c.contact_person,
        phone: c.phone,
        email: c.email,
        payment_terms: c.payment_terms || '30 days credit',
        zone: c.zone || detectZone(c.billing_address || c.address) || 'Zone A'
      });
    });

    (contacts || []).forEach(c => {
      const key = (c.customer_name || c.company_name || c.id || '').toLowerCase().trim();
      if (!key) return;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          id: c.id,
          company_name: c.customer_name || c.company_name,
          contact_person: c.contact_person,
          phone: c.contact_no || c.phone,
          email: c.email,
          payment_terms: 'Registered Contact',
          zone: c.region || c.zone || 'Zone A'
        });
      } else {
        const existing = customerMap.get(key);
        if (!existing.phone && (c.contact_no || c.phone)) existing.phone = c.contact_no || c.phone;
        if (!existing.email && c.email) existing.email = c.email;
        if (!existing.contact_person && c.contact_person) existing.contact_person = c.contact_person;
      }
    });

    const unifiedList = Array.from(customerMap.values());

    let list = unifiedList.map(c => {
      const custPickupZone = c.zone || 'Zone A';

      // Count active running/assigned jobs for this customer
      const activeJobsCount = jobs.filter(j =>
        (j.status === 'assigned' || j.status === 'in_transit') &&
        ((j.customer?.company_name && c.company_name && j.customer.company_name.toLowerCase().trim() === c.company_name.toLowerCase().trim()) ||
         (j.customer_name && c.company_name && j.customer_name.toLowerCase().trim() === c.company_name.toLowerCase().trim()) ||
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

    if (chosenLorry) {
      list = list.filter(c => isLorryCustomerZoneMatch(chosenLorry.current_zone, c.pickup_zone));
    } else if (outreachZone !== 'all') {
      list = list.filter(c => isLorryCustomerZoneMatch(outreachZone, c.pickup_zone));
    } else {
      if (outreachAudience === 'un_giving') {
        list = list.filter(c => c.isZoneMatched && Boolean(c.matchedLorry));
      }
    }

    if (outreachAudience === 'un_giving') {
      list = list.filter(c => c.activeJobsCount === 0);
    }

    return list;
  }, [customers, contacts, jobs, availableLorries, selectedLorryId, outreachZone, outreachAudience]);

  // Active target customer in outreach modal
  const activeOutreachCustomer = useMemo(() => {
    return outreachModalCustomer || outreachTargetCustomers[0] || customers[0] || contacts[0] || null;
  }, [outreachModalCustomer, outreachTargetCustomers, customers, contacts]);

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

  // Synchronize pitch text when active customer/lorry changes
  useEffect(() => {
    if (isOutreachOpen && !isPitchCustomized && activeOutreachCustomer) {
      if (pitchTab === 'whatsapp') {
        setEditedPitchText(generateWhatsAppText(activeOutreachCustomer, activeOutreachLorry));
      } else {
        const { body } = generateEmailContent(activeOutreachCustomer, activeOutreachLorry);
        setEditedPitchText(body);
      }
    }
  }, [isOutreachOpen, activeOutreachCustomer, activeOutreachLorry, pitchTab, isPitchCustomized, generateWhatsAppText, generateEmailContent]);

  // Filtered Quotations List
  const filteredQuotations = useMemo(() => {
    if (!quoSearch.trim()) return quotations;
    const q = quoSearch.toLowerCase().trim();
    return quotations.filter(quo =>
      (quo.customer?.company_name || quo.customer_name || '').toLowerCase().includes(q) ||
      (quo.quote_no || quo.customer_ref || '').toLowerCase().includes(q) ||
      (quo.pickup_location || '').toLowerCase().includes(q) ||
      (quo.dropoff_location || '').toLowerCase().includes(q)
    );
  }, [quotations, quoSearch]);

  return (
    <div className="page">
      {/* Page Header */}
      <div className="pagehead">
        <div>
          <h1>Customers &amp; Quotation Registry</h1>
          <div className="sub">
            {settings.regno ? `${settings.regno} • ` : ''}Customer accounts &amp; quotation contracts records.
          </div>
        </div>

        <div className="tools" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
       

          <button
            className={`btn ${showForm ? 'gh' : 'pri'}`}
            onClick={() => setShowForm(!showForm)}
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

      {/* KPI Cards Row */}
      <div className="kpis" style={{ marginBottom: '24px' }}>
        <div className="kpi">
          <div className="k">Total Customers</div>
          <div className="v">{customers.length}</div>
          <div className="d up">{customers.length} Active Accounts</div>
        </div>

        <div className="kpi">
          <div className="k">Quotation Contracts</div>
          <div className="v" style={{ color: '#2563EB' }}>{quotations.length}</div>
          <div className="d">Registered rate cards</div>
        </div>

        <div className="kpi">
          <div className="k">Active Deliveries</div>
          <div className="v" style={{ color: '#10B981' }}>{jobs.filter(j => j.status === 'in_transit' || j.status === 'assigned').length}</div>
          <div className="d up">In transit &amp; assigned</div>
        </div>

        <div className="kpi">
          <div className="k">Lifetime Revenue</div>
          <div className="v">
            {fmtMoney(jobs.reduce((sum, j) => sum + (Number(j.rate_amount) || 0), 0))}
          </div>
          <div className="d">Commercial volume</div>
        </div>
      </div>

      {/* Top Heading Navigation Tabs */}
      <div className="statsrow" style={{ marginBottom: '24px' }}>
        <button
          className={`statchip ${activeTab === 'customers' ? 'on' : ''}`}
          onClick={() => setActiveTab('customers')}
        >
          CUSTOMERS <b>{customers.length}</b>
        </button>

        <button
          className={`statchip ${activeTab === 'quotations' ? 'on' : ''}`}
          onClick={() => setActiveTab('quotations')}
        >
          QUOTATIONS <b>{quotations.length}</b>
        </button>


      </div>

      {/* ═════════════════════════════════════════════════════════════
          TAB 1: CUSTOMERS
      ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'customers' && (
        <div className="tab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Full-Width Register Customer Panel */}
          {showForm && (
            <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', marginTop: 0, marginBottom: '18px' }}>
                {editingCustomerId ? `Edit customer — ${cName}` : 'Register customer'}
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.86rem' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Company name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Aureumaex Industries (M) Sdn Bhd"
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                  />
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label>Company reg. no.</label>
                  <input
                    type="text"
                    placeholder="e.g. 950592-K"
                    value={cRegNo}
                    onChange={(e) => setCRegNo(e.target.value)}
                  />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1', margin: 0 }}>
                  <label>Address</label>
                  <textarea
                    rows={2}
                    placeholder="Lot 5556, Block 2 & 3, Batu 14, Jalan Muar, 84900 Tangkak, Johor"
                    value={cAddress}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCAddress(val);
                      if (!cZone || cZone === 'Zone A') {
                        const detected = detectZone(val);
                        if (detected) setCZone(detected);
                      }
                    }}
                  />
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label>Attn / contact person</label>
                  <input
                    type="text"
                    placeholder="e.g. Mr Andrew"
                    value={cAttn}
                    onChange={(e) => setCAttn(e.target.value)}
                  />
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label>Phone (H/P)</label>
                  <input
                    type="tel"
                    placeholder="012-3456789"
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    style={{
                      borderColor: cPhone.trim() && !isValidPhone(cPhone) ? '#EF4444' : undefined,
                      boxShadow: cPhone.trim() && !isValidPhone(cPhone) ? '0 0 0 1px #EF4444' : undefined
                    }}
                  />
                  {cPhone.trim() && !isValidPhone(cPhone) && (
                    <span style={{ color: '#EF4444', fontSize: '0.72rem', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                      Please enter a valid phone number (min 8 digits, e.g. 012-3456789)
                    </span>
                  )}
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label>Email</label>
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={cEmail}
                    onChange={(e) => setCEmail(e.target.value)}
                    style={{
                      borderColor: cEmail.trim() && !isValidEmail(cEmail) ? '#EF4444' : undefined,
                      boxShadow: cEmail.trim() && !isValidEmail(cEmail) ? '0 0 0 1px #EF4444' : undefined
                    }}
                  />
                  {cEmail.trim() && !isValidEmail(cEmail) && (
                    <span style={{ color: '#EF4444', fontSize: '0.72rem', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                      Please enter a valid email address (e.g. name@company.com)
                    </span>
                  )}
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label>Payment terms</label>
                  <input
                    type="text"
                    placeholder="e.g. 30 days credit from invoice date"
                    value={cTerms}
                    onChange={(e) => setCTerms(e.target.value)}
                  />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1', margin: 0 }}>
                  <label>Notes / special instructions</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Requires safety boots, delivery before 3 PM"
                    value={cNotes}
                    onChange={(e) => setCNotes(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button className="btn pri" onClick={handleSaveCustomer} disabled={savingCustomer}>
                  {savingCustomer ? 'Saving...' : 'Save customer'}
                </button>
                {editingCustomerId && (
                  <button className="btn gh" onClick={resetCustomerForm} disabled={savingCustomer}>
                    Cancel edit
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Full-Width Registered Customers Panel */}
          <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', margin: 0 }}>
                  Registered customers
                </h2>
                <span className="badge" style={{ background: '#F1F5F9', color: 'var(--navy-900)', fontWeight: 800, padding: '3px 10px', borderRadius: '12px' }}>
                  {filteredCustomers.length} {filteredCustomers.length === 1 ? 'Customer' : 'Customers'}
                </span>
              </div>

              {/* Filters Toolbar: Activity Filter and Search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Activity Filter (All vs Un-giving / No active order) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', border: '1px solid var(--line)', borderRadius: '8px', padding: '0 8px', height: '34px' }}>
                  <Filter size={13} style={{ color: '#2563EB' }} />
                  <select
                    value={custActivityFilter}
                    onChange={(e) => setCustActivityFilter(e.target.value)}
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
                    <option value="all">All Statuses</option>
                    <option value="un_giving">⚡ No Active Orders (Dormant)</option>
                    <option value="active">🚚 Active Orders</option>
                  </select>
                </div>

                {/* Search Bar */}
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)' }} />
                  <input
                    type="text"
                    placeholder="Search company, attn, phone…"
                    value={custSearch}
                    onChange={(e) => setCustSearch(e.target.value)}
                    style={{ width: '100%', paddingLeft: '32px', height: '34px', fontSize: '0.84rem', background: '#FFF', border: '1px solid var(--line)', borderRadius: '8px' }}
                  />
                </div>

                {customers.length > 0 && (
                  <button
                    type="button"
                    className="btn gh sm"
                    onClick={handleClearAllCustomers}
                    style={{
                      fontSize: '0.74rem',
                      height: '34px',
                      color: '#EF4444',
                      borderColor: '#FECACA',
                      background: '#FFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Delete all demo/test customer entries"
                  >
                    <Trash2 size={13} />
                    <span>Reset Table</span>
                  </button>
                )}
              </div>
            </div>

            {filteredCustomers.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--slate)', border: '1px dashed var(--line)', borderRadius: '12px' }}>
                No customers match the filter criteria.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', color: 'var(--slate)', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--line)' }}>
                      <th style={{ padding: '12px 14px' }}>CUSTOMER / COMPANY</th>
                      <th style={{ padding: '12px 14px' }}>CONTACT PERSON &amp; PHONE</th>
                      <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>PAYMENT TERMS &amp; QUOTES</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => {
                      const qCount = quotations.filter(q => String(q.customer_id) === String(c.id)).length;
                      return (
                        <tr
                          key={c.id}
                          style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.15s ease' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Column 1: Customer Company, Reg No & Activity */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ color: 'var(--navy-900)', fontSize: '0.9rem' }}>{c.company_name}</strong>
                              {c.activeJobsCount === 0 && (
                                <span style={{ fontSize: '0.68rem', background: '#FEF3C7', color: '#D97706', padding: '2px 7px', borderRadius: '5px', fontWeight: 800 }} title="No active jobs running right now - prime candidate for available lorry outreach">
                                  ⚡ No Active Orders
                                </span>
                              )}
                            </div>
                            {c.registration_no && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px' }}>{c.registration_no}</div>
                            )}
                          </td>

                          {/* Column 2: Contact Person & Phone */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ color: 'var(--navy-900)', fontWeight: 600 }}>
                              {c.contact_person && c.contact_person !== '—' ? c.contact_person : <span style={{ color: 'var(--slate)' }}>—</span>}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>{c.phone || '—'}</span>
                              {c.email && <span style={{ color: '#2563EB' }}>&bull; {c.email}</span>}
                            </div>
                          </td>

                          {/* Column 3: Payment Terms & Quotations Count */}
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ color: 'var(--navy-900)', fontWeight: 600, fontSize: '0.82rem' }}>
                              {c.payment_terms || '30 days credit'}
                            </div>
                            <div style={{ marginTop: '3px' }}>
                              <span className="badge blue" style={{ padding: '1px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700 }}>
                                {qCount} {qCount === 1 ? 'Quotation' : 'Quotations'}
                              </span>
                            </div>
                          </td>

                          {/* Column 4: Actions with Eye Icon to view full details popup */}
                          <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {/* Eye View Details Icon */}
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => setViewingCustomer(c)}
                              style={{
                                marginRight: '6px',
                                height: '30px',
                                padding: '0 10px',
                                background: '#F1F5F9',
                                color: 'var(--navy-900)',
                                border: '1px solid var(--line)',
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                              }}
                              title="View full customer details popup"
                            >
                              <Eye size={13} style={{ color: '#2563EB' }} />
                              <span>View</span>
                            </button>

                            {/* Edit Button */}
                            <button
                              className="btn gh sm"
                              onClick={() => handleEditCustomer(c)}
                              style={{ marginRight: '6px', height: '30px', padding: '0 10px', fontWeight: 700 }}
                            >
                              Edit
                            </button>

                            {/* Delete Button */}
                            <button
                              className="btn danger sm"
                              onClick={() => setDeletingCustomer(c)}
                              style={{ height: '30px', padding: '0 10px', fontWeight: 700 }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB 2: QUOTATIONS
      ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'quotations' && (
        <div className="tab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {showForm && (
            <>
              {/* Panel 1: Register quotation fields */}
              <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', marginTop: 0, marginBottom: '18px' }}>
                  {editingQuoId ? `Edit quotation — ${qRef || 'untitled'}` : 'Register quotation'}
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', fontSize: '0.86rem' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Customer *</label>
                    <select
                      value={qCustomer}
                      onChange={(e) => handleSelectQuotationCustomer(e.target.value)}
                    >
                      <option value="">— select registered customer —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                    </select>
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label>Our ref.</label>
                    <input
                      type="text"
                      placeholder="e.g. Rens20260801"
                      value={qRef}
                      onChange={(e) => setQRef(e.target.value)}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label>Date</label>
                    <input
                      type="date"
                      value={qDate}
                      onChange={(e) => setQDate(e.target.value)}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label>Rev.</label>
                    <input
                      type="text"
                      placeholder="e.g. 1 0"
                      value={qRev}
                      onChange={(e) => setQRev(e.target.value)}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label>Sender</label>
                    <input
                      type="text"
                      placeholder="e.g. Rauf Rao"
                      value={qSender}
                      onChange={(e) => setQSender(e.target.value)}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label>Sender H/P</label>
                    <input
                      type="tel"
                      placeholder="012-6078449"
                      value={qSenderPhone}
                      onChange={(e) => setQSenderPhone(e.target.value)}
                      style={{
                        borderColor: qSenderPhone.trim() && !isValidPhone(qSenderPhone) ? '#EF4444' : undefined,
                        boxShadow: qSenderPhone.trim() && !isValidPhone(qSenderPhone) ? '0 0 0 1px #EF4444' : undefined
                      }}
                    />
                    {qSenderPhone.trim() && !isValidPhone(qSenderPhone) && (
                      <span style={{ color: '#EF4444', fontSize: '0.72rem', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                        Please enter a valid phone number (min 8 digits, e.g. 012-6078449)
                      </span>
                    )}
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label>Applies to item no. (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 8, 11, 12"
                      value={qItemNo}
                      onChange={(e) => setQItemNo(e.target.value)}
                    />
                  </div>

                  {/* 8th Slot: Diesel Price Include Checkbox & Dropdown */}
                  <div className="field" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', margin: 0, height: '18px' }}>
                      <input
                        type="checkbox"
                        checked={qIncludeDiesel}
                        onChange={(e) => setQIncludeDiesel(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--orange)', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.82rem' }}>
                        Diesel price include
                      </span>
                    </label>

                    {qIncludeDiesel && (
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            list="diesel-price-presets"
                            placeholder="e.g. 2.00 - 2.18 or 2.15"
                            value={qDieselPrice}
                            onChange={(e) => setQDieselPrice(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: '0.86rem',
                              fontWeight: 700,
                              border: '1px solid var(--line)',
                              borderRadius: '8px',
                              background: '#FFFFFF',
                              color: 'var(--navy-900)',
                              height: '38px'
                            }}
                          />
                          <select
                            value={['2.00 - 2.18', '2.15', '2.18', '2.50', '3.00', '3.35', 'Current Market Rate'].includes(qDieselPrice) ? qDieselPrice : 'custom'}
                            onChange={(e) => {
                              if (e.target.value !== 'custom') {
                                setQDieselPrice(e.target.value);
                              }
                            }}
                            style={{
                              width: 'auto',
                              padding: '0 8px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              border: '1px solid var(--line)',
                              borderRadius: '8px',
                              background: '#F8FAFC',
                              color: 'var(--navy-900)',
                              height: '38px',
                              cursor: 'pointer'
                            }}
                            title="Select preset diesel rate"
                          >
                            <option value="2.00 - 2.18">2.00 - 2.18</option>
                            <option value="2.15">2.15 (Euro 5 B10)</option>
                            <option value="2.18">2.18 (Euro 5 B7)</option>
                            <option value="2.50">2.50</option>
                            <option value="3.00">3.00</option>
                            <option value="3.35">3.35 (Commercial)</option>
                            <option value="Current Market Rate">Market Rate</option>
                            <option value="custom">Custom...</option>
                          </select>
                        </div>
                        <datalist id="diesel-price-presets">
                          <option value="2.00 - 2.18" />
                          <option value="2.15" />
                          <option value="2.18" />
                          <option value="2.50" />
                          <option value="3.00" />
                          <option value="3.35" />
                          <option value="Current Market Rate" />
                        </datalist>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Panel 2: Lorry types on this quotation */}
              <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', marginTop: 0, marginBottom: '4px' }}>
                  Lorry types on this quotation
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--slate)', marginBottom: '14px' }}>
                  — edit column labels to match tonnage/length used
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  {qLorryTypes.map((t, idx) => (
                    <div key={idx} className="field" style={{ margin: 0 }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Column {idx + 1}</span>
                        {qLorryTypes.length > 1 && (
                          <span
                            onClick={() => {
                              const copy = [...qLorryTypes];
                              copy.splice(idx, 1);
                              setQLorryTypes(copy);
                            }}
                            title="Remove column"
                            style={{ cursor: 'pointer', color: '#EF4444', fontWeight: 800, fontSize: '0.8rem' }}
                          >
                            ✕
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={t}
                        onChange={(e) => {
                          const copy = [...qLorryTypes];
                          copy[idx] = e.target.value;
                          setQLorryTypes(copy);
                        }}
                      />
                    </div>
                  ))}
                </div>

                <button
                  className="btn gh sm"
                  type="button"
                  onClick={() => setQLorryTypes([...qLorryTypes, 'New type'])}
                >
                  + Add lorry type column
                </button>
              </div>

              {/* Panel 3: Routes & rates (RM) */}
              <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', marginTop: 0, marginBottom: '4px' }}>
                  Routes &amp; rates (RM)
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--slate)', marginBottom: '16px' }}>
                  — per lorry type, collection &rarr; unloading
                </div>

                {qRoutes.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--slate)', border: '1px dashed var(--line)', borderRadius: '12px', marginBottom: '16px' }}>
                    No routes yet — add one below.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {qRoutes.map((r, rIdx) => (
                      <div
                        key={rIdx}
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid var(--line)',
                          borderRadius: '12px',
                          padding: '14px 16px'
                        }}
                      >
                        {/* Line 1: Origin, Origin Zone, Destination, Destination Zone, Code Word & Remove */}
                        <div style={{ display: 'grid', gridTemplateColumns: r.isDropoint ? 'minmax(200px, 2fr) minmax(130px, 1.2fr) minmax(110px, 1fr) auto' : 'minmax(180px, 1.8fr) minmax(130px, 1.2fr) minmax(180px, 1.8fr) minmax(130px, 1.2fr) minmax(110px, 1fr) auto', gap: '10px', alignItems: 'flex-end', marginBottom: '12px' }}>
                          {r.isDropoint ? (
                            <>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--orange)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  Dropoint Description
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Between 10km radius"
                                  value={r.collection || ''}
                                  onChange={(e) => {
                                    const copy = [...qRoutes];
                                    copy[rIdx].collection = e.target.value;
                                    setQRoutes(copy);
                                  }}
                                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.84rem', background: '#FFF' }}
                                />
                              </div>

                              <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  <MapPin size={11} style={{ color: 'var(--orange)' }} />
                                  Zone / Region
                                </label>
                                <input
                                  type="text"
                                  list="route-zone-options"
                                  placeholder="e.g. Zone A"
                                  value={r.collection_zone || ''}
                                  onChange={(e) => {
                                    const copy = [...qRoutes];
                                    copy[rIdx].collection_zone = e.target.value;
                                    setQRoutes(copy);
                                  }}
                                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.84rem', background: '#FFF' }}
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  Code Word / Ref
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. DP-01"
                                  value={r.code_word || ''}
                                  onChange={(e) => {
                                    const copy = [...qRoutes];
                                    copy[rIdx].code_word = e.target.value;
                                    setQRoutes(copy);
                                  }}
                                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.84rem', background: '#FFF' }}
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  Collection Place
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Shah Alam"
                                  value={r.collection || ''}
                                  onChange={(e) => {
                                    const copy = [...qRoutes];
                                    copy[rIdx].collection = e.target.value;
                                    setQRoutes(copy);
                                  }}
                                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.84rem', background: '#FFF' }}
                                />
                              </div>

                              <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  <MapPin size={11} style={{ color: 'var(--orange)' }} />
                                  Collection Zone
                                </label>
                                <input
                                  type="text"
                                  list="route-zone-options"
                                  placeholder="e.g. Zone A"
                                  value={r.collection_zone || ''}
                                  onChange={(e) => {
                                    const copy = [...qRoutes];
                                    copy[rIdx].collection_zone = e.target.value;
                                    setQRoutes(copy);
                                  }}
                                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.84rem', background: '#FFF' }}
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  Unloading Place
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Pasir Gudang, Johor"
                                  value={r.unloading || ''}
                                  onChange={(e) => {
                                    const copy = [...qRoutes];
                                    copy[rIdx].unloading = e.target.value;
                                    setQRoutes(copy);
                                  }}
                                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.84rem', background: '#FFF' }}
                                />
                              </div>

                              <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  <MapPin size={11} style={{ color: 'var(--orange)' }} />
                                  Unloading Zone
                                </label>
                                <input
                                  type="text"
                                  list="route-zone-options"
                                  placeholder="e.g. Zone D"
                                  value={r.unloading_zone || ''}
                                  onChange={(e) => {
                                    const copy = [...qRoutes];
                                    copy[rIdx].unloading_zone = e.target.value;
                                    setQRoutes(copy);
                                  }}
                                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.84rem', background: '#FFF' }}
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  Code Word / Ref
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. CW-01"
                                  value={r.code_word || ''}
                                  onChange={(e) => {
                                    const copy = [...qRoutes];
                                    copy[rIdx].code_word = e.target.value;
                                    setQRoutes(copy);
                                  }}
                                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.84rem', background: '#FFF' }}
                                />
                              </div>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setQRoutes(qRoutes.filter((_, idx) => idx !== rIdx))}
                            style={{
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#EF4444',
                              cursor: 'pointer',
                              padding: '7px 12px',
                              borderRadius: '8px',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              height: '35px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap'
                            }}
                            title="Remove route"
                          >
                            ✕ Remove
                          </button>
                        </div>

                        {/* Line 2: Rates per Lorry Type */}
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '6px' }}>
                            Rates (RM) Per Lorry Type
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                            {qLorryTypes.map((t, tIdx) => (
                              <div
                                key={tIdx}
                                style={{
                                  background: '#FFFFFF',
                                  border: '1px solid var(--line)',
                                  borderRadius: '8px',
                                  padding: '6px 10px'
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: 'var(--slate)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    marginBottom: '3px'
                                  }}
                                  title={t}
                                >
                                  {t}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>RM</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={r.rates[t] || ''}
                                    onChange={(e) => {
                                      const copy = [...qRoutes];
                                      copy[rIdx].rates = { ...copy[rIdx].rates, [t]: e.target.value };
                                      setQRoutes(copy);
                                    }}
                                    style={{
                                      width: '100%',
                                      border: 'none',
                                      background: 'transparent',
                                      fontSize: '0.86rem',
                                      fontWeight: 800,
                                      color: 'var(--navy-900)',
                                      textAlign: 'right',
                                      outline: 'none',
                                      padding: 0
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <datalist id="route-zone-options">
                  {allAvailableZones.map(z => (
                    <option key={z} value={z} />
                  ))}
                </datalist>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn gh sm"
                    type="button"
                    onClick={() => setQRoutes([...qRoutes, { collection: '', collection_zone: '', unloading: '', unloading_zone: '', code_word: '', isDropoint: false, rates: {} }])}
                  >
                    + Add route
                  </button>
                  <button
                    className="btn gh sm"
                    type="button"
                    onClick={() => setQRoutes([...qRoutes, { collection: '', collection_zone: '', unloading: 'Dropoint', unloading_zone: '', code_word: '', isDropoint: true, rates: {} }])}
                  >
                    + Add dropoint row
                  </button>
                </div>
              </div>

              {/* Panel 4: Terms & conditions */}
              <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', marginTop: 0, marginBottom: '12px' }}>
                  Terms &amp; conditions
                </h2>
                <textarea
                  rows={4}
                  placeholder="e.g. Payment term: 30 days credit from date of invoice..."
                  value={qTerms}
                  onChange={(e) => setQTerms(e.target.value)}
                  style={{ width: '100%', fontSize: '0.84rem', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', margin: '-4px 0 10px 0' }}>
                <button className="btn pri" onClick={handleSaveQuotation} disabled={savingQuotation}>
                  {savingQuotation ? 'Saving...' : 'Save quotation'}
                </button>
                {editingQuoId && (
                  <button className="btn gh" onClick={resetQuotationForm} disabled={savingQuotation}>
                    Cancel edit
                  </button>
                )}
              </div>
            </>
          )}

          {/* Panel 5: Saved quotations list */}
          <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', margin: 0 }}>
                Saved quotations
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '260px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)' }} />
                  <input
                    type="text"
                    placeholder="Search customer, ref…"
                    value={quoSearch}
                    onChange={(e) => setQuoSearch(e.target.value)}
                    style={{ width: '100%', paddingLeft: '32px', height: '34px', fontSize: '0.84rem', background: '#FFF', border: '1px solid var(--line)', borderRadius: '8px' }}
                  />
                </div>

                {quotations.length > 0 && (
                  <button
                    type="button"
                    className="btn gh sm"
                    onClick={handleClearAllQuotations}
                    style={{
                      fontSize: '0.74rem',
                      height: '34px',
                      color: '#EF4444',
                      borderColor: '#FECACA',
                      background: '#FFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Delete all saved quotation entries"
                  >
                    <Trash2 size={13} />
                    <span>Reset Quotations</span>
                  </button>
                )}
              </div>
            </div>

            {filteredQuotations.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--slate)', border: '1px dashed var(--line)', borderRadius: '12px' }}>
                No quotations registered yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', color: 'var(--slate)', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--line)' }}>
                      <th style={{ padding: '12px 14px' }}>CUSTOMER</th>
                      <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>REF</th>
                      <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>DATE</th>
                      <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>STATUS</th>
                      <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>ROUTES</th>
                      <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>LORRY TYPES</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotations.map((quo) => {
                      let parsed = null;
                      try {
                        if (quo.special_instructions && quo.special_instructions.startsWith('{')) {
                          parsed = JSON.parse(quo.special_instructions);
                        }
                      } catch (_) {}

                      const custName = quo.customer?.company_name || quo.customer_name || 'Unlinked customer';
                      const routeCount = parsed?.routes ? parsed.routes.length : 1;
                      const typeCount = parsed?.lorryTypes ? parsed.lorryTypes.length : (quo.lorry_spec ? quo.lorry_spec.split(' | ').length : 5);
                      const isApproved = quo.status === 'approved';

                      return (
                        <tr
                          key={quo.id}
                          style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.15s ease' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '12px 14px' }}>
                            <strong style={{ color: 'var(--navy-900)' }}>{custName}</strong>
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--slate)' }}>
                            {quo.quote_no || quo.customer_ref || '—'}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--slate)' }}>
                            {parsed?.date || fmtDate(quo.created_at)}
                          </td>
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: isApproved ? '#ECFDF5' : '#FFFBEB',
                              color: isApproved ? '#059669' : '#D97706',
                              border: `1px solid ${isApproved ? '#A7F3D0' : '#FDE68A'}`
                            }}>
                              {isApproved ? 'Approved' : 'Pending Approval'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>{routeCount}</td>
                          <td style={{ padding: '12px 14px', color: 'var(--slate)' }}>{typeCount}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              className="btn gh sm"
                              onClick={() => handleViewQuotation(quo)}
                              style={{ marginRight: '6px', height: '28px', padding: '2px 10px' }}
                            >
                              View / print
                            </button>
                            <button
                              className="btn gh sm"
                              onClick={() => handleEditQuotation(quo)}
                              style={{ marginRight: '6px', height: '28px', padding: '2px 10px' }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn danger sm"
                              onClick={() => setDeletingQuotation(quo)}
                              style={{ height: '28px', padding: '2px 10px' }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════
          TAB 3: COMPANY DETAILS
      ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'settings' && (
        <div className="tab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Panel 1: Letterhead details */}
          {showForm && (
            <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', marginTop: 0, marginBottom: '4px' }}>
                Letterhead details
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate)', marginBottom: '18px' }}>
                — used when printing/viewing a quotation document
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.86rem' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Company name</label>
                  <input
                    type="text"
                    placeholder="e.g. RENS DYNAMICS LOGISTICS SDN BHD"
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  />
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label>Reg. no.</label>
                  <input
                    type="text"
                    placeholder="e.g. 950592-K"
                    value={settings.regno}
                    onChange={(e) => setSettings({ ...settings, regno: e.target.value })}
                  />
                </div>

                <div className="field" style={{ gridColumn: '1 / -1', margin: 0 }}>
                  <label>Address</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. P.T 2140, Sri Senawang Light Industrial Centre, 70450 Seremban, Negeri Sembilan."
                    value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  />
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label>Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 012-616 8449"
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    style={{
                      borderColor: settings.phone && settings.phone.trim() && !isValidPhone(settings.phone) ? '#EF4444' : undefined,
                      boxShadow: settings.phone && settings.phone.trim() && !isValidPhone(settings.phone) ? '0 0 0 1px #EF4444' : undefined
                    }}
                  />
                  {settings.phone && settings.phone.trim() && !isValidPhone(settings.phone) && (
                    <span style={{ color: '#EF4444', fontSize: '0.72rem', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                      Please enter a valid phone number (min 8 digits, e.g. 012-616 8449)
                    </span>
                  )}
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label>Email</label>
                  <input
                    type="email"
                    placeholder="e.g. rensdynamic.logistics@gmail.com"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    style={{
                      borderColor: settings.email && settings.email.trim() && !isValidEmail(settings.email) ? '#EF4444' : undefined,
                      boxShadow: settings.email && settings.email.trim() && !isValidEmail(settings.email) ? '0 0 0 1px #EF4444' : undefined
                    }}
                  />
                  {settings.email && settings.email.trim() && !isValidEmail(settings.email) && (
                    <span style={{ color: '#EF4444', fontSize: '0.72rem', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                      Please enter a valid email address (e.g. rensdynamic.logistics@gmail.com)
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <button className="btn pri" onClick={handleSaveSettings}>
                  Save details
                </button>
              </div>
            </div>
          )}

          {/* Panel 2: About this registry */}
          <div className="panel" style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', marginTop: 0, marginBottom: '10px' }}>
              About this registry
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--slate)', lineHeight: 1.6, margin: 0 }}>
              Data entered here is shared with everyone who opens this tool (it is not private to one device).
              Customers are registered once, then reused when building a quotation. Each quotation stores its own
              lorry-type columns and route rates, so different customers can keep different tonnage/length structures —
              matching how your paper quotations vary by client. Use "View / print" on a saved quotation to get a
              letterhead-formatted copy.
            </p>
          </div>
        </div>
      )}

      {/* Official Letterhead Printable Modal */}
      {previewQuotation && createPortal(
        <div
          className="overlay open"
          onClick={() => setPreviewQuotation(null)}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
            zIndex: 99999
          }}
        >
          <div
            className="cmdbox quotation-preview-box"
            style={{
              maxWidth: '820px',
              width: '100%',
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '36px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
              border: '1px solid var(--line)',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Action Bar */}
            <div className="print-hide" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              {/* WhatsApp and Email Send Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn gh"
                  onClick={() => handleSendQuotationWhatsApp(previewQuotation)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#15803D',
                    borderColor: '#86EFAC',
                    background: '#F0FDF4',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    padding: '8px 14px',
                    boxShadow: '0 1px 3px rgba(22, 163, 74, 0.1)'
                  }}
                  title="Send Quotation via WhatsApp"
                >
                  <MessageSquare size={15} strokeWidth={2.4} />
                  <span>Send WhatsApp</span>
                </button>

                <button
                  className="btn gh"
                  onClick={() => handleSendQuotationEmail(previewQuotation)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#1D4ED8',
                    borderColor: '#93C5FD',
                    background: '#EFF6FF',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    padding: '8px 14px',
                    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.1)'
                  }}
                  title="Send Quotation via Email"
                >
                  <Mail size={15} strokeWidth={2.4} />
                  <span>Send Email</span>
                </button>
              </div>

              {/* Print and Close Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="btn gh" onClick={() => setPreviewQuotation(null)}>Close</button>
                <button className="btn pri" onClick={() => window.print()}>
                  <Printer size={14} /> Print
                </button>
              </div>
            </div>

            {/* Letterhead Paper Sheet */}
            <div
              className="printable-sheet"
              style={{
                background: '#FFFFFF',
                color: '#000000',
                fontFamily: '"Times New Roman", "Outfit", serif, sans-serif',
                padding: '24px 28px',
                border: '1px solid #E2E8F0',
                borderRadius: '8px'
              }}
            >
              {/* Brand Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #000000', paddingBottom: '10px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={logoImg} alt="Rens Dynamics" style={{ height: '56px', width: 'auto', objectFit: 'contain' }} />
                </div>
                <div style={{ textAlign: 'center', flex: 1, paddingRight: '20px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#000000', letterSpacing: '0.5px' }}>
                    {settings.name || 'RENS DYNAMICS LOGISTICS SDN. BHD.'} <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>({settings.regno || '950592-K'})</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#222222', marginTop: '3px', lineHeight: 1.35 }}>
                    {settings.address || 'P.T 2140, Sri Senawang Light Industrial Centre, 70450 Seremban, Negeri Sembilan.'}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#222222', marginTop: '2px' }}>
                    <strong>H/P :</strong> {settings.phone || '012-616 8449'} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>email :</strong> {settings.email || 'rensdynamic.logistics@gmail.com'}
                  </div>
                </div>
              </div>

              {/* Customer Info (Left) & Metadata (Right) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px', marginBottom: '16px', fontSize: '0.86rem', color: '#000000' }}>
                {/* Left: Customer */}
                <div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <strong style={{ minWidth: '35px' }}>To :</strong>
                    <div>
                      <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>
                        {previewQuotation.customer?.company_name || previewQuotation.customer_name || 'Valued Customer'}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#222222', marginTop: '2px', lineHeight: 1.4 }}>
                        {previewQuotation.customer?.billing_address || '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                    <strong style={{ minWidth: '35px' }}>Attn:</strong>
                    <div style={{ fontWeight: 800 }}>
                      {previewQuotation.customer?.contact_person || '—'}
                    </div>
                  </div>
                </div>

                {/* Right: Quotation Specs */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.86rem', width: 'auto' }}>
                    <tbody>
                      {previewQuotation.ref ? (
                        <tr>
                          <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>Our Ref :</td>
                          <td style={{ padding: '2px 0', fontWeight: 700 }}>{previewQuotation.ref}</td>
                        </tr>
                      ) : null}
                      <tr>
                        <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>Sender :</td>
                        <td style={{ padding: '2px 0', fontWeight: 700 }}>{previewQuotation.sender || 'Rauf Rao'}</td>
                      </tr>
                      {previewQuotation.senderPhone ? (
                        <tr>
                          <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>H/P :</td>
                          <td style={{ padding: '2px 0' }}>{previewQuotation.senderPhone}</td>
                        </tr>
                      ) : null}
                      <tr>
                        <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>Date :</td>
                        <td style={{ padding: '2px 0' }}>{fmtDate(previewQuotation.date || previewQuotation.created_at) || previewQuotation.date || '01/02/2025'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>Rev :</td>
                        <td style={{ padding: '2px 0' }}>{previewQuotation.rev || '1 0'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Centered Title */}
              <div style={{ textAlign: 'center', margin: '14px 0 12px 0' }}>
                <span
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 900,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    borderBottom: '1.5px solid #000000',
                    paddingBottom: '2px',
                    display: 'inline-block'
                  }}
                >
                  QUOTATION
                </span>
              </div>

              {/* Intro Line */}
              <div style={{ fontSize: '0.84rem', marginBottom: '14px', lineHeight: 1.5, color: '#111111' }}>
                With regards to the above mentioned subject, we are pleased to submit our competitive rate{previewQuotation.itemNo ? ` for item no. ${previewQuotation.itemNo}` : ''} for your kind perusal and consideration.
              </div>

              {/* Rates Table with Solid Clean Borders */}
              <table
                style={{
                  width: '100%',
                  border: '1.5px solid #000000',
                  borderCollapse: 'collapse',
                  fontSize: '0.82rem',
                  marginBottom: '10px'
                }}
              >
                <thead>
                  <tr style={{ background: '#F8FAFC', textAlign: 'center', borderBottom: '1.5px solid #000000' }}>
                    <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '50px', fontWeight: 900 }}>ITEM</th>
                    <th style={{ border: '1px solid #000000', padding: '6px 12px', textAlign: 'left', fontWeight: 900 }}>DESTINATION</th>
                    {previewQuotation.includeDiesel !== false && (
                      <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '110px', fontWeight: 900 }}>DIESEL PRICE<br/>(RM)</th>
                    )}
                    {previewQuotation.lorryTypes.map((t, idx) => (
                      <th key={idx} style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 900 }}>
                        {t}<br />(RM)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewQuotation.routes.map((r, rIdx) => {
                    const destLabel = r.isDropoint
                      ? `Dropoint — ${r.collection}`
                      : (r.collection && r.unloading ? `${r.collection} to ${r.unloading}` : (r.collection || r.unloading || 'Standard Route'));

                    const zoneDetails = [
                      r.collection_zone ? `From: ${r.collection_zone}` : null,
                      r.unloading_zone ? `To: ${r.unloading_zone}` : null
                    ].filter(Boolean).join(' • ');

                    return (
                      <tr key={rIdx} style={{ textAlign: 'center' }}>
                        <td style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 800 }}>
                          {r.code_word ? (
                            <div>
                              <div>{rIdx + 1}</div>
                              <div style={{ fontSize: '0.68rem', color: '#555555', fontWeight: 700 }}>({r.code_word})</div>
                            </div>
                          ) : (
                            rIdx + 1
                          )}
                        </td>
                        <td style={{ border: '1px solid #000000', padding: '6px 12px', textAlign: 'left', fontWeight: 800 }}>
                          <div>{destLabel}</div>
                          {zoneDetails && (
                            <div style={{ fontSize: '0.72rem', color: '#444444', fontWeight: 600, marginTop: '2px' }}>
                              📍 {zoneDetails}
                            </div>
                          )}
                        </td>
                        {previewQuotation.includeDiesel !== false && (
                          <td style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 700, color: '#333333' }}>
                            {previewQuotation.dieselPrice ? previewQuotation.dieselPrice : '—'}
                          </td>
                        )}
                        {previewQuotation.lorryTypes.map((t, tIdx) => (
                          <td key={tIdx} style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 800, textAlign: 'right' }}>
                            {r.rates && r.rates[t] && !isNaN(Number(r.rates[t])) && Number(r.rates[t]) > 0
                              ? Number(r.rates[t]).toFixed(2)
                              : (r.rates && r.rates[t] ? r.rates[t] : '—')}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Sub-table Note */}
              {previewQuotation.subNote ? (
                <div style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: '#111111', fontStyle: 'italic', marginBottom: '14px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                  {previewQuotation.subNote}
                </div>
              ) : null}

              {/* Terms and Conditions */}
              <div style={{ fontSize: '0.82rem', lineHeight: 1.6, marginBottom: '20px', color: '#111111' }}>
                <div style={{ fontWeight: 900, marginBottom: '4px' }}>Terms and conditions :</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {previewQuotation.terms || DEFAULT_TERMS}
                </div>
                <div style={{ marginTop: '10px' }}>
                  We trust the above price is reasonable and look forward to your valuable support and we are assuring prompt service at all the times. Thank you in advance.
                </div>
                <div style={{ marginTop: '6px' }}>
                  Should you need any further clarification, please do not hesitate to contact us.
                </div>
              </div>

              {/* Footer Signatures: Dual Column like Image 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '28px', fontSize: '0.82rem', color: '#000000' }}>
                {/* Left Signature */}
                <div>
                  <div>Your faithfully,</div>
                  <div style={{ fontWeight: 900, marginTop: '2px' }}>
                    {settings.name || 'RENS DYNAMICS LOGISTICS SDN BHD'}
                  </div>
                  <div style={{ fontSize: '0.74rem', fontStyle: 'italic', color: '#444444', marginTop: '20px' }}>
                    This is a computer-generated document.<br />
                    No signature is required.
                  </div>
                  <div style={{ fontWeight: 900, marginTop: '20px', textTransform: 'uppercase' }}>
                    {previewQuotation.sender || 'RAUF RAO'}
                  </div>
                </div>

                {/* Right Acceptance Box */}
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#222222', lineHeight: 1.4, marginBottom: '25px' }}>
                    Kindly sign a copy of this quotation in acceptance of the above-mentioned terms and conditions and return the same for our records.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82rem' }}>
                    <div>Name : _________________________________</div>
                    <div>Date &nbsp;: _________________________________</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Customer Confirmation Modal */}
      {deletingCustomer && createPortal(
        <div
          className="overlay open"
          onClick={() => setDeletingCustomer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
            zIndex: 99999
          }}
        >
          <div className="cmdbox" style={{ maxWidth: '420px', width: '100%', background: '#FFFFFF', borderRadius: '20px', padding: '24px', textAlign: 'center', margin: 'auto', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <Trash2 size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)' }}>
              Delete Customer?
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: 'var(--slate)' }}>
              Are you sure you want to remove <strong>{deletingCustomer.company_name}</strong> from the customer registry?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button type="button" className="btn gh" onClick={() => setDeletingCustomer(null)} style={{ flex: 1 }}>Cancel</button>
              <button type="button" className="btn danger" onClick={confirmDeleteCustomer} style={{ flex: 1, background: '#DC2626', color: '#FFF', borderColor: '#DC2626' }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Quotation Confirmation Modal */}
      {deletingQuotation && createPortal(
        <div
          className="overlay open"
          onClick={() => setDeletingQuotation(null)}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
            zIndex: 99999
          }}
        >
          <div className="cmdbox" style={{ maxWidth: '420px', width: '100%', background: '#FFFFFF', borderRadius: '20px', padding: '24px', textAlign: 'center', margin: 'auto', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <Trash2 size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)' }}>
              Delete Quotation Contract?
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: 'var(--slate)' }}>
              Are you sure you want to remove quotation <strong>{deletingQuotation.quote_no || deletingQuotation.id}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button type="button" className="btn gh" onClick={() => setDeletingQuotation(null)} style={{ flex: 1 }}>Cancel</button>
              <button type="button" className="btn danger" onClick={confirmDeleteQuotation} style={{ flex: 1, background: '#DC2626', color: '#FFF', borderColor: '#DC2626' }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ═════════════════════════════════════════════════════════════
          AVAILABLE LORRY ZONE OUTREACH MODAL (PREMIUM STUDIO VIEW)
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
                    onChange={(e) => setOutreachZone(e.target.value)}
                    style={{ border: 'none', background: 'transparent', fontSize: '0.84rem', fontWeight: 700, color: 'var(--navy-900)', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="all">All Operating Zones</option>
                    {allAvailableZones.map(z => {
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
                      Target Customers in {outreachZone === 'all' ? 'All Zones' : outreachZone}
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
                          onClick={() => setOutreachModalCustomer(cust)}
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
                                  {cust.company_name}
                                </strong>
                                <span style={{ fontSize: '0.68rem', background: '#F1F5F9', color: 'var(--navy-900)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                  📍 {cust.pickup_zone || cust.zone || 'Zone A'}
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
                          {(cust.address || cust.factory_location || cust.pickup_location) && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '0.72rem', color: 'var(--slate)', lineHeight: 1.35 }}>
                              <MapPin size={11} style={{ color: '#F97316', flexShrink: 0, marginTop: '2px' }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {cust.address || cust.factory_location || cust.pickup_location}
                              </span>
                            </div>
                          )}

                          {/* Contact Info & Actions Bar */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px dashed #F1F5F9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--slate)', flexWrap: 'wrap' }}>
                              <span>Attn: <strong style={{ color: 'var(--navy-800)' }}>{(cust.contact_person || 'Logistics').split('\n')[0]}</strong></span>
                              <span>Tel: <strong style={{ color: 'var(--navy-800)' }}>{cust.phone || '—'}</strong></span>
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
                                title={`Open WhatsApp chat with ${cust.company_name}`}
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
                                  title={`Send Email to ${cust.company_name}`}
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
                  {/* Channel Tabs */}
                  <div style={{ display: 'flex', background: '#E2E8F0', padding: '3px', borderRadius: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPitchTab('whatsapp');
                        setIsPitchCustomized(false);
                        setEditedPitchText(generateWhatsAppText(activeOutreachCustomer, activeOutreachLorry));
                      }}
                      style={{
                        border: 'none',
                        background: pitchTab === 'whatsapp' ? '#10B981' : 'transparent',
                        color: pitchTab === 'whatsapp' ? '#FFFFFF' : 'var(--navy-900)',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                        boxShadow: pitchTab === 'whatsapp' ? '0 1px 4px rgba(16, 185, 129, 0.3)' : 'none'
                      }}
                    >
                      <Phone size={11} />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPitchTab('email');
                        setIsPitchCustomized(false);
                        const { body } = generateEmailContent(activeOutreachCustomer, activeOutreachLorry);
                        setEditedPitchText(body);
                      }}
                      style={{
                        border: 'none',
                        background: pitchTab === 'email' ? '#2563EB' : 'transparent',
                        color: pitchTab === 'email' ? '#FFFFFF' : 'var(--navy-900)',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                        boxShadow: pitchTab === 'email' ? '0 1px 4px rgba(37, 99, 235, 0.3)' : 'none'
                      }}
                    >
                      <Mail size={11} />
                      <span>Email</span>
                    </button>
                  </div>

                  {/* Editor Action Tools */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPitchCustomized(false);
                        if (pitchTab === 'whatsapp') {
                          setEditedPitchText(generateWhatsAppText(activeOutreachCustomer, activeOutreachLorry));
                        } else {
                          const { body } = generateEmailContent(activeOutreachCustomer, activeOutreachLorry);
                          setEditedPitchText(body);
                        }
                        toast('Reset pitch to standard template', 'ok');
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
                      title="Reset to default pitch template"
                    >
                      <RotateCcw size={11} />
                      <span>Reset</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const textToCopy = editedPitchText || (pitchTab === 'whatsapp'
                          ? generateWhatsAppText(activeOutreachCustomer, activeOutreachLorry)
                          : generateEmailContent(activeOutreachCustomer, activeOutreachLorry).body);
                        navigator.clipboard.writeText(textToCopy);
                        toast('Pitch message copied to clipboard!', 'ok');
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
                        <span>To: <strong style={{ color: 'var(--navy-900)' }}>{activeOutreachCustomer?.company_name || 'Customer'}</strong></span>
                      </div>
                      <span style={{ fontSize: '0.68rem', background: '#DBEAFE', color: '#1D4ED8', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                        📍 {activeOutreachCustomer?.pickup_zone || activeOutreachCustomer?.zone || 'Zone A'}
                      </span>
                    </div>

                    {(activeOutreachCustomer?.address || activeOutreachCustomer?.factory_location || activeOutreachCustomer?.pickup_location) && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', fontSize: '0.72rem', color: 'var(--slate)' }}>
                        <MapPin size={12} style={{ color: '#2563EB', flexShrink: 0, marginTop: '1px' }} />
                        <span style={{ color: 'var(--navy-800)', lineHeight: 1.3 }}>
                          {activeOutreachCustomer.address || activeOutreachCustomer.factory_location || activeOutreachCustomer.pickup_location}
                        </span>
                      </div>
                    )}

                    {activeOutreachLorry && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#047857' }}>
                        <Truck size={12} style={{ color: '#059669' }} />
                        <span>Unit: <strong>{activeOutreachLorry.plate_no}</strong> ({activeOutreachLorry.capacity_desc || activeOutreachLorry.lorry_type || 'Fleet Lorry'}) &bull; <strong>Now in {activeOutreachLorry.current_zone || 'Zone A'}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Email Subject preview line (when in email mode) */}
                  {pitchTab === 'email' && (
                    <div style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '8px', padding: '6px 10px', fontSize: '0.76rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'var(--slate)', fontWeight: 700 }}>Subject:</span>
                      <strong style={{ color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {generateEmailContent(activeOutreachCustomer, activeOutreachLorry).subject}
                      </strong>
                    </div>
                  )}

                  {/* Live Editable Textarea Box */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '200px' }}>
                    <textarea
                      value={editedPitchText}
                      onChange={(e) => {
                        setEditedPitchText(e.target.value);
                        setIsPitchCustomized(true);
                      }}
                      placeholder="Enter pitch message..."
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

                  {/* Primary Action Button */}
                  {pitchTab === 'whatsapp' ? (
                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(activeOutreachCustomer, activeOutreachLorry, editedPitchText)}
                      style={{
                        border: 'none',
                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        color: '#FFFFFF',
                        padding: '10px 16px',
                        borderRadius: '10px',
                        fontSize: '0.84rem',
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
                      <span>Launch WhatsApp &amp; Send Pitch Now</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendEmail(activeOutreachCustomer, activeOutreachLorry, editedPitchText)}
                      style={{
                        border: 'none',
                        background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                        color: '#FFFFFF',
                        padding: '10px 16px',
                        borderRadius: '10px',
                        fontSize: '0.84rem',
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
                      <span>Open Email Client &amp; Send Pitch Now</span>
                    </button>
                  )}
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

      {/* ═════════════════════════════════════════════════════════════
          CUSTOMER FULL DETAILS POPUP MODAL (EYE ICON ACTION)
      ═════════════════════════════════════════════════════════════ */}
      {viewingCustomer && createPortal(
        <div
          className="overlay open"
          onClick={() => setViewingCustomer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.75)',
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
              maxWidth: '920px',
              width: '95vw',
              maxHeight: '90vh',
              background: '#FFFFFF',
              borderRadius: '24px',
              padding: '0',
              margin: 'auto',
              boxShadow: '0 30px 70px -15px rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              textAlign: 'left'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 28px',
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                color: '#FFFFFF',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(37, 99, 235, 0.2)',
                    border: '1px solid rgba(37, 99, 235, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60A5FA',
                    flexShrink: 0
                  }}
                >
                  <Building2 size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#F8FAFC' }}>
                      {viewingCustomer.company_name}
                    </h3>
                    {viewingCustomer.activeJobsCount === 0 ? (
                      <span style={{ fontSize: '0.7rem', background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        ⚡ No Active Orders (Dormant)
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.7rem', background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        🚚 {viewingCustomer.activeJobsCount} Active Orders
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '3px' }}>
                    Registration No: <strong>{viewingCustomer.registration_no || '—'}</strong> &bull; Customer ID: <strong>{viewingCustomer.id}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              
              {/* Profile Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                
                {/* Card 1: Company Profile & Location */}
                <div style={{ background: '#F8FAFC', border: '1px solid var(--line)', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--navy-900)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
                    📍 Company Profile &amp; Location
                  </div>

                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>FULL BILLING / SITE ADDRESS</div>
                    <div style={{ fontSize: '0.86rem', color: 'var(--navy-900)', marginTop: '3px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {viewingCustomer.billing_address || viewingCustomer.address || '— No address recorded —'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>PAYMENT TERMS</div>
                    <div style={{ fontSize: '0.86rem', color: 'var(--navy-900)', fontWeight: 700, marginTop: '2px' }}>
                      {viewingCustomer.payment_terms || '30 days credit'}
                    </div>
                  </div>

                  {viewingCustomer.notes && (
                    <div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>SPECIAL INSTRUCTIONS / NOTES</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--navy-800)', marginTop: '2px', background: '#FFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                        {viewingCustomer.notes}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card 2: Contact Person & Outreach Channels */}
                <div style={{ background: '#F8FAFC', border: '1px solid var(--line)', borderRadius: '16px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--navy-900)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--line)', paddingBottom: '8px' }}>
                    📞 Contact Person &amp; Direct Outreach
                  </div>

                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>ATTN / CONTACT PERSON</div>
                    <div style={{ fontSize: '0.94rem', color: 'var(--navy-900)', fontWeight: 800, marginTop: '2px' }}>
                      {viewingCustomer.contact_person || '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>PHONE NUMBER (H/P)</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '3px', background: '#FFF', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                        {viewingCustomer.phone || '—'}
                      </span>
                      {viewingCustomer.phone && viewingCustomer.phone !== '—' && (
                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(viewingCustomer, availableLorries[0])}
                          style={{
                            background: '#10B981',
                            color: '#FFF',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Phone size={12} />
                          <span>WhatsApp</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>EMAIL ADDRESS</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '3px', background: '#FFF', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: viewingCustomer.email ? 'var(--navy-900)' : 'var(--slate)' }}>
                        {viewingCustomer.email || '— No email registered —'}
                      </span>
                      {viewingCustomer.email && (
                        <button
                          type="button"
                          onClick={() => handleSendEmail(viewingCustomer, availableLorries[0])}
                          style={{
                            background: '#2563EB',
                            color: '#FFF',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Mail size={12} />
                          <span>Email</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Linked Quotation Contracts Section */}
              <div style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: '16px', padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} style={{ color: '#2563EB' }} />
                    <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--navy-900)', textTransform: 'uppercase' }}>
                      Registered Quotations ({quotations.filter(q => String(q.customer_id) === String(viewingCustomer.id)).length})
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn pri sm"
                    onClick={() => {
                      const cid = viewingCustomer.id;
                      setViewingCustomer(null);
                      setActiveTab('quotations');
                      setShowForm(true);
                      handleSelectQuotationCustomer(cid);
                      window.scrollTo({ top: 160, behavior: 'smooth' });
                    }}
                    style={{ fontSize: '0.74rem', height: '28px', padding: '0 10px', fontWeight: 800 }}
                  >
                    + Create Quotation Contract
                  </button>
                </div>

                {quotations.filter(q => String(q.customer_id) === String(viewingCustomer.id)).length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--slate)', background: '#F8FAFC', borderRadius: '10px', fontSize: '0.82rem' }}>
                    No quotation contracts registered yet for this customer.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {quotations.filter(q => String(q.customer_id) === String(viewingCustomer.id)).map(q => {
                      let rCount = 0;
                      try {
                        const parsed = JSON.parse(q.special_instructions || q.notes || '{}');
                        if (parsed.routes && Array.isArray(parsed.routes)) rCount = parsed.routes.length;
                      } catch (_) {}

                      return (
                        <div
                          key={q.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: '#F8FAFC',
                            borderRadius: '10px',
                            border: '1px solid var(--line)',
                            fontSize: '0.82rem'
                          }}
                        >
                          <div>
                            <strong style={{ color: 'var(--navy-900)' }}>{q.quote_no || q.id}</strong>
                            <span style={{ color: 'var(--slate)', marginLeft: '8px' }}>&bull; Date: {fmtDate(q.created_at)}</span>
                            {rCount > 0 && (
                              <span className="badge blue" style={{ marginLeft: '8px', padding: '1px 6px', fontSize: '0.7rem' }}>
                                {rCount} Rates Registered
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => {
                                setPreviewQuotation(q);
                              }}
                              style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem', background: '#FFF' }}
                            >
                              <Printer size={12} />
                              <span style={{ marginLeft: '3px' }}>Print</span>
                            </button>
                            <button
                              type="button"
                              className="btn gh sm"
                              onClick={() => {
                                setViewingCustomer(null);
                                setActiveTab('quotations');
                                handleEditQuotation(q);
                              }}
                              style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem' }}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div
              style={{
                padding: '16px 28px',
                background: '#F8FAFC',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const c = viewingCustomer;
                    setViewingCustomer(null);
                    setOutreachModalCustomer(c);
                    if (c.zone) setOutreachZone(c.zone);
                    setIsOutreachOpen(true);
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                    color: '#FFF',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Megaphone size={14} style={{ color: 'var(--orange)' }} />
                  <span>Available Lorry Pitch</span>
                </button>

                <button
                  type="button"
                  className="btn gh"
                  onClick={() => {
                    const c = viewingCustomer;
                    setViewingCustomer(null);
                    handleEditCustomer(c);
                  }}
                  style={{ height: '36px', padding: '0 16px', fontWeight: 700 }}
                >
                  <Edit3 size={13} />
                  <span>Edit Profile</span>
                </button>
              </div>

              <button
                type="button"
                className="btn pri"
                onClick={() => setViewingCustomer(null)}
                style={{ height: '36px', padding: '0 24px', fontWeight: 800 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
