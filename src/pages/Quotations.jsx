import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { sb, fmtMoney, fmtDate, esc, withSST, nextQuoteNo, nextJobNo, jobNoFromQuoteNo, subscribeTable, getStorageData, isOrderQuotation, isContractQuotation } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import logoImg from '../assets/WhatsApp Image 2026-07-09 at 2.19.49 PM-Photoroom-BQJKJGof-Bld4xBKC.png';
import {
  Plus,
  Sparkles,
  FileCode,
  Calendar,
  Clock,
  Truck,
  Package,
  AlertTriangle,
  ArrowRight,
  Edit3,
  Send,
  Check,
  X,
  ChevronRight,
  Eye,
  Building2,
  Phone,
  User,
  CheckCircle2,
  FileText,
  Printer,
  RotateCcw,
  ChevronLeft,
  CalendarDays,
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  MapPin,
  Layers,
  CheckCheck,
  Tag,
  MessageSquare,
  Mail,
  Share2,
  Copy
} from 'lucide-react';
import { INITIAL_DIESEL_RATES } from './CustomerPricing';

export function parseDateToISO(dStr) {
  if (!dStr) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const parts = dStr.trim().split(/[\/\.-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return new Date().toISOString().split('T')[0];
}

export function formatISOToDMY(isoStr) {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function getDayName(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return dayNames[dt.getDay()] || '';
}

export function getQuoteDisplayDate(x) {
  if (!x) return 'Today';
  const targetDate = x.collection_date || x.order_date || x.delivery_date || x.arrived_date;
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
  if (x.created_at) {
    const dt = new Date(x.created_at);
    if (!isNaN(dt.getTime())) return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
  return 'Today';
}

export function getConsecutiveDates(baseDateStr, count = 5, skipWeekends = false) {
  let baseDate = new Date();
  if (baseDateStr) {
    const parts = baseDateStr.trim().split(/[\/\.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        baseDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      } else {
        baseDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      }
    }
  }
  if (isNaN(baseDate.getTime())) {
    baseDate = new Date();
  }

  const results = [];
  let curr = new Date(baseDate);
  while (results.length < count) {
    const dayOfWeek = curr.getDay();
    if (!skipWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
      const dd = String(curr.getDate()).padStart(2, '0');
      const mm = String(curr.getMonth() + 1).padStart(2, '0');
      const yyyy = curr.getFullYear();
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      results.push({
        dateStr: `${dd}/${mm}/${yyyy}`,
        dayName: dayNames[dayOfWeek],
        isoDate: curr.toISOString().split('T')[0],
        dayNumber: results.length + 1
      });
    }
    curr.setDate(curr.getDate() + 1);
  }
  return results;
}

export function findExistingCustomer(custId, companyName, quoteObj, customersList = [], existingQuotes = []) {
  const isCustApprovedOrRegistered = (c) => {
    if (!c) return false;
    if (c.status === 'waiting' || c.status === 'pending' || c.status === 'rejected') {
      return existingQuotes && existingQuotes.some(q => 
        q.status === 'approved' && (String(q.customer_id) === String(c.id) || (q.customer?.company_name || q.customer_name || '').trim().toLowerCase() === (c.company_name || '').trim().toLowerCase())
      );
    }
    return true;
  };

  // 1. Check by custId if provided and matches an existing registered customer
  if (custId && customersList && customersList.length > 0) {
    const custIdStr = String(custId).toLowerCase().trim();
    const found = customersList.find(c => {
      if (String(c.id).toLowerCase().trim() !== custIdStr) return false;
      return isCustApprovedOrRegistered(c);
    });
    if (found) return found;
  }

  // 2. Extract target company name to check
  const targetName = (
    companyName ||
    quoteObj?.customer?.company_name ||
    quoteObj?.customer_name ||
    ''
  ).toLowerCase().trim();

  if (!targetName || targetName === 'direct customer' || targetName === 'existing customer' || targetName.length < 3) {
    return null;
  }

  // 3. Match against registered customers in customersList by exact company name
  if (customersList && customersList.length > 0) {
    const found = customersList.find(c => {
      const cName = (c.company_name || '').toLowerCase().trim();
      if (cName !== targetName) return false;
      return isCustApprovedOrRegistered(c);
    });
    if (found) return found;
  }

  // 4. Match against previous approved quotations
  if (existingQuotes && existingQuotes.length > 0) {
    const prevQuote = existingQuotes.find(q => {
      if (q.status !== 'approved') return false;
      if (quoteObj && q.id === quoteObj.id) return false;
      const qCustName = (
        q.customer?.company_name ||
        q.customer_name ||
        ''
      ).toLowerCase().trim();
      return qCustName && qCustName !== 'direct customer' && qCustName === targetName;
    });
    if (prevQuote) {
      const matchedName = prevQuote.customer?.company_name || prevQuote.customer_name || targetName;
      return { id: prevQuote.customer_id || ('c_prev_' + prevQuote.id), company_name: matchedName };
    }
  }

  return null;
}

export function checkIsExistingCustomer(custId, companyName, quoteObj, customersList = [], existingQuotes = []) {
  return !!findExistingCustomer(custId, companyName, quoteObj, customersList, existingQuotes);
}

export function badgeClass(status) {
  if (status === 'approved') return 'green';
  if (status === 'assigned') return 'grey';
  if (status === 'in_transit') return 'blue';
  if (status === 'delivered') return 'green';
  if (status === 'client_confirmed') return 'amber';
  if (status === 'sent') return 'blue';
  if (status === 'declined') return 'red';
  if (status === 'draft') return 'grey';
  return 'amber';
}


export default function Quotations() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState(() => getStorageData('quotations'));
  const [customers, setCustomers] = useState(() => getStorageData('customers'));
  const [approvals, setApprovals] = useState(() => getStorageData('approvals'));
  const [jobs, setJobs] = useState(() => getStorageData('jobs'));
  const [activeFilter, setActiveFilter] = useState('all');
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [viewModalQuote, setViewModalQuote] = useState(null);

  // Form State
  const [rawText, setRawText] = useState('');
  const [isPasteBoxOpen, setIsPasteBoxOpen] = useState(false);
  const [formCustomer, setFormCustomer] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAttn, setFormAttn] = useState('');
  const [formTerms, setFormTerms] = useState('30 days credit');
  const [formZone, setFormZone] = useState('');
  const [formPickupZone, setFormPickupZone] = useState('');
  const [formDropoffZone, setFormDropoffZone] = useState('');
  const [formPickup, setFormPickup] = useState('');
  const [formDropoff, setFormDropoff] = useState('');
  const [formOrderDate, setFormOrderDate] = useState('');
  const [formArrivedDate, setFormArrivedDate] = useState('');
  const [formPickupTime, setFormPickupTime] = useState('');
  const [formDropoffTime, setFormDropoffTime] = useState('');
  const [formSpec, setFormSpec] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formSpecial, setFormSpecial] = useState('');
  const [formRate, setFormRate] = useState('');
  const [formUrgent, setFormUrgent] = useState(false);
  const [formRepeatOrder, setFormRepeatOrder] = useState(false);
  const [formRepeatDeliveryMode, setFormRepeatDeliveryMode] = useState('same_day'); // 'same_day' (Today Pickup -> Today Drop) | 'next_day' (Today Pickup -> Tomorrow Drop)
  const [selectedRepeatDates, setSelectedRepeatDates] = useState([]);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [customDateInput, setCustomDateInput] = useState('');
  const [selectedRouteIds, setSelectedRouteIds] = useState([]);
  const selectedRouteId = selectedRouteIds[selectedRouteIds.length - 1] || null;
  const [customAddedRoutes, setCustomAddedRoutes] = useState([]);
  const [showAllCompanyRoutes, setShowAllCompanyRoutes] = useState(false);

  // Searchable Customer Dropdown State
  const [isCustDropdownOpen, setIsCustDropdownOpen] = useState(false);
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const custDropdownRef = useRef(null);

  // Searchable Customer Reference / Code Word Dropdown State
  const [isRefDropdownOpen, setIsRefDropdownOpen] = useState(false);
  const [refSearchQuery, setRefSearchQuery] = useState('');
  const refDropdownRef = useRef(null);

  // Active inline popup picker state (collectionDate, pickupTime, arrivedDate, dropoffTime)
  const [activePicker, setActivePicker] = useState(null);
  const [pickerCalMonth, setPickerCalMonth] = useState(new Date().getMonth());
  const [pickerCalYear, setPickerCalYear] = useState(new Date().getFullYear());
  const datePickerRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (custDropdownRef.current && !custDropdownRef.current.contains(e.target)) {
        setIsCustDropdownOpen(false);
      }
      if (refDropdownRef.current && !refDropdownRef.current.contains(e.target)) {
        setIsRefDropdownOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setActivePicker(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = useCallback(async () => {
    let q = [], c = [], a = [], j = [];
    if (sb) {
      try {
        const res = await Promise.all([
          sb.from('quotations').select('*, customer:customers(company_name, phone, contact_person)').order('created_at', { ascending: false }),
          sb.from('customers').select('*').order('company_name'),
          sb.from('approvals').select('*').order('created_at', { ascending: false }),
          sb.from('jobs').select('*, customer:customers(company_name, phone, contact_person)').order('created_at', { ascending: false })
        ]);
        q = res[0].data || [];
        c = res[1].data || [];
        a = res[2].data || [];
        j = res[3].data || [];
      } catch (e) { }
    }
    try {
      if (!j || j.length === 0) {
        const rawJ = localStorage.getItem('rens_db_jobs');
        if (rawJ) j = JSON.parse(rawJ);
      }
      if (!q || q.length === 0) {
        const rawQ = localStorage.getItem('rens_db_quotations');
        if (rawQ) q = JSON.parse(rawQ);
      }
    } catch (_) {}
    setQuotes(q || []);
    setCustomers(c || []);
    setApprovals(a || []);
    setJobs(j || []);
  }, []);

  const getQuoteEffectiveStatus = useCallback((q) => {
    if (!q) return 'draft';
    // Match associated job in Job Board
    const matchedJob = (jobs || []).find(j => 
      (j.quotation_id && (String(j.quotation_id) === String(q.id) || String(j.quotation_id) === String(q.quote_no))) ||
      (j.id && (String(j.id) === String(q.id) || String(j.id) === String(q.quotation_id))) ||
      (j.job_no && q.quote_no && (
        j.job_no === q.quote_no.replace('RJ-Q-', 'RJ-') ||
        j.job_no === q.quote_no ||
        q.quote_no === j.job_no.replace('RJ-', 'RJ-Q-')
      ))
    );

    if (matchedJob) {
      if (['assigned', 'in_transit', 'delivered'].includes(matchedJob.status)) {
        return matchedJob.status;
      }
      if (matchedJob.is_approved === 1 || matchedJob.is_approved === true || matchedJob.approved_at) {
        return 'approved';
      }
      // If job exists in unassigned column and is not yet approved for assign on Job Board:
      return (q.status === 'draft') ? 'draft' : (q.status === 'approved' ? 'approved' : 'client_confirmed');
    }

    if (['assigned', 'in_transit', 'delivered'].includes(q.status)) {
      return q.status;
    }

    if (q.status === 'approved') {
      return 'approved';
    }

    return q.status || 'draft';
  }, [jobs]);

  // Approved customers only: show strictly customers that have an approved authorization in Executive Approvals or an approved quotation
  const approvedCustomers = useMemo(() => {
    return (customers || []).filter(c => {
      if (!c || !c.company_name || !c.company_name.trim()) return false;
      const cName = (c.company_name || '').trim().toLowerCase();

      // Check if there is an approved quotation for this customer
      const hasApprovedQuote = (quotes || []).some(q => {
        const qStatus = String(q.status || '').toLowerCase().trim();
        if (qStatus !== 'approved') return false;
        const isIdMatch = c.id && (String(q.customer_id) === String(c.id) || String(q.customer?.id) === String(c.id));
        const isNameMatch = (q.customer?.company_name || q.customer_name || '').trim().toLowerCase() === cName;
        return Boolean(isIdMatch || isNameMatch);
      });

      // Check if there is an approved record in approvals table for this customer
      const hasApprovedRecord = (approvals || []).some(appr => {
        const aStatus = String(appr.status || '').toLowerCase().trim();
        if (aStatus !== 'approved') return false;
        const isRefMatch = c.id && String(appr.ref_id) === String(c.id);
        const isTitleMatch = appr.title && appr.title.toLowerCase().includes(cName);
        const isQuoteRefMatch = (quotes || []).some(q => 
          (q.id === appr.ref_id || q.quote_no === appr.ref_id) &&
          (String(q.customer_id) === String(c.id) || (q.customer?.company_name || q.customer_name || '').trim().toLowerCase() === cName)
        );
        return Boolean(isRefMatch || isTitleMatch || isQuoteRefMatch);
      });

      return hasApprovedQuote || hasApprovedRecord;
    });
  }, [customers, quotes, approvals]);

  // Filtered approved customers for searchable dropdown
  const filteredSelectCustomers = useMemo(() => {
    if (!custSearchQuery.trim()) return approvedCustomers;
    const q = custSearchQuery.toLowerCase();
    return approvedCustomers.filter(c => 
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.zone || '').toLowerCase().includes(q) ||
      (c.contact_person || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  }, [approvedCustomers, custSearchQuery]);

  // Dynamic unlimited zones derived from customers, quotations, and presets
  const allAvailableQuotationZones = useMemo(() => {
    const set = new Set(['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E', 'Zone F', 'Central Zone', 'Southern Zone (Johor)', 'Northern Zone (Penang/Perak)', 'Eastern Zone (Pahang)']);
    approvedCustomers.forEach(c => { if (c.zone) set.add(c.zone); });
    quotes.forEach(q => { if (q.zone && q.status === 'approved') set.add(q.zone); });
    return Array.from(set);
  }, [approvedCustomers, quotes]);

  // All available reference suggestions specifically for the selected customer
  const allAvailableReferences = useMemo(() => {
    if (!formCustomer) return [];
    const list = [];
    const seen = new Set();
    const selectedCust = approvedCustomers.find(c => c.id === formCustomer);
    const selectedCustName = (selectedCust?.company_name || formCustomer || '').toLowerCase().trim();
    if (!selectedCustName) return [];

    quotes.forEach(q => {
      let parsed = null;
      try {
        if (q.special_instructions && q.special_instructions.startsWith('{')) parsed = JSON.parse(q.special_instructions);
        else if (q.notes && q.notes.startsWith('{')) parsed = JSON.parse(q.notes);
      } catch (_) {}

      const custName = (q.customer?.company_name || q.customer_name || '').toLowerCase().trim();
      const isCustMatch = selectedCustName && (
        (q.customer_id && (String(q.customer_id) === String(selectedCust?.id) || String(q.customer?.id) === String(selectedCust?.id))) ||
        (custName && (custName === selectedCustName || selectedCustName.includes(custName) || custName.includes(selectedCustName.split(' ')[0])))
      );

      if (!isCustMatch) return;

      if (parsed?.routes && Array.isArray(parsed.routes)) {
        parsed.routes.forEach(rt => {
          const cw = (rt.code_word || rt.customer_ref || rt.client_tag || '').trim();
          if (cw && !seen.has(cw.toLowerCase())) {
            seen.add(cw.toLowerCase());
            list.push({ 
              ref: cw, 
              label: cw,
              collection: rt.collection || '',
              unloading: rt.unloading || '',
              collection_zone: rt.collection_zone || '',
              unloading_zone: rt.unloading_zone || '',
              isDropoint: Boolean(rt.isDropoint || (rt.unloading || '').toLowerCase() === 'dropoint')
            });
          }
        });
      }
    });
    return list;
  }, [quotes, formCustomer, approvedCustomers]);

  // Filtered code words for searchable dropdown
  const filteredRefOptions = useMemo(() => {
    if (!refSearchQuery.trim()) return allAvailableReferences;
    const q = refSearchQuery.toLowerCase().trim();
    return allAvailableReferences.filter(item => 
      item.ref.toLowerCase().includes(q) ||
      (item.collection && item.collection.toLowerCase().includes(q)) ||
      (item.unloading && item.unloading.toLowerCase().includes(q)) ||
      (item.collection_zone && item.collection_zone.toLowerCase().includes(q)) ||
      (item.unloading_zone && item.unloading_zone.toLowerCase().includes(q))
    );
  }, [allAvailableReferences, refSearchQuery]);

  // Consolidate and extract routes ONLY matching the entered Code Word / Keyword for the selected customer
  const customerAvailableRoutes = useMemo(() => {
    if (!formCustomer) return [];
    const selectedCust = approvedCustomers.find(c => c.id === formCustomer);
    const custName = (selectedCust?.company_name || formCustomer || '').toLowerCase().trim();
    const refQuery = (formRef || '').toLowerCase().trim();

    // If no keyword / code word is entered in CUSTOMER REFERENCE / CODE WORD, do not show routes table!
    if (!refQuery && !showAllCompanyRoutes && customAddedRoutes.length === 0) {
      return [];
    }

    const routesList = [];
    const seenKeys = new Set();

    const addRoute = (r) => {
      const coll = (r.collection || r.pickup_location || '').trim();
      const unld = (r.unloading || r.dropoff_location || '').trim();
      const code = (r.code_word || r.customer_ref || r.client_tag || '').trim();
      const key = `${coll}__${unld}__${code}__${r.id || ''}`.toLowerCase();
      if (!seenKeys.has(key) && (coll || unld || r.isCustom)) {
        seenKeys.add(key);
        routesList.push({
          id: r.id || `r_${routesList.length + 1}`,
          collection: coll || '',
          collection_zone: r.collection_zone || r.pickup_zone || selectedCust?.zone || '',
          unloading: unld || '',
          unloading_zone: r.unloading_zone || r.dropoff_zone || selectedCust?.zone || '',
          code_word: code || '',
          isDropoint: Boolean(r.isDropoint || unld.toLowerCase() === 'dropoint'),
          lorryTypes: r.lorryTypes || ['1 ton 9 ft', '3 & 5 ton 17 ft', '10 ton 24ft', '14 ton 30ft', '20 ton 40ft'],
          rates: r.rates || {},
          source: r.source || 'Customer Rate Card',
          isCustom: Boolean(r.isCustom || String(r.id || '').startsWith('custom_'))
        });
      }
    };

    // Include any custom routes added dynamically in the form
    customAddedRoutes.forEach(cr => addRoute({ ...cr, isCustom: true, source: 'Custom Added' }));

    // 1. Check all saved quotations / customer rate cards strictly for THIS selected customer
    quotes.forEach(q => {
      if (q.status !== 'approved') return;
      let parsed = null;
      try {
        if (q.special_instructions && q.special_instructions.startsWith('{')) {
          parsed = JSON.parse(q.special_instructions);
        } else if (q.notes && q.notes.startsWith('{')) {
          parsed = JSON.parse(q.notes);
        }
      } catch (_) {}

      const qCustName = (q.customer?.company_name || q.customer_name || '').toLowerCase().trim();
      const isCustMatch = custName && (
        (q.customer_id && (String(q.customer_id) === String(selectedCust?.id) || String(q.customer?.id) === String(selectedCust?.id))) ||
        (qCustName && (qCustName === custName || custName.includes(qCustName) || qCustName.includes(custName.split(' ')[0])))
      );

      if (!isCustMatch) return;

      const qRef = (parsed?.ref || q.customer_ref || q.quote_no || '').toLowerCase().trim();

      if (parsed && Array.isArray(parsed.routes) && parsed.routes.length > 0) {
        const lTypes = parsed.lorryTypes || ['1 ton 9 ft', '3 & 5 ton 17 ft', '10 ton 24ft', '14 ton 30ft', '20 ton 40ft'];
        parsed.routes.forEach((rt, rtIdx) => {
          const cw = (rt.code_word || rt.customer_ref || rt.client_tag || '').toLowerCase().trim();
          const isMatch = refQuery && (
            cw === refQuery ||
            (refQuery.length >= 2 && cw.includes(refQuery)) ||
            (cw.length >= 2 && refQuery.includes(cw)) ||
            qRef === refQuery ||
            (refQuery.length >= 3 && qRef.includes(refQuery))
          );

          if (isMatch || showAllCompanyRoutes) {
            addRoute({
              ...rt,
              id: rt.id || `cr_${q.id}_${rtIdx}`,
              lorryTypes: rt.lorryTypes || lTypes,
              source: 'Customer Rate Card'
            });
          }
        });
      }
    });

    return routesList;
  }, [formCustomer, formRef, approvedCustomers, quotes, customAddedRoutes, showAllCompanyRoutes]);

  // Handle typing / entering reference or code word to auto-resolve routes strictly for selected customer
  const handleReferenceChange = (newRef) => {
    setFormRef(newRef);
    const query = newRef.trim().toLowerCase();
    if (!query) return;

    if (!formCustomer) {
      toast('Please select a customer first before entering a code word', 'info');
      return;
    }

    const selectedCust = approvedCustomers.find(c => c.id === formCustomer);
    const custName = (selectedCust?.company_name || formCustomer || '').toLowerCase().trim();

    for (const q of quotes) {
      if (q.status !== 'approved') continue;
      let parsed = null;
      try {
        if (q.special_instructions && q.special_instructions.startsWith('{')) {
          parsed = JSON.parse(q.special_instructions);
        } else if (q.notes && q.notes.startsWith('{')) {
          parsed = JSON.parse(q.notes);
        }
      } catch (_) {}

      const qCustName = (q.customer?.company_name || q.customer_name || '').toLowerCase().trim();
      const isCustMatch = custName && (
        (q.customer_id && (String(q.customer_id) === String(selectedCust?.id) || String(q.customer?.id) === String(selectedCust?.id))) ||
        (qCustName && (qCustName === custName || custName.includes(qCustName) || qCustName.includes(custName.split(' ')[0])))
      );

      if (!isCustMatch) continue;

      const qRefStr = (parsed?.ref || q.customer_ref || q.quote_no || '').toLowerCase().trim();
      const matchedRoute = parsed?.routes?.find(r => (r.code_word || '').toLowerCase().trim() === query);
      const isRefMatch = qRefStr === query || (query.length >= 3 && qRefStr.includes(query));

      if (matchedRoute || isRefMatch) {
        const routeToApply = matchedRoute || (parsed?.routes && parsed.routes[0]);
        if (routeToApply) {
          if (routeToApply.collection) setFormPickup(routeToApply.collection);
          if (routeToApply.unloading) setFormDropoff(routeToApply.unloading);
          if (routeToApply.collection_zone) setFormPickupZone(routeToApply.collection_zone);
          if (routeToApply.unloading_zone) setFormDropoffZone(routeToApply.unloading_zone);
          // Do not select default lorry spec or rate upon route activation
          setFormSpec('');
          setFormRate('');
          toast(`Loaded route for code word: ${routeToApply.code_word || newRef}`, 'ok');
        }
        break;
      }
    }
  };

  const handleToggleCustomerRoute = (route, chosenLorryType, chosenRate) => {
    const isCurrentlyActive = selectedRouteIds.includes(route.id);

    if (isCurrentlyActive && !chosenLorryType && !chosenRate) {
      // Toggle OFF: Remove this route from active list
      const remaining = selectedRouteIds.filter(id => id !== route.id);
      setSelectedRouteIds(remaining);
      if (remaining.length === 0) {
        setFormPickup('');
        setFormDropoff('');
        setFormPickupZone('');
        setFormDropoffZone('');
        setFormRef('');
        setFormSpec('');
        setFormRate('');
        toast(`Route deactivated`, 'info');
      } else {
        const lastActive = customerAvailableRoutes.find(r => r.id === remaining[remaining.length - 1]);
        if (lastActive) {
          setFormPickup(lastActive.collection || '');
          setFormDropoff(lastActive.unloading || '');
          setFormPickupZone(lastActive.collection_zone || formZone || '');
          setFormDropoffZone(lastActive.unloading_zone || '');
          if (lastActive.code_word) setFormRef(lastActive.code_word);
          setFormSpec('');
          setFormRate('');
        }
        toast(`Route deactivated (${remaining.length} active remaining)`, 'info');
      }
      return;
    }

    // Toggle ON: Add this route to active list
    const newSelected = Array.from(new Set([...selectedRouteIds, route.id]));
    setSelectedRouteIds(newSelected);

    setFormPickup(route.collection || '');
    setFormDropoff(route.unloading || '');
    setFormPickupZone(route.collection_zone || formZone || '');
    setFormDropoffZone(route.unloading_zone || '');
    if (route.code_word) setFormRef(route.code_word);

    if (chosenLorryType) {
      setFormSpec(chosenLorryType);
      if (chosenRate) {
        setFormRate(String(chosenRate));
      } else if (route.rates && route.rates[chosenLorryType]) {
        setFormRate(String(route.rates[chosenLorryType]));
      }
    } else {
      // Do not auto-select default spec or rate when simply activating route
      setFormSpec('');
      setFormRate('');
    }

    const routeLabel = (route.collection && route.unloading) ? `${route.collection} → ${route.unloading}` : (route.collection || route.unloading || 'Custom Route');
    toast(`Active Route: ${routeLabel}${newSelected.length > 1 ? ` (${newSelected.length} active routes)` : ''}`, 'ok');
  };

  const handleApplyCustomerRoute = handleToggleCustomerRoute;

  const handleToggleSelectAllRoutes = () => {
    if (selectedRouteIds.length === customerAvailableRoutes.length && customerAvailableRoutes.length > 0) {
      setSelectedRouteIds([]);
      setFormSpec('');
      setFormRate('');
      toast('All routes deactivated', 'info');
    } else {
      const allIds = customerAvailableRoutes.map(r => r.id);
      setSelectedRouteIds(allIds);
      if (customerAvailableRoutes.length > 0) {
        const first = customerAvailableRoutes[0];
        setFormPickup(first.collection || '');
        setFormDropoff(first.unloading || '');
        setFormPickupZone(first.collection_zone || formZone || '');
        setFormDropoffZone(first.unloading_zone || '');
        if (first.code_word) setFormRef(first.code_word);
        setFormSpec('');
        setFormRate('');
      }
      toast(`All ${allIds.length} routes activated`, 'ok');
    }
  };

  const handleBatchCreateAllRoutes = async (targetStatus = 'sent') => {
    let routesToProcess = customerAvailableRoutes;
    if (selectedRouteIds.length > 0) {
      routesToProcess = customerAvailableRoutes.filter(r => selectedRouteIds.includes(r.id));
    }

    if (!routesToProcess || routesToProcess.length === 0) {
      toast('No routes selected or available for this customer', 'err');
      return;
    }

    const cleanCustName = (customers.find(c => c.id === formCustomer)?.company_name || formCustomer || '').trim();
    if (!cleanCustName) {
      toast('Please select or specify a customer first', 'err');
      return;
    }

    let isExistingCustomer = false;
    let resolvedCustomerId = null;
    let custObj = null;

    if (formCustomer && customers.find(c => c.id === formCustomer)) {
      isExistingCustomer = true;
      resolvedCustomerId = formCustomer;
      custObj = customers.find(c => c.id === formCustomer);
    } else {
      const match = findExistingCustomer(null, cleanCustName, null, customers, quotes);
      if (match) {
        isExistingCustomer = true;
        resolvedCustomerId = match.id;
        custObj = match;
      }
    }

    const now = new Date();
    const qPrefix = `RJ-Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const jPrefix = `RJ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;

    const localQuotes = (getStorageData ? getStorageData('quotations') : quotes) || [];
    let maxQSeq = 0;
    localQuotes.forEach(q => {
      if (q.quote_no && q.quote_no.startsWith(qPrefix)) {
        const num = parseInt(q.quote_no.split('-').pop(), 10);
        if (!isNaN(num) && num > maxQSeq) maxQSeq = num;
      }
    });
    quotes.forEach(q => {
      if (q.quote_no && q.quote_no.startsWith(qPrefix)) {
        const num = parseInt(q.quote_no.split('-').pop(), 10);
        if (!isNaN(num) && num > maxQSeq) maxQSeq = num;
      }
    });

    const localJobs = (getStorageData ? getStorageData('jobs') : []) || [];
    let maxJSeq = 0;
    localJobs.forEach(j => {
      if (j.job_no && j.job_no.startsWith(jPrefix)) {
        const num = parseInt(j.job_no.split('-').pop(), 10);
        if (!isNaN(num) && num > maxJSeq) maxJSeq = num;
      }
    });

    const finalStatus = targetStatus === 'draft' ? 'draft' : (isExistingCustomer ? 'approved' : 'client_confirmed');
    const quotesToInsert = [];
    const jobsToInsert = [];
    const approvalsToInsert = [];

    const baseOrderDate = formOrderDate.trim() || new Date().toLocaleDateString('en-GB');
    const baseArrivedDate = formArrivedDate.trim() || baseOrderDate;

    routesToProcess.forEach((route, idx) => {
      const seqQ = maxQSeq + 1 + idx;
      const seqJ = maxJSeq + 1 + idx;
      const quoteNo = `${qPrefix}${String(seqQ).padStart(4, '0')}`;
      const jobNo = `${jPrefix}${String(seqJ).padStart(4, '0')}`;
      const quoteId = 'q_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 5);

      const rSpec = (route.lorryTypes && route.lorryTypes.find(t => t.includes('30ft'))) || (route.lorryTypes && route.lorryTypes[0]) || formSpec || '30ft SIDE CURTAIN';
      const rRateVal = parseFloat((route.rates && (route.rates[rSpec] || Object.values(route.rates)[0])) || formRate || '1500.00');

      const quoteRow = {
        id: quoteId,
        quote_no: quoteNo,
        customer_id: resolvedCustomerId,
        customer_ref: route.code_word || formRef.trim() || `Route #${idx + 1}`,
        zone: (route.collection_zone || route.unloading_zone || formZone.trim() || 'Zone A'),
        pickup_zone: route.collection_zone || formPickupZone.trim() || 'Zone A',
        dropoff_zone: route.unloading_zone || formDropoffZone.trim() || 'Zone A',
        pickup_location: route.collection || formPickup.trim(),
        dropoff_location: route.unloading || formDropoff.trim(),
        collection_date: baseOrderDate,
        delivery_date: baseArrivedDate,
        arrived_date: baseArrivedDate,
        pickup_time: formPickupTime.trim() || '8:00 AM',
        dropoff_time: formDropoffTime.replace(/^Before\s+/i, '').trim() || '8:00 AM',
        lorry_spec: rSpec,
        weight_desc: formWeight.trim() || '12MT',
        special_instructions: (formSpecial.trim() ? formSpecial.trim() + ' | ' : '') + `Route: ${route.collection} → ${route.unloading}`,
        rate_amount: rRateVal,
        urgent: formUrgent ? 1 : 0,
        raw_message: rawText,
        status: finalStatus,
        client_confirmed_at: new Date().toISOString(),
        owner_approved_at: (isExistingCustomer && finalStatus !== 'draft') ? new Date().toISOString() : null,
        phone: formPhone.trim() || custObj?.phone || '',
        contact_person: formAttn.trim() || custObj?.contact_person || '',
        payment_terms: formTerms.trim() || custObj?.payment_terms || '30 days credit',
        created_at: new Date(Date.now() + idx * 50).toISOString()
      };
      if (finalStatus === 'sent') quoteRow.sent_at = new Date().toISOString();
      quotesToInsert.push(quoteRow);

      if (isExistingCustomer && finalStatus !== 'draft') {
        jobsToInsert.push({
          id: 'job_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 5),
          job_no: jobNo,
          quotation_id: quoteId,
          customer_id: resolvedCustomerId,
          customer_ref: quoteRow.customer_ref,
          rate_amount: rRateVal,
          pickup_location: quoteRow.pickup_location,
          dropoff_location: quoteRow.dropoff_location,
          pickup_zone: quoteRow.pickup_zone,
          dropoff_zone: quoteRow.dropoff_zone,
          cargo_desc: quoteRow.weight_desc || quoteRow.lorry_spec,
          lorry_spec: quoteRow.lorry_spec,
          weight_desc: quoteRow.weight_desc,
          urgent: formUrgent ? 1 : 0,
          special_instructions: quoteRow.special_instructions,
          collection_date: baseOrderDate,
          delivery_date: baseArrivedDate,
          status: 'unassigned',
          is_approved: 0,
          billed_status: 'pending',
          created_at: new Date(Date.now() + idx * 50).toISOString()
        });
      }
    });

    if (sb) {
      try {
        await sb.from('quotations').insert(quotesToInsert);
        if (jobsToInsert.length > 0) await sb.from('jobs').insert(jobsToInsert);
      } catch (e) {
        console.error('Error inserting batch routes orders:', e);
      }
    }

    toast(`Successfully created quotes for ${routesToProcess.length} active routes!`, 'ok');
    setShowNewPanel(false);
    setEditingId(null);
    loadData();
  };

  const handleAddCustomRoute = () => {
    const newR = {
      id: 'custom_' + Date.now(),
      collection: '',
      collection_zone: '',
      unloading: '',
      unloading_zone: '',
      code_word: '',
      isDropoint: false,
      isCustom: true,
      lorryTypes: ['5 ton 17 ft', '10 ton 20- 24 ft', '30ft', '40ft'],
      rates: {
        '5 ton 17 ft': '',
        '10 ton 20- 24 ft': '',
        '30ft': '',
        '40ft': ''
      }
    };
    setCustomAddedRoutes(prev => [...prev, newR]);
    setSelectedRouteIds(prev => [...prev, newR.id]);
    toast('Added new empty route — enter details manually', 'ok');
  };

  const handleUpdateRouteField = (routeId, field, val) => {
    setCustomAddedRoutes(prev => {
      const exists = prev.some(r => r.id === routeId);
      if (exists) {
        return prev.map(r => r.id === routeId ? { ...r, [field]: val } : r);
      }
      const found = customerAvailableRoutes.find(r => r.id === routeId);
      if (found) {
        return [...prev, { ...found, [field]: val, id: routeId, isCustom: true }];
      }
      return prev;
    });

    if (selectedRouteIds.includes(routeId)) {
      if (field === 'collection') setFormPickup(val);
      if (field === 'unloading') setFormDropoff(val);
      if (field === 'collection_zone') setFormPickupZone(val);
      if (field === 'unloading_zone') setFormDropoffZone(val);
      if (field === 'code_word') setFormRef(val);
    }
  };

  const handleUpdateRouteRate = (routeId, lorryType, rateVal) => {
    setCustomAddedRoutes(prev => {
      const exists = prev.some(r => r.id === routeId);
      if (exists) {
        return prev.map(r => r.id === routeId ? { ...r, rates: { ...(r.rates || {}), [lorryType]: rateVal } } : r);
      }
      const found = customerAvailableRoutes.find(r => r.id === routeId);
      if (found) {
        return [...prev, { ...found, rates: { ...(found.rates || {}), [lorryType]: rateVal }, id: routeId, isCustom: true }];
      }
      return prev;
    });

    if (selectedRouteIds.includes(routeId) && formSpec === lorryType) {
      setFormRate(rateVal);
    }
  };

  const handleRemoveCustomRoute = (routeId) => {
    setCustomAddedRoutes(prev => prev.filter(r => r.id !== routeId));
    setSelectedRouteIds(prev => prev.filter(id => id !== routeId));
    toast('Removed route', 'info');
  };

  const resetForm = () => {
    setRawText('');
    setFormCustomer('');
    setFormPhone('');
    setFormAttn('');
    setFormTerms('30 days credit');
    setFormZone('');
    setFormPickupZone('');
    setFormDropoffZone('');
    setFormPickup('');
    setFormDropoff('');
    setFormOrderDate('');
    setFormArrivedDate('');
    setFormPickupTime('');
    setFormDropoffTime('');
    setFormSpec('');
    setFormWeight('');
    setFormRef('');
    setRefSearchQuery('');
    setIsRefDropdownOpen(false);
    setFormSpecial('');
    setFormRate('');
    setFormUrgent(false);
    setFormRepeatOrder(false);
    setSelectedRepeatDates([]);
    setCustomDateInput('');
    setSelectedRouteIds([]);
    setCustomAddedRoutes([]);
    setShowAllCompanyRoutes(false);
    toast('Form cleared for manual entry', 'info');
  };

  const showNewForm = () => {
    setEditingId(null);
    resetForm();
    setShowNewPanel(true);
  };

  useEffect(() => {
    loadData();
    const query = new URLSearchParams(location.search);
    if (query.get('new') === '1') {
      showNewForm();
    }
    const unsub1 = subscribeTable('quotations', loadData);
    const unsub2 = subscribeTable('customers', loadData);
    const unsub3 = subscribeTable('approvals', loadData);
    const unsub4 = subscribeTable('jobs', loadData);
    let ch = null;
    if (sb && typeof sb.channel === 'function') {
      ch = sb.channel('quotes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quotations' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, loadData)
        .subscribe();
    }
    return () => {
      unsub1(); unsub2(); unsub3(); unsub4();
      if (ch && typeof ch.unsubscribe === 'function') {
        try { ch.unsubscribe(); } catch (e) { }
      }
      if (sb && typeof sb.removeChannel === 'function') {
        try { sb.removeChannel(ch); } catch (e) { }
      }
    };
  }, [loadData, location.search]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showNewPanel) return;
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key === 'Enter') {
        e.preventDefault();
        saveQuote('sent');
      } else if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveQuote('draft');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNewPanel, formCustomer, formPickup, formDropoff, formRate, formSpec, formWeight, formRef, formSpecial, formOrderDate, formPickupTime, formDropoffTime, formUrgent, rawText, editingId]);

  const handleSelectCustomer = (selectedCustId) => {
    setFormCustomer(selectedCustId);
    if (!selectedCustId) {
      setFormZone('');
      setFormPickupZone('');
      setFormDropoffZone('');
      setFormPhone('');
      setFormAttn('');
      setFormTerms('30 days credit');
      return;
    }

    const custObj = customers.find(c => c.id === selectedCustId);
    if (!custObj) return;

    setFormZone('');
    setFormPickupZone('');
    setFormDropoffZone('');
    setFormPhone(custObj.phone || '');
    setFormAttn(custObj.contact_person || '');
    setFormTerms(custObj.payment_terms || '30 days credit');

    setFormPickup('');
    setFormDropoff('');
    setFormOrderDate('');
    setFormArrivedDate('');
    setFormPickupTime('');
    setFormDropoffTime('');
    setFormSpec('');
    setFormWeight('');
    setFormRef(''); // Keep Customer Reference / Code Word blank by default!
    setRefSearchQuery('');
    setIsRefDropdownOpen(false);
    setFormSpecial('');
    setFormRate('');
    setFormUrgent(false);

    toast(`Selected ${custObj.company_name} — select Code Word to load routes & rates`, 'ok');
  };

  const fillFormFields = (c, raw) => {
    setFormPickup(c.pickup_location || '');
    setFormDropoff(c.dropoff_location || '');
    setFormPickupZone(c.pickup_zone || c.zone || '');
    setFormDropoffZone(c.dropoff_zone || c.drop_zone || c.zone || '');
    setFormZone(c.zone || '');
    setFormOrderDate(c.collection_date || c.order_date || '');
    setFormArrivedDate(c.delivery_date || c.arrived_date || c.dropoff_date || c.collection_date || c.order_date || '');
    setFormPickupTime(c.pickup_time || c.loading_time || '');
    setFormDropoffTime(c.dropoff_time || c.unloading_time || '');
    setFormSpec(c.lorry_spec || '');
    setFormWeight(c.weight_desc || '');
    setFormRef(c.customer_ref || '');
    setFormSpecial(c.special_instructions || '');
    setFormUrgent(!!c.urgent);
    if (raw) setRawText(raw);

    const custName = (c.customer_name || '').toLowerCase().trim();
    let foundCust = null;

    if (custName) {
      foundCust = findExistingCustomer(null, c.customer_name, c, customers, quotes);
    }

    if (foundCust) {
      if (foundCust.id && !String(foundCust.id).startsWith('c_prev_')) {
        setFormCustomer(foundCust.id);
      }
      setFormPhone(foundCust.phone || c.phone || '');
      setFormAttn(foundCust.contact_person || c.contact_person || '');
      setFormTerms(foundCust.payment_terms || c.payment_terms || '30 days credit');
      if (foundCust.default_rate && !formRate) setFormRate(String(foundCust.default_rate));
    } else {
      if (c.customer_name) setFormCustomer(c.customer_name);
      else setFormCustomer('');
      setFormPhone(c.phone || '');
      setFormAttn(c.contact_person || '');
      setFormTerms(c.payment_terms || '30 days credit');
      if (!formRate) setFormRate('1500.00');
    }
  };

  const fetchAIParse = async (text, timeoutMs = 3500) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('/api/parse-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return (data.candidates && data.candidates[0]) ? data.candidates[0] : null;
      }
    } catch (e) {
      clearTimeout(timer);
    }
    return null;
  };

  const smartParseWhatsApp = (raw) => {
    const c = {
      pickup_location: '',
      dropoff_location: '',
      collection_date: '',
      pickup_time: '',
      dropoff_time: '',
      lorry_spec: '',
      weight_desc: '',
      customer_ref: '',
      special_instructions: '',
      customer_name: '',
      urgent: false
    };

    if (!raw) return c;
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

    // 0. Explicit Customer Name match (e.g. **Customer Name: Emerald Coast Engineering Sdn. Bhd.**)
    const custExplicit = raw.match(/(?:\*\*Customer Name:?\s*([^\*\n]+)\*\*|Customer Name[:\s]*([^\n]+))/i);
    if (custExplicit) {
      c.customer_name = (custExplicit[1] || custExplicit[2]).replace(/[\*\_]/g, '').trim();
    }

    // 1. Client Order / Collection Date extraction (clean IC numbers like 820327-05-5411 first)
    const cleanRawForDate = raw.replace(/\b\d{6}-\d{2}-\d{4}\b/g, '');
    const dateMatch = cleanRawForDate.match(/(?:date|day|order date|collection date|\ud83d\udea8)?\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*\(?(\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b)\)?/i);
    if (dateMatch) {
      c.collection_date = dateMatch[1].trim();
      c.arrived_date = dateMatch[1].trim();
    }

    // 1b. Explicit Arrived / Delivery Date extraction
    const arriveDateMatch = cleanRawForDate.match(/(?:date arrive|arrive date|arrived date|delivery date|arrival date|arrived|delivery)[:\s]*\*?\(?(\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b)\)?\*?/i);
    if (arriveDateMatch) {
      c.arrived_date = arriveDateMatch[1].trim();
      c.delivery_date = arriveDateMatch[1].trim();
    }

    // 2. Pickup Time extraction
    const pTimeMatch = raw.match(/(?:part ready|ready time|ready|pickup time)[:\s]*([^\n\_]+)/i);
    if (pTimeMatch) {
      c.pickup_time = pTimeMatch[1].replace(/[\*\_]/g, '').trim();
    }

    // 3. Dropoff Time / Deadline extraction
    const dTimeMatch = raw.match(/(?:time before|deliver before|dropoff time|arrive before)[:\s]*([^\n\*\_]+)/i);
    if (dTimeMatch) {
      c.dropoff_time = dTimeMatch[1].replace(/[\*\_]/g, '').trim();
    }

    // 4. Arrow format check
    const arrow = raw.match(/([^\n]+?)\s*(?:→|->|to)\s*([^\n]+)/i);
    if (arrow && !raw.toLowerCase().includes('collection') && !raw.toLowerCase().includes('address')) {
      c.pickup_location = arrow[1].replace(/^(pickup|from|collection)[:\s]*/i, '').replace(/[\*\_]/g, '').trim();
      c.dropoff_location = arrow[2].replace(/^(dropoff|to|delivery)[:\s]*/i, '').replace(/[\*\_]/g, '').trim();
    }

    // 5. Collection & Address Block Parsing
    const colIdx = lines.findIndex(l => /^(collection|pick\s*up|from[:\s])/i.test(l) || /^collection\s+from/i.test(l));
    if (colIdx !== -1) {
      let addressParts = [];
      let contacts = [];
      for (let i = colIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/(?:material weight|pls send|deliver|date arrive|time before|#|_|\ud83d\udea8)/i.test(line) && !line.toLowerCase().includes('address')) {
          break;
        }
        if (/^address:?/i.test(line)) {
          const rest = line.replace(/^address:-?\s*/i, '').replace(/[\*\_]/g, '').trim();
          if (rest) addressParts.push(rest);
        } else if (/(?:mr|ms|mrs|call|hp|tel|contact|ic no|lorry:|\d{3}-\d+)/i.test(line)) {
          contacts.push(line.replace(/[\*\_]/g, '').trim());
        } else if (!/^(collection|pick\s*up)/i.test(line)) {
          if (/A\/L|A\/P|IC NO|HP NO|LORRY:/i.test(line)) {
            contacts.push(line.replace(/[\*\_]/g, '').trim());
          } else {
            addressParts.push(line.replace(/[\*\_]/g, '').trim());
          }
        }
      }
      if (addressParts.length > 0) {
        if (!/^(pt\s*\d+|no\.?|lot|section|\d+)/i.test(addressParts[0]) && !/A\/L|A\/P/i.test(addressParts[0])) {
          c.customer_name = addressParts[0];
        }
        c.pickup_location = addressParts.join(', ');
      }
      if (contacts.length > 0) {
        c.customer_ref = contacts.join(' | ');
      }
    }

    // 6. Dropoff location parsing
    const dropMatch = raw.match(/(?:pls send part to|send part to|send to|deliver to|dropoff|destination|to[:\s]+)([^\n👇🏻🚨]+)/i);
    if (dropMatch) {
      c.dropoff_location = dropMatch[1].replace(/same day collection/i, '').replace(/[\*\_]/g, '').trim();
    }

    // 7. Lorry Spec
    const specMatch = raw.match(/(?:booking\s*\*?)?(\d+\s*(?:lorry|truck)?\s*(?:👉🏻)?\s*\d*ft[^\n]*)/i) ||
      raw.match(/(\d+\s*ft[^\n]*)/i) ||
      raw.match(/(side curtain|curtain|bonded|box|flatbed|trailer|canvas)/i);
    let specStr = specMatch ? specMatch[1].replace(/[\*\_👉🏻]/g, '').trim() : '';
    if (/side curtain/i.test(raw) && !/side curtain/i.test(specStr)) {
      specStr += ' SIDE CURTAIN';
    }
    c.lorry_spec = specStr.replace(/\s+/g, ' ').trim();

    // 8. Weight
    const wMatch = raw.match(/(?:material weight:?|weight:?)\s*\*?\*?\s*([\d\.]+\s*(?:MT|Tons?|Tonne|kg))\*?\*?/i) ||
      raw.match(/(\d+\s*(?:MT|Tons?|Tonne|kg))/i);
    if (wMatch) c.weight_desc = wMatch[1].replace(/[\*\_]/g, '').trim();

    // 9. Urgency
    c.urgent = /urgent|without fail|priority|asap|today|🚨/i.test(raw);

    // 10. Special instructions & canvas notes
    const notes = [];
    const canvasNote = raw.match(/#_?([^\n]+(?:covered by[^\n]+)?)/i) || raw.match(/(pallets? contain[^\n]+)/i);
    if (canvasNote) notes.push(canvasNote[1].replace(/^#_?/, '').replace(/[\*\_]/g, '').trim());
    if (notes.length > 0) {
      c.special_instructions = notes.join('. ');
    }

    // 11. Driver details if included
    const driverMatch = raw.match(/([A-Z\s]+A\/L[^\n]+|driver:[^\n]+)/i);
    const plateMatch = raw.match(/(?:lorry:?|plate:?)\s*([A-Z]{1,3}\s*\d{1,4}\s*[A-Z]?)/i);
    if (driverMatch || plateMatch) {
      const drvParts = [];
      if (driverMatch && !c.customer_ref.includes(driverMatch[1].trim())) drvParts.push('Driver: ' + driverMatch[1].replace(/[\*\_]/g, '').trim());
      if (plateMatch && !c.customer_ref.includes(plateMatch[1].trim())) drvParts.push('Lorry: ' + plateMatch[1].trim());
      if (drvParts.length > 0) {
        c.customer_ref = c.customer_ref ? `${c.customer_ref} | ${drvParts.join(' ')}` : drvParts.join(' ');
      }
    }

    // 12. Fallback customer name check
    if (!c.customer_name || /A\/L|A\/P/i.test(c.customer_name)) {
      const custMatch = raw.match(/(JFE Shoji steel|JFE|Leon Fuat|Penta Logistics|Sinar Enterprise|Global Forwarding)/i);
      if (custMatch) c.customer_name = custMatch[1];
    }

    // 13. Customer Phone & Attn & Terms extraction
    const phoneMatch = raw.match(/\b(01\d{1}[\s\-]?\d{7,8}|0[3-9]\d{1}[\s\-]?\d{7,8})\b/);
    if (phoneMatch) {
      c.phone = phoneMatch[1].trim();
    }

    const attnMatch = raw.match(/(?:mr\.|ms\.|mrs\.|encik|puan|attn:?|contact:?)\s*([A-Za-z\s\/]+?)(?=\s*\(|\s*\||\s*[\d\n]|$)/i);
    if (attnMatch) {
      c.contact_person = attnMatch[0].replace(/^(attn|contact):?\s*/i, '').trim();
    }

    const termsMatch = raw.match(/(\d+\s*days(?:\s*credit)?|cash on delivery|cod)/i);
    if (termsMatch) {
      c.payment_terms = termsMatch[1].trim();
    }

    return c;
  };

  const parseNow = async (textOverride = null) => {
    const textToParse = typeof textOverride === 'string' ? textOverride : rawText;
    const trimmed = (textToParse || '').trim();
    if (!trimmed) {
      toast('Paste a message first', 'warn');
      return;
    }
    setIsParsing(true);
    try {
      const localCandidate = smartParseWhatsApp(trimmed);
      const aiCandidate = await fetchAIParse(trimmed);

      let candidate = localCandidate;
      if (aiCandidate && (aiCandidate.pickup_location || aiCandidate.customer_name || aiCandidate.lorry_spec)) {
        const ai = aiCandidate;
        candidate = {
          customer_name: ai.customer_name || localCandidate.customer_name,
          pickup_location: ai.pickup_location || localCandidate.pickup_location,
          dropoff_location: ai.dropoff_location || localCandidate.dropoff_location,
          collection_date: ai.collection_date || localCandidate.collection_date,
          pickup_time: ai.pickup_time || localCandidate.pickup_time,
          dropoff_time: ai.dropoff_time || localCandidate.dropoff_time,
          lorry_spec: ai.lorry_spec || localCandidate.lorry_spec,
          weight_desc: ai.weight_desc || localCandidate.weight_desc,
          rate_amount: ai.rate_amount || localCandidate.rate_amount,
          urgent: ai.urgent ?? localCandidate.urgent,
          customer_ref: ai.customer_ref || localCandidate.customer_ref,
          special_instructions: ai.special_instructions || localCandidate.special_instructions,
          phone: ai.phone || localCandidate.phone,
          contact_person: ai.contact_person || localCandidate.contact_person,
          payment_terms: ai.payment_terms || localCandidate.payment_terms
        };
      }

      fillFormFields(candidate, trimmed);
      toast('Booking parsed into form! Review details on the right & click Save & Send.', 'ok');
    } catch (e) {
      toast('Error parsing text', 'err');
    } finally {
      setIsParsing(false);
    }
  };

  const saveParse = parseNow;

  const saveQuote = async (targetStatus) => {
    const rateVal = parseFloat(formRate) || null;
    let custObj = customers.find(c => c.id === formCustomer || (c.company_name && c.company_name.toLowerCase().trim() === (formCustomer || '').toLowerCase().trim()));
    const candidateName = custObj?.company_name || formCustomer || '';
    const matchedExistingCust = findExistingCustomer(formCustomer, candidateName, null, customers, quotes);
    const isExistingCustomer = Boolean(custObj || matchedExistingCust);

    let resolvedCustomerId = custObj?.id || matchedExistingCust?.id || formCustomer;
    if (matchedExistingCust && matchedExistingCust.id && !String(matchedExistingCust.id).startsWith('c_')) {
      resolvedCustomerId = matchedExistingCust.id;
    }
    if (!custObj && matchedExistingCust) custObj = matchedExistingCust;

    const cleanCustName = (custObj?.company_name || formCustomer || candidateName || '').trim();
    if (sb && cleanCustName && cleanCustName !== 'Direct Customer') {
      try {
        const { data: existCust } = await sb.from('customers').select('*').eq('company_name', cleanCustName).maybeSingle();
        if (!existCust) {
          const newCustRow = {
            company_name: cleanCustName,
            contact_person: formAttn.trim() || 'Logistics Dept',
            phone: formPhone.trim(),
            payment_terms: formTerms.trim() || '30 days credit',
            zone: formZone.trim() || 'Zone A',
            billing_address: formPickup.trim(),
            is_new: isExistingCustomer ? 0 : 1,
            default_rate: rateVal || 1500.00
          };
          const insRes = await sb.from('customers').insert([newCustRow]).select();
          if (insRes.data && insRes.data[0]) {
            resolvedCustomerId = insRes.data[0].id;
            custObj = insRes.data[0];
          }
        } else {
          resolvedCustomerId = existCust.id;
          custObj = existCust;
          const patch = {};
          if (formPhone.trim() && !existCust.phone) patch.phone = formPhone.trim();
          if (formAttn.trim() && !existCust.contact_person) patch.contact_person = formAttn.trim();
          if (formTerms.trim() && !existCust.payment_terms) patch.payment_terms = formTerms.trim();
          if (formZone.trim() && !existCust.zone) patch.zone = formZone.trim();
          if (Object.keys(patch).length > 0) {
            await sb.from('customers').update(patch).eq('id', existCust.id);
          }
        }
      } catch (e) {}
    }

    const finalStatus = targetStatus === 'draft' ? 'draft' : (isExistingCustomer ? 'approved' : 'client_confirmed');

    // ── CASE 1: REPEAT ORDER FOR MULTIPLE SELECTED DATES ─────────────────────
    if (formRepeatOrder && selectedRepeatDates.length > 0) {
      const sortedDates = Array.from(new Set(selectedRepeatDates)).sort();
      const now = new Date();
      const qPrefix = `RJ-Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
      const jPrefix = `RJ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;

      // Read current max sequence from local data and state
      const localQuotes = (getStorageData ? getStorageData('quotations') : quotes) || [];
      let maxQSeq = 0;
      localQuotes.forEach(q => {
        if (q.quote_no && q.quote_no.startsWith(qPrefix)) {
          const num = parseInt(q.quote_no.split('-').pop(), 10);
          if (!isNaN(num) && num > maxQSeq) maxQSeq = num;
        }
      });
      quotes.forEach(q => {
        if (q.quote_no && q.quote_no.startsWith(qPrefix)) {
          const num = parseInt(q.quote_no.split('-').pop(), 10);
          if (!isNaN(num) && num > maxQSeq) maxQSeq = num;
        }
      });

      const localJobs = (getStorageData ? getStorageData('jobs') : []) || [];
      let maxJSeq = 0;
      localJobs.forEach(j => {
        if (j.job_no && j.job_no.startsWith(jPrefix)) {
          const num = parseInt(j.job_no.split('-').pop(), 10);
          if (!isNaN(num) && num > maxJSeq) maxJSeq = num;
        }
      });

      const quotesToInsert = [];
      const jobsToInsert = [];
      const approvalsToInsert = [];

      for (let i = 0; i < sortedDates.length; i++) {
        const isoDate = sortedDates[i];
        const pickupDmy = formatISOToDMY(isoDate);

        let dropoffDmy = pickupDmy;
        if (formRepeatDeliveryMode === 'next_day') {
          const [y, m, d] = isoDate.split('-').map(Number);
          const dropDt = new Date(y, m - 1, d);
          dropDt.setDate(dropDt.getDate() + 1);
          dropoffDmy = `${String(dropDt.getDate()).padStart(2, '0')}/${String(dropDt.getMonth() + 1).padStart(2, '0')}/${dropDt.getFullYear()}`;
        }

        const deliveryTimingText = formRepeatDeliveryMode === 'next_day' ? 'Today Pickup ➔ Tomorrow Drop' : 'Today Pickup ➔ Today Drop';
        const seqQ = maxQSeq + 1 + i;
        const seqJ = maxJSeq + 1 + i;
        const quoteNo = `${qPrefix}${String(seqQ).padStart(4, '0')}`;
        const jobNo = `${jPrefix}${String(seqJ).padStart(4, '0')}`;
        const quoteId = 'q_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 5);

        const quoteRow = {
          id: quoteId,
          quote_no: quoteNo,
          customer_id: resolvedCustomerId,
          customer_ref: formRef.trim(),
          zone: (formPickupZone.trim() || formDropoffZone.trim() || formZone.trim()),
          pickup_zone: formPickupZone.trim(),
          dropoff_zone: formDropoffZone.trim(),
          pickup_location: formPickup.trim(),
          dropoff_location: formDropoff.trim(),
          collection_date: pickupDmy,
          delivery_date: dropoffDmy,
          arrived_date: dropoffDmy,
          pickup_time: formPickupTime.trim(),
          dropoff_time: formDropoffTime.trim(),
          lorry_spec: formSpec.trim(),
          weight_desc: formWeight.trim(),
          special_instructions: (formSpecial.trim() ? formSpecial.trim() + ' | ' : '') + `Repeat Order (Day ${i + 1}/${sortedDates.length}) • ${deliveryTimingText}`,
          rate_amount: rateVal,
          urgent: formUrgent ? 1 : 0,
          raw_message: rawText,
          status: finalStatus,
          client_confirmed_at: new Date().toISOString(),
          owner_approved_at: (isExistingCustomer && finalStatus !== 'draft') ? new Date().toISOString() : null,
          phone: formPhone.trim(),
          contact_person: formAttn.trim(),
          payment_terms: formTerms.trim() || '30 days credit',
          created_at: new Date(Date.now() + i * 50).toISOString()
        };
        if (finalStatus === 'sent') quoteRow.sent_at = new Date().toISOString();

        quotesToInsert.push(quoteRow);

        if (isExistingCustomer && finalStatus !== 'draft') {
          jobsToInsert.push({
            id: 'job_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 5),
            job_no: jobNo,
            quotation_id: quoteId,
            customer_id: resolvedCustomerId,
            customer_ref: formRef.trim() || ('Quotation ' + quoteNo),
            rate_amount: rateVal || 0,
            pickup_location: formPickup.trim() || 'Pickup Location',
            dropoff_location: formDropoff.trim() || 'Dropoff Location',
            pickup_zone: formPickupZone.trim(),
            dropoff_zone: formDropoffZone.trim(),
            cargo_desc: formWeight.trim() || formSpec.trim() || 'General Cargo',
            lorry_spec: formSpec.trim(),
            weight_desc: formWeight.trim(),
            urgent: formUrgent ? 1 : 0,
            special_instructions: quoteRow.special_instructions,
            collection_date: pickupDmy,
            delivery_date: dropoffDmy,
            status: 'unassigned',
            is_approved: 0,
            billed_status: 'pending',
            created_at: new Date(Date.now() + i * 50).toISOString()
          });
        }
      }

      if (sb) {
        try {
          await sb.from('quotations').insert(quotesToInsert);
          if (jobsToInsert.length > 0) await sb.from('jobs').insert(jobsToInsert);
        } catch (e) {
          console.error('Error inserting batch repeat orders:', e);
        }
      }

      toast(`Successfully created exactly ${sortedDates.length} orders for the selected dates!`, 'ok');
      setShowNewPanel(false);
      setEditingId(null);
      setFormRepeatOrder(false);
      setSelectedRepeatDates([]);
      loadData();
      return;
    }

    // ── CASE 2: SINGLE QUOTATION (STANDARD OR EDIT) ──────────────────────────
    const payload = {
      customer_id: resolvedCustomerId,
      customer_ref: formRef.trim(),
      zone: (formPickupZone.trim() || formDropoffZone.trim() || formZone.trim()),
      pickup_zone: formPickupZone.trim(),
      dropoff_zone: formDropoffZone.trim(),
      pickup_location: formPickup.trim(),
      dropoff_location: formDropoff.trim(),
      collection_date: formOrderDate.trim(),
      delivery_date: formArrivedDate.trim() || formOrderDate.trim(),
      arrived_date: formArrivedDate.trim() || formOrderDate.trim(),
      pickup_time: formPickupTime.trim(),
      dropoff_time: formDropoffTime.trim(),
      lorry_spec: formSpec.trim(),
      weight_desc: formWeight.trim(),
      special_instructions: formSpecial.trim(),
      rate_amount: rateVal,
      urgent: formUrgent ? 1 : 0,
      raw_message: rawText,
      status: finalStatus,
      client_confirmed_at: new Date().toISOString(),
      owner_approved_at: (isExistingCustomer && finalStatus !== 'draft') ? new Date().toISOString() : null,
      phone: formPhone.trim(),
      contact_person: formAttn.trim(),
      payment_terms: formTerms.trim() || '30 days credit'
    };
    if (finalStatus === 'sent') payload.sent_at = new Date().toISOString();

    let targetId = editingId;
    if (editingId) {
      if (sb) await sb.from('quotations').update(payload).eq('id', editingId);
    } else {
      payload.quote_no = await nextQuoteNo();
      payload.created_at = new Date().toISOString();
      if (sb) {
        try {
          const res = await sb.from('quotations').insert(payload).select();
          if (res.data) {
            const row = Array.isArray(res.data) ? res.data[0] : res.data;
            if (row && row.id) targetId = row.id;
          }
        } catch (e) { }
      }
    }

    const fullObj = {
      id: targetId || ('q_' + Date.now()),
      ...payload,
      customer_id: resolvedCustomerId,
      customer: custObj ? {
        id: custObj.id,
        company_name: custObj.company_name,
        contact_person: formAttn.trim() || custObj.contact_person,
        phone: formPhone.trim() || custObj.phone,
        payment_terms: formTerms.trim() || custObj.payment_terms || '30 days credit'
      } : (cleanCustName ? {
        company_name: cleanCustName,
        contact_person: formAttn.trim() || 'Logistics Dept',
        phone: formPhone.trim(),
        payment_terms: formTerms.trim() || '30 days credit'
      } : null)
    };

    if (sb) {
      try {
        if (isExistingCustomer && finalStatus !== 'draft') {
          const expectedJobNo = jobNoFromQuoteNo(fullObj.quote_no);
          const { data: allDbJobs } = await sb.from('jobs').select('id, job_no, quotation_id, customer_ref');
          const existingJob = (allDbJobs || []).find(j => 
            String(j.quotation_id) === String(fullObj.id) ||
            (expectedJobNo && j.job_no === expectedJobNo) ||
            (fullObj.quote_no && (j.job_no === fullObj.quote_no || j.customer_ref?.includes(fullObj.quote_no)))
          );
          if (!existingJob) {
            const newJobNo = expectedJobNo || (await nextJobNo());
            await sb.from('jobs').insert({
              job_no: newJobNo,
              quotation_id: fullObj.id,
              customer_id: fullObj.customer_id,
              customer_ref: fullObj.customer_ref,
              rate_amount: fullObj.rate_amount,
              pickup_location: fullObj.pickup_location || 'Pickup Location',
              dropoff_location: fullObj.dropoff_location || 'Dropoff Location',
              pickup_zone: formPickupZone.trim(),
              dropoff_zone: formDropoffZone.trim(),
              cargo_desc: fullObj.weight_desc || fullObj.lorry_spec || '',
              lorry_spec: fullObj.lorry_spec,
              weight_desc: fullObj.weight_desc,
              urgent: fullObj.urgent ? 1 : 0,
              special_instructions: fullObj.special_instructions,
              collection_date: fullObj.collection_date,
              delivery_date: fullObj.delivery_date,
              status: 'unassigned',
              is_approved: 0,
              billed_status: 'pending'
            });
          }
        }
        await sb.from('approvals').delete().eq('ref_id', fullObj.id);
        if (fullObj.quote_no) await sb.from('approvals').delete().eq('ref_id', fullObj.quote_no);
      } catch (e) {}
    }

    if (targetStatus === 'draft') {
      toast('Quotation saved as draft!', 'ok');
    } else if (isExistingCustomer) {
      toast('Order created and dispatched to Job Board!', 'ok');
    } else {
      toast('Order quotation saved successfully!', 'ok');
    }
    setShowNewPanel(false);
    setEditingId(null);
    loadData();
  };

  const startEdit = (id) => {
    const q = quotes.find(x => x.id === id);
    if (!q) return;
    setEditingId(id);
    setRawText(q.raw_message || '');
    setFormCustomer(q.customer_id || '');
    setFormPhone(q.customer?.phone || q.phone || '');
    setFormAttn(q.customer?.contact_person || q.contact_person || q.attn || '');
    setFormTerms(q.customer?.payment_terms || q.payment_terms || q.terms || '30 days credit');
    setFormZone(q.zone || q.customer?.zone || '');
    setFormPickupZone(q.pickup_zone || q.zone || q.customer?.pickup_zone || q.customer?.zone || '');
    setFormDropoffZone(q.dropoff_zone || q.drop_zone || q.zone || q.customer?.dropoff_zone || q.customer?.drop_zone || '');
    setFormPickup(q.pickup_location || q.pickup || '');
    setFormDropoff(q.dropoff_location || q.dropoff || '');
    setFormOrderDate(q.collection_date || q.order_date || '');
    setFormArrivedDate(q.delivery_date || q.arrived_date || q.collection_date || q.order_date || '');
    setFormPickupTime(q.pickup_time || q.loading_time || '');
    setFormDropoffTime(q.dropoff_time || q.unloading_time || '');
    setFormSpec(q.lorry_spec || '');
    setFormWeight(q.weight_desc || '');
    setFormRef(q.customer_ref || '');
    setFormSpecial(q.special_instructions || '');
    setFormRate(q.rate_amount || q.quoted_rate || '');
    setFormUrgent(!!q.urgent);
    setShowNewPanel(true);
  };

  const markStatus = async (id, status) => {
    const q = quotes.find(x => x.id === id);
    const isExistingCustomer = checkIsExistingCustomer(q?.customer_id, q?.customer?.company_name, q, customers);

    if (status === 'approved' || (isExistingCustomer && (status === 'client_confirmed' || status === 'sent'))) {
      const custName = (q?.customer?.company_name || q?.customer_name || '').trim();
      const custId = q?.customer_id;

      // 1. Mark customer as approved
      if (custId) {
        await sb.from('customers').update({ status: 'approved', is_new: 0 }).eq('id', custId);
      } else if (custName && custName.toLowerCase() !== 'direct customer') {
        await sb.from('customers').update({ status: 'approved', is_new: 0 }).ilike('company_name', custName);
      }

      // 2. Find and approve ALL quotes/routes for this same customer
      const matchingQuotes = quotes.filter(item => {
        if (item.id === id) return true;
        if (custId && item.customer_id === custId) return true;
        if (custName && custName.toLowerCase() !== 'direct customer') {
          const itemCustName = (item.customer?.company_name || item.customer_name || '').trim().toLowerCase();
          if (itemCustName === custName.toLowerCase()) return true;
        }
        return false;
      });

      const { data: allDbJobs } = await sb.from('jobs').select('id, job_no, quotation_id, customer_ref');

      for (const targetQ of (matchingQuotes.length > 0 ? matchingQuotes : [q])) {
        await sb.from('quotations').update({
          status: 'approved',
          owner_approved_at: new Date().toISOString(),
          client_confirmed_at: new Date().toISOString()
        }).eq('id', targetQ.id);

        await sb.from('approvals').delete().eq('ref_id', targetQ.id);
      }

      toast('Quotation & customer routes approved! Ready for ordering.', 'ok');
    } else {
      const patch = { status };
      if (status === 'sent') patch.sent_at = new Date().toISOString();
      if (status === 'client_confirmed') patch.client_confirmed_at = new Date().toISOString();
      if (status === 'declined') patch.decline_reason = prompt('Reason (optional)') || null;
      await sb.from('quotations').update(patch).eq('id', id);

      if (status === 'client_confirmed' || status === 'sent') {
        const title = 'Quotation ' + (q?.quote_no || id) + (q?.customer?.company_name ? ' - ' + q.customer.company_name : '');
        const { data: existing } = await sb.from('approvals').select('id').eq('ref_id', id).maybeSingle();
        if (!existing) {
          await sb.from('approvals').insert({
            kind: 'quotation',
            ref_id: id,
            title: title,
            amount: q?.rate_amount || 0,
            status: 'waiting',
            flagged: 1
          });
        }
        toast(`Status updated to ${status.replace('_', ' ')}`, 'info');
      } else {
        toast('Quotation updated', 'ok');
      }
    }
    loadData();
  };

  const [focusId, setFocusId] = useState(null);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

      if (showNewPanel) {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter') {
          e.preventDefault();
          parseAndAddDirectly();
        } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          if (document.activeElement.id === 'raw') parseNow();
          else saveQuote('sent');
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          saveQuote('draft');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setShowNewPanel(false);
        }
        return;
      }

      if (isInput) return;

      const filtered = activeFilter === 'all' ? quotes : quotes.filter(x => x.status === activeFilter);
      let curIdx = filtered.findIndex(x => x.id === focusId);

      if (e.key === 'n') {
        e.preventDefault();
        showNewForm();
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered.length) {
          const next = (curIdx + 1) % filtered.length;
          setFocusId(filtered[next].id);
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length) {
          const prev = (curIdx - 1 + filtered.length) % filtered.length;
          setFocusId(filtered[prev].id);
        }
      } else if (e.key === 'e' || e.key === 'Enter') {
        e.preventDefault();
        if (focusId) startEdit(focusId);
      } else if (e.key === 's') {
        e.preventDefault();
        const item = filtered.find(x => x.id === focusId);
        if (item && item.status === 'draft') markStatus(item.id, 'sent');
      } else if (e.key === 'c') {
        e.preventDefault();
        const item = filtered.find(x => x.id === focusId);
        if (item && item.status === 'sent') markStatus(item.id, 'client_confirmed');
      } else if (e.key === 'd') {
        e.preventDefault();
        const item = filtered.find(x => x.id === focusId);
        if (item && item.status !== 'approved') markStatus(item.id, 'declined');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNewPanel, rawText, formCustomer, formPickup, formDropoff, formSpec, formWeight, formRef, formSpecial, formRate, formUrgent, editingId, quotes, activeFilter, focusId]);

  const { total } = withSST(formRate);

  const isTripOrder = useCallback((q) => {
    if (!q) return false;
    return isOrderQuotation(q);
  }, []);

  const tripOrders = useMemo(() => {
    // 1. Process all quotations from quotations table
    const processedQuotes = (quotes || []).filter(isTripOrder).map(q => ({
      ...q,
      effectiveStatus: getQuoteEffectiveStatus(q)
    }));

    // 2. Map existing quote identifiers (id, quote_no, syncd job_no)
    const quoteKeySet = new Set();
    processedQuotes.forEach(q => {
      if (q.id) quoteKeySet.add(String(q.id));
      if (q.quote_no) {
        quoteKeySet.add(String(q.quote_no));
        const syncd = jobNoFromQuoteNo(q.quote_no);
        if (syncd) quoteKeySet.add(String(syncd));
      }
    });

    // 3. Include any jobs from jobs table that do not have a matching quotation in processedQuotes
    const standaloneJobs = (jobs || []).filter(job => {
      if (!job) return false;
      if (job.status === 'cancelled') return false;
      if (isContractQuotation(job)) return false;
      if (job.is_contract === true || job.is_contract === 1 || job.quote_type === 'contract') return false;
      if (job.special_instructions && typeof job.special_instructions === 'string' && job.special_instructions.startsWith('{')) {
        try {
          const parsed = JSON.parse(job.special_instructions);
          if (parsed && parsed.routes && Array.isArray(parsed.routes)) return false;
        } catch (_) {}
      }
      // Check if already represented by a quotation
      const linkedQId = String(job.quotation_id || '');
      const jobNoStr = String(job.job_no || '');
      if (linkedQId && quoteKeySet.has(linkedQId)) return false;
      if (jobNoStr && quoteKeySet.has(jobNoStr)) return false;
      if (job.id && quoteKeySet.has(String(job.id))) return false;
      return true;
    }).map(job => {
      const qNo = job.job_no ? (job.job_no.startsWith('RJ-Q-') ? job.job_no : job.job_no.replace('RJ-', 'RJ-Q-')) : ('RJ-Q-' + String(job.id).slice(-4));
      return {
        id: job.quotation_id || job.id,
        quote_no: qNo,
        job_no: job.job_no,
        customer_id: job.customer_id,
        customer: job.customer,
        customer_ref: job.customer_ref,
        pickup_location: job.pickup_location,
        dropoff_location: job.dropoff_location,
        pickup_zone: job.pickup_zone,
        dropoff_zone: job.dropoff_zone,
        zone: job.zone || job.pickup_zone,
        collection_date: job.collection_date || job.order_date,
        delivery_date: job.delivery_date || job.arrived_date || job.collection_date,
        arrived_date: job.arrived_date || job.delivery_date,
        pickup_time: job.pickup_time || job.loading_time,
        dropoff_time: job.dropoff_time || job.unloading_time,
        lorry_spec: job.lorry_spec,
        weight_desc: job.weight_desc || job.cargo_desc,
        special_instructions: job.special_instructions,
        rate_amount: job.rate_amount,
        quoted_rate: job.rate_amount,
        urgent: job.urgent,
        status: job.status || 'approved',
        effectiveStatus: job.status || 'approved',
        created_at: job.created_at || new Date().toISOString()
      };
    });

    const combined = [...processedQuotes, ...standaloneJobs];
    // Deduplicate by quote_no / id
    const seen = new Set();
    const result = [];
    combined.forEach(item => {
      const key = item.quote_no || item.id;
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(item);
      } else if (!key) {
        result.push(item);
      }
    });
    return result;
  }, [quotes, jobs, isTripOrder, getQuoteEffectiveStatus]);

  const cnt = (s) => {
    if (s === 'approved') {
      return tripOrders.filter(x => ['approved', 'assigned', 'in_transit', 'delivered'].includes(x.effectiveStatus)).length;
    }
    return tripOrders.filter(x => x.effectiveStatus === s).length;
  };

  const filteredQuotes = useMemo(() => {
    if (activeFilter === 'all') return tripOrders;
    if (activeFilter === 'approved') {
      return tripOrders.filter(x => ['approved', 'assigned', 'in_transit', 'delivered'].includes(x.effectiveStatus));
    }
    return tripOrders.filter(x => x.effectiveStatus === activeFilter);
  }, [activeFilter, tripOrders]);

  const badgeClass = s => ({ draft: 'grey', sent: 'blue', client_confirmed: 'amber', approved: 'green', assigned: 'grey', in_transit: 'blue', delivered: 'green', declined: 'red' }[s] || 'amber');

  const totalValue = tripOrders.reduce((acc, curr) => acc + (parseFloat(curr.quoted_rate) || parseFloat(curr.rate_amount) || 0), 0);

  const sampleMsg = `🚨Monday (20/07/2026)\n🚛Booking *1 Lorry 👉🏻 30ft*\n*SIDE CURTAIN*\n\nCollection 👇🏻\nAddress:-\nJFE Shoji steel Malaysia S.B.\nPT 5021,Jalan 27/90, section 27. Hicom Industrial Area.  40400 Shah Alam, Selangor. \nMr.Danny (012-3683105)\nMs Lau (03-51911125 ext: 314)\n\nMaterial weight: \n** 12MT**\n\n_Part ready 8am_\n\n\n🚨🚨🚨🚨\nPls send part to Likom same day collection 👇🏻\nDate arrive: *20/07/2026* \nTime before : 8am\n\nPls take note 🙏🏻\nPart very urgent \n*Without fail*\n\n\nPls arrange priority for this collection 🙏🏻\n\n\n\n#_From today onwards for all upcoming collection from JFE and Leon fuat the pallets contain steel must be covered by the blue canvas for protection in case raining during in transit.  Hope for your cooperation_.\n\nSugumar A/L Velasamy\nIc no : 820327-05-5411\nHp no: 01111963021\nLorry: BEP 6261`;

  const deleteQuote = async (id, e) => {
    if (e) e.stopPropagation();
    if (sb) {
      try {
        await sb.from('quotations').delete().eq('id', id);
        await sb.from('approvals').delete().eq('ref_id', id);
      } catch (err) { }
    }
    setQuotes(prev => prev.filter(x => x.id !== id));
    toast('Quotation removed', 'warn');
  };

  const clearAllTestingQuotes = async () => {
    try {
      await fetch('/api/db.php?action=clear_quotes_and_jobs');
    } catch (e) { }
    if (sb) {
      try {
        await sb.from('quotations').delete();
        await sb.from('approvals').delete();
        await sb.from('jobs').delete();
        await sb.from('job_crew').delete();
        await sb.from('sales_invoices').delete();
      } catch (e) { }
    }
    try {
      localStorage.setItem('rens_db_quotations', '[]');
      localStorage.setItem('rens_db_approvals', '[]');
      localStorage.setItem('rens_db_jobs', '[]');
      localStorage.setItem('rens_db_job_crew', '[]');
      localStorage.setItem('rens_db_sales_invoices', '[]');
    } catch (e) { }
    setQuotes([]);
    setFormCustomer('');
    toast('All test quotations & jobs cleared! Starting clean.', 'ok');
    loadData();
  };

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Orders &amp; Pricing</h1>
          <div className="sub">Paste WhatsApp bookings, parse with AI, auto-price, and submit for owner approval.</div>
        </div>
        <div className="tools" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tripOrders.length > 0 && (
            <button
              className="btn danger"
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete all ${tripOrders.length} quotations and reset the table?`)) {
                  clearAllTestingQuotes();
                }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}
              title="Delete all demo/test quotation entries"
            >
              <Trash2 size={14} strokeWidth={2.4} />
              <span>Clear All Quotes ({tripOrders.length})</span>
            </button>
          )}

          <button className="btn pri" onClick={showNewForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={15} strokeWidth={2.4} />
            <span>New order</span>
            <kbd>N</kbd>
          </button>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: '24px' }}>
        <div className="kpi">
          <div className="k">Total Pipeline</div>
          <div className="v">{fmtMoney(totalValue)}</div>
          <div className="d up">Active Quotes: {tripOrders.length}</div>
        </div>
        <div className="kpi">
          <div className="k">Pending Sent</div>
          <div className="v">{cnt('sent')}</div>
          <div className="d">Awaiting client</div>
        </div>
        <div className="kpi">
          <div className="k">Confirmed Quotes</div>
          <div className="v">{cnt('client_confirmed')}</div>
          <div className="d warn">Needs Owner Approval</div>
        </div>
        <div className="kpi">
          <div className="k">Converted Jobs</div>
          <div className="v">{tripOrders.filter(x => ['approved', 'assigned', 'in_transit', 'delivered'].includes(x.effectiveStatus)).length}</div>
          <div className="d up">Ready for Dispatch</div>
        </div>
      </div>

      {showNewPanel && (
        <div className="tab-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '28px' }}>
          {/* ① Box 1: Quick Import / Paste Booking Message (Collapsible Top Card) */}
          <div 
            className="panel" 
            style={{ 
              background: isPasteBoxOpen ? '#FFFFFF' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
              border: isPasteBoxOpen ? '1.5px solid #CBD5E1' : '1px solid var(--line)',
              borderRadius: '16px',
              padding: isPasteBoxOpen ? '20px 24px' : '14px 20px',
              boxShadow: isPasteBoxOpen ? '0 4px 16px rgba(0,0,0,0.06)' : 'var(--shadow-sm)',
              transition: 'all 0.2s ease-in-out'
            }}
          >
            {/* Header / Clickable Toggle */}
            <div 
              onClick={() => setIsPasteBoxOpen(prev => !prev)}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                cursor: 'pointer',
                userSelect: 'none',
                paddingBottom: isPasteBoxOpen ? '14px' : '0',
                borderBottom: isPasteBoxOpen ? '1px solid #E2E8F0' : 'none'
              }}
              title={isPasteBoxOpen ? "Click to collapse message parser" : "Click to expand AI message parser"}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span 
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #BFDBFE'
                  }}
                >
                  ①
                </span>
                <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '1.02rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                  Paste booking message 
                  <span className="kk" style={{ fontSize: '0.72rem' }}><kbd>⌘</kbd><kbd>↵</kbd> parse</span>
                </h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--slate)', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                  WhatsApp / Email AI Converter
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span 
                  style={{ 
                    fontSize: '0.78rem', 
                    color: isPasteBoxOpen ? 'var(--slate)' : 'var(--pri)', 
                    fontWeight: 700, 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '5px',
                    background: isPasteBoxOpen ? '#F1F5F9' : '#EEF2FF',
                    border: isPasteBoxOpen ? '1px solid #CBD5E1' : '1px solid #C7D2FE',
                    padding: '4px 10px',
                    borderRadius: '8px'
                  }}
                >
                  {!isPasteBoxOpen && <Sparkles size={13} color="var(--pri)" />}
                  {isPasteBoxOpen ? 'Hide Parser' : 'Open Message Parser'}
                  <ChevronDown 
                    size={14} 
                    style={{ 
                      transition: 'transform 0.2s ease', 
                      transform: isPasteBoxOpen ? 'rotate(180deg)' : 'rotate(0deg)' 
                    }} 
                  />
                </span>
              </div>
            </div>

            {/* Collapsible Message Box Body */}
            {isPasteBoxOpen && (
              <div className="tab-fade-in" style={{ marginTop: '14px' }}>
                <div className="field" style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px', display: 'block' }}>
                    Customer Message (WhatsApp / Email / Order Text)
                  </label>
                  <textarea
                    id="raw"
                    rows={5}
                    placeholder="Paste WhatsApp or email message (e.g. 'Port Klang to Ipoh Depot, 24 Tons, 2x40ft containers' or WhatsApp order format)..."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: '0.84rem',
                      lineHeight: '1.45',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: '#F8FAFC'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn pri" onClick={() => parseNow()} disabled={isParsing} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                      <Sparkles size={14} strokeWidth={2.2} />
                      {isParsing ? 'Parsing Message...' : 'Parse Booking Message'}
                    </button>
                    <button className="btn gh" onClick={resetForm} style={{ fontSize: '0.82rem' }}>Clear / Manual</button>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    💡 Auto-extracts customer, route, dates, specs &amp; rate into form below
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ② Box 2: Review & Price Quotation (Full Width Main Form) */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span 
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#FFF7ED',
                    color: '#EA580C',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #FED7AA'
                  }}
                >
                  ②
                </span>
                <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '1.08rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                  Review &amp; price quotation 
                  <span className="kk" style={{ fontSize: '0.72rem' }}><kbd>⌘</kbd><kbd>↵</kbd> save+send</span>
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  type="button" 
                  className="btn gh sm" 
                  onClick={() => setShowNewPanel(false)}
                  style={{ fontSize: '0.75rem', color: 'var(--slate)' }}
                >
                  ✕ Close Form
                </button>
              </div>
            </div>

            {/* Customer Search & Selector */}
            <div className="field" ref={custDropdownRef} style={{ position: 'relative', width: '100%', boxSizing: 'border-box', marginBottom: '16px' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 800, fontSize: '0.76rem', color: 'var(--navy-900)' }}>CUSTOMER</span>
                {formCustomer && approvedCustomers.find(c => c.id === formCustomer) && (
                  <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} /> Existing Registered Customer
                  </span>
                )}
              </label>

              {/* Single Unified Search & Select Input Box */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                    minHeight: '42px',
                    padding: '6px 12px',
                    border: isCustDropdownOpen ? '2px solid var(--orange)' : '1px solid var(--line)',
                    borderRadius: '8px',
                    background: '#FFFFFF',
                    boxShadow: isCustDropdownOpen ? '0 0 0 3px rgba(249, 115, 22, 0.15)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Search size={15} style={{ color: isCustDropdownOpen ? 'var(--orange)' : 'var(--slate)', flexShrink: 0 }} />
                  
                  <input
                    type="text"
                    placeholder="Search or select customer or contact..."
                    value={isCustDropdownOpen ? custSearchQuery : (approvedCustomers.find(c => c.id === formCustomer)?.company_name || formCustomer || '')}
                    onFocus={() => {
                      setIsCustDropdownOpen(true);
                      setCustSearchQuery(approvedCustomers.find(c => c.id === formCustomer)?.company_name || formCustomer || '');
                    }}
                    onChange={(e) => {
                      setCustSearchQuery(e.target.value);
                      setFormCustomer(e.target.value);
                      if (!isCustDropdownOpen) setIsCustDropdownOpen(true);
                    }}
                    style={{
                      border: 'none',
                      outline: 'none',
                      flex: 1,
                      width: '100%',
                      padding: 0,
                      fontSize: '0.86rem',
                      fontWeight: formCustomer ? 800 : 600,
                      color: 'var(--navy-900)',
                      background: 'transparent'
                    }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, color: 'var(--slate)' }}>
                    {(formCustomer || custSearchQuery) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectCustomer('');
                          setCustSearchQuery('');
                        }}
                        style={{
                          background: '#F1F5F9',
                          border: 'none',
                          borderRadius: '50%',
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--slate)'
                        }}
                        title="Clear selection"
                      >
                        <X size={11} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsCustDropdownOpen(prev => !prev)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'var(--slate)',
                        padding: '2px'
                      }}
                    >
                      {isCustDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* 100% Width Dropdown Menu */}
                {isCustDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '10px',
                      boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0,0,0,0.05)',
                      zIndex: 99999,
                      overflow: 'hidden',
                      animation: 'fadeIn 0.15s ease'
                    }}
                  >
                    <div style={{ maxHeight: '250px', overflowY: 'auto', padding: '6px' }}>
                      <div
                        onClick={() => {
                          handleSelectCustomer('');
                          setIsCustDropdownOpen(false);
                          setCustSearchQuery('');
                        }}
                        style={{
                          padding: '7px 10px',
                          fontSize: '0.78rem',
                          color: 'var(--slate)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          borderBottom: '1px dashed #E2E8F0',
                          marginBottom: '4px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        — Clear / Manual Customer Entry —
                      </div>

                      {filteredSelectCustomers.length > 0 ? (
                        filteredSelectCustomers.map(c => {
                          const isSelected = formCustomer === c.id;
                          return (
                            <div
                              key={c.id}
                              onClick={() => {
                                handleSelectCustomer(c.id);
                                setIsCustDropdownOpen(false);
                                setCustSearchQuery('');
                              }}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyItems: 'space-between',
                                justifyContent: 'space-between',
                                gap: '8px',
                                background: isSelected ? '#FFF7ED' : 'transparent',
                                border: isSelected ? '1px solid #FFEDD5' : '1px solid transparent',
                                margin: '2px 0',
                                transition: 'background 0.1s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.company_name}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--slate)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {c.contact_person && <span>👤 {c.contact_person}</span>}
                                  {c.phone && <span>📞 {c.phone}</span>}
                                </div>
                              </div>
                              {isSelected && (
                                <Check size={15} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '14px', textAlign: 'center', color: 'var(--slate)', fontSize: '0.78rem' }}>
                          No customers match "{custSearchQuery}" — you can still proceed with manual name.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Reference / Code Word Dropdown */}
            <div className="field" ref={refDropdownRef} style={{ position: 'relative', width: '100%', boxSizing: 'border-box', marginBottom: '16px' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 800, fontSize: '0.76rem', color: formCustomer ? 'var(--navy-900)' : 'var(--slate)' }}>
                  CUSTOMER REFERENCE / CODE WORD
                </span>
                <span style={{ fontSize: '0.7rem', color: formCustomer ? 'var(--orange)' : 'var(--slate)', fontWeight: 600 }}>
                  {formCustomer ? (allAvailableReferences.length > 0 ? `💡 ${allAvailableReferences.length} route code ${allAvailableReferences.length === 1 ? 'word' : 'words'} available — select or type` : '💡 Enter code word to auto-load customer routes & rates') : '🔒 Select a customer above first to unlock code word lookup'}
                </span>
              </label>

              {/* Single Unified Search & Select Input Box for Code Word */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                    minHeight: '42px',
                    padding: '6px 12px',
                    border: isRefDropdownOpen ? '2px solid var(--orange)' : '1px solid var(--line)',
                    borderRadius: '8px',
                    background: formCustomer ? '#FFFFFF' : '#F8FAFC',
                    boxShadow: isRefDropdownOpen ? '0 0 0 3px rgba(249, 115, 22, 0.15)' : 'none',
                    transition: 'all 0.15s ease',
                    cursor: formCustomer ? 'text' : 'not-allowed'
                  }}
                >
                  <Tag size={15} style={{ color: isRefDropdownOpen ? 'var(--orange)' : (formCustomer ? 'var(--slate)' : '#CBD5E1'), flexShrink: 0 }} />

                  <input
                    type="text"
                    disabled={!formCustomer}
                    placeholder={formCustomer ? (allAvailableReferences.length > 0 ? "Search or select code word (e.g. Dog)..." : "Enter customer code word (e.g. Dog)...") : "⚠️ Please select a customer above first..."}
                    value={isRefDropdownOpen ? refSearchQuery : formRef}
                    onFocus={() => {
                      if (!formCustomer) return;
                      setIsRefDropdownOpen(true);
                      setRefSearchQuery(formRef || '');
                    }}
                    onChange={(e) => {
                      setRefSearchQuery(e.target.value);
                      handleReferenceChange(e.target.value);
                      if (!isRefDropdownOpen) setIsRefDropdownOpen(true);
                    }}
                    style={{
                      border: 'none',
                      outline: 'none',
                      flex: 1,
                      width: '100%',
                      padding: 0,
                      fontSize: '0.86rem',
                      fontWeight: formRef ? 800 : 600,
                      color: formCustomer ? 'var(--navy-900)' : '#94A3B8',
                      background: 'transparent',
                      cursor: formCustomer ? 'text' : 'not-allowed'
                    }}
                  />

                  {formCustomer && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, color: 'var(--slate)' }}>
                      {(formRef || refSearchQuery) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReferenceChange('');
                            setRefSearchQuery('');
                          }}
                          style={{
                            background: '#F1F5F9',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'var(--slate)'
                          }}
                          title="Clear code word"
                        >
                          <X size={11} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (!formCustomer) return;
                          setIsRefDropdownOpen(prev => !prev);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--slate)',
                          padding: '2px'
                        }}
                      >
                        {isRefDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* 100% Width Dropdown Menu for Code Words */}
                {isRefDropdownOpen && formCustomer && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '10px',
                      boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0,0,0,0.05)',
                      zIndex: 99999,
                      overflow: 'hidden',
                      animation: 'fadeIn 0.15s ease'
                    }}
                  >
                    <div style={{ maxHeight: '250px', overflowY: 'auto', padding: '6px' }}>
                      <div
                        onClick={() => {
                          handleReferenceChange('');
                          setIsRefDropdownOpen(false);
                          setRefSearchQuery('');
                        }}
                        style={{
                          padding: '7px 10px',
                          fontSize: '0.78rem',
                          color: 'var(--slate)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          borderBottom: '1px dashed #E2E8F0',
                          marginBottom: '4px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        — Clear / Manual Reference Entry —
                      </div>

                      {filteredRefOptions.length > 0 ? (
                        filteredRefOptions.map((item, idx) => {
                          const isSelected = formRef.trim().toLowerCase() === item.ref.trim().toLowerCase();
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                handleReferenceChange(item.ref);
                                setIsRefDropdownOpen(false);
                                setRefSearchQuery('');
                              }}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                background: isSelected ? '#FFF7ED' : 'transparent',
                                border: isSelected ? '1px solid #FFEDD5' : '1px solid transparent',
                                margin: '2px 0',
                                transition: 'background 0.1s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{
                                    fontWeight: 800,
                                    fontSize: '0.84rem',
                                    color: '#EA580C',
                                    background: '#FFF7ED',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #FED7AA',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <Tag size={12} /> {item.ref}
                                  </span>
                                  {(item.collection || item.unloading) && (
                                    <span style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                                      {item.collection} {item.unloading ? `➔ ${item.unloading}` : ''}
                                    </span>
                                  )}
                                </div>
                                {(item.collection_zone || item.unloading_zone) && (
                                  <div style={{ fontSize: '0.70rem', color: 'var(--slate)', marginTop: '3px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {item.collection_zone && <span>Pickup: <b>{item.collection_zone}</b></span>}
                                    {item.unloading_zone && <span>Dropoff: <b>{item.unloading_zone}</b></span>}
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <Check size={15} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '14px', textAlign: 'center', color: 'var(--slate)', fontSize: '0.78rem' }}>
                          {allAvailableReferences.length === 0
                            ? 'No saved routes or code words found for this customer. Type any code word or manual reference above.'
                            : `No code words match "${refSearchQuery}" — you can still proceed with manual entry.`}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════
                ROUTES & RATES (RM) — Only shown when Code Word / Ref is entered
            ═════════════════════════════════════════════════════════════ */}
            {((formRef.trim() && customerAvailableRoutes.length > 0) || showAllCompanyRoutes || customAddedRoutes.length > 0) && (
              <div
                style={{
                  marginTop: '16px',
                  marginBottom: '16px',
                  background: '#FFFFFF',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '18px 20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--navy-900)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={16} style={{ color: 'var(--orange)' }} />
                        ROUTES &amp; RATES (RM)
                      </h4>
                      {customerAvailableRoutes.length > 0 && (
                        <span style={{ fontSize: '0.72rem', background: selectedRouteIds.length > 0 ? '#FEF2F2' : '#FFF7ED', color: selectedRouteIds.length > 0 ? '#DC2626' : '#C2410C', border: `1px solid ${selectedRouteIds.length > 0 ? '#FECACA' : '#FED7AA'}`, padding: '2px 8px', borderRadius: '12px', fontWeight: 800 }}>
                          {selectedRouteIds.length > 0 ? `${selectedRouteIds.length} of ${customerAvailableRoutes.length} Active` : `${customerAvailableRoutes.length} ${customerAvailableRoutes.length === 1 ? 'Route Available' : 'Routes Available'}`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--slate)', marginTop: '2px' }}>
                      — per lorry type, collection &rarr; unloading • click any route or rate pill to apply to this quotation
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {customerAvailableRoutes.length > 1 && (
                      <button
                        type="button"
                        className="btn gh sm"
                        onClick={handleToggleSelectAllRoutes}
                        style={{ fontSize: '0.74rem', height: '28px', padding: '0 8px' }}
                      >
                        {selectedRouteIds.length === customerAvailableRoutes.length ? 'Deselect All' : `Select All (${customerAvailableRoutes.length})`}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn gh sm"
                      onClick={handleAddCustomRoute}
                      style={{ fontSize: '0.74rem', height: '28px', padding: '0 8px' }}
                    >
                      + Add Route
                    </button>
                    <button
                      type="button"
                      className="btn gh sm"
                      onClick={() => setShowAllCompanyRoutes(prev => !prev)}
                      style={{ fontSize: '0.74rem', height: '28px', padding: '0 8px', color: showAllCompanyRoutes ? 'var(--orange)' : 'var(--slate)' }}
                    >
                      {showAllCompanyRoutes ? 'Show Customer Only' : 'Browse All Routes'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customerAvailableRoutes.map((r, rIdx) => {
                    const isSelected = selectedRouteIds.includes(r.id);
                    const defaultLorryTypes = r.lorryTypes || ['5 ton 17 ft', '10 ton 20- 24 ft', '30ft', '40ft'];

                    return (
                      <div
                        key={r.id || rIdx}
                        className="tab-fade-in"
                        style={{
                          background: isSelected ? 'linear-gradient(145deg, #FFFDF7 0%, #FFF7ED 100%)' : '#F8FAFC',
                          border: isSelected ? '2px solid #EA580C' : '1px solid var(--line)',
                          borderRadius: '12px',
                          padding: '12px 14px',
                          boxShadow: isSelected ? '0 4px 14px rgba(234, 88, 12, 0.12)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Line 1: Origin, Origin Zone, Destination, Destination Zone, Code Word & Select Action */}
                        <div style={{ display: 'grid', gridTemplateColumns: r.isDropoint ? 'minmax(180px, 2fr) minmax(110px, 1fr) minmax(110px, 1fr) auto' : 'minmax(140px, 1.8fr) minmax(100px, 1.2fr) minmax(140px, 1.8fr) minmax(100px, 1.2fr) minmax(90px, 1fr) auto', gap: '8px', alignItems: 'flex-end', marginBottom: '10px' }}>
                          {r.isDropoint ? (
                            <>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--orange)', textTransform: 'uppercase', marginBottom: '3px' }}>
                                  Dropoint Description
                                </label>
                                <input
                                  type="text"
                                  readOnly
                                  value={r.collection || ''}
                                  onClick={() => handleToggleCustomerRoute(r)}
                                  style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '0.82rem', background: '#F8FAFC', fontWeight: 700, color: 'var(--navy-900)', cursor: 'pointer' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '3px' }}>
                                  <MapPin size={10} style={{ color: 'var(--orange)' }} /> Zone / Region
                                </label>
                                <input
                                  type="text"
                                  readOnly
                                  value={r.collection_zone || ''}
                                  onClick={() => handleToggleCustomerRoute(r)}
                                  style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '0.82rem', background: '#F8FAFC', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '3px' }}>
                                  Code Word / Ref
                                </label>
                                <input
                                  type="text"
                                  readOnly
                                  value={r.code_word || ''}
                                  onClick={() => handleToggleCustomerRoute(r)}
                                  style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '0.82rem', background: '#F8FAFC', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '3px' }}>
                                  Collection Place
                                </label>
                                <input
                                  type="text"
                                  readOnly
                                  value={r.collection || ''}
                                  onClick={() => handleToggleCustomerRoute(r)}
                                  style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '0.82rem', background: '#F8FAFC', fontWeight: 700, color: 'var(--navy-900)', cursor: 'pointer' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '3px' }}>
                                  <MapPin size={10} style={{ color: 'var(--orange)' }} /> Collection Zone
                                </label>
                                <input
                                  type="text"
                                  readOnly
                                  value={r.collection_zone || ''}
                                  onClick={() => handleToggleCustomerRoute(r)}
                                  style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '0.82rem', background: '#F8FAFC', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '3px' }}>
                                  Unloading Place
                                </label>
                                <input
                                  type="text"
                                  readOnly
                                  value={r.unloading || ''}
                                  onClick={() => handleToggleCustomerRoute(r)}
                                  style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '0.82rem', background: '#F8FAFC', fontWeight: 700, color: 'var(--navy-900)', cursor: 'pointer' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '3px' }}>
                                  <MapPin size={10} style={{ color: 'var(--orange)' }} /> Unloading Zone
                                </label>
                                <input
                                  type="text"
                                  readOnly
                                  value={r.unloading_zone || ''}
                                  onClick={() => handleToggleCustomerRoute(r)}
                                  style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '0.82rem', background: '#F8FAFC', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '3px' }}>
                                  Code Word / Ref
                                </label>
                                <input
                                  type="text"
                                  readOnly
                                  value={r.code_word || ''}
                                  onClick={() => handleToggleCustomerRoute(r)}
                                  style={{ width: '100%', padding: '6px 9px', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '0.82rem', background: '#F8FAFC', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                />
                              </div>
                            </>
                          )}

                        </div>

                        {/* Line 2: Rates (RM) per Lorry Type (Fixed / Read-only) */}
                        <div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Rates (RM) Per Lorry Type (Click card to select):</span>
                            <span style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 600 }}>{r.source || (r.isCustom ? 'Custom Added' : 'Registered Route')}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))`, gap: '6px' }}>
                            {defaultLorryTypes.map((t, tIdx) => {
                              const rateVal = r.rates ? (r.rates[t] || '') : '';
                              
                              const getLorryCategory = (str) => {
                                if (!str) return '';
                                const txt = str.toLowerCase();
                                if (txt.includes('1 ton') || txt.includes('9 ft') || txt.includes('9ft')) return '1ton';
                                if (txt.includes('3 ton') || txt.includes('5 ton') || txt.includes('17 ft') || txt.includes('17ft') || txt.includes('3 & 5')) return '5ton';
                                if (txt.includes('10 ton') || txt.includes('24 ft') || txt.includes('24ft') || txt.includes('20- 24')) return '10ton';
                                if (txt.includes('14 ton') || txt.includes('30 ft') || txt.includes('30ft') || txt.includes('30 ft')) return '30ft';
                                if (txt.includes('20 ton') || txt.includes('40 ft') || txt.includes('40ft') || txt.includes('40 ft')) return '40ft';
                                return txt.trim();
                              };

                              const isSpecActive = isSelected && Boolean(formSpec) && (getLorryCategory(formSpec) === getLorryCategory(t));

                              return (
                                <div
                                  key={tIdx}
                                  onClick={() => handleToggleCustomerRoute(r, t, rateVal)}
                                  style={{
                                    background: isSpecActive ? '#FFF7ED' : '#FFFFFF',
                                    border: isSpecActive ? '1.5px solid #EA580C' : '1px solid var(--line)',
                                    borderRadius: '6px',
                                    padding: '6px 10px',
                                    cursor: 'pointer',
                                    transition: 'all 0.12s ease',
                                    boxShadow: isSpecActive ? '0 2px 6px rgba(234, 88, 12, 0.15)' : 'none',
                                    userSelect: 'none'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSpecActive) e.currentTarget.style.borderColor = 'var(--orange)';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSpecActive) e.currentTarget.style.borderColor = 'var(--line)';
                                  }}
                                  title={`Click to select ${t}`}
                                >
                                  <div
                                    style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      color: isSpecActive ? '#C2410C' : 'var(--slate)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      marginBottom: '2px'
                                    }}
                                  >
                                    {t}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                    <span style={{ fontSize: '0.7rem', color: isSpecActive ? '#EA580C' : 'var(--slate)', fontWeight: 700 }}>RM</span>
                                    <span
                                      style={{
                                        fontSize: '0.86rem',
                                        fontWeight: 800,
                                        color: isSpecActive ? '#9A3412' : 'var(--navy-900)',
                                        textAlign: 'right'
                                      }}
                                    >
                                      {rateVal || '—'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pickup & Dropoff Locations */}
            <div className="grid2" style={{ gap: '14px' }}>
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0 }}>Pickup Location</label>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: formRepeatOrder ? 'var(--orange)' : 'var(--slate)',
                      background: formRepeatOrder ? '#FFF7ED' : '#F1F5F9',
                      border: formRepeatOrder ? '1px solid #FDBA74' : '1px solid #E2E8F0',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      userSelect: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    title="Repeat this same order across manually selected calendar dates"
                  >
                    <input
                      type="checkbox"
                      checked={formRepeatOrder}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormRepeatOrder(checked);
                        if (checked) {
                          const today = new Date();
                          setCalYear(today.getFullYear());
                          setCalMonth(today.getMonth());
                          setSelectedRepeatDates([]);
                        }
                      }}
                      style={{ width: '13px', height: '13px', accentColor: 'var(--orange)', cursor: 'pointer', margin: 0 }}
                    />
                    <RotateCcw size={12} strokeWidth={2.4} />
                    <span>Repeat order</span>
                  </label>
                </div>
                <input value={formPickup} onChange={(e) => setFormPickup(e.target.value)} placeholder="e.g. Port Klang" />
              </div>
              <div className="field">
                <label>Dropoff Location</label>
                <input value={formDropoff} onChange={(e) => setFormDropoff(e.target.value)} placeholder="e.g. Ipoh Depot" />
              </div>
            </div>

            {/* Pickup & Dropoff Zone Text Boxes */}
            <div className="grid2" style={{ gap: '14px' }}>
              <div className="field">
                <label>Pickup Zone</label>
                <input
                  type="text"
                  placeholder="Enter pickup zone (e.g. Zone A, Central Zone)..."
                  value={formPickupZone}
                  onChange={(e) => setFormPickupZone(e.target.value)}
                  list="pickup-zone-presets-list"
                />
                <datalist id="pickup-zone-presets-list">
                  {allAvailableQuotationZones.map(z => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>Dropoff Zone</label>
                <input
                  type="text"
                  placeholder="Enter dropoff zone (e.g. Zone B, Ipoh / Perak Zone)..."
                  value={formDropoffZone}
                  onChange={(e) => setFormDropoffZone(e.target.value)}
                  list="dropoff-zone-presets-list"
                />
                <datalist id="dropoff-zone-presets-list">
                  {allAvailableQuotationZones.map(z => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Interactive Manual Calendar Selection Box */}
            {formRepeatOrder && (() => {
              const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
              const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
              const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

              const prevMonth = () => {
                if (calMonth === 0) {
                  setCalMonth(11);
                  setCalYear(calYear - 1);
                } else {
                  setCalMonth(calMonth - 1);
                }
              };

              const nextMonth = () => {
                if (calMonth === 11) {
                  setCalMonth(0);
                  setCalYear(calYear + 1);
                } else {
                  setCalMonth(calMonth + 1);
                }
              };

              const toggleDate = (isoStr) => {
                const exists = selectedRepeatDates.includes(isoStr);
                const updated = exists
                  ? selectedRepeatDates.filter(d => d !== isoStr)
                  : [...selectedRepeatDates, isoStr];
                updated.sort();
                setSelectedRepeatDates(updated);
                if (updated.length > 0) {
                  setFormOrderDate(formatISOToDMY(updated[0]));
                }
              };

              const addPreset = (daysCount, skipWeekends = false) => {
                const baseIso = parseDateToISO(formOrderDate);
                const [y, m, d] = baseIso.split('-').map(Number);
                let curr = new Date(y, m - 1, d);
                const newDates = [];
                while (newDates.length < daysCount) {
                  const dayOfWeek = curr.getDay();
                  if (!skipWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
                    newDates.push(curr.toISOString().split('T')[0]);
                  }
                  curr.setDate(curr.getDate() + 1);
                }
                const cleanDates = Array.from(new Set(newDates)).sort();
                setSelectedRepeatDates(cleanDates);
                if (cleanDates.length > 0) {
                  const firstDmy = formatISOToDMY(cleanDates[0]);
                  setFormOrderDate(firstDmy);
                  setFormArrivedDate(firstDmy);
                }
              };

              const handleAddCustomDate = () => {
                if (!customDateInput) return;
                if (!selectedRepeatDates.includes(customDateInput)) {
                  const updated = Array.from(new Set([...selectedRepeatDates, customDateInput])).sort();
                  setSelectedRepeatDates(updated);
                  if (updated.length > 0) {
                    const firstDmy = formatISOToDMY(updated[0]);
                    setFormOrderDate(firstDmy);
                    setFormArrivedDate(firstDmy);
                  }
                }
                setCustomDateInput('');
              };

              return (
                <div
                  className="tab-fade-in"
                  style={{
                    background: 'linear-gradient(145deg, #FFFDF7 0%, #FFF7ED 100%)',
                    border: '1.5px solid #FDBA74',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '14px',
                    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.09)'
                  }}
                >
                  {/* Top Bar: Title & Total Selected Count */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 800, color: '#9A3412', fontSize: '0.88rem' }}>
                      <CalendarDays size={16} color="#EA580C" strokeWidth={2.4} />
                      <span>Manual Calendar Date Selection</span>
                      <span style={{ fontSize: '0.74rem', background: '#FFEDD5', color: '#C2410C', padding: '2px 8px', borderRadius: '12px', fontWeight: 800 }}>
                        {selectedRepeatDates.length} {selectedRepeatDates.length === 1 ? 'Date Selected' : 'Dates Selected (Daily Repeat)'}
                      </span>
                    </div>

                    {/* Quick Presets */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn gh sm"
                        onClick={() => addPreset(5, false)}
                        style={{ fontSize: '0.72rem', height: '26px', padding: '2px 8px', borderColor: '#FDBA74', color: '#9A3412', background: '#FFF' }}
                        title="Add next 5 consecutive dates"
                      >
                        + Next 5 Days
                      </button>
                      <button
                        type="button"
                        className="btn gh sm"
                        onClick={() => addPreset(5, true)}
                        style={{ fontSize: '0.72rem', height: '26px', padding: '2px 8px', borderColor: '#FDBA74', color: '#9A3412', background: '#FFF' }}
                        title="Add next 5 working weekdays (Mon-Fri)"
                      >
                        + Mon-Fri
                      </button>
                      <button
                        type="button"
                        className="btn gh sm"
                        onClick={() => addPreset(7, false)}
                        style={{ fontSize: '0.72rem', height: '26px', padding: '2px 8px', borderColor: '#FDBA74', color: '#9A3412', background: '#FFF' }}
                        title="Add 1 week"
                      >
                        + 7 Days
                      </button>
                      {selectedRepeatDates.length > 0 && (
                        <button
                          type="button"
                          className="btn gh sm"
                          onClick={() => setSelectedRepeatDates([])}
                          style={{ fontSize: '0.72rem', height: '26px', padding: '2px 8px', color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)', background: '#FFF' }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Delivery Schedule Mode (Today Pickup & Today Drop vs Today Pickup & Tomorrow Drop) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '8px 12px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #FED7AA', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#9A3412', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock size={13} color="#EA580C" /> Delivery Timing:
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', color: formRepeatDeliveryMode === 'same_day' ? '#C2410C' : '#64748B', background: formRepeatDeliveryMode === 'same_day' ? '#FFF7ED' : '#F8FAFC', border: `1.5px solid ${formRepeatDeliveryMode === 'same_day' ? '#EA580C' : '#E2E8F0'}`, padding: '4px 10px', borderRadius: '6px', transition: 'all 0.12s ease' }}>
                        <input
                          type="radio"
                          name="repeatDeliveryMode"
                          value="same_day"
                          checked={formRepeatDeliveryMode === 'same_day'}
                          onChange={() => setFormRepeatDeliveryMode('same_day')}
                          style={{ accentColor: 'var(--orange)', cursor: 'pointer' }}
                        />
                        <span>📦 Today Pickup &amp; Today Drop (Same Day)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', color: formRepeatDeliveryMode === 'next_day' ? '#C2410C' : '#64748B', background: formRepeatDeliveryMode === 'next_day' ? '#FFF7ED' : '#F8FAFC', border: `1.5px solid ${formRepeatDeliveryMode === 'next_day' ? '#EA580C' : '#E2E8F0'}`, padding: '4px 10px', borderRadius: '6px', transition: 'all 0.12s ease' }}>
                        <input
                          type="radio"
                          name="repeatDeliveryMode"
                          value="next_day"
                          checked={formRepeatDeliveryMode === 'next_day'}
                          onChange={() => setFormRepeatDeliveryMode('next_day')}
                          style={{ accentColor: 'var(--orange)', cursor: 'pointer' }}
                        />
                        <span>🚚 Today Pickup &amp; Tomorrow Drop (Next Day / +1 Day)</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: '16px', alignItems: 'start' }}>
                    {/* Visual Month Calendar Card */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #FED7AA', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      {/* Month Navigation */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <button
                          type="button"
                          onClick={prevMonth}
                          style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer', padding: '4px 7px', color: '#334155', display: 'flex', alignItems: 'center' }}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0F172A' }}>
                          {monthNames[calMonth]} {calYear}
                        </span>
                        <button
                          type="button"
                          onClick={nextMonth}
                          style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer', padding: '4px 7px', color: '#334155', display: 'flex', alignItems: 'center' }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>

                      {/* Day of week headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: '3px', marginBottom: '4px' }}>
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dw, i) => (
                          <div key={i} style={{ fontSize: '0.68rem', fontWeight: 800, color: (i === 0 || i === 6) ? '#DC2626' : '#64748B', padding: '2px 0' }}>
                            {dw}
                          </div>
                        ))}
                      </div>

                      {/* Days Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                        {/* Empty offset cells */}
                        {Array.from({ length: firstDayIndex }).map((_, idx) => (
                          <div key={`empty-${idx}`} style={{ height: '28px' }} />
                        ))}

                        {/* Month Days */}
                        {Array.from({ length: daysInMonth }).map((_, idx) => {
                          const dayNum = idx + 1;
                          const isoStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                          const isSelected = selectedRepeatDates.includes(isoStr);
                          const dayOfWeek = new Date(calYear, calMonth, dayNum).getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                          return (
                            <button
                              key={dayNum}
                              type="button"
                              onClick={() => toggleDate(isoStr)}
                              style={{
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.76rem',
                                fontWeight: isSelected ? 800 : (isWeekend ? 600 : 500),
                                borderRadius: '6px',
                                border: isSelected ? '1.5px solid #EA580C' : '1px solid transparent',
                                background: isSelected ? '#EA580C' : (isWeekend ? '#FFF1F2' : '#F8FAFC'),
                                color: isSelected ? '#FFFFFF' : (isWeekend ? '#BE123C' : '#1E293B'),
                                cursor: 'pointer',
                                transition: 'all 0.12s ease',
                                padding: 0
                              }}
                              title={isSelected ? `Remove ${dayNum}/${calMonth + 1}/${calYear}` : `Add ${dayNum}/${calMonth + 1}/${calYear}`}
                            >
                              {dayNum}
                            </button>
                          );
                        })}
                      </div>

                      {/* Manual Direct Date Input */}
                      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #E2E8F0', display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input
                          type="date"
                          value={customDateInput}
                          onChange={(e) => setCustomDateInput(e.target.value)}
                          style={{ flex: 1, height: '26px', fontSize: '0.74rem', padding: '2px 6px', border: '1px solid #CBD5E1', borderRadius: '6px', background: '#FFF' }}
                        />
                        <button
                          type="button"
                          className="btn gh sm"
                          onClick={handleAddCustomDate}
                          disabled={!customDateInput}
                          style={{ height: '26px', padding: '2px 8px', fontSize: '0.72rem', borderColor: '#FDBA74', color: '#9A3412' }}
                        >
                          + Add
                        </button>
                      </div>
                    </div>

                    {/* Selected Dates Display list */}
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#9A3412', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Selected Repeat Schedule ({selectedRepeatDates.length} Days):</span>
                        <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>Click date pill to remove</span>
                      </div>

                      {selectedRepeatDates.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', background: '#FFF', border: '1px dashed #FDBA74', borderRadius: '8px', color: '#9A3412', fontSize: '0.78rem' }}>
                          No dates selected yet. Click any date on the calendar on the left to add.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '2px' }}>
                          {selectedRepeatDates.map((iso, idx) => {
                            const pickupDmy = formatISOToDMY(iso);
                            const pickupDayNm = getDayName(iso);
                            
                            // Calculate dropoff date based on selected delivery timing mode
                            let dropDmy = pickupDmy;
                            let dropDayNm = pickupDayNm;
                            if (formRepeatDeliveryMode === 'next_day') {
                              const [y, m, d] = iso.split('-').map(Number);
                              const dropDt = new Date(y, m - 1, d);
                              dropDt.setDate(dropDt.getDate() + 1);
                              dropDmy = `${String(dropDt.getDate()).padStart(2, '0')}/${String(dropDt.getMonth() + 1).padStart(2, '0')}/${dropDt.getFullYear()}`;
                              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                              dropDayNm = dayNames[dropDt.getDay()];
                            }

                            return (
                              <div
                                key={iso}
                                style={{
                                  background: '#FFFFFF',
                                  border: '1.5px solid #FDBA74',
                                  borderRadius: '8px',
                                  padding: '6px 10px',
                                  fontSize: '0.74rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  color: '#9A3412',
                                  fontWeight: 700,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                }}
                              >
                                <span style={{ color: '#EA580C', fontWeight: 800, fontSize: '0.72rem', background: '#FFF7ED', padding: '2px 5px', borderRadius: '4px', border: '1px solid #FFEDD5' }}>
                                  Day {idx + 1}
                                </span>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#16A34A', fontWeight: 800 }}>📦 Pickup:</span>
                                    <span style={{ color: '#0F172A' }}>{pickupDmy}</span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>({pickupDayNm})</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#EA580C', fontWeight: 800 }}>🚚 Drop:</span>
                                    <span style={{ color: '#0F172A' }}>{dropDmy}</span>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>({dropDayNm})</span>
                                    <span style={{ fontSize: '0.62rem', background: formRepeatDeliveryMode === 'next_day' ? '#FEF3C7' : '#DCFCE7', color: formRepeatDeliveryMode === 'next_day' ? '#B45309' : '#15803D', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                                      {formRepeatDeliveryMode === 'next_day' ? 'Tomorrow Drop' : 'Today Drop'}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleDate(iso)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#EF4444',
                                    fontWeight: 800,
                                    fontSize: '0.82rem',
                                    padding: '0 2px',
                                    marginLeft: '4px'
                                  }}
                                  title="Remove this date"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#64748B' }}>
                        ⚡ <b>Auto-Assignment:</b> When saved, the same order details (Customer, Pickup, Dropoff, Spec, Rate) will be created and dispatched for each chosen date.
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Collection & Arrival Dates and Times with Custom Calendar and Time Selectors */}
            {(() => {
              const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
              const timeSlots = [
                '06:00 AM', '07:00 AM', '08:00 AM', '08:30 AM',
                '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
                '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
                '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
                '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
                '05:00 PM', '05:30 PM', '06:00 PM', '07:00 PM',
                '08:00 PM', '09:00 PM', '10:00 PM', '11:00 PM', '12:00 AM'
              ];

              const renderCalendarPicker = (currentVal, onSelectDate) => {
                const firstDayIndex = new Date(pickerCalYear, pickerCalMonth, 1).getDay();
                const daysInMonth = new Date(pickerCalYear, pickerCalMonth + 1, 0).getDate();

                return (
                  <div
                    ref={datePickerRef}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      zIndex: 99999,
                      background: '#FFFFFF',
                      border: '1.5px solid #FDBA74',
                      borderRadius: '12px',
                      padding: '12px',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
                      width: '270px',
                      animation: 'fadeIn 0.15s ease'
                    }}
                  >
                    {/* Month Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (pickerCalMonth === 0) {
                            setPickerCalMonth(11);
                            setPickerCalYear(prev => prev - 1);
                          } else {
                            setPickerCalMonth(prev => prev - 1);
                          }
                        }}
                        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer', padding: '3px 6px', color: '#334155', display: 'flex', alignItems: 'center' }}
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0F172A' }}>
                        {monthNames[pickerCalMonth]} {pickerCalYear}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (pickerCalMonth === 11) {
                            setPickerCalMonth(0);
                            setPickerCalYear(prev => prev + 1);
                          } else {
                            setPickerCalMonth(prev => prev + 1);
                          }
                        }}
                        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer', padding: '3px 6px', color: '#334155', display: 'flex', alignItems: 'center' }}
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>

                    {/* Weekdays */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: '2px', marginBottom: '4px' }}>
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dw, i) => (
                        <div key={i} style={{ fontSize: '0.66rem', fontWeight: 800, color: (i === 0 || i === 6) ? '#DC2626' : '#64748B', padding: '2px 0' }}>
                          {dw}
                        </div>
                      ))}
                    </div>

                    {/* Days Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                      {Array.from({ length: firstDayIndex }).map((_, idx) => (
                        <div key={`empty-${idx}`} style={{ height: '26px' }} />
                      ))}
                      {Array.from({ length: daysInMonth }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const isoStr = `${pickerCalYear}-${String(pickerCalMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const dmyStr = formatISOToDMY(isoStr);
                        const isSelected = currentVal === dmyStr || currentVal === isoStr;
                        const dayOfWeek = new Date(pickerCalYear, pickerCalMonth, dayNum).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                        return (
                          <button
                            key={dayNum}
                            type="button"
                            onClick={() => {
                              onSelectDate(dmyStr);
                              setActivePicker(null);
                            }}
                            style={{
                              height: '26px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '5px',
                              border: isSelected ? '1px solid #EA580C' : '1px solid transparent',
                              background: isSelected ? '#EA580C' : isWeekend ? '#FFF1F2' : '#F8FAFC',
                              color: isSelected ? '#FFFFFF' : isWeekend ? '#DC2626' : '#1E293B',
                              fontWeight: isSelected ? 800 : 600,
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            {dayNum}
                          </button>
                        );
                      })}
                    </div>

                    {/* Quick Presets */}
                    <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0', display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
                      <button
                        type="button"
                        className="btn gh sm"
                        onClick={() => {
                          const today = new Date();
                          const dmy = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
                          onSelectDate(dmy);
                          setActivePicker(null);
                        }}
                        style={{ fontSize: '0.7rem', height: '24px', padding: '0 6px', flex: 1 }}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className="btn gh sm"
                        onClick={() => {
                          const tmrw = new Date();
                          tmrw.setDate(tmrw.getDate() + 1);
                          const dmy = `${String(tmrw.getDate()).padStart(2, '0')}/${String(tmrw.getMonth() + 1).padStart(2, '0')}/${tmrw.getFullYear()}`;
                          onSelectDate(dmy);
                          setActivePicker(null);
                        }}
                        style={{ fontSize: '0.7rem', height: '24px', padding: '0 6px', flex: 1 }}
                      >
                        Tomorrow
                      </button>
                    </div>
                  </div>
                );
              };

              const renderTimePicker = (currentVal, onSelectTime, label) => {
                const cleanVal = (currentVal || '').replace(/^Before\s+/i, '').trim();

                return (
                  <div
                    ref={datePickerRef}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      zIndex: 99999,
                      background: '#FFFFFF',
                      border: '1.5px solid #93C5FD',
                      borderRadius: '12px',
                      padding: '12px',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
                      width: '260px',
                      animation: 'fadeIn 0.15s ease'
                    }}
                  >
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} style={{ color: '#2563EB' }} /> {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActivePicker(null)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 0 }}
                      >
                        <X size={13} />
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
                      {timeSlots.map((slot) => {
                        const isSelected = cleanVal.toLowerCase() === slot.toLowerCase();
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => {
                              onSelectTime(slot);
                              setActivePicker(null);
                            }}
                            style={{
                              padding: '5px 2px',
                              borderRadius: '5px',
                              border: isSelected ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                              background: isSelected ? '#EFF6FF' : '#F8FAFC',
                              color: isSelected ? '#1D4ED8' : '#334155',
                              fontWeight: isSelected ? 800 : 600,
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.1s ease'
                            }}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              };

              return (
                <>
                  <div className="grid2" style={{ gap: '14px', marginBottom: '14px' }}>
                    {/* 1. Client Order / Collection Date */}
                    <div className="field" style={{ position: 'relative' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Client Order / Collection Date</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--orange)', fontWeight: 700, cursor: 'pointer' }} onClick={() => setActivePicker(activePicker === 'collectionDate' ? null : 'collectionDate')}>
                          📅 Select Date
                        </span>
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          value={formOrderDate}
                          onChange={(e) => setFormOrderDate(e.target.value)}
                          placeholder="e.g. 20/07/2026"
                          style={{ paddingRight: '36px' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (formOrderDate) {
                              const iso = parseDateToISO(formOrderDate);
                              const parts = iso.split('-').map(Number);
                              if (parts.length === 3 && !isNaN(parts[0])) {
                                setPickerCalYear(parts[0]);
                                setPickerCalMonth(parts[1] - 1);
                              }
                            }
                            setActivePicker(activePicker === 'collectionDate' ? null : 'collectionDate');
                          }}
                          style={{
                            position: 'absolute',
                            right: '6px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--orange)',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Open Calendar Date Picker"
                        >
                          <Calendar size={16} />
                        </button>
                      </div>
                      {activePicker === 'collectionDate' && renderCalendarPicker(formOrderDate, (newDate) => {
                        setFormOrderDate(newDate);
                        if (!formArrivedDate || formArrivedDate === formOrderDate) {
                          setFormArrivedDate(newDate);
                        }
                      })}
                    </div>

                    {/* 2. Pickup Time (Part Ready) */}
                    <div className="field" style={{ position: 'relative' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Pickup Time (Part Ready)</span>
                        <span style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 700, cursor: 'pointer' }} onClick={() => setActivePicker(activePicker === 'pickupTime' ? null : 'pickupTime')}>
                          🕒 Select Time
                        </span>
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          value={formPickupTime}
                          onChange={(e) => setFormPickupTime(e.target.value)}
                          placeholder="e.g. 8:00 AM"
                          style={{ paddingRight: '36px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setActivePicker(activePicker === 'pickupTime' ? null : 'pickupTime')}
                          style={{
                            position: 'absolute',
                            right: '6px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#2563EB',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Open Time Picker"
                        >
                          <Clock size={16} />
                        </button>
                      </div>
                      {activePicker === 'pickupTime' && renderTimePicker(formPickupTime, (newTime) => setFormPickupTime(newTime), 'Pickup Time')}
                    </div>
                  </div>

                  <div className="grid2" style={{ gap: '14px', marginBottom: '14px' }}>
                    {/* 3. Arrived Date / Delivery Date */}
                    <div className="field" style={{ position: 'relative' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Arrived Date / Delivery Date</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--orange)', fontWeight: 700, cursor: 'pointer' }} onClick={() => setActivePicker(activePicker === 'arrivedDate' ? null : 'arrivedDate')}>
                          📅 Select Date
                        </span>
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          value={formArrivedDate}
                          onChange={(e) => setFormArrivedDate(e.target.value)}
                          placeholder="e.g. 20/07/2026"
                          style={{ paddingRight: '36px' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (formArrivedDate) {
                              const iso = parseDateToISO(formArrivedDate);
                              const parts = iso.split('-').map(Number);
                              if (parts.length === 3 && !isNaN(parts[0])) {
                                setPickerCalYear(parts[0]);
                                setPickerCalMonth(parts[1] - 1);
                              }
                            }
                            setActivePicker(activePicker === 'arrivedDate' ? null : 'arrivedDate');
                          }}
                          style={{
                            position: 'absolute',
                            right: '6px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--orange)',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Open Calendar Date Picker"
                        >
                          <Calendar size={16} />
                        </button>
                      </div>
                      {activePicker === 'arrivedDate' && renderCalendarPicker(formArrivedDate, (newDate) => setFormArrivedDate(newDate))}
                    </div>

                    {/* 4. Dropoff Time (Deadline) */}
                    <div className="field" style={{ position: 'relative' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Dropoff Time (Deadline)</span>
                        <span style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 700, cursor: 'pointer' }} onClick={() => setActivePicker(activePicker === 'dropoffTime' ? null : 'dropoffTime')}>
                          🕒 Select Time
                        </span>
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          value={formDropoffTime.replace(/^Before\s+/i, '')}
                          onChange={(e) => setFormDropoffTime(e.target.value.replace(/^Before\s+/i, ''))}
                          placeholder="e.g. 8:00 AM"
                          style={{ paddingRight: '36px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setActivePicker(activePicker === 'dropoffTime' ? null : 'dropoffTime')}
                          style={{
                            position: 'absolute',
                            right: '6px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#2563EB',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Open Time Picker"
                        >
                          <Clock size={16} />
                        </button>
                      </div>
                      {activePicker === 'dropoffTime' && renderTimePicker(formDropoffTime, (newTime) => setFormDropoffTime(newTime), 'Dropoff Time')}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Lorry Spec & Cargo / Weight */}
            <div className="grid2" style={{ gap: '14px' }}>
              <div className="field">
                <label>Lorry Spec</label>
                <input placeholder="30ft SIDE CURTAIN" value={formSpec} onChange={(e) => setFormSpec(e.target.value)} />
              </div>
              <div className="field">
                <label>Cargo / Weight</label>
                <input placeholder="12MT" value={formWeight} onChange={(e) => setFormWeight(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Special Instructions</label>
              <input value={formSpecial} onChange={(e) => setFormSpecial(e.target.value)} placeholder="Handle with care / blue canvas needed" />
            </div>

            {/* Financials & Trip Rate */}
            <div className="grid2" style={{ gap: '14px', alignItems: 'center' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Trip Rate (RM)</label>
                <input type="number" step="0.01" value={formRate} onChange={(e) => setFormRate(e.target.value)} placeholder="0.00" />
              </div>
              <div className="field" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}>
                  <input type="checkbox" checked={formUrgent} onChange={(e) => setFormUrgent(e.target.checked)} style={{ width: 'auto', marginRight: '6px', cursor: 'pointer' }} /> 
                  Urgent Handling
                </label>
                <div style={{ fontSize: '0.86rem', color: 'var(--slate)', fontWeight: 600, background: '#F8FAFC', padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Total Rate:</span>
                  <b style={{ color: 'var(--navy-900)', fontSize: '1rem' }}>{fmtMoney(formRate || 0)}</b>
                </div>
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="formfoot" style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <button className="btn pri" onClick={() => saveQuote('sent')}>
                Save &amp; Send <kbd className="hot">⌘</kbd><kbd className="hot">↵</kbd>
              </button>
              <button className="btn gh" onClick={() => saveQuote('draft')}>
                Save Draft <kbd>⌘</kbd><kbd>S</kbd>
              </button>
              <button className="btn gh" style={{ marginLeft: 'auto' }} onClick={() => setShowNewPanel(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="statsrow">
        <span className={`statchip ${activeFilter === 'all' ? 'on' : ''}`} onClick={() => setActiveFilter('all')}>
          All Quotes<b>{tripOrders.length}</b>
        </span>
        <span className={`statchip ${activeFilter === 'draft' ? 'on' : ''}`} onClick={() => setActiveFilter('draft')}>
          Draft<b>{cnt('draft')}</b>
        </span>
        <span className={`statchip ${activeFilter === 'sent' ? 'on' : ''}`} onClick={() => setActiveFilter('sent')}>
          Sent<b>{cnt('sent')}</b>
        </span>
        <span className={`statchip ${activeFilter === 'client_confirmed' ? 'on' : ''}`} onClick={() => setActiveFilter('client_confirmed')}>
          Client Confirmed<b>{cnt('client_confirmed')}</b>
        </span>
        <span className={`statchip ${activeFilter === 'approved' ? 'on' : ''}`} onClick={() => setActiveFilter('approved')}>
          Approved<b>{cnt('approved')}</b>
        </span>
      </div>

      {/* Desktop Table View */}
      <div className="desktop-table-container">
        <div className="tablecard" style={{ width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
          <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '13%', padding: '10px 8px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Quote # &amp; Date</th>
                <th style={{ width: '16%', padding: '10px 8px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Customer</th>
                <th style={{ width: '22%', padding: '10px 8px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Route &amp; Date</th>
                <th style={{ width: '13%', padding: '10px 8px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Cargo &amp; Vehicle</th>
                <th style={{ width: '9%', padding: '10px 6px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>Rate</th>
                <th style={{ width: '10%', padding: '10px 4px', verticalAlign: 'middle', textAlign: 'center', fontSize: '0.74rem' }}>Status</th>
                <th style={{ width: '17%', padding: '10px 8px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.length > 0 ? (
                filteredQuotes.map((x) => {
                  const pickupStr = x.pickup_location || x.pickup || '—';
                  const dropoffStr = x.dropoff_location || x.dropoff || '—';
                  const rateVal = x.quoted_rate || x.rate_amount || 0;
                  const { total } = withSST(rateVal);

                  // Clean and compact customer reference display
                  let refDisplay = x.customer_ref || '';
                  if (refDisplay.length > 32) {
                    refDisplay = refDisplay.slice(0, 30) + '…';
                  }

                  return (
                    <tr key={x.id} className={`tab-fade-in ${x.id === focusId ? 'focus' : ''}`} onClick={() => setFocusId(x.id)} style={{ cursor: 'pointer' }}>
                      {/* Quote # & Date */}
                      <td style={{ verticalAlign: 'middle', padding: '10px 8px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                          <span className="jno-pill" style={{ fontSize: '0.74rem', padding: '2px 6px', fontWeight: 800 }}>{x.quote_no}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {Boolean(x.urgent) && (
                              <span className="badge urgent" style={{ fontSize: '0.56rem', padding: '0 4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                <AlertTriangle size={8} strokeWidth={2.5} /> Urgent
                              </span>
                            )}
                            <span style={{ fontSize: '0.72rem', color: 'var(--navy-900)', fontWeight: 700 }}>
                              {getQuoteDisplayDate(x)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Customer */}
                      <td style={{ verticalAlign: 'middle', padding: '10px 8px', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={x.customer?.company_name || (x.pickup_location && !x.pickup_location.toLowerCase().startsWith('pt ') ? x.pickup_location.split(',')[0] : 'Direct Customer')}>
                          {x.customer?.company_name || (x.pickup_location && !x.pickup_location.toLowerCase().startsWith('pt ') ? x.pickup_location.split(',')[0] : 'Direct Customer')}
                        </div>
                        {x.customer_ref && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--slate)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={x.customer_ref}>
                            Ref: {refDisplay}
                          </div>
                        )}
                      </td>

                      {/* Route & Date */}
                      <td style={{ verticalAlign: 'middle', padding: '10px 8px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '3px 6px', borderRadius: '6px', border: '1px solid #E2E8F0', width: '100%', boxSizing: 'border-box' }}>
                          <span className="r-dot pickup" style={{ flexShrink: 0 }}></span>
                          <span className="r-name" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)' }} title={pickupStr}>{pickupStr}</span>
                          <ArrowRight size={11} strokeWidth={2.4} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                          <span className="r-dot dropoff" style={{ flexShrink: 0 }}></span>
                          <span className="r-name" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)' }} title={dropoffStr}>{dropoffStr}</span>
                        </div>
                        {(x.collection_date || x.order_date) && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--slate)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Calendar size={10} strokeWidth={2.2} />
                            <span>{x.collection_date || x.order_date}</span>
                          </div>
                        )}
                      </td>

                      {/* Cargo & Vehicle */}
                      <td style={{ verticalAlign: 'middle', padding: '10px 8px', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', overflow: 'hidden' }}>
                          {x.lorry_spec && (
                            <span className="cargo-spec-pill" style={{ fontSize: '0.68rem', padding: '1px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85px', flexShrink: 1 }} title={x.lorry_spec}>
                              {x.lorry_spec}
                            </span>
                          )}
                          {x.weight_desc && (
                            <span className="cargo-spec-pill" style={{ fontSize: '0.68rem', padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0 }} title={x.weight_desc}>
                              {x.weight_desc}
                            </span>
                          )}
                          {x.special_instructions && (
                            <span className="badge amber" style={{ fontSize: '0.62rem', padding: '1px 4px', display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }} title={x.special_instructions}>
                              <AlertTriangle size={8} strokeWidth={2.5} /> Notes
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Rate */}
                      <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '10px 6px', whiteSpace: 'nowrap' }}>
                        <b style={{ color: 'var(--navy-900)', fontSize: '0.88rem', fontWeight: 800 }}>{fmtMoney(rateVal)}</b>
                      </td>

                      {/* Status */}
                      <td style={{ verticalAlign: 'middle', textAlign: 'center', padding: '10px 4px', whiteSpace: 'nowrap' }}>
                        <span className={`badge ${badgeClass(x.effectiveStatus || x.status)}`} style={{ fontSize: '0.66rem', padding: '3px 8px', display: 'inline-block', minWidth: '60px', textAlign: 'center', fontWeight: 700 }}>
                          {(x.effectiveStatus || x.status) === 'client_confirmed' ? 'Confirmed' : (x.effectiveStatus || x.status).replace('_', ' ').toUpperCase()}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '10px 8px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', flexWrap: 'nowrap' }}>
                          {/* Clean View / Print Button */}
                          <button
                            className="btn gh sm"
                            style={{ height: '26px', padding: '0 6px', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0, whiteSpace: 'nowrap' }}
                            onClick={(e) => { e.stopPropagation(); setViewModalQuote(x); }}
                            title="View & Print Official Quotation Letterhead / Share via WhatsApp & Email"
                          >
                            <Printer size={11} strokeWidth={2.2} />
                            <span>View / print</span>
                          </button>

                          {(() => {
                            const isExistingCustRow = checkIsExistingCustomer(x.customer_id, x.customer?.company_name, x, customers);
                            if (isExistingCustRow || x.effectiveStatus === 'approved' || x.effectiveStatus === 'assigned' || x.effectiveStatus === 'in_transit' || x.effectiveStatus === 'delivered') {
                              return (
                                <button className="btn navy sm" style={{ height: '26px', padding: '0 6px', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); navigate('/board'); }}>
                                  <span>Job Board</span>
                                  <ChevronRight size={11} strokeWidth={2.4} />
                                </button>
                              );
                            }
                            return (
                              <>
                                {x.status === 'draft' && (
                                  <button className="btn pri sm" style={{ height: '26px', padding: '0 6px', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); markStatus(x.id, 'sent'); }}>
                                    <Send size={10} strokeWidth={2.2} />
                                    Send
                                  </button>
                                )}
                                {x.status === 'sent' && (
                                  <button className="btn pri sm" style={{ height: '26px', padding: '0 6px', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); markStatus(x.id, 'client_confirmed'); }}>
                                    <Check size={11} strokeWidth={2.5} />
                                    Confirm
                                  </button>
                                )}
                                {x.status === 'client_confirmed' && (
                                  <button className="btn navy sm" style={{ height: '26px', padding: '0 6px', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); navigate('/approvals'); }}>
                                    <span>Approval</span>
                                    <ChevronRight size={11} strokeWidth={2.4} />
                                  </button>
                                )}
                              </>
                            );
                          })()}
                          <button
                            className="btn danger sm"
                            style={{ height: '26px', width: '26px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            onClick={(e) => deleteQuote(x.id, e)}
                            title="Delete this quotation"
                          >
                            <Trash2 size={11} strokeWidth={2.2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: 'var(--slate)', fontWeight: 600 }}>No quotations matching the selected filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards View */}
      <div className="mobile-cards-container">
        {filteredQuotes.length > 0 ? (
          filteredQuotes.map((x) => {
            const pickupStr = x.pickup_location || x.pickup || '—';
            const dropoffStr = x.dropoff_location || x.dropoff || '—';
            const rateVal = x.quoted_rate || x.rate_amount || 0;

            return (
              <div key={x.id} className={`mobile-card ${x.id === focusId ? 'focus' : ''}`} onClick={() => setFocusId(x.id)}>
                <div className="mobile-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="jno-pill" style={{ fontSize: '0.82rem', padding: '2px 8px', fontWeight: 800 }}>{x.quote_no}</span>
                    {Boolean(x.urgent) && (
                      <span className="badge urgent" style={{ fontSize: '0.62rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <AlertTriangle size={10} strokeWidth={2.5} /> Urgent
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--navy-900)', fontWeight: 700 }}>
                      {getQuoteDisplayDate(x)}
                    </span>
                    <span className={`badge ${badgeClass(x.effectiveStatus || x.status)}`} style={{ fontSize: '0.68rem', padding: '3px 8px' }}>
                      {(x.effectiveStatus || x.status) === 'client_confirmed' ? 'Confirmed' : (x.effectiveStatus || x.status).replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="mobile-card-title">{x.customer?.company_name || 'Direct Customer'}</div>
                  {x.customer_ref && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600 }}>Ref / Contact:</span> {x.customer_ref}
                    </div>
                  )}
                </div>

                {/* Route Box (Full 2-Step Display) */}
                <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem' }}>
                    <span className="r-dot pickup" style={{ flexShrink: 0, marginTop: '4px' }}></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: '#16A34A', fontSize: '0.68rem', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Origin Pickup</span>
                      <span style={{ fontWeight: 700, color: 'var(--navy-900)', wordBreak: 'break-word', display: 'block' }}>{pickupStr}</span>
                    </div>
                  </div>
                  <div style={{ height: '1px', background: '#E2E8F0', margin: '2px 0 2px 18px' }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem' }}>
                    <span className="r-dot dropoff" style={{ flexShrink: 0, marginTop: '4px' }}></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: '#DC2626', fontSize: '0.68rem', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Destination Dropoff</span>
                      <span style={{ fontWeight: 700, color: 'var(--navy-900)', wordBreak: 'break-word', display: 'block' }}>{dropoffStr}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {x.lorry_spec && <span className="cargo-spec-pill" style={{ fontSize: '0.74rem', padding: '4px 10px' }}>{x.lorry_spec}</span>}
                  {x.weight_desc && <span className="cargo-spec-pill" style={{ fontSize: '0.74rem', padding: '4px 10px' }}>{x.weight_desc}</span>}
                </div>

                <div className="mobile-card-footer" style={{ flexDirection: 'column', gap: '10px', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--slate)', fontWeight: 600 }}>Total Rate</span>
                    <b style={{ color: 'var(--orange)', fontSize: '1.15rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtMoney(rateVal)}</b>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '8px', width: '100%' }}>
                    <button
                      className="btn gh sm"
                      style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%' }}
                      onClick={(e) => { e.stopPropagation(); setViewModalQuote(x); }}
                    >
                      <Printer size={14} strokeWidth={2.2} /> View / print
                    </button>
                    {(() => {
                      const isExistingCustRow = checkIsExistingCustomer(x.customer_id, x.customer?.company_name, x, customers);
                      if (isExistingCustRow || x.effectiveStatus === 'approved' || x.effectiveStatus === 'assigned' || x.effectiveStatus === 'in_transit' || x.effectiveStatus === 'delivered') {
                        return (
                          <button className="btn navy sm" style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%' }} onClick={(e) => { e.stopPropagation(); navigate('/board'); }}>
                            <span>Job Board</span>
                            <ChevronRight size={14} strokeWidth={2.4} />
                          </button>
                        );
                      }
                      return (
                        <>
                          {x.status === 'draft' && (
                            <button className="btn pri sm" style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%' }} onClick={(e) => { e.stopPropagation(); markStatus(x.id, 'sent'); }}>
                              <Send size={13} strokeWidth={2.2} /> Send
                            </button>
                          )}
                          {x.status === 'sent' && (
                            <button className="btn pri sm" style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%' }} onClick={(e) => { e.stopPropagation(); markStatus(x.id, 'client_confirmed'); }}>
                              <Check size={14} strokeWidth={2.5} /> Confirm
                            </button>
                          )}
                          {x.status === 'client_confirmed' && (
                            <button className="btn navy sm" style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', width: '100%' }} onClick={(e) => { e.stopPropagation(); navigate('/approvals'); }}>
                              <span>Approval</span>
                              <ChevronRight size={14} strokeWidth={2.4} />
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)', background: '#FFFFFF', borderRadius: '16px', border: '1px solid var(--line)' }}>
            No quotations matching the selected filter.
          </div>
        )}
      </div>

      {/* Full Quotation Details & Print Letterhead Modal Popup */}
      {viewModalQuote && (
        <QuotationDetailModal
          quote={viewModalQuote}
          customers={customers}
          onClose={() => setViewModalQuote(null)}
          onEdit={(id) => {
            setViewModalQuote(null);
            startEdit(id);
          }}
          onNavigateBoard={() => {
            setViewModalQuote(null);
            navigate('/board');
          }}
          onNavigateApprovals={() => {
            setViewModalQuote(null);
            navigate('/approvals');
          }}
        />
      )}
    </div>
  );
}

// Rich Popup Modal for Full Quotation Details with Official Letterhead View, Print & WhatsApp/Email Share
function QuotationDetailModal({ quote, customers, onClose, onEdit, onNavigateBoard, onNavigateApprovals }) {
  const { toast } = useToast();

  const pickupStr = quote.pickup_location || quote.pickup || '—';
  const dropoffStr = quote.dropoff_location || quote.dropoff || '—';
  const rateVal = parseFloat(quote.quoted_rate) || parseFloat(quote.rate_amount) || 0;

  // Letterhead company settings
  const settings = useMemo(() => {
    try {
      const saved = localStorage.getItem('rens_letterhead_settings_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name && parsed.name.trim()) return parsed;
      }
    } catch (_) {}
    return {
      name: 'RENS DYNAMICS LOGISTICS SDN. BHD.',
      regno: '950592-K',
      address: 'P.T 2140, Sri Senawang Light Industrial Centre, 70450 Seremban, Negeri Sembilan.',
      phone: '012-616 8449',
      email: 'rensdynamic.logistics@gmail.com'
    };
  }, []);

  const custObj = quote.customer || customers.find(c => String(c.id) === String(quote.customer_id));
  const companyName = custObj?.company_name || quote.customer_name || 'TEST';
  const contactPerson = custObj?.contact_person || quote.contact_person || 'kum';
  const customerPhone = custObj?.phone || quote.phone || '';
  const customerEmail = custObj?.email || quote.email || '';
  const quoteRef = quote.quote_no || quote.customer_ref || 'Rens20260801';
  const displayDate = quote.collection_date || quote.order_date || (quote.created_at ? fmtDate(quote.created_at) : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
  const paymentTerms = quote.payment_terms || custObj?.payment_terms || '30 credit from date of invoice.';

  const normalizeZoneStr = (z) => {
    if (!z) return null;
    const str = String(z).trim();
    if (/^[A-Z]$/i.test(str)) return `Zone ${str.toUpperCase()}`;
    if (/^zone\s*[A-Z]$/i.test(str)) return `Zone ${str.replace(/zone\s*/i, '').toUpperCase()}`;
    return str;
  };

  const detectQuoteZone = (locStr) => {
    if (!locStr) return 'Zone A';
    const d = String(locStr).trim();
    if (/^[A-Z]$/i.test(d)) return `Zone ${d.toUpperCase()}`;
    if (/^zone\s*[A-Z]$/i.test(d)) return `Zone ${d.replace(/zone\s*/i, '').toUpperCase()}`;
    const lower = d.toLowerCase();
    if (lower.includes('bangi') || lower.includes('semenyih') || lower.includes('kajang') || lower.includes('cyberjaya') || lower.includes('putrajaya') || lower.includes('sepang') || lower.includes('klia') || lower.includes('cheras')) return 'Zone B';
    if (lower.includes('klang') || lower.includes('port klang') || lower.includes('shah alam') || lower.includes('subang') || lower.includes('petaling') || lower.includes('puchong') || lower.includes('kuala lumpur') || lower.includes('kl') || lower.includes('selayang') || lower.includes('rawang') || lower.includes('batu caves') || lower.includes('sunway')) return 'Zone C';
    if (lower.includes('johor') || lower.includes('pasir gudang') || lower.includes('tangkak') || lower.includes('muar') || lower.includes('batu pahat') || lower.includes('kluang') || lower.includes('kulai') || lower.includes('ipoh') || lower.includes('penang') || lower.includes('perak') || lower.includes('kedah') || lower.includes('kuantan') || lower.includes('pahang') || lower.includes('perlis') || lower.includes('terengganu') || lower.includes('kelantan')) return 'Zone D';
    if (lower.includes('melaka') || lower.includes('nilai') || lower.includes('seremban') || lower.includes('senawang') || lower.includes('negeri sembilan') || lower.includes('rembau') || lower.includes('ayer keroh')) return 'Zone A';
    return 'Zone A';
  };

  const pickupZone = normalizeZoneStr(quote.pickup_zone || quote.collection_zone || quote.origin_zone || quote.zone) || (pickupStr && pickupStr !== '—' ? detectQuoteZone(pickupStr) : 'Zone A');
  const dropoffZone = normalizeZoneStr(quote.dropoff_zone || quote.drop_zone || quote.delivery_zone || quote.destination_zone) || (dropoffStr && dropoffStr !== '—' ? detectQuoteZone(dropoffStr) : 'Zone B');

  let parsedSpecial = null;
  try {
    if (quote.special_instructions && typeof quote.special_instructions === 'string' && quote.special_instructions.startsWith('{')) {
      parsedSpecial = JSON.parse(quote.special_instructions);
    }
  } catch (_) {}

  // Lorry types to display across the table
  const defaultLorryColumns = ['1 ton 9 ft', '3 & 5 ton 17 ft', '10 ton 24ft', '14 ton 30ft', '20 ton 40ft'];
  const tableLorryTypes = (parsedSpecial?.lorryTypes && Array.isArray(parsedSpecial.lorryTypes) && parsedSpecial.lorryTypes.length > 0)
    ? parsedSpecial.lorryTypes
    : defaultLorryColumns;

  // WhatsApp Share
  const handleSendWhatsApp = () => {
    let targetPhone = (customerPhone || '').trim();
    if (!targetPhone) {
      targetPhone = window.prompt(`Enter WhatsApp mobile phone number for ${companyName}:`, '');
      if (!targetPhone) return;
    }

    const rawPhone = targetPhone.replace(/[^\d+]/g, '');
    let cleanPhone = rawPhone;
    if (cleanPhone.startsWith('0')) cleanPhone = '60' + cleanPhone.slice(1);
    if (!cleanPhone) {
      toast('Invalid phone number provided.', 'err');
      return;
    }

    const text = 
`📄 *OFFICIAL TRANSPORT QUOTATION*
*${settings.name || 'RENS DYNAMICS LOGISTICS SDN. BHD.'}* (${settings.regno || '950592-K'})

*To:* ${companyName}
${contactPerson ? `*Attn:* ${contactPerson}\n` : ''}*Our Ref:* ${quoteRef}
*Date:* ${displayDate}
${quote.customer_ref ? `*Customer Ref / PO:* ${quote.customer_ref}\n` : ''}
*TRANSPORT DETAILS:*
• *Route:* ${pickupStr} (${pickupZone}) ➔ ${dropoffStr} (${dropoffZone})
• *Vehicle:* ${quote.lorry_spec || '3 & 5 ton 17 ft'}
${quote.weight_desc ? `• *Cargo / Weight:* ${quote.weight_desc}\n` : ''}• *Collection:* ${quote.collection_date || quote.order_date || 'Today'} (${quote.pickup_time || '8:00 AM'})
• *Delivery:* ${quote.delivery_date || quote.arrived_date || 'Same Day'} (${quote.dropoff_time || 'Before 8:00 AM'})
${quote.special_instructions && !quote.special_instructions.startsWith('{') ? `• *Instructions:* ${quote.special_instructions}\n` : ''}
*QUOTED RATE:* *RM ${rateVal.toFixed(2)}*

*Payment Terms:* ${paymentTerms}

We trust the above price is reasonable and look forward to your valuable support and prompt service at all times!

*Operations & Dispatch Dept*
*${settings.name || 'Rens Dynamics Logistics Sdn. Bhd.'}*
Tel: ${settings.phone || '012-616 8449'} | Email: ${settings.email || 'rensdynamic.logistics@gmail.com'}`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    toast(`Opening WhatsApp quotation for ${companyName}`, 'ok');
  };

  // Email Share
  const handleSendEmail = () => {
    let targetEmail = (customerEmail || '').trim();
    if (!targetEmail) {
      targetEmail = window.prompt(`Enter recipient email address for ${companyName}:`, '');
      if (!targetEmail) return;
    }

    const subject = `Transport Quotation: ${quoteRef} - ${companyName} [${settings.name || 'Rens Dynamics Logistics'}]`;
    const body = 
`Dear ${contactPerson || companyName},

With regards to the above mentioned subject, we are pleased to submit our competitive rate for your kind perusal and consideration:

Quotation Ref: ${quoteRef}
Date: ${displayDate}
${quote.customer_ref ? `Customer PO / Ref: ${quote.customer_ref}\n` : ''}
TRANSPORT SPECIFICATIONS:
- Origin (Pickup): ${pickupStr} (${pickupZone})
- Destination (Dropoff): ${dropoffStr} (${dropoffZone})
- Vehicle Type: ${quote.lorry_spec || '3 & 5 ton 17 ft'}
- Cargo / Weight: ${quote.weight_desc || quote.cargo_desc || 'General Cargo'}
- Collection Date: ${quote.collection_date || quote.order_date || 'Today'} (${quote.pickup_time || '8:00 AM'})
- Delivery Date: ${quote.delivery_date || quote.arrived_date || 'Same Day'} (${quote.dropoff_time || 'Before 8:00 AM'})
${quote.special_instructions && !quote.special_instructions.startsWith('{') ? `- Special Notes: ${quote.special_instructions}\n` : ''}
QUOTED RATE: RM ${rateVal.toFixed(2)}

Payment Terms: ${paymentTerms}

We trust the above price is reasonable and look forward to your valuable support and assuring prompt service at all times.

Thank you in advance.

Best regards,
Operations & Logistics Team
${settings.name || 'RENS DYNAMICS LOGISTICS SDN. BHD.'}
Tel: ${settings.phone || '012-616 8449'}
Email: ${settings.email || 'rensdynamic.logistics@gmail.com'}`;

    const mailto = `mailto:${targetEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    toast(`Opening email client for ${companyName}`, 'ok');
  };

  const handlePrint = () => {
    window.print();
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
      id="quoteViewOverlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'quoteViewOverlay' && onClose()}
    >
      <div
        className="modalbox tab-fade-in"
        style={{
          maxWidth: '860px',
          width: '100%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#FFFFFF'
        }}
      >
        {/* Top Action Toolbar (Identical to Image 3 Header) */}
        <div
          className="print-hide"
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FFFFFF',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Send WhatsApp Button */}
            <button
              type="button"
              className="btn gh"
              onClick={handleSendWhatsApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: '#16A34A',
                borderColor: '#86EFAC',
                background: '#F0FDF4',
                fontWeight: 700,
                fontSize: '0.84rem',
                padding: '7px 16px',
                borderRadius: '8px'
              }}
            >
              <MessageSquare size={16} strokeWidth={2.4} />
              <span>Send WhatsApp</span>
            </button>

            {/* Send Email Button */}
            <button
              type="button"
              className="btn gh"
              onClick={handleSendEmail}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: '#2563EB',
                borderColor: '#BFDBFE',
                background: '#EFF6FF',
                fontWeight: 700,
                fontSize: '0.84rem',
                padding: '7px 16px',
                borderRadius: '8px'
              }}
            >
              <Mail size={16} strokeWidth={2.4} />
              <span>Send Email</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Close Button */}
            <button
              type="button"
              className="btn gh"
              onClick={onClose}
              style={{
                fontSize: '0.84rem',
                padding: '7px 18px',
                borderRadius: '8px',
                color: '#334155',
                borderColor: '#CBD5E1'
              }}
            >
              Close
            </button>

            {/* Print Button */}
            <button
              type="button"
              className="btn pri"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.84rem',
                fontWeight: 700,
                padding: '7px 20px',
                borderRadius: '8px',
                background: 'var(--orange)',
                color: '#FFFFFF',
                borderColor: 'var(--orange)'
              }}
            >
              <Printer size={16} strokeWidth={2.2} />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Scrollable Letterhead Paper (Exact Image 3 Layout) */}
        <div style={{ padding: '24px 32px 32px 32px', overflowY: 'auto', flex: 1, background: '#FFFFFF' }}>
          <div
            className="printable-sheet tab-fade-in"
            style={{
              background: '#FFFFFF',
              color: '#000000',
              fontFamily: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            {/* Company Header with Logo & Centered Address */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', borderBottom: '2px solid #000000', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}>
                <img src={logoImg} alt="Rens Dynamics" style={{ height: '52px', width: 'auto', objectFit: 'contain' }} />
              </div>
              <div style={{ textAlign: 'center', width: '100%', paddingLeft: '80px', paddingRight: '20px' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#000000', letterSpacing: '0.5px' }}>
                  {settings.name || 'RENS DYNAMICS LOGISTICS SDN. BHD.'} <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>({settings.regno || '950592-K'})</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#111111', marginTop: '3px', lineHeight: 1.35 }}>
                  {settings.address || 'P.T 2140, Sri Senawang Light Industrial Centre, 70450 Seremban, Negeri Sembilan.'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#111111', marginTop: '2px' }}>
                  <strong>H/P :</strong> {settings.phone || '012-616 8449'} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>email :</strong> {settings.email || 'rensdynamic.logistics@gmail.com'}
                </div>
              </div>
            </div>

            {/* 2-Column To / Our Ref Metadata Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '16px', fontSize: '0.86rem', color: '#000000' }}>
              {/* Left Column: To & Attn */}
              <div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <strong style={{ minWidth: '42px' }}>To :</strong>
                  <div>
                    <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>
                      {companyName}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#222222', marginTop: '2px', lineHeight: 1.4 }}>
                      {custObj?.billing_address || 'address'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <strong style={{ minWidth: '42px' }}>Attn:</strong>
                  <div style={{ fontWeight: 800 }}>
                    {contactPerson}
                  </div>
                </div>
              </div>

              {/* Right Column: Quotation Specs Table */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.86rem', width: 'auto' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>Our Ref :</td>
                      <td style={{ padding: '2px 0', fontWeight: 700 }}>{quoteRef}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>Sender :</td>
                      <td style={{ padding: '2px 0', fontWeight: 700 }}>Rauf Rao</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>H/P :</td>
                      <td style={{ padding: '2px 0' }}>012-6078449</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>Date :</td>
                      <td style={{ padding: '2px 0' }}>{displayDate}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '2px 8px 2px 0', fontWeight: 900, textAlign: 'right' }}>Rev :</td>
                      <td style={{ padding: '2px 0' }}>1 0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Centered Document Title */}
            <div style={{ textAlign: 'center', margin: '16px 0 14px 0' }}>
              <span
                style={{
                  fontSize: '1.25rem',
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

            {/* Introductory Sentence */}
            <div style={{ fontSize: '0.84rem', marginBottom: '14px', lineHeight: 1.5, color: '#111111' }}>
              With regards to the above mentioned subject, we are pleased to submit our competitive rate for your kind perusal and consideration.
            </div>

            {/* Rates Table with Solid Clean Borders */}
            <table
              style={{
                width: '100%',
                border: '1.5px solid #000000',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
                marginBottom: '12px'
              }}
            >
              <thead>
                <tr style={{ background: '#FFFFFF', textAlign: 'center', borderBottom: '1.5px solid #000000' }}>
                  <th style={{ border: '1px solid #000000', padding: '6px 8px', width: '50px', fontWeight: 900 }}>ITEM</th>
                  <th style={{ border: '1px solid #000000', padding: '6px 12px', textAlign: 'left', fontWeight: 900 }}>DESTINATION</th>
                  {tableLorryTypes.map((t, idx) => (
                    <th key={idx} style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 900 }}>
                      {t}<br />(RM)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedSpecial?.routes && parsedSpecial.routes.length > 0 ? (
                  parsedSpecial.routes.map((r, rIdx) => {
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
                        {tableLorryTypes.map((t, tIdx) => (
                          <td key={tIdx} style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 800, textAlign: 'center' }}>
                            {r.rates && r.rates[t] && !isNaN(Number(r.rates[t])) && Number(r.rates[t]) > 0
                              ? Number(r.rates[t]).toFixed(2)
                              : (r.rates && r.rates[t] ? r.rates[t] : '—')}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                ) : (
                  <tr style={{ textAlign: 'center' }}>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 800 }}>
                      <div>1</div>
                      {quote.customer_ref && (
                        <div style={{ fontSize: '0.68rem', color: '#555555', fontWeight: 700 }}>({quote.customer_ref})</div>
                      )}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 12px', textAlign: 'left', fontWeight: 800 }}>
                      <div>{pickupStr && dropoffStr && pickupStr !== '—' && dropoffStr !== '—' ? `${pickupStr} to ${dropoffStr}` : (pickupStr !== '—' ? pickupStr : 'Standard Route')}</div>
                      <div style={{ fontSize: '0.72rem', color: '#444444', fontWeight: 600, marginTop: '2px' }}>
                        📍 From: {pickupZone} • To: {dropoffZone}
                      </div>
                    </td>
                    {tableLorryTypes.map((t, tIdx) => {
                      const quoteSpecLower = (quote.lorry_spec || '').toLowerCase();
                      const tLower = t.toLowerCase();
                      const isMatch = quoteSpecLower === tLower ||
                        (quoteSpecLower.includes('3') && tLower.includes('3')) ||
                        (quoteSpecLower.includes('17') && tLower.includes('17')) ||
                        (quoteSpecLower.includes('1 ton') && tLower.includes('1 ton')) ||
                        (quoteSpecLower.includes('10 ton') && tLower.includes('10 ton')) ||
                        (quoteSpecLower.includes('14 ton') && tLower.includes('14 ton')) ||
                        (quoteSpecLower.includes('20 ton') && tLower.includes('20 ton'));

                      return (
                        <td key={tIdx} style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 800, textAlign: 'center' }}>
                          {isMatch ? rateVal.toFixed(2) : (tIdx === 1 && !quote.lorry_spec ? rateVal.toFixed(2) : '—')}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>

            {/* Sub-table Note */}
            {parsedSpecial?.subNote && (
              <div style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: '#111111', fontStyle: 'italic', marginBottom: '14px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                {parsedSpecial.subNote}
              </div>
            )}

            {/* Terms and Conditions */}
            <div style={{ fontSize: '0.82rem', lineHeight: 1.6, marginBottom: '20px', color: '#111111' }}>
              <div style={{ fontWeight: 900, marginBottom: '4px' }}>Terms and conditions :</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                Payment term: {paymentTerms.includes('credit') || paymentTerms.includes('days') ? paymentTerms : `${paymentTerms} from date of invoice.`}
              </div>
              <div style={{ marginTop: '10px' }}>
                We trust the above price is reasonable and look forward to your valuable support and we are assuring prompt service at all the times.
              </div>
            </div>

            {/* Footer Signatures: Dual Column like Image 3 */}
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
                  RAUF RAO
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
      </div>
    </div>
  );

  return createPortal(modalEl, document.body);
}
