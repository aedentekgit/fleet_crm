import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb, fmtMoney, jobNoFromQuoteNo, deduplicateJobs, subscribeTable, getStorageData } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/common/Pagination';
import {
  Search,
  X,
  Truck,
  User,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Inbox,
  Eye,
  Plus,
  Trash2,
  DollarSign,
  Receipt,
  FileText,
  CreditCard,
  Banknote,
  Percent,
  Check,
  Save,
  Fuel,
  Coins,
  PackageCheck,
  PackagePlus,
  Building2,
  Clock,
  Sparkles
} from 'lucide-react';
import { JobDetailModal, getJobDisplayDate } from './JobBoard';

export default function ExpensesReport() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [jobs, setJobs] = useState(() => getStorageData('jobs'));
  const [lorries, setLorries] = useState(() => getStorageData('lorries'));
  const [drivers, setDrivers] = useState(() => getStorageData('drivers'));
  const [focusId, setFocusId] = useState(null);

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [lorryFilter, setLorryFilter] = useState('all');
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('all'); // 'all' | 'entered' | 'pending'

  // Modals
  const [viewJobModal, setViewJobModal] = useState(null);
  const [expenseModalJob, setExpenseModalJob] = useState(null);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    diesel_expense: '',
    driver_salary: '',
    salary_payment_mode: 'cash', // 'cash' | 'invoice'
    toll_charges: '',
    loading_charges: '',
    unloading_charges: '',
    loading_unloading_charges: '',
    custom_expenses: [], // Array of { id, name, amount }
    notes: ''
  });

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
        console.warn('Expenses report load error:', e);
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

    // Deduplicate jobs
    const dedupedAll = deduplicateJobs(j);

    // Filter to DELIVERED jobs
    const deliveredJobs = dedupedAll.filter(item => {
      return item && item.status === 'delivered' && item.status !== 'cancelled';
    });

    setJobs(deliveredJobs);
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

  // Resolve Customer Name
  const resolveCustomerName = (card) => {
    if (!card) return 'Direct Customer';
    return card.customer?.company_name ||
           card.customer_name ||
           (card.pickup_location && !card.pickup_location.toLowerCase().startsWith('pt ') && !card.pickup_location.toLowerCase().startsWith('no') ? card.pickup_location.split(',')[0].trim() : null) ||
           card.customer_ref?.split('|')[0]?.trim() ||
           'Direct Customer';
  };

  // Helper to compute total expenses for a single job
  const getJobTotalExpenses = (job) => {
    if (!job) return 0;
    if (typeof job.total_expenses === 'number' && job.total_expenses > 0) {
      return job.total_expenses;
    }
    const diesel = parseFloat(job.diesel_expense || job.diesel_cost) || 0;
    const salary = parseFloat(job.driver_salary) || 0;
    const toll = parseFloat(job.toll_charges || job.tng_cost) || 0;
    const loading = parseFloat(job.loading_charges) || 0;
    const unloading = parseFloat(job.unloading_charges) || 0;
    const legacyLoading = (loading + unloading > 0) ? (loading + unloading) : (parseFloat(job.loading_unloading_charges) || 0);
    const maint = parseFloat(job.maintenance_cost) || 0;
    
    let customSum = 0;
    if (Array.isArray(job.custom_expenses)) {
      customSum = job.custom_expenses.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    } else if (job.extra_expenses) {
      customSum = parseFloat(job.extra_expenses) || 0;
    }

    const total = diesel + salary + toll + legacyLoading + maint + customSum;
    return total;
  };

  // Helper to check if expenses have been recorded for a job
  const hasExpensesRecorded = (job) => {
    if (!job) return false;
    return (
      (parseFloat(job.diesel_expense || job.diesel_cost) > 0) ||
      (parseFloat(job.driver_salary) > 0) ||
      (parseFloat(job.toll_charges || job.tng_cost) > 0) ||
      (parseFloat(job.loading_charges) > 0) ||
      (parseFloat(job.unloading_charges) > 0) ||
      (parseFloat(job.loading_unloading_charges) > 0) ||
      (Array.isArray(job.custom_expenses) && job.custom_expenses.length > 0) ||
      (parseFloat(job.total_expenses) > 0)
    );
  };

  // Filtered jobs list
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (lorryFilter !== 'all' && job.lorry_id !== lorryFilter) return false;

      const hasExp = hasExpensesRecorded(job);
      if (expenseStatusFilter === 'entered' && !hasExp) return false;
      if (expenseStatusFilter === 'pending' && hasExp) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const jNo = (job.job_no || '').toLowerCase();
        const cust = (job.customer?.company_name || job.customer_name || '').toLowerCase();
        const pickup = (job.pickup_location || job.origin || '').toLowerCase();
        const dropoff = (job.dropoff_location || job.destination || '').toLowerCase();
        const lorry = lorries.find(l => l.id === job.lorry_id);
        const lorryPlate = (lorry?.plate_no || job.plate_no || '').toLowerCase();
        const crewNames = (job.job_crew || []).map(c => (c.driver?.name || '').toLowerCase()).join(' ');

        const matches = jNo.includes(q) || cust.includes(q) || pickup.includes(q) || dropoff.includes(q) || lorryPlate.includes(q) || crewNames.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [jobs, lorryFilter, expenseStatusFilter, searchQuery, lorries]);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
  }, [lorryFilter, expenseStatusFilter, searchQuery]);

  const paginatedJobs = useMemo(() => {
    return filteredJobs.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredJobs, page, pageSize]);

  // Overall totals
  const pageTotals = useMemo(() => {
    const totalDelivered = jobs.length;
    const withExpenses = jobs.filter(hasExpensesRecorded).length;
    const pendingExpenses = totalDelivered - withExpenses;
    const totalExpenseAmount = jobs.reduce((sum, j) => sum + getJobTotalExpenses(j), 0);
    const totalRevenueAmount = jobs.reduce((sum, j) => sum + (parseFloat(j.rate_amount) || 0), 0);
    const netProfitAmount = totalRevenueAmount - totalExpenseAmount;

    return {
      totalDelivered,
      withExpenses,
      pendingExpenses,
      totalExpenseAmount,
      totalRevenueAmount,
      netProfitAmount
    };
  }, [jobs]);

  // Open Expense Modal
  const handleOpenExpenseModal = (job) => {
    setExpenseModalJob(job);
    
    // Parse existing custom expenses if present
    let existingCustom = [];
    if (Array.isArray(job.custom_expenses)) {
      existingCustom = job.custom_expenses;
    } else if (typeof job.custom_expenses === 'string') {
      try {
        existingCustom = JSON.parse(job.custom_expenses);
      } catch (_) {}
    }

    setExpenseForm({
      diesel_expense: job.diesel_expense !== undefined ? String(job.diesel_expense || '') : (job.diesel_cost ? String(job.diesel_cost) : ''),
      driver_salary: job.driver_salary !== undefined ? String(job.driver_salary || '') : '',
      salary_payment_mode: job.salary_payment_mode || 'cash',
      toll_charges: job.toll_charges !== undefined ? String(job.toll_charges || '') : (job.tng_cost ? String(job.tng_cost) : ''),
      loading_charges: job.loading_charges !== undefined ? String(job.loading_charges || '') : (job.loading_unloading_charges !== undefined && !job.unloading_charges ? String(job.loading_unloading_charges || '') : ''),
      unloading_charges: job.unloading_charges !== undefined ? String(job.unloading_charges || '') : '',
      loading_unloading_charges: job.loading_unloading_charges !== undefined ? String(job.loading_unloading_charges || '') : '',
      custom_expenses: existingCustom.length > 0 ? existingCustom : [],
      notes: job.expense_notes || ''
    });
  };

  // Add custom expense line
  const handleAddCustomExpense = () => {
    setExpenseForm(prev => ({
      ...prev,
      custom_expenses: [
        ...prev.custom_expenses,
        { id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), name: '', amount: '' }
      ]
    }));
  };

  // Remove custom expense line
  const handleRemoveCustomExpense = (id) => {
    setExpenseForm(prev => ({
      ...prev,
      custom_expenses: prev.custom_expenses.filter(c => c.id !== id)
    }));
  };

  // Update custom expense line
  const handleUpdateCustomExpense = (id, field, value) => {
    setExpenseForm(prev => ({
      ...prev,
      custom_expenses: prev.custom_expenses.map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  };

  // Live calculation inside modal
  const modalCalculatedTotal = useMemo(() => {
    const diesel = parseFloat(expenseForm.diesel_expense) || 0;
    const salary = parseFloat(expenseForm.driver_salary) || 0;
    const toll = parseFloat(expenseForm.toll_charges) || 0;
    const loading = parseFloat(expenseForm.loading_charges) || 0;
    const unloading = parseFloat(expenseForm.unloading_charges) || 0;
    const custom = expenseForm.custom_expenses.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    return diesel + salary + toll + loading + unloading + custom;
  }, [expenseForm]);

  // Save Expense Report
  const handleSaveExpenses = async (e) => {
    if (e) e.preventDefault();
    if (!expenseModalJob || isSubmittingExpense) return;
    setIsSubmittingExpense(true);

    const diesel = parseFloat(expenseForm.diesel_expense) || 0;
    const salary = parseFloat(expenseForm.driver_salary) || 0;
    const toll = parseFloat(expenseForm.toll_charges) || 0;
    const loading = parseFloat(expenseForm.loading_charges) || 0;
    const unloading = parseFloat(expenseForm.unloading_charges) || 0;
    const combinedLoading = loading + unloading;
    const custom = expenseForm.custom_expenses
      .filter(c => c.name.trim() || parseFloat(c.amount) > 0)
      .map(c => ({ id: c.id, name: c.name.trim() || 'Custom Expense', amount: parseFloat(c.amount) || 0 }));
    
    const customTotal = custom.reduce((s, c) => s + c.amount, 0);
    const totalExpenses = diesel + salary + toll + loading + unloading + customTotal;

    const patch = {
      diesel_expense: diesel,
      diesel_cost: diesel,
      driver_salary: salary,
      salary_payment_mode: expenseForm.salary_payment_mode,
      toll_charges: toll,
      tng_cost: toll,
      loading_charges: loading,
      unloading_charges: unloading,
      loading_unloading_charges: combinedLoading,
      custom_expenses: custom,
      extra_expenses: customTotal,
      total_expenses: totalExpenses,
      expense_notes: expenseForm.notes,
      expenses_entered_at: new Date().toISOString()
    };

    // 1. Update Supabase if available
    if (sb) {
      try {
        if (expenseModalJob.id) {
          await sb.from('jobs').update(patch).eq('id', expenseModalJob.id);
        }
        if (expenseModalJob.job_no) {
          await sb.from('jobs').update(patch).eq('job_no', expenseModalJob.job_no);
        }
      } catch (err) {
        console.warn('Database expense save error:', err);
      }
    }

    // 2. Update localStorage (rens_db_jobs)
    try {
      const raw = localStorage.getItem('rens_db_jobs');
      if (raw) {
        const parsed = JSON.parse(raw);
        const updated = parsed.map(j => {
          if (j.id === expenseModalJob.id || (expenseModalJob.job_no && j.job_no === expenseModalJob.job_no)) {
            return { ...j, ...patch };
          }
          return j;
        });
        localStorage.setItem('rens_db_jobs', JSON.stringify(updated));
      }
    } catch (_) {}

    // 3. Update active state
    setJobs(prev => prev.map(j => {
      if (j.id === expenseModalJob.id || (expenseModalJob.job_no && j.job_no === expenseModalJob.job_no)) {
        return { ...j, ...patch };
      }
      return j;
    }));

    if (viewJobModal?.id === expenseModalJob.id) {
      setViewJobModal(prev => prev ? { ...prev, ...patch } : null);
    }

    // Trigger local reactivity broadcast for Sales & Targets and Fleet tracking
    try {
      window.dispatchEvent(new CustomEvent('rens_db_change', { detail: { table: 'jobs' } }));
    } catch (_) {}

    toast(`Expenses saved for Job ${expenseModalJob.job_no || ''}! Total: ${fmtMoney(totalExpenses)}`, 'ok');
    setIsSubmittingExpense(false);
    setExpenseModalJob(null);
  };

  return (
    <div className="page">
      {/* Page Header */}
      <div className="pagehead">
        <div>
          <h1>
            Expenses Report
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#059669', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 12px', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Receipt size={13} strokeWidth={2.4} />
              Delivered Orders Trip Expenses
            </span>
          </h1>
          <div className="sub" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>Manage operating expenses for delivered trips (Diesel, Driver Salary, Tolls, Loading, Unloading &amp; Custom Costs)</span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span>Syncs directly with Sales &amp; Targets Lorry Daily Expenses</span>
          </div>
        </div>
        <div className="tools" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn gh" onClick={() => navigate('/finalize')}>
            Finalize Page <kbd>G</kbd><kbd>Z</kbd>
          </button>
          <button className="btn pri" onClick={() => navigate('/sales')} style={{ background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)' }}>
            Sales &amp; Targets <kbd>G</kbd><kbd>S</kbd>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="kpis" style={{ marginTop: '16px', marginBottom: '20px' }}>
        <div className="kpi">
          <div className="k">Delivered Orders</div>
          <div className="v">{pageTotals.totalDelivered} <span style={{ fontSize: '0.85rem', color: 'var(--slate)', fontWeight: 600 }}>trips</span></div>
          <div className="d up">{pageTotals.withExpenses} with recorded expenses</div>
        </div>

        <div className="kpi">
          <div className="k">Total Trip Expenses</div>
          <div className="v" style={{ color: '#DC2626' }}>{pageTotals.totalExpenseAmount > 0 ? fmtMoney(pageTotals.totalExpenseAmount) : 'RM 0.00'}</div>
          <div className="d">Operating &amp; dispatch trip costs</div>
        </div>

        <div className="kpi">
          <div className="k">Delivered Revenue</div>
          <div className="v" style={{ color: '#059669' }}>{fmtMoney(pageTotals.totalRevenueAmount)}</div>
          <div className="d">Gross revenue from completed jobs</div>
        </div>

        <div className="kpi">
          <div className="k">Net Trip Profit</div>
          <div className="v" style={{ color: pageTotals.netProfitAmount >= 0 ? 'var(--navy-900)' : '#DC2626' }}>
            {fmtMoney(pageTotals.netProfitAmount)}
          </div>
          <div className="d">Delivered revenue minus trip expenses</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="filter-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          margin: '0 0 20px',
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
          <option value="all">All Vehicles ({lorries.length})</option>
          {lorries.map(l => (
            <option key={l.id} value={l.id}>{l.plate_no} ({l.capacity_desc || l.model || 'Lorry'})</option>
          ))}
        </select>

        {/* Expense Status Filter */}
        <select
          value={expenseStatusFilter}
          onChange={(e) => setExpenseStatusFilter(e.target.value)}
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
          <option value="all">All Expense Statuses</option>
          <option value="entered">✓ Expenses Recorded ({pageTotals.withExpenses})</option>
          <option value="pending">⏳ Pending Entry ({pageTotals.pendingExpenses})</option>
        </select>
      </div>

      {/* Delivered Orders Table */}
      <div className="desktop-table-container">
        <div className="tablecard tab-fade-in" style={{ width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
          <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '12%', padding: '10px 8px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Order / Job # &amp; Date</th>
                <th style={{ width: '14%', padding: '10px 8px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Customer</th>
                <th style={{ width: '12%', padding: '10px 8px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Route</th>
                <th style={{ width: '12%', padding: '10px 8px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Cargo / Specs</th>
                <th style={{ width: '14%', padding: '10px 8px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Vehicle &amp; Crew</th>
                <th style={{ width: '9%', textAlign: 'right', padding: '10px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Rate</th>
                <th style={{ width: '10%', textAlign: 'center', padding: '10px 6px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Status</th>
                <th style={{ width: '17%', textAlign: 'right', padding: '10px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>Actions</th>
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
                  const totalExp = getJobTotalExpenses(card);
                  const hasExp = hasExpensesRecorded(card);

                  return (
                    <tr
                      key={card.id}
                      className={isFocused ? 'focus' : ''}
                      onClick={() => setFocusId(card.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* 1. Job # & Date */}
                      <td style={{ verticalAlign: 'middle', padding: '8px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
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

                      {/* 2. Customer */}
                      <td style={{ verticalAlign: 'middle', padding: '8px 8px', textAlign: 'left', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={customerName}>
                          {customerName}
                        </div>
                        {card.customer_ref && <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ref: {card.customer_ref}</div>}
                      </td>

                      {/* 3. Route */}
                      <td style={{ verticalAlign: 'middle', padding: '8px 8px', textAlign: 'left', overflow: 'hidden' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#F8FAFC', padding: '2px 5px', borderRadius: '6px', border: '1px solid #E2E8F0', maxWidth: '100%' }}>
                          <span className="r-dot pickup" style={{ flexShrink: 0 }}></span>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '56px' }} title={pickup}>{pickup}</span>
                          <ArrowRight size={10} strokeWidth={2.4} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                          <span className="r-dot dropoff" style={{ flexShrink: 0 }}></span>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '56px' }} title={dropoff}>{dropoff}</span>
                        </div>
                      </td>

                      {/* 4. Cargo / Specs */}
                      <td style={{ verticalAlign: 'middle', padding: '8px 8px', textAlign: 'left', overflow: 'hidden' }}>
                        <div className="cargo-spec-pill" style={{ display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', fontSize: '0.7rem', padding: '2px 5px' }} title={weightText}>
                          {weightText}
                        </div>
                        {card.special_instructions && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--orange-600)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={card.special_instructions.startsWith('{') ? 'Contract Rate Card' : card.special_instructions}>
                            <AlertTriangle size={10} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                            <span>{card.special_instructions.startsWith('{') ? 'Contract Rate Card' : card.special_instructions}</span>
                          </div>
                        )}
                      </td>

                      {/* 5. Vehicle & Crew */}
                      <td style={{ verticalAlign: 'middle', padding: '8px 8px', textAlign: 'left', overflow: 'hidden' }}>
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
                          <span style={{ fontSize: '0.74rem', color: 'var(--slate)', fontStyle: 'italic' }}>— Unassigned —</span>
                        )}
                      </td>

                      {/* 6. Rate */}
                      <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '8px 8px', whiteSpace: 'nowrap' }}>
                        <div style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.82rem' }}>
                          {rateText}
                        </div>
                      </td>

                      {/* 7. Status */}
                      <td style={{ verticalAlign: 'middle', textAlign: 'center', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        <span className="badge green" style={{ fontSize: '0.66rem', padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={11} strokeWidth={2.4} /> DELIVERED
                        </span>
                      </td>

                      {/* 8. Actions (Replaced TO BILL with Add/Edit Expense) */}
                      <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '8px 8px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px', flexWrap: 'nowrap' }}>
                          {/* View Button */}
                          <button
                            className="btn gh sm"
                            style={{ height: '28px', padding: '0 8px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}
                            onClick={(e) => { e.stopPropagation(); setViewJobModal(card); }}
                            title="View Full Job Details"
                          >
                            <Eye size={12} strokeWidth={2.2} />
                            View
                          </button>

                          {/* Add / Edit Expense Button (Replaces TO BILL) */}
                          <button
                            className="btn sm"
                            style={{
                              height: '28px',
                              padding: '0 10px',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              flexShrink: 0,
                              background: hasExp ? '#F0FDF4' : 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                              color: hasExp ? '#15803D' : '#FFFFFF',
                              border: hasExp ? '1px solid #86EFAC' : 'none',
                              boxShadow: hasExp ? 'none' : '0 2px 6px rgba(234, 88, 12, 0.25)',
                              cursor: 'pointer'
                            }}
                            onClick={(e) => { e.stopPropagation(); handleOpenExpenseModal(card); }}
                            title={hasExp ? `Expenses: ${fmtMoney(totalExp)} (Click to edit)` : 'Add Trip Expenses'}
                          >
                            {hasExp ? (
                              <>
                                <Check size={12} strokeWidth={2.8} />
                                <span>{fmtMoney(totalExp)}</span>
                              </>
                            ) : (
                              <>
                                <Plus size={12} strokeWidth={2.8} />
                                <span>Add</span>
                              </>
                            )}
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
                    No delivered orders found matching your search or filters.
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
            itemName="delivered orders"
          />
        </div>
      </div>

      {/* EXPENSE ENTRY POPUP MODAL */}
      {expenseModalJob && createPortal(
        <div className="overlay open" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(6px)', padding: '20px' }} onClick={() => setExpenseModalJob(null)}>
          <div
            className="modal"
            style={{
              maxWidth: '1080px',
              width: '95%',
              borderRadius: '24px',
              background: '#FFFFFF',
              boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              border: '1px solid #E2E8F0',
              padding: 0,
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '18px 28px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)' }}>
                  <Receipt size={22} strokeWidth={2.4} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                      Trip Expenses Report
                    </h3>
                    <span className="jno-pill" style={{ fontSize: '0.8rem', padding: '2px 8px' }}>{expenseModalJob.job_no}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--slate)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--navy-800)' }}>{resolveCustomerName(expenseModalJob)}</span>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: 600 }}>{expenseModalJob.pickup_location || 'Origin'}</span>
                      <ArrowRight size={12} style={{ color: 'var(--orange)' }} />
                      <span style={{ fontWeight: 600 }}>{expenseModalJob.dropoff_location || 'Destination'}</span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setExpenseModalJob(null)}
                style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', transition: 'all 0.2s' }}
                title="Close"
              >
                <X size={17} strokeWidth={2.4} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveExpenses} style={{ padding: '22px 28px 24px' }}>
              {/* Row 1: 5 Main Expense Cards with Perfect Alignment and Equal Height */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '18px' }}>
                {/* 1. Diesel Expenses */}
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '142px' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '10px' }}>
                      <Fuel size={15} style={{ color: '#F97316' }} />
                      Diesel Expenses
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--slate)', fontSize: '0.86rem' }}>RM</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={expenseForm.diesel_expense}
                        onChange={(e) => setExpenseForm({ ...expenseForm, diesel_expense: e.target.value })}
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '0 10px 0 40px',
                          borderRadius: '10px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          color: 'var(--navy-900)',
                          background: '#FFFFFF',
                          outline: 'none',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F97316' }}></span>
                    <span>Fuel card / receipts</span>
                  </div>
                </div>

                {/* 2. Driver Salary with Cash/Invoice selector */}
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '142px' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '10px' }}>
                      <Coins size={15} style={{ color: '#059669' }} />
                      Driver Salary
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--slate)', fontSize: '0.86rem' }}>RM</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={expenseForm.driver_salary}
                        onChange={(e) => setExpenseForm({ ...expenseForm, driver_salary: e.target.value })}
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '0 10px 0 40px',
                          borderRadius: '10px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          color: 'var(--navy-900)',
                          background: '#FFFFFF',
                          outline: 'none',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      />
                    </div>
                  </div>
                  {/* Segmented Payment Mode selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#E2E8F0', padding: '2px', borderRadius: '8px', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setExpenseForm({ ...expenseForm, salary_payment_mode: 'cash' })}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: expenseForm.salary_payment_mode === 'cash' ? '#FFFFFF' : 'transparent',
                        color: expenseForm.salary_payment_mode === 'cash' ? '#059669' : '#64748B',
                        fontWeight: 800,
                        fontSize: '0.72rem',
                        padding: '4px 4px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '3px',
                        boxShadow: expenseForm.salary_payment_mode === 'cash' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Banknote size={12} /> Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseForm({ ...expenseForm, salary_payment_mode: 'invoice' })}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: expenseForm.salary_payment_mode === 'invoice' ? '#FFFFFF' : 'transparent',
                        color: expenseForm.salary_payment_mode === 'invoice' ? '#2563EB' : '#64748B',
                        fontWeight: 800,
                        fontSize: '0.72rem',
                        padding: '4px 4px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '3px',
                        boxShadow: expenseForm.salary_payment_mode === 'invoice' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <FileText size={12} /> Invoice
                    </button>
                  </div>
                </div>

                {/* 3. Toll Charges */}
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '142px' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '10px' }}>
                      <CreditCard size={15} style={{ color: '#2563EB' }} />
                      Toll Charges (TNG)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--slate)', fontSize: '0.86rem' }}>RM</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={expenseForm.toll_charges}
                        onChange={(e) => setExpenseForm({ ...expenseForm, toll_charges: e.target.value })}
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '0 10px 0 40px',
                          borderRadius: '10px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          color: 'var(--navy-900)',
                          background: '#FFFFFF',
                          outline: 'none',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB' }}></span>
                    <span>Touch &apos;n Go / RFID</span>
                  </div>
                </div>

                {/* 4. Loading Charges */}
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '142px' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '10px' }}>
                      <PackagePlus size={15} style={{ color: '#7C3AED' }} />
                      Loading Charges
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--slate)', fontSize: '0.86rem' }}>RM</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={expenseForm.loading_charges}
                        onChange={(e) => setExpenseForm({ ...expenseForm, loading_charges: e.target.value })}
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '0 10px 0 40px',
                          borderRadius: '10px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          color: 'var(--navy-900)',
                          background: '#FFFFFF',
                          outline: 'none',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7C3AED' }}></span>
                    <span>Pickup / handling cost</span>
                  </div>
                </div>

                {/* 5. Unloading Charges */}
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '142px' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '10px' }}>
                      <PackageCheck size={15} style={{ color: '#6366F1' }} />
                      Unloading Charges
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--slate)', fontSize: '0.86rem' }}>RM</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={expenseForm.unloading_charges}
                        onChange={(e) => setExpenseForm({ ...expenseForm, unloading_charges: e.target.value })}
                        style={{
                          width: '100%',
                          height: '42px',
                          padding: '0 10px 0 40px',
                          borderRadius: '10px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          color: 'var(--navy-900)',
                          background: '#FFFFFF',
                          outline: 'none',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366F1' }}></span>
                    <span>Dropoff / labour cost</span>
                  </div>
                </div>
              </div>

              {/* Row 2: 2-Column Balanced Cards for Custom Expenses and Remarks */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '18px' }}>
                {/* Left Card: Dynamic Manual Custom Expenses */}
                <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', minHeight: '165px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.84rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                      <Sparkles size={16} style={{ color: '#F59E0B' }} />
                      Additional / Manual Custom Expenses
                      {expenseForm.custom_expenses.length > 0 && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#FEF3C7', color: '#B45309', padding: '1px 6px', borderRadius: '99px' }}>
                          {expenseForm.custom_expenses.length}
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={handleAddCustomExpense}
                      className="btn sm"
                      style={{
                        background: '#EFF6FF',
                        color: '#2563EB',
                        border: '1px solid #BFDBFE',
                        fontWeight: 800,
                        fontSize: '0.74rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={13} strokeWidth={2.6} /> Add Custom Box
                    </button>
                  </div>

                  {expenseForm.custom_expenses.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
                      {expenseForm.custom_expenses.map((item, idx) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="text"
                            placeholder={`Expense Title #${idx + 1} (e.g. Weighbridge, Parking, Food Allowance)`}
                            value={item.name}
                            onChange={(e) => handleUpdateCustomExpense(item.id, 'name', e.target.value)}
                            style={{
                              flex: 2,
                              height: '36px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '0.84rem',
                              background: '#FFFFFF',
                              outline: 'none',
                              color: 'var(--navy-900)'
                            }}
                          />
                          <div style={{ flex: 1, position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--slate)', fontSize: '0.8rem' }}>RM</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={item.amount}
                              onChange={(e) => handleUpdateCustomExpense(item.id, 'amount', e.target.value)}
                              style={{
                                width: '100%',
                                height: '36px',
                                padding: '0 8px 0 34px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.86rem',
                                fontWeight: 800,
                                color: 'var(--navy-900)',
                                background: '#FFFFFF',
                                outline: 'none'
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomExpense(item.id)}
                            style={{
                              background: '#FEE2E2',
                              color: '#DC2626',
                              border: 'none',
                              borderRadius: '8px',
                              width: '34px',
                              height: '34px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0
                            }}
                            title="Remove this expense box"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      onClick={handleAddCustomExpense}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1.5px dashed #CBD5E1',
                        borderRadius: '12px',
                        background: '#FFFFFF',
                        cursor: 'pointer',
                        padding: '16px',
                        color: 'var(--slate)',
                        fontSize: '0.8rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Plus size={18} style={{ color: '#2563EB', marginBottom: '4px' }} />
                      <span>No custom expense boxes yet. <b>Click here to add one</b></span>
                    </div>
                  )}
                </div>

                {/* Right Card: Remarks & Receipt Details */}
                <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', minHeight: '165px' }}>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 800, color: 'var(--navy-900)', marginBottom: '8px' }}>
                    Trip Expense Remarks &amp; Receipt Reference
                  </label>
                  <textarea
                    rows="3"
                    placeholder="Enter optional notes regarding receipts, fuel card numbers, payment vouchers, driver advances..."
                    value={expenseForm.notes}
                    onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                    style={{
                      width: '100%',
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.84rem',
                      background: '#FFFFFF',
                      outline: 'none',
                      resize: 'none',
                      color: 'var(--navy-900)',
                      lineHeight: '1.4'
                    }}
                  />
                </div>
              </div>

              {/* MODAL DOWNSIDE: REAL-TIME TOTAL EXPENSES & ACTION BUTTONS */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                  borderRadius: '18px',
                  padding: '16px 24px',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.2)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', fontWeight: 800 }}>
                      Total Trip Expenses
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#38BDF8', letterSpacing: '-0.02em', marginTop: '2px' }}>
                      {fmtMoney(modalCalculatedTotal)}
                    </div>
                  </div>
                  <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.15)' }}></div>
                  <div style={{ fontSize: '0.78rem', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div>Delivered Rate: <b style={{ color: '#FFFFFF' }}>{fmtMoney(expenseModalJob.rate_amount || 0)}</b></div>
                    <div style={{ color: (expenseModalJob.rate_amount || 0) - modalCalculatedTotal >= 0 ? '#4ADE80' : '#F87171', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Estimated Profit:</span>
                      <span>{fmtMoney((parseFloat(expenseModalJob.rate_amount) || 0) - modalCalculatedTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Modal Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setExpenseModalJob(null)}
                    style={{
                      height: '42px',
                      padding: '0 18px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#E2E8F0',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingExpense}
                    style={{
                      height: '42px',
                      padding: '0 24px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Save size={16} strokeWidth={2.4} />
                    {isSubmittingExpense ? 'Saving…' : 'Save & Sync Expenses'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* JOB DETAIL VIEW MODAL */}
      {viewJobModal && (
        <JobDetailModal
          job={viewJobModal}
          lorries={lorries}
          drivers={drivers}
          onClose={() => setViewJobModal(null)}
          onEdit={() => {
            const j = viewJobModal;
            setViewJobModal(null);
            handleOpenExpenseModal(j);
          }}
        />
      )}
    </div>
  );
}
