import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb, fmtMoney, fmtDate, subscribeTable, getStorageData } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/common/Pagination';
import {
  Tag,
  Building2,
  Search,
  Plus,
  Printer,
  Edit3,
  Trash2,
  Truck,
  DollarSign,
  Fuel,
  Sparkles,
  Check,
  X,
  RotateCcw,
  Sliders,
  MapPin,
  Eye,
  Phone,
  Mail,
  FileText,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Layers
} from 'lucide-react';
import logoImg from '../assets/logo.png';

const ZONE_OPTIONS = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];

export const INITIAL_DIESEL_RATES = [];

const STANDARD_LORRY_TYPES = [
  '1 ton 9 ft',
  '3 & 5 ton 17 ft',
  '10 ton 24ft',
  '14 ton 30ft',
  '20 ton 40ft'
];

export default function CustomerPricing() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [customers, setCustomers] = useState(() => getStorageData('customers'));
  const [quotations, setQuotations] = useState(() => getStorageData('quotations'));
  const [priceList, setPriceList] = useState(() => getStorageData('customer_price_lists'));
  const [loading, setLoading] = useState(false);

  // Modals & Active Customer
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingRate, setDeletingRate] = useState(null);

  // Main Page Filters
  const [search, setSearch] = useState('');
  const [selectedZone, setSelectedZone] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Popup Modal Filters
  const [popupSearch, setPopupSearch] = useState('');
  const [popupDieselBand, setPopupDieselBand] = useState('all');

  // Load Customers, Quotations, and Price Lists
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (sb) {
        const [custRes, quoRes, priceRes] = await Promise.all([
          sb.from('customers').select('*').order('company_name', { ascending: true }),
          sb.from('quotations').select('*, customer:customers(company_name, registration_no, billing_address, contact_person, phone)').order('created_at', { ascending: false }),
          sb.from('customer_price_lists').select('*')
        ]);

        const custList = custRes.data || [];
        setCustomers(custList);
        setQuotations(quoRes.data || []);

        const data = priceRes.data || [];
        if (data && data.length > 0) {
          const demoIds = [];
          const customRecords = [];

          data.forEach(item => {
            const tag = (item.client_tag || '').toLowerCase().trim();
            const dest = (item.destination || '').toLowerCase().trim();
            const isDemo = String(item.id || '').startsWith('cpl-') ||
              tag === 'plastictecnic' || tag === 'sony' || tag === 'panasonic' ||
              tag === 'sema / panasonic' || tag === 'daikin' || tag === 'apm' ||
              dest.includes('senawang to nilai') || dest.includes('senawang to bangi') ||
              dest.includes('senawang to melaka') || dest.includes('senawang to shah alam') ||
              dest.includes('senawang to klang') || dest.includes('senawang to sg.buloh');
            if (isDemo) {
              demoIds.push(item.id);
            } else {
              customRecords.push(item);
            }
          });

          if (demoIds.length > 0) {
            demoIds.forEach(dId => {
              try { sb.from('customer_price_lists').delete().eq('id', dId); } catch (_) {}
            });
            try {
              const stored = localStorage.getItem('rens_db_customer_price_lists');
              if (stored) {
                const parsed = JSON.parse(stored);
                const cleaned = parsed.filter(i => !demoIds.includes(i.id));
                localStorage.setItem('rens_db_customer_price_lists', JSON.stringify(cleaned));
              }
              localStorage.removeItem('rens_diesel_price_matrix_v3');
              localStorage.removeItem('rens_diesel_price_matrix_v2');
            } catch (_) {}
          }

          const mapped = customRecords.map((item) => {
            let tiers = item.tiers || [];
            if (!tiers.length && item.tiers_json) {
              try {
                tiers = typeof item.tiers_json === 'string' ? JSON.parse(item.tiers_json) : item.tiers_json;
              } catch (_) {}
            }
            let pickup = item.pickup_location || '';
            let drop = item.drop_location || '';
            if (!pickup && !drop && (item.destination || '').includes(' to ')) {
              const parts = item.destination.split(' to ');
              pickup = parts[0] || '';
              drop = parts[1] || '';
            }
            return {
              ...item,
              pickup_location: pickup,
              drop_location: drop,
              pickup_zone: item.pickup_zone || item.zone || 'Zone A',
              drop_zone: item.drop_zone || item.zone || 'Zone A',
              code_word: item.code_word || item.remark || '',
              zone: item.zone || 'Zone A',
              tiers
            };
          });
          setPriceList(mapped);
        } else {
          setPriceList([]);
        }
      }
    } catch (_) {
      setPriceList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub1 = subscribeTable('customers', loadData);
    const unsub2 = subscribeTable('quotations', loadData);
    const unsub3 = subscribeTable('customer_price_lists', loadData);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [loadData]);

  // Extract All Customer Routes (From both Quotations and Price Lists) with strict deduplication & merging
  const getCustomerRoutes = useCallback((customer) => {
    if (!customer) return [];
    const custId = String(customer.id || '').toLowerCase().trim();
    const custName = (customer.company_name || customer.name || '').toLowerCase().trim();
    const custReg = (customer.registration_no || '').toLowerCase().trim();

    const routeMap = new Map();

    const normalizeRouteText = (str) => {
      if (!str) return '';
      return String(str)
        .toLowerCase()
        .trim()
        .replace(/\s*(?:->|→|—|–|-)\s*/g, ' to ')
        .replace(/\s+/g, ' ');
    };

    const processRoute = (entry) => {
      const normPickup = (entry.pickup_location || entry.collection || '').trim();
      const normDrop = (entry.drop_location || entry.dropoff_location || entry.unloading || '').trim();

      let dest = entry.destination || '';
      if (entry.isDropoint) {
        dest = `Dropoint — ${normPickup || 'Location'}`;
      } else if (normPickup && normDrop) {
        dest = `${normPickup} to ${normDrop}`;
      } else if (!dest) {
        dest = normPickup || normDrop || 'Standard Route';
      }

      const normDest = normalizeRouteText(dest);
      const codeWord = (entry.code_word || entry.customer_ref || '').trim();
      const normCode = codeWord.toLowerCase().trim();
      const dieselBand = String(entry.diesel_price || '2.00 - 2.18').trim();

      // Clean unique key: destination + code_word (so same route is unified into one comprehensive row)
      const key = normCode ? `${normDest}:::${normCode}` : normDest;

      const rateMap = {};
      STANDARD_LORRY_TYPES.forEach(t => {
        if (entry.rates && entry.rates[t] !== undefined && entry.rates[t] !== null && entry.rates[t] !== '' && entry.rates[t] !== '—') {
          const val = Number(entry.rates[t]);
          rateMap[t] = !isNaN(val) && val > 0 ? val.toFixed(2) : String(entry.rates[t]);
        } else {
          rateMap[t] = '—';
        }
      });

      if (!routeMap.has(key)) {
        routeMap.set(key, {
          id: entry.id || `rt_${routeMap.size + 1}`,
          code_word: codeWord,
          destination: dest,
          pickup_location: normPickup,
          drop_location: normDrop,
          pickup_zone: entry.pickup_zone || entry.collection_zone || customer.zone || 'Zone A',
          drop_zone: entry.drop_zone || entry.unloading_zone || customer.zone || 'Zone A',
          diesel_price: dieselBand,
          rates: rateMap,
          lorryTypes: entry.lorryTypes || STANDARD_LORRY_TYPES,
          note: entry.note || '',
          source: entry.source || 'quotation'
        });
      } else {
        const existing = routeMap.get(key);
        // Merge lorry rates: fill any missing rate values
        STANDARD_LORRY_TYPES.forEach(t => {
          if (rateMap[t] && rateMap[t] !== '—') {
            existing.rates[t] = rateMap[t];
          }
        });
        // Prefer detailed diesel band over default 3.00
        if (dieselBand && (dieselBand === '2.00 - 2.18' || existing.diesel_price === '3.00')) {
          existing.diesel_price = dieselBand;
        }
        if (entry.pickup_zone && (!existing.pickup_zone || existing.pickup_zone === 'Zone A')) {
          existing.pickup_zone = entry.pickup_zone;
        }
        if (entry.drop_zone && (!existing.drop_zone || existing.drop_zone === 'Zone A')) {
          existing.drop_zone = entry.drop_zone;
        }
        if (codeWord && !existing.code_word) {
          existing.code_word = codeWord;
        }
        if (normPickup && !existing.pickup_location) {
          existing.pickup_location = normPickup;
        }
        if (normDrop && !existing.drop_location) {
          existing.drop_location = normDrop;
        }
        if (entry.note && !existing.note) {
          existing.note = entry.note;
        }
      }
    };

    // 1. Extract from Quotations / Customer Rate Cards
    quotations.forEach(q => {
      const qCustId = String(q.customer_id || (q.customer && q.customer.id) || '').toLowerCase().trim();
      const qCustName = (q.customer_name || (q.customer && q.customer.company_name) || '').toLowerCase().trim();

      const isCustMatch = (qCustId && qCustId === custId) ||
        (custName && (qCustName === custName || custName.includes(qCustName) || qCustName.includes(custName)));

      if (!isCustMatch) return;

      let parsed = null;
      try {
        if (q.special_instructions && q.special_instructions.startsWith('{')) {
          parsed = JSON.parse(q.special_instructions);
        } else if (q.notes && q.notes.startsWith('{')) {
          parsed = JSON.parse(q.notes);
        }
      } catch (_) {}

      const dieselBand = parsed?.dieselPrice !== undefined && parsed?.dieselPrice !== null
        ? String(parsed.dieselPrice)
        : (parsed?.includeDiesel !== false && q.diesel_price ? String(q.diesel_price) : '3.00');

      const lTypes = parsed?.lorryTypes || STANDARD_LORRY_TYPES;

      if (parsed && Array.isArray(parsed.routes) && parsed.routes.length > 0) {
        parsed.routes.forEach((r) => {
          const dest = r.isDropoint
            ? `Dropoint — ${r.collection || 'Location'}`
            : (r.collection && r.unloading ? `${r.collection} to ${r.unloading}` : (r.collection || r.unloading || 'Standard Route'));

          const rateMap = {};
          STANDARD_LORRY_TYPES.forEach(t => {
            if (r.rates && r.rates[t] !== undefined && r.rates[t] !== null && r.rates[t] !== '') {
              const val = Number(r.rates[t]);
              rateMap[t] = !isNaN(val) && val > 0 ? val.toFixed(2) : (String(r.rates[t]) || '—');
            } else {
              rateMap[t] = '—';
            }
          });

          processRoute({
            id: r.id || `quo_rt_${r.collection}_${r.unloading}`,
            code_word: r.code_word || r.customer_ref || '',
            destination: dest,
            pickup_location: r.collection || '',
            drop_location: r.unloading || '',
            pickup_zone: r.collection_zone || customer.zone || 'Zone A',
            drop_zone: r.unloading_zone || customer.zone || 'Zone A',
            diesel_price: dieselBand || '3.00',
            rates: rateMap,
            lorryTypes: lTypes,
            note: r.note || '',
            source: 'quotation'
          });
        });
      } else if (q.pickup_location || q.dropoff_location) {
        const pLoc = (q.pickup_location || '').trim();
        const dLoc = (q.dropoff_location || '').trim();
        const dest = pLoc && dLoc ? `${pLoc} to ${dLoc}` : (pLoc || dLoc || 'Standard Route');
        const rateVal = q.rate_amount ? Number(q.rate_amount).toFixed(2) : '—';

        const qSpec = (q.lorry_spec || '').toLowerCase();
        let targetLorryType = '3 & 5 ton 17 ft';
        if (qSpec.includes('1 ton') || qSpec.includes('9ft') || qSpec.includes('9 ft')) targetLorryType = '1 ton 9 ft';
        else if (qSpec.includes('10 ton') || qSpec.includes('24ft') || qSpec.includes('24 ft')) targetLorryType = '10 ton 24ft';
        else if (qSpec.includes('14 ton') || qSpec.includes('30ft') || qSpec.includes('30 ft')) targetLorryType = '14 ton 30ft';
        else if (qSpec.includes('20 ton') || qSpec.includes('40ft') || qSpec.includes('40 ft')) targetLorryType = '20 ton 40ft';

        const singleRates = {
          '1 ton 9 ft': '—',
          '3 & 5 ton 17 ft': '—',
          '10 ton 24ft': '—',
          '14 ton 30ft': '—',
          '20 ton 40ft': '—'
        };
        singleRates[targetLorryType] = rateVal;

        processRoute({
          id: `quo_single_${pLoc}_${dLoc}`,
          code_word: q.customer_ref || '',
          destination: dest,
          pickup_location: pLoc,
          drop_location: dLoc,
          pickup_zone: q.pickup_zone || q.zone || customer.zone || 'Zone A',
          drop_zone: q.dropoff_zone || q.zone || customer.zone || 'Zone A',
          diesel_price: dieselBand || '3.00',
          rates: singleRates,
          lorryTypes: lTypes,
          note: '',
          source: 'quotation'
        });
      }
    });

    // 2. Extract from Customer Price Lists
    priceList.forEach(r => {
      const isMatch = (r.customer_id && String(r.customer_id) === custId) ||
        (r.client_tag && custName && (r.client_tag.toLowerCase().trim() === custName || custName.includes(r.client_tag.toLowerCase().trim()) || r.client_tag.toLowerCase().trim().includes(custName))) ||
        (r.client_tag && custReg && r.client_tag.toLowerCase().trim() === custReg);

      if (isMatch) {
        const tiers = r.tiers || [];
        const primaryTier = tiers.find(t => t && t.diesel_band === '2.00 - 2.18') || tiers[0] || {};
        processRoute({
          id: r.id,
          code_word: r.code_word || '',
          destination: r.destination,
          pickup_location: r.pickup_location || '',
          drop_location: r.drop_location || '',
          pickup_zone: r.pickup_zone || r.zone || customer.zone || 'Zone A',
          drop_zone: r.drop_zone || r.zone || customer.zone || 'Zone A',
          diesel_price: primaryTier.diesel_band ? `${primaryTier.diesel_band}` : '2.00 - 2.18',
          rates: {
            '1 ton 9 ft': (primaryTier.ton1_9ft || primaryTier['1 ton 9 ft']) ? Number(primaryTier.ton1_9ft || primaryTier['1 ton 9 ft']).toFixed(2) : '—',
            '3 & 5 ton 17 ft': (primaryTier.ton5_17ft || primaryTier['3 & 5 ton 17 ft'] || primaryTier['3 & 5 ton']) ? Number(primaryTier.ton5_17ft || primaryTier['3 & 5 ton 17 ft'] || primaryTier['3 & 5 ton']).toFixed(2) : '—',
            '10 ton 24ft': (primaryTier.ton10_24ft || primaryTier['10 ton 24ft']) ? Number(primaryTier.ton10_24ft || primaryTier['10 ton 24ft']).toFixed(2) : '—',
            '14 ton 30ft': (primaryTier.ft30 || primaryTier['14 ton 30ft'] || primaryTier['14 ton']) ? Number(primaryTier.ft30 || primaryTier['14 ton 30ft'] || primaryTier['14 ton']).toFixed(2) : '—',
            '20 ton 40ft': (primaryTier.ft40 || primaryTier['20 ton 40ft'] || primaryTier['20 ton']) ? Number(primaryTier.ft40 || primaryTier['20 ton 40ft'] || primaryTier['20 ton']).toFixed(2) : '—'
          },
          lorryTypes: STANDARD_LORRY_TYPES,
          note: r.note || '',
          source: 'price_list'
        });
      }
    });

    // Assign sequential item numbers 1, 2, 3...
    return Array.from(routeMap.values()).map((item, idx) => ({
      ...item,
      item_no: String(idx + 1)
    }));
  }, [quotations, priceList]);

  // Dynamic zones list from registered customers and rates
  const allAvailablePricingZones = useMemo(() => {
    const set = new Set(['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E', 'Zone F', 'Central Zone', 'Southern Region', 'Northern Region', 'East Coast']);
    customers.forEach(c => { if (c.zone) set.add(c.zone); });
    priceList.forEach(r => {
      if (r.zone) set.add(r.zone);
      if (r.pickup_zone) set.add(r.pickup_zone);
      if (r.drop_zone) set.add(r.drop_zone);
    });
    return Array.from(set).filter(Boolean);
  }, [customers, priceList]);

  // Dynamic all diesel price bands
  const allAvailableDieselBands = useMemo(() => {
    const set = new Set(['1.50 - 2.00', '2.00 - 2.18', '3.00']);
    priceList.forEach(r => {
      (r.tiers || []).forEach(t => {
        if (t.diesel_band) set.add(t.diesel_band);
      });
    });
    return Array.from(set).filter(Boolean);
  }, [priceList]);

  // Filtered Customer List
  const filteredCustomers = useMemo(() => {
    let list = customers;

    if (selectedZone !== 'all') {
      list = list.filter(c => (c.zone || 'Zone A') === selectedZone);
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'with_routes') {
        list = list.filter(c => getCustomerRoutes(c).length > 0);
      } else if (statusFilter === 'no_routes') {
        list = list.filter(c => getCustomerRoutes(c).length === 0);
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(c =>
        (c.company_name && c.company_name.toLowerCase().includes(q)) ||
        (c.registration_no && c.registration_no.toLowerCase().includes(q)) ||
        (c.contact_person && c.contact_person.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.zone && c.zone.toLowerCase().includes(q)) ||
        (c.billing_address && c.billing_address.toLowerCase().includes(q)) ||
        (c.payment_terms && c.payment_terms.toLowerCase().includes(q))
      );
    }

    return list;
  }, [customers, selectedZone, statusFilter, search, getCustomerRoutes]);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
  }, [selectedZone, statusFilter, search]);

  const paginatedCustomers = useMemo(() => {
    return filteredCustomers.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredCustomers, page, pageSize]);

  // Form State for Add / Edit Route Rate
  const [formData, setFormData] = useState({
    customer_id: '',
    client_tag: '',
    item_no: '',
    pickup_zone: 'Zone A',
    pickup_location: '',
    drop_zone: 'Zone A',
    drop_location: '',
    destination: '',
    code_word: '',
    note: '',
    tier1_band: '1.50 - 2.00',
    tier1_5ton: '320.00',
    tier1_10ton: '410.00',
    tier1_30ft: '450.00',
    tier1_40ft: '580.00',
    has_tier2: true,
    tier2_band: '2.00 - 2.18',
    tier2_5ton: '340.00',
    tier2_10ton: '430.00',
    tier2_30ft: '470.00',
    tier2_40ft: '600.00'
  });

  // Open Add Route Modal (Optionally pre-bound to a customer)
  const handleOpenAddRoute = (customer = null) => {
    const custRoutes = customer ? getCustomerRoutes(customer) : [];
    const nextItemNo = String(custRoutes.length + 1);

    setFormData({
      customer_id: customer?.id || '',
      client_tag: customer?.company_name || customer?.name || '',
      item_no: nextItemNo,
      pickup_zone: customer?.zone || 'Zone A',
      pickup_location: '',
      drop_zone: 'Zone A',
      drop_location: '',
      destination: '',
      code_word: '',
      note: '',
      tier1_band: '1.50 - 2.00',
      tier1_5ton: '320.00',
      tier1_10ton: '410.00',
      tier1_30ft: '450.00',
      tier1_40ft: '580.00',
      has_tier2: true,
      tier2_band: '2.00 - 2.18',
      tier2_5ton: '340.00',
      tier2_10ton: '430.00',
      tier2_30ft: '470.00',
      tier2_40ft: '600.00'
    });
    setEditingId(null);
    setIsAddEditOpen(true);
  };

  // Open Edit Route Modal
  const handleOpenEditRoute = (rate) => {
    const t1 = rate.tiers?.[0] || { diesel_band: '1.50 - 2.00', ton5_17ft: 0, ton10_24ft: 0, ft30: 0, ft40: 0 };
    const t2 = rate.tiers?.[1];

    let pickup = rate.pickup_location || '';
    let drop = rate.drop_location || '';
    if (!pickup && !drop && (rate.destination || '').includes(' to ')) {
      const parts = rate.destination.split(' to ');
      pickup = parts[0] || '';
      drop = parts[1] || '';
    }

    setFormData({
      customer_id: rate.customer_id || '',
      client_tag: rate.client_tag || '',
      item_no: rate.item_no || rate.id,
      pickup_zone: rate.pickup_zone || rate.zone || 'Zone A',
      pickup_location: pickup,
      drop_zone: rate.drop_zone || rate.zone || 'Zone A',
      drop_location: drop,
      destination: rate.destination || '',
      code_word: rate.code_word || rate.remark || '',
      note: rate.note || '',
      tier1_band: t1.diesel_band || '1.50 - 2.00',
      tier1_5ton: String(t1.ton5_17ft || 0),
      tier1_10ton: String(t1.ton10_24ft || 0),
      tier1_30ft: String(t1.ft30 || 0),
      tier1_40ft: String(t1.ft40 || 0),
      has_tier2: !!t2,
      tier2_band: t2 ? t2.diesel_band : '2.00 - 2.18',
      tier2_5ton: t2 ? String(t2.ton5_17ft || 0) : '0',
      tier2_10ton: t2 ? String(t2.ton10_24ft || 0) : '0',
      tier2_30ft: t2 ? String(t2.ft30 || 0) : '0',
      tier2_40ft: t2 ? String(t2.ft40 || 0) : '0'
    });
    setEditingId(rate.id);
    setIsAddEditOpen(true);
  };

  // Handle Save Route Form
  const handleSaveRouteSubmit = async (e) => {
    e.preventDefault();

    if (!formData.pickup_location.trim() || !formData.drop_location.trim()) {
      toast('Please provide both Pickup and Drop Locations', 'warn');
      return;
    }

    const finalDest = `${formData.pickup_location.trim()} to ${formData.drop_location.trim()}`;
    const overallZone = formData.pickup_zone === formData.drop_zone
      ? formData.pickup_zone
      : `${formData.pickup_zone} → ${formData.drop_zone}`;

    const tiers = [
      {
        diesel_band: formData.tier1_band.trim() || '1.50 - 2.00',
        ton5_17ft: parseFloat(formData.tier1_5ton) || 0,
        ton10_24ft: parseFloat(formData.tier1_10ton) || 0,
        ft30: parseFloat(formData.tier1_30ft) || 0,
        ft40: parseFloat(formData.tier1_40ft) || 0
      }
    ];

    if (formData.has_tier2) {
      tiers.push({
        diesel_band: formData.tier2_band.trim() || '2.00 - 2.18',
        ton5_17ft: parseFloat(formData.tier2_5ton) || 0,
        ton10_24ft: parseFloat(formData.tier2_10ton) || 0,
        ft30: parseFloat(formData.tier2_30ft) || 0,
        ft40: parseFloat(formData.tier2_40ft) || 0
      });
    }

    // Determine customer tag & id
    let matchedCust = customers.find(c => String(c.id) === String(formData.customer_id));
    if (!matchedCust && formData.client_tag) {
      matchedCust = customers.find(c => (c.company_name || '').toLowerCase() === formData.client_tag.toLowerCase());
    }

    const newRecord = {
      id: editingId || ('cpl_' + Date.now()),
      customer_id: matchedCust ? matchedCust.id : (formData.customer_id || null),
      item_no: formData.item_no || String(priceList.length + 1),
      pickup_zone: formData.pickup_zone,
      drop_zone: formData.drop_zone,
      zone: overallZone,
      pickup_location: formData.pickup_location.trim(),
      drop_location: formData.drop_location.trim(),
      destination: finalDest,
      client_tag: matchedCust ? matchedCust.company_name : (formData.client_tag.trim() || ''),
      code_word: formData.code_word.trim(),
      note: formData.note.trim(),
      tiers
    };

    if (editingId) {
      if (sb) {
        try {
          await sb.from('customer_price_lists').update({
            ...newRecord,
            tiers_json: JSON.stringify(tiers)
          }).eq('id', editingId);
        } catch (_) {}
      }
      setPriceList(prev => prev.map(r => (r.id === editingId ? newRecord : r)));
      toast(`Updated rate card for ${newRecord.destination}`, 'ok');
    } else {
      if (sb) {
        try {
          await sb.from('customer_price_lists').insert({
            ...newRecord,
            tiers_json: JSON.stringify(tiers)
          });
        } catch (_) {}
      }
      setPriceList(prev => [...prev, newRecord]);
      toast(`Added route rate for ${newRecord.client_tag || 'customer'}`, 'ok');
    }

    setIsAddEditOpen(false);
  };

  // Delete Route Rate
  const confirmDeleteRoute = async () => {
    if (!deletingRate) return;
    if (sb) {
      try {
        await sb.from('customer_price_lists').delete().eq('id', deletingRate.id);
      } catch (_) {}
    }
    setPriceList(prev => prev.filter(r => r.id !== deletingRate.id));
    toast(`Removed route rate item ${deletingRate.item_no}`, 'warn');
    setDeletingRate(null);
  };

  // Selected viewing customer's routes for the popup modal
  const activeCustomerRoutes = useMemo(() => {
    if (!viewingCustomer) return [];
    let list = getCustomerRoutes(viewingCustomer);

    if (popupSearch.trim()) {
      const q = popupSearch.toLowerCase().trim();
      list = list.filter(r =>
        (r.destination && r.destination.toLowerCase().includes(q)) ||
        (r.pickup_location && r.pickup_location.toLowerCase().includes(q)) ||
        (r.drop_location && r.drop_location.toLowerCase().includes(q)) ||
        (r.pickup_zone && r.pickup_zone.toLowerCase().includes(q)) ||
        (r.drop_zone && r.drop_zone.toLowerCase().includes(q)) ||
        (r.code_word && r.code_word.toLowerCase().includes(q)) ||
        (r.note && r.note.toLowerCase().includes(q))
      );
    }

    if (popupDieselBand !== 'all') {
      list = list.filter(r => String(r.diesel_price) === String(popupDieselBand));
    }

    return list;
  }, [viewingCustomer, getCustomerRoutes, popupSearch, popupDieselBand]);

  return (
    <div className="page" style={{ paddingBottom: '40px' }}>
      {/* Page Header */}
      <div className="pagehead">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#FFF7ED',
              color: 'var(--orange)'
            }}>
              <Tag size={18} strokeWidth={2.4} />
            </span>
            <h1 style={{ margin: 0 }}>Price Lists &amp; Customer Freight Matrix</h1>
          </div>
          <div className="sub" style={{ marginTop: '4px' }}>
            Registered customer rates directory &bull; Multi-tonnage Malaysian route pricing schedule indexed by diesel bands.
          </div>
        </div>

        <div className="tools" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="btn gh"
            onClick={() => navigate('/customers')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
          >
            <Building2 size={15} />
            <span>Manage Customers</span>
          </button>

          <button
            className="btn pri"
            onClick={() => handleOpenAddRoute()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} strokeWidth={2.4} />
            <span>Add Route Rate</span>
            <kbd>N</kbd>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="kpis" style={{ marginBottom: '24px' }}>
        <div className="kpi">
          <div className="k">Registered Customers</div>
          <div className="v">{customers.length}</div>
          <div className="d up">{customers.filter(c => getCustomerRoutes(c).length > 0).length} active with rates</div>
        </div>

        <div className="kpi">
          <div className="k">Configured Routes</div>
          <div className="v" style={{ color: 'var(--orange)' }}>
            {customers.reduce((acc, c) => acc + getCustomerRoutes(c).length, 0)}
          </div>
          <div className="d">Across all client schedules</div>
        </div>

        <div className="kpi">
          <div className="k">Standard Diesel Band</div>
          <div className="v" style={{ color: '#2563EB' }}>RM 2.00 - 2.18</div>
          <div className="d">Active indexed rate</div>
        </div>

        <div className="kpi">
          <div className="k">Fleet Capacities</div>
          <div className="v" style={{ color: '#059669' }}>5 Specs</div>
          <div className="d">1T 9ft &bull; 3-5T 17ft &bull; 10T 24ft &bull; 14T 30ft &bull; 20T 40ft</div>
        </div>
      </div>

      {/* Main Customers Table Container */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--line)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden'
        }}
      >
        {/* Search & Filter Toolbar Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--line)',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          {/* Search Bar */}
          <div style={{ position: 'relative', width: '320px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--slate)'
              }}
            />
            <input
              type="text"
              placeholder="Search customer, reg no, contact, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '36px',
                background: '#FFFFFF',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                color: 'var(--navy-900)',
                height: '36px',
                fontSize: '0.84rem'
              }}
            />
          </div>

          {/* Right: Zone & Rate Status Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Zone Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={13} style={{ color: 'var(--orange)' }} />
                Zone:
              </span>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                style={{
                  padding: '5px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  background: selectedZone !== 'all' ? '#FFF7ED' : '#FFFFFF',
                  color: selectedZone !== 'all' ? 'var(--orange)' : 'var(--navy-900)',
                  cursor: 'pointer',
                  height: '36px',
                  outline: 'none'
                }}
              >
                <option value="all">All Zones</option>
                {allAvailablePricingZones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>

            {/* Rates Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Layers size={13} style={{ color: '#2563EB' }} />
                Routes:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '5px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  background: statusFilter !== 'all' ? '#EFF6FF' : '#FFFFFF',
                  color: statusFilter !== 'all' ? '#2563EB' : 'var(--navy-900)',
                  cursor: 'pointer',
                  height: '36px',
                  outline: 'none'
                }}
              >
                <option value="all">All Customers</option>
                <option value="with_routes">With Configured Routes</option>
                <option value="no_routes">No Routes Yet</option>
              </select>
            </div>
          </div>
        </div>

        {/* Registered Customer Table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.86rem',
              fontFamily: '"Outfit", "Inter", sans-serif'
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#F8FAFC',
                  color: 'var(--navy-900)',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  letterSpacing: '0.5px',
                  borderBottom: '2px solid var(--navy-900)'
                }}
              >
                <th style={{ padding: '12px 14px', width: '50px', textAlign: 'center', borderRight: '1px solid var(--line)' }}>#</th>
                <th style={{ padding: '12px 18px', textAlign: 'left', minWidth: '250px', borderRight: '1px solid var(--line)' }}>CUSTOMER / COMPANY</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', minWidth: '200px', borderRight: '1px solid var(--line)' }}>CONTACT &amp; PHONE</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', width: '140px', borderRight: '1px solid var(--line)' }}>PAYMENT TERMS</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', width: '170px', borderRight: '1px solid var(--line)' }}>ASSIGNED ROUTES</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '110px', borderRight: '1px solid var(--line)' }}>STATUS</th>
                <th style={{ padding: '12px 18px', textAlign: 'center', width: '130px' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--slate)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <div className="spinner" style={{ width: '28px', height: '28px' }} />
                      <span style={{ fontWeight: 600 }}>Loading customer price registry...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--slate)' }}>
                    <Building2 size={36} style={{ margin: '0 auto 12px auto', color: '#CBD5E1' }} />
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '4px' }}>
                      No Registered Customers Found
                    </div>
                    <div style={{ fontSize: '0.84rem' }}>
                      {search || selectedZone !== 'all' || statusFilter !== 'all'
                        ? 'Try clearing your filters or search terms.'
                        : 'Register your first customer or add custom route rates.'}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((cust, idx) => {
                  const routes = getCustomerRoutes(cust);
                  const hasRoutes = routes.length > 0;

                  return (
                    <tr
                      key={cust.id || idx}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA')}
                    >
                      {/* Index */}
                      <td style={{ padding: '14px', textAlign: 'center', fontWeight: 700, color: 'var(--slate)', borderRight: '1px solid var(--line)' }}>
                        {(page - 1) * pageSize + idx + 1}
                      </td>

                      {/* Customer / Company */}
                      <td style={{ padding: '14px 18px', borderRight: '1px solid var(--line)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.92rem', marginBottom: '2px' }}>
                          {cust.company_name || cust.name || 'Unnamed Customer'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.76rem', color: 'var(--slate)' }}>
                          {cust.registration_no && (
                            <span style={{ background: '#F1F5F9', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 600 }}>
                              {cust.registration_no}
                            </span>
                          )}
                          {cust.billing_address && (
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '280px' }} title={cust.billing_address}>
                              {cust.billing_address}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Contact & Phone */}
                      <td style={{ padding: '14px 16px', borderRight: '1px solid var(--line)' }}>
                        <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.84rem' }}>
                          {cust.contact_person || cust.attn || '—'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px', fontSize: '0.78rem', color: 'var(--slate)' }}>
                          {cust.phone && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Phone size={11} style={{ color: 'var(--orange)' }} />
                              {cust.phone}
                            </span>
                          )}
                          {cust.email && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Mail size={11} style={{ color: '#2563EB' }} />
                              {cust.email}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Payment Terms */}
                      <td style={{ padding: '14px 16px', textAlign: 'center', borderRight: '1px solid var(--line)' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          background: '#F1F5F9',
                          color: '#475569',
                          border: '1px solid #CBD5E1'
                        }}>
                          {cust.payment_terms || '30 Days'}
                        </span>
                      </td>

                      {/* Assigned Routes */}
                      <td style={{ padding: '14px 16px', textAlign: 'center', borderRight: '1px solid var(--line)' }}>
                        {hasRoutes ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            background: '#ECFDF5',
                            color: '#065F46',
                            border: '1px solid #A7F3D0'
                          }}>
                            <Check size={12} strokeWidth={3} />
                            {routes.length} {routes.length === 1 ? 'Route' : 'Routes'}
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: '#FEF2F2',
                            color: '#991B1B',
                            border: '1px solid #FECACA'
                          }}>
                            No Routes Set
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 14px', textAlign: 'center', borderRight: '1px solid var(--line)' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          background: '#F0FDF4',
                          color: '#15803D',
                          border: '1px solid #BBF7D0'
                        }}>
                          Active
                        </span>
                      </td>

                      {/* Action Column */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn sm pri"
                          onClick={() => {
                            setPopupSearch('');
                            setPopupDieselBand('all');
                            setViewingCustomer(cust);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            height: '32px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            borderRadius: '8px',
                            boxShadow: '0 2px 4px rgba(249, 115, 22, 0.2)'
                          }}
                          title={`View route and rate schedule for ${cust.company_name}`}
                        >
                          <Eye size={14} strokeWidth={2.4} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={page}
            totalItems={filteredCustomers.length}
            pageSize={pageSize}
            onPageChange={setPage}
            itemName="customers"
          />
        </div>

        {/* Footer Summary */}
        <div
          style={{
            padding: '14px 20px',
            background: '#F8FAFC',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem',
            color: 'var(--slate)',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <div>
            Showing <strong>{filteredCustomers.length}</strong> of <strong>{customers.length}</strong> registered customer rate profiles
          </div>
          <div>
            Click <strong>"View"</strong> on any customer to inspect their assigned freight routes and diesel tiers.
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CUSTOMER ROUTES & RATE DETAILS POPUP MODAL (Matching Image 1 Table Format) */}
      {/* ========================================================================= */}
      {viewingCustomer && createPortal(
        <div
          className="overlay open"
          onClick={() => setViewingCustomer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
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
              maxWidth: '1200px',
              width: '100%',
              maxHeight: '90vh',
              background: '#FFFFFF',
              borderRadius: '24px',
              boxShadow: '0 30px 70px -15px rgba(0,0,0,0.35)',
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 26px',
                background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                color: '#FFFFFF',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'rgba(249, 115, 22, 0.2)',
                  border: '1px solid rgba(249, 115, 22, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--orange)'
                }}>
                  <Building2 size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.28rem', fontWeight: 800, color: '#FFFFFF' }}>
                      {viewingCustomer.company_name || viewingCustomer.name}
                    </h2>
                    {viewingCustomer.registration_no && (
                      <span style={{
                        background: 'rgba(255,255,255,0.12)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: '#93C5FD'
                      }}>
                        {viewingCustomer.registration_no}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {viewingCustomer.contact_person && (
                      <span>Attn: <strong>{viewingCustomer.contact_person}</strong></span>
                    )}
                    {viewingCustomer.phone && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={12} /> {viewingCustomer.phone}
                      </span>
                    )}
                    {viewingCustomer.email && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={12} /> {viewingCustomer.email}
                      </span>
                    )}
                    <span>Zone: <strong style={{ color: '#FDBA74' }}>{viewingCustomer.zone || 'Zone A'}</strong></span>
                    <span>Terms: <strong>{viewingCustomer.payment_terms || '30'}</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => setViewingCustomer(null)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#FFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Sub-toolbar inside Popup */}
            <div
              style={{
                padding: '12px 24px',
                background: '#F8FAFC',
                borderBottom: '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ position: 'relative', width: '280px' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--slate)'
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search routes, destinations, notes..."
                    value={popupSearch}
                    onChange={(e) => setPopupSearch(e.target.value)}
                    style={{
                      width: '100%',
                      paddingLeft: '32px',
                      background: '#FFFFFF',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      color: 'var(--navy-900)',
                      height: '32px',
                      fontSize: '0.8rem'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--slate)' }}>Diesel Band:</span>
                  <select
                    value={popupDieselBand}
                    onChange={(e) => setPopupDieselBand(e.target.value)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      border: '1px solid var(--line)',
                      borderRadius: '6px',
                      background: '#FFFFFF',
                      height: '32px',
                      outline: 'none'
                    }}
                  >
                    <option value="all">All Diesel Tiers</option>
                    {allAvailableDieselBands.map((band) => (
                      <option key={band} value={band}>{band === 'Fixed' ? 'Fixed Rate' : `RM ${band}`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--slate)', fontWeight: 600 }}>
                Total Routes Configured: <strong style={{ color: 'var(--navy-900)' }}>{activeCustomerRoutes.length}</strong>
              </div>
            </div>

            {/* Modal Body: Exact Table Format from Image 1 */}
            <div style={{ padding: '18px 24px', overflowY: 'auto', flex: 1, maxHeight: '60vh', background: '#FFFFFF' }}>
              {activeCustomerRoutes.length === 0 ? (
                <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--slate)' }}>
                  <Truck size={44} style={{ margin: '0 auto 12px auto', color: '#CBD5E1' }} />
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '4px' }}>
                    No Freight Routes Found for {viewingCustomer.company_name}
                  </div>
                  <p style={{ fontSize: '0.84rem', maxWidth: '440px', margin: '0 auto' }}>
                    {popupSearch ? 'No routes matched your search query.' : 'This customer currently has no agreed rate schedule defined.'}
                  </p>
                </div>
              ) : (
                <div style={{ border: '1.5px solid #000000', overflow: 'hidden' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.84rem',
                      fontFamily: '"Outfit", "Inter", sans-serif',
                      color: '#000000'
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: '#FFFFFF',
                          color: '#000000',
                          fontWeight: 900,
                          fontSize: '0.78rem',
                          textAlign: 'center',
                          borderBottom: '1.5px solid #000000'
                        }}
                      >
                        <th style={{ border: '1px solid #000000', padding: '10px 8px', width: '70px', fontWeight: 900 }}>
                          ITEM
                        </th>
                        <th style={{ border: '1px solid #000000', padding: '10px 14px', textAlign: 'left', minWidth: '220px', fontWeight: 900 }}>
                          DESTINATION
                        </th>
                        <th style={{ border: '1px solid #000000', padding: '10px 8px', width: '120px', fontWeight: 900 }}>
                          DIESEL PRICE<br />(RM)
                        </th>
                        <th style={{ border: '1px solid #000000', padding: '10px 8px', minWidth: '95px', fontWeight: 900 }}>
                          1 ton 9<br />ft<br />(RM)
                        </th>
                        <th style={{ border: '1px solid #000000', padding: '10px 8px', minWidth: '105px', fontWeight: 900 }}>
                          3 &amp; 5 ton<br />17 ft<br />(RM)
                        </th>
                        <th style={{ border: '1px solid #000000', padding: '10px 8px', minWidth: '95px', fontWeight: 900 }}>
                          10 ton<br />24ft<br />(RM)
                        </th>
                        <th style={{ border: '1px solid #000000', padding: '10px 8px', minWidth: '95px', fontWeight: 900 }}>
                          14 ton<br />30ft<br />(RM)
                        </th>
                        <th style={{ border: '1px solid #000000', padding: '10px 8px', minWidth: '95px', fontWeight: 900 }}>
                          20 ton<br />40ft<br />(RM)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCustomerRoutes.map((r, rIdx) => {
                        const zoneDetails = [
                          r.pickup_zone ? `From: ${r.pickup_zone}` : null,
                          r.drop_zone ? `To: ${r.drop_zone}` : null
                        ].filter(Boolean).join(' • ');

                        return (
                          <tr
                            key={r.id || rIdx}
                            style={{
                              textAlign: 'center',
                              background: '#FFFFFF'
                            }}
                          >
                            {/* ITEM (e.g. 1 / (rens)) */}
                            <td style={{ border: '1px solid #000000', padding: '10px 8px', fontWeight: 800 }}>
                              <div style={{ fontSize: '0.95rem' }}>{r.item_no || (rIdx + 1)}</div>
                              {r.code_word ? (
                                <div style={{ fontSize: '0.72rem', color: '#444444', fontWeight: 700, marginTop: '2px' }}>
                                  ({r.code_word})
                                </div>
                              ) : null}
                            </td>

                            {/* DESTINATION (e.g. A to B / 📍 From: Zone A • To: Zone B) */}
                            <td style={{ border: '1px solid #000000', padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>
                              <div style={{ fontSize: '0.9rem', color: '#000000' }}>
                                {r.destination}
                              </div>
                              {zoneDetails && (
                                <div style={{ fontSize: '0.74rem', color: '#444444', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>📍</span>
                                  <span>{zoneDetails}</span>
                                </div>
                              )}
                              {r.note && (
                                <div style={{ fontSize: '0.72rem', color: '#666666', fontStyle: 'italic', marginTop: '2px' }}>
                                  {r.note}
                                </div>
                              )}
                            </td>

                            {/* DIESEL PRICE (RM) */}
                            <td style={{ border: '1px solid #000000', padding: '10px 8px', fontWeight: 800, fontSize: '0.9rem' }}>
                              {r.diesel_price || '—'}
                            </td>

                            {/* 1 ton 9 ft (RM) */}
                            <td style={{ border: '1px solid #000000', padding: '10px 8px', fontWeight: 800, textAlign: 'center', fontSize: '0.9rem' }}>
                              {r.rates?.['1 ton 9 ft'] || '—'}
                            </td>

                            {/* 3 & 5 ton 17 ft (RM) */}
                            <td style={{ border: '1px solid #000000', padding: '10px 8px', fontWeight: 800, textAlign: 'center', fontSize: '0.9rem' }}>
                              {r.rates?.['3 & 5 ton 17 ft'] || r.rates?.['3 & 5 ton'] || '—'}
                            </td>

                            {/* 10 ton 24ft (RM) */}
                            <td style={{ border: '1px solid #000000', padding: '10px 8px', fontWeight: 800, textAlign: 'center', fontSize: '0.9rem' }}>
                              {r.rates?.['10 ton 24ft'] || r.rates?.['10 ton'] || '—'}
                            </td>

                            {/* 14 ton 30ft (RM) */}
                            <td style={{ border: '1px solid #000000', padding: '10px 8px', fontWeight: 800, textAlign: 'center', fontSize: '0.9rem' }}>
                              {r.rates?.['14 ton 30ft'] || r.rates?.['14 ton'] || r.rates?.['30ft'] || '—'}
                            </td>

                            {/* 20 ton 40ft (RM) */}
                            <td style={{ border: '1px solid #000000', padding: '10px 8px', fontWeight: 800, textAlign: 'center', fontSize: '0.9rem' }}>
                              {r.rates?.['20 ton 40ft'] || r.rates?.['20 ton'] || r.rates?.['40ft'] || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '14px 24px',
                background: '#F8FAFC',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.8rem',
                color: 'var(--slate)',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div>
                <strong>Note:</strong> Standard waiting charges apply after 2 hours: <strong>RM50.00/hour</strong>. Extra drops: <strong>RM70 - RM100</strong>.
              </div>
              <button
                type="button"
                className="btn gh"
                onClick={() => setViewingCustomer(null)}
                style={{ height: '34px', padding: '0 16px', fontSize: '0.82rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT ROUTE RATE MODAL */}
      {/* ========================================================================= */}
      {isAddEditOpen && createPortal(
        <div
          className="overlay open"
          onClick={() => setIsAddEditOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
            zIndex: 100000
          }}
        >
          <div
            className="cmdbox"
            style={{
              maxWidth: '920px',
              width: '100%',
              background: '#FFFFFF',
              borderRadius: '22px',
              padding: '28px 34px',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
              border: '1px solid var(--line)',
              margin: 'auto',
              maxHeight: '92vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Tag size={20} style={{ color: 'var(--orange)' }} />
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                  {editingId ? 'Edit Destination Rate' : 'Add Destination Rate'}
                </h3>
              </div>
              <button
                onClick={() => setIsAddEditOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--slate)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRouteSubmit}>
              {/* Datalist for Zone Types */}
              <datalist id="pickup-zone-list">
                {allAvailablePricingZones.map(z => (
                  <option key={`p_${z}`} value={z} />
                ))}
              </datalist>
              <datalist id="drop-zone-list">
                {allAvailablePricingZones.map(z => (
                  <option key={`d_${z}`} value={z} />
                ))}
              </datalist>

              {/* Row 1: Target Customer Dropdown & Item # */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1.4fr 1.2fr', gap: '14px', marginBottom: '16px', fontSize: '0.84rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px' }}>Item #</label>
                  <input
                    type="text"
                    value={formData.item_no}
                    onChange={(e) => setFormData({ ...formData, item_no: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'center', fontWeight: 700, height: '40px', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '6px' }}>
                    Select Customer / Client *
                  </label>
                  <select
                    value={formData.customer_id}
                    onChange={(e) => {
                      const selId = e.target.value;
                      const selCust = customers.find(c => String(c.id) === String(selId));
                      setFormData({
                        ...formData,
                        customer_id: selId,
                        client_tag: selCust ? selCust.company_name : '',
                        pickup_zone: selCust?.zone || formData.pickup_zone
                      });
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      height: '40px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      background: '#FFFFFF',
                      color: 'var(--navy-900)'
                    }}
                  >
                    <option value="">-- Select Registered Customer --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} {c.registration_no ? `(${c.registration_no})` : ''} - {c.zone || 'Zone A'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px' }}>Remark / Code Word</label>
                  <input
                    type="text"
                    placeholder="e.g. 5384, 6729, CODE-01"
                    value={formData.code_word}
                    onChange={(e) => setFormData({ ...formData, code_word: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 600, height: '40px', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              {/* Row 2: Pickup Location, Pickup Zone, Drop Location, Drop Zone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 1.3fr 0.9fr', gap: '14px', marginBottom: '16px', fontSize: '0.84rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: '#059669', marginBottom: '6px' }}>
                    Pickup Location *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senawang"
                    value={formData.pickup_location}
                    onChange={(e) => {
                      const p = e.target.value;
                      const autoDest = p && formData.drop_location ? `${p} to ${formData.drop_location}` : (p || formData.destination);
                      setFormData({ ...formData, pickup_location: p, destination: autoDest });
                    }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 600, height: '40px', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: '#059669', marginBottom: '6px' }}>
                    Pickup Zone Type
                  </label>
                  <input
                    type="text"
                    list="pickup-zone-list"
                    placeholder="e.g. Zone A"
                    value={formData.pickup_zone}
                    onChange={(e) => setFormData({ ...formData, pickup_zone: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #A7F3D0', borderRadius: '8px', fontWeight: 700, background: '#F0FDF4', height: '40px', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: 'var(--orange)', marginBottom: '6px' }}>
                    Drop Location *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shah Alam"
                    value={formData.drop_location}
                    onChange={(e) => {
                      const d = e.target.value;
                      const autoDest = formData.pickup_location && d ? `${formData.pickup_location} to ${d}` : (d ? `to ${d}` : formData.destination);
                      setFormData({ ...formData, drop_location: d, destination: autoDest });
                    }}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 600, height: '40px', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: 'var(--orange)', marginBottom: '6px' }}>
                    Drop Zone Type
                  </label>
                  <input
                    type="text"
                    list="drop-zone-list"
                    placeholder="e.g. Zone B"
                    value={formData.drop_zone}
                    onChange={(e) => setFormData({ ...formData, drop_zone: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #FED7AA', borderRadius: '8px', fontWeight: 700, background: '#FFF7ED', height: '40px', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              {/* Row 3: Destination Route Name & Special Route Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px', marginBottom: '16px', fontSize: '0.84rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '6px' }}>
                    Destination Route Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senawang to Shah Alam"
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 700, height: '40px', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, color: 'var(--slate)', marginBottom: '6px' }}>
                    Special Route Notes / Waiting Charges
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. #waiting charges - after 2 hours, per hours RM50.00"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '0.88rem', height: '40px' }}
                  />
                </div>
              </div>

              {/* Tier 1: Editable Diesel Tier Band & Rates */}
              <div style={{ background: '#F8FAFC', border: '1px solid var(--line)', borderRadius: '14px', padding: '14px 18px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Fuel size={16} style={{ color: '#2563EB' }} />
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--navy-900)' }}>
                      Diesel Tier 1 Rate Band:
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--slate)' }}>RM</span>
                    <input
                      type="text"
                      placeholder="e.g. 1.50 - 2.00"
                      value={formData.tier1_band}
                      onChange={(e) => setFormData({ ...formData, tier1_band: e.target.value })}
                      style={{ padding: '5px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '0.86rem', fontWeight: 700, width: '140px', background: '#FFFFFF', height: '32px' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '0.84rem' }}>
                  <div>
                    <label style={{ display: 'block', color: 'var(--slate)', marginBottom: '4px', fontSize: '0.78rem', fontWeight: 600 }}>5 Ton 17ft</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.tier1_5ton}
                      onChange={(e) => setFormData({ ...formData, tier1_5ton: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'right', fontWeight: 700, height: '36px', fontSize: '0.88rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--slate)', marginBottom: '4px', fontSize: '0.78rem', fontWeight: 600 }}>10 Ton 24ft</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.tier1_10ton}
                      onChange={(e) => setFormData({ ...formData, tier1_10ton: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'right', fontWeight: 700, height: '36px', fontSize: '0.88rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--slate)', marginBottom: '4px', fontSize: '0.78rem', fontWeight: 600 }}>30ft Lorry</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.tier1_30ft}
                      onChange={(e) => setFormData({ ...formData, tier1_30ft: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'right', fontWeight: 700, height: '36px', fontSize: '0.88rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--slate)', marginBottom: '4px', fontSize: '0.78rem', fontWeight: 600 }}>40ft Lorry</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.tier1_40ft}
                      onChange={(e) => setFormData({ ...formData, tier1_40ft: e.target.value })}
                      style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'right', fontWeight: 700, height: '36px', fontSize: '0.88rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Tier 2: Editable Diesel Tier Band & Rates */}
              <div style={{ background: '#F8FAFC', border: '1px solid var(--line)', borderRadius: '14px', padding: '14px 18px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Fuel size={16} style={{ color: '#DC2626' }} />
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#DC2626' }}>
                      Diesel Tier 2 Rate Band:
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626' }}>RM</span>
                      <input
                        type="text"
                        placeholder="e.g. 2.00 - 2.18"
                        value={formData.tier2_band}
                        onChange={(e) => setFormData({ ...formData, tier2_band: e.target.value })}
                        disabled={!formData.has_tier2}
                        style={{ padding: '5px 10px', border: '1px solid #FECACA', borderRadius: '6px', fontSize: '0.86rem', fontWeight: 700, width: '140px', background: formData.has_tier2 ? '#FFFFFF' : '#F1F5F9', color: '#DC2626', height: '32px' }}
                      />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={formData.has_tier2}
                      onChange={(e) => setFormData({ ...formData, has_tier2: e.target.checked })}
                    />
                    <span>Include Tier 2</span>
                  </label>
                </div>

                {formData.has_tier2 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '0.84rem' }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--slate)', marginBottom: '4px', fontSize: '0.78rem', fontWeight: 600 }}>5 Ton 17ft</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.tier2_5ton}
                        onChange={(e) => setFormData({ ...formData, tier2_5ton: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'right', fontWeight: 700, color: '#DC2626', height: '36px', fontSize: '0.88rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--slate)', marginBottom: '4px', fontSize: '0.78rem', fontWeight: 600 }}>10 Ton 24ft</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.tier2_10ton}
                        onChange={(e) => setFormData({ ...formData, tier2_10ton: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'right', fontWeight: 700, color: '#DC2626', height: '36px', fontSize: '0.88rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--slate)', marginBottom: '4px', fontSize: '0.78rem', fontWeight: 600 }}>30ft Lorry</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.tier2_30ft}
                        onChange={(e) => setFormData({ ...formData, tier2_30ft: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'right', fontWeight: 700, color: '#DC2626', height: '36px', fontSize: '0.88rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--slate)', marginBottom: '4px', fontSize: '0.78rem', fontWeight: 600 }}>40ft Lorry</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.tier2_40ft}
                        onChange={(e) => setFormData({ ...formData, tier2_40ft: e.target.value })}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '8px', textAlign: 'right', fontWeight: 700, color: '#DC2626', height: '36px', fontSize: '0.88rem' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn gh"
                  onClick={() => setIsAddEditOpen(false)}
                  style={{ height: '38px', padding: '0 20px', fontSize: '0.88rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn pri"
                  style={{ height: '38px', padding: '0 24px', fontSize: '0.88rem', fontWeight: 700 }}
                >
                  Save Route Rate
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {deletingRate && createPortal(
        <div
          className="overlay open"
          onClick={() => setDeletingRate(null)}
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
            zIndex: 100001
          }}
        >
          <div
            className="cmdbox"
            style={{
              maxWidth: '420px',
              width: '100%',
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '24px',
              textAlign: 'center',
              margin: 'auto',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto'
            }}>
              <Trash2 size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)' }}>
              Delete Route Rate?
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: 'var(--slate)' }}>
              Are you sure you want to remove item <strong>{deletingRate.item_no}: {deletingRate.destination}</strong> from the price schedule?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button
                type="button"
                className="btn gh"
                onClick={() => setDeletingRate(null)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={confirmDeleteRoute}
                style={{ flex: 1, background: '#DC2626', color: '#FFF', borderColor: '#DC2626' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

