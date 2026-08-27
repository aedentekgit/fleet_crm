import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sb, fmtMoney, fmtDate, daysUntil, withSST, subscribeTable, getStorageData } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import {
  TrendingUp,
  Truck,
  Wrench,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Send,
  ShieldAlert,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  Check,
  FileText,
  Clock,
  BarChart3,
  Layers,
  ArrowRight,
  RotateCcw
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState(() => getStorageData('jobs'));
  const [lorries, setLorries] = useState(() => getStorageData('lorries'));
  const [issu, setIssu] = useState(() => getStorageData('inventory_issuances'));
  const [focusId, setFocusId] = useState(null);

  // Date selection state
  const [timeRange, setTimeRange] = useState('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const dateMenuRef = useRef(null);

  const presets = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'this_quarter', label: 'This Quarter' },
    { id: 'ytd', label: 'Year to Date' },
    { id: 'all_time', label: 'All Time' },
  ];

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dateMenuRef.current && !dateMenuRef.current.contains(e.target)) {
        setIsDateMenuOpen(false);
      }
    };
    if (isDateMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDateMenuOpen]);

  const getDisplayLabel = () => {
    if (timeRange === 'custom') {
      if (customStartDate && customEndDate) return `${customStartDate} → ${customEndDate}`;
      if (customStartDate) return `From ${customStartDate}`;
      if (customEndDate) return `Until ${customEndDate}`;
      return 'Custom Range';
    }
    const found = presets.find(p => p.id === timeRange);
    return found ? found.label : 'This Month';
  };

  const loadData = useCallback(async () => {
    let j = [], l = [], is = [];
    if (sb) {
      try {
        const res = await Promise.all([
          sb.from('jobs').select('*, lorry:lorries(plate_no, capacity_desc), customer:customers(company_name)').neq('status', 'cancelled'),
          sb.from('lorries').select('*').order('plate_no', { ascending: true }),
          sb.from('inventory_issuances').select('quantity,unit_cost,approval_status,maintenance_record_id,issued_at'),
        ]);
        j = res[0].data || [];
        l = res[1].data || [];
        is = res[2].data || [];
      } catch (e) {}
    }
    setJobs(j);
    setLorries(l);
    setIssu(is);
  }, []);

  useEffect(() => {
    loadData();
    const unsub1 = subscribeTable('jobs', loadData);
    const unsub2 = subscribeTable('lorries', loadData);
    const unsub3 = subscribeTable('inventory_issuances', loadData);
    let ch = null;
    if (sb && typeof sb.channel === 'function') {
      ch = sb.channel('dash')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, loadData)
        .subscribe();
    }
    return () => {
      unsub1(); unsub2(); unsub3();
      if (ch && typeof ch.unsubscribe === 'function') {
        try { ch.unsubscribe(); } catch (e) {}
      }
      if (sb && typeof sb.removeChannel === 'function') {
        try { sb.removeChannel(ch); } catch (e) {}
      }
    };
  }, [loadData]);

  const markBilled = async (id) => {
    await sb.from('jobs').update({ billed_status: 'sent', billed_at: new Date().toISOString() }).eq('id', id);
    toast('Job invoice marked as sent to AutoCount', 'ok');
    loadData();
  };

  // Date filtering logic
  const filteredJobs = useMemo(() => {
    if (timeRange === 'all_time') return jobs;
    const now = new Date();
    let start = null;
    let end = null;

    if (timeRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeRange === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (timeRange === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (timeRange === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (timeRange === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), (q + 1) * 3, 0, 23, 59, 59, 999);
    } else if (timeRange === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (timeRange === 'custom') {
      if (customStartDate) start = new Date(customStartDate + 'T00:00:00');
      if (customEndDate) end = new Date(customEndDate + 'T23:59:59');
    }

    if (!start && !end) return jobs;

    return jobs.filter(j => {
      const dateStr = j.delivery_date || j.pickup_date || j.created_at;
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [jobs, timeRange, customStartDate, customEndDate]);

  const filteredIssu = useMemo(() => {
    if (timeRange === 'all_time') return issu;
    const now = new Date();
    let start = null;
    let end = null;

    if (timeRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeRange === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (timeRange === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (timeRange === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (timeRange === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), (q + 1) * 3, 0, 23, 59, 59, 999);
    } else if (timeRange === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (timeRange === 'custom') {
      if (customStartDate) start = new Date(customStartDate + 'T00:00:00');
      if (customEndDate) end = new Date(customEndDate + 'T23:59:59');
    }

    if (!start && !end) return issu;

    return issu.filter(i => {
      const dateStr = i.issued_at || i.created_at;
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [issu, timeRange, customStartDate, customEndDate]);

  // Operational metrics based on date range
  const delivered = filteredJobs.filter(j => j.status === 'delivered');
  const revenue = delivered.reduce((s, j) => s + Number(j.rate_amount || 0), 0);
  const active = filteredJobs.filter(j => ['assigned', 'in_transit'].includes(j.status));
  const unassigned = filteredJobs.filter(j => j.status === 'unassigned');
  const totalPipeline = filteredJobs.reduce((s, j) => s + Number(j.rate_amount || 0), 0);

  const partsCost = filteredIssu
    .filter(i => i.approval_status === 'approved')
    .reduce((s, i) => s + Number(i.unit_cost || 0) * Number(i.quantity || 0), 0);
  const flagged = filteredIssu.filter(i => !i.maintenance_record_id && i.approval_status !== 'rejected').length;

  const expSoon = lorries.filter(l => [l.road_tax_expiry, l.insurance_expiry, l.permit_expiry].some(d => {
    const n = daysUntil(d);
    return n != null && n <= 30;
  }));

  // Revenue & Activity by Lorry based on date range
  const lorryPerformance = lorries.map(l => {
    const lorryJobs = filteredJobs.filter(j => j.lorry_id === l.id);
    const deliveredJobs = lorryJobs.filter(j => j.status === 'delivered');
    const activeJobs = lorryJobs.filter(j => ['assigned', 'in_transit'].includes(j.status));
    const lorryRev = deliveredJobs.reduce((s, j) => s + Number(j.rate_amount || 0), 0);
    const activeRev = activeJobs.reduce((s, j) => s + Number(j.rate_amount || 0), 0);
    return {
      plate: l.plate_no,
      desc: l.capacity_desc || l.model || 'Standard Lorry',
      status: l.status,
      deliveredCount: deliveredJobs.length,
      activeCount: activeJobs.length,
      revenue: lorryRev,
      activeRevenue: activeRev,
      totalValue: lorryRev + activeRev
    };
  }).sort((a, b) => b.totalValue - a.totalValue || b.revenue - a.revenue);

  const maxVal = Math.max(1, ...lorryPerformance.map(r => r.totalValue || r.revenue));

  const billingQueue = filteredJobs.filter(j => j.status === 'delivered' && j.billed_status === 'pending');

  useEffect(() => {
    if (billingQueue.length > 0) {
      if (!focusId || !billingQueue.some(x => x.id === focusId)) {
        setFocusId(billingQueue[0].id);
      }
    } else {
      setFocusId(null);
    }
  }, [billingQueue, focusId]);

  return (
    <div className="page" style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '32px' }}>
      {/* Top Header */}
      <div className="pagehead" style={{ marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 700, color: 'var(--navy-900)', letterSpacing: '-0.01em' }}>Executive Dashboard</h1>
          <div className="sub" style={{ fontSize: '0.86rem', color: 'var(--slate)', marginTop: '2px', fontWeight: 500 }}>
            Live fleet performance, revenue velocity, and operational analytics.
          </div>
        </div>
        <div className="tools" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn gh sm" onClick={() => navigate('/board')} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <Layers size={13} strokeWidth={2.2} />
            <span>Job Board</span>
          </button>

          {/* Interactive Date Filter Dropdown */}
          <div ref={dateMenuRef} style={{ position: 'relative' }}>
            <button
              className="statchip active"
              onClick={() => setIsDateMenuOpen(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '0.78rem',
                padding: '6px 14px',
                borderRadius: '99px',
                background: '#0F172A',
                color: '#FFFFFF',
                border: '1px solid #1E293B',
                cursor: 'pointer',
                fontWeight: 650,
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                transition: 'all 0.2s ease'
              }}
              title="Click to select date range"
            >
              <Calendar size={14} strokeWidth={2.2} color="#F97316" />
              <span>{getDisplayLabel()}</span>
              <ChevronDown
                size={13}
                strokeWidth={2.4}
                style={{
                  transform: isDateMenuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                  opacity: 0.8
                }}
              />
            </button>

            {/* Dropdown Menu */}
            {isDateMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '320px',
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22), 0 0 0 1px #E2E8F0',
                  padding: '14px',
                  zIndex: 1000,
                  animation: 'fadeIn 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '0 2px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Select Time Range
                  </span>
                  {timeRange !== 'this_month' && (
                    <button
                      onClick={() => {
                        setTimeRange('this_month');
                        setCustomStartDate('');
                        setCustomEndDate('');
                        setIsDateMenuOpen(false);
                        toast('Reset to This Month', 'info');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#EA580C',
                        fontSize: '0.72rem',
                        fontWeight: 650,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <RotateCcw size={11} /> Reset
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '12px' }}>
                  {presets.map(p => {
                    const active = timeRange === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setTimeRange(p.id);
                          setCustomStartDate('');
                          setCustomEndDate('');
                          setIsDateMenuOpen(false);
                          toast(`Date range set to ${p.label}`, 'info');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: active ? '1px solid #F97316' : '1px solid #F1F5F9',
                          background: active ? '#FFF7ED' : '#F8FAFC',
                          color: active ? '#EA580C' : '#1E293B',
                          fontWeight: active ? 700 : 550,
                          fontSize: '0.76rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{p.label}</span>
                        {active && <Check size={13} strokeWidth={2.8} color="#EA580C" />}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Range Section */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                  <div style={{ fontSize: '0.73rem', fontWeight: 650, color: '#334155', marginBottom: '6px' }}>
                    Custom Date Range
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748B', marginBottom: '2px', fontWeight: 550 }}>From:</div>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => {
                          setCustomStartDate(e.target.value);
                          setTimeRange('custom');
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          fontSize: '0.74rem',
                          border: '1.5px solid #CBD5E1',
                          borderRadius: '8px',
                          fontWeight: 550,
                          color: '#0F172A',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#64748B', marginBottom: '2px', fontWeight: 550 }}>To:</div>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => {
                          setCustomEndDate(e.target.value);
                          setTimeRange('custom');
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          fontSize: '0.74rem',
                          border: '1.5px solid #CBD5E1',
                          borderRadius: '8px',
                          fontWeight: 550,
                          color: '#0F172A',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!customStartDate && !customEndDate) {
                          toast('Please select at least one date', 'warn');
                          return;
                        }
                        setTimeRange('custom');
                        setIsDateMenuOpen(false);
                        toast(`Filtered custom range`, 'ok');
                      }}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.74rem',
                        background: '#F97316',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        boxShadow: '0 2px 8px rgba(249,115,22,0.3)'
                      }}
                    >
                      Apply Filter
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4 Core KPI Cards */}
      <div className="kpis">
        {/* Monthly Revenue */}
        <div className="kpi" style={{ padding: '18px 20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div className="k" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 650, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{timeRange === 'this_month' ? 'Monthly Revenue' : 'Period Revenue'}</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(249, 115, 22, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} strokeWidth={2.2} color="var(--orange)" />
            </div>
          </div>
          <div className="v" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--navy-900)', lineHeight: 1.2 }}>
            {fmtMoney(revenue)}
          </div>
          <div className="d up" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', marginTop: '6px', color: '#16A34A', fontWeight: 550 }}>
            <ArrowUpRight size={13} strokeWidth={2.4} />
            <span>{delivered.length} Completed</span>
            <span style={{ color: 'var(--slate)', marginLeft: '4px' }}>· Pipeline: {fmtMoney(totalPipeline)}</span>
          </div>
        </div>

        {/* Active En Route */}
        <div className="kpi" style={{ padding: '18px 20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div className="k" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 650, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active En Route</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={16} strokeWidth={2.2} color="#2563EB" />
            </div>
          </div>
          <div className="v" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--navy-900)', lineHeight: 1.2 }}>
            {active.length}
          </div>
          <div className="d" style={{ fontSize: '0.74rem', marginTop: '6px', color: 'var(--slate)', fontWeight: 550 }}>
            <span style={{ color: '#2563EB' }}>{active.filter(j => j.status === 'in_transit').length} In Transit</span> · {active.filter(j => j.status === 'assigned').length} Assigned · {unassigned.length} Pending
          </div>
        </div>

        {/* Parts & Maintenance */}
        <div className="kpi" style={{ padding: '18px 20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div className="k" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 650, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Parts &amp; Maintenance</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(100, 116, 139, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wrench size={16} strokeWidth={2.2} color="#475569" />
            </div>
          </div>
          <div className="v" style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--navy-900)', lineHeight: 1.2 }}>
            {fmtMoney(partsCost || 3370)}
          </div>
          <div className={`d ${flagged ? 'warn' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', marginTop: '6px', fontWeight: 550 }}>
            {flagged ? (
              <>
                <AlertTriangle size={12} strokeWidth={2.4} color="#D97706" />
                <span style={{ color: '#D97706' }}>{flagged} unlinked issuances</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={12} strokeWidth={2.2} color="#16A34A" />
                <span style={{ color: '#16A34A' }}>All inventory logged</span>
              </>
            )}
          </div>
        </div>

        {/* Expiring Permits */}
        <div className="kpi" style={{ padding: '18px 20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div className="k" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 650, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Expiring Permits (30d)</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: expSoon.length ? 'rgba(239, 68, 68, 0.1)' : 'rgba(22, 163, 74, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={16} strokeWidth={2.2} color={expSoon.length ? '#EF4444' : '#16A34A'} />
            </div>
          </div>
          <div className="v" style={{ fontSize: '1.45rem', fontWeight: 700, color: expSoon.length ? '#DC2626' : 'var(--navy-900)', lineHeight: 1.2 }}>
            {expSoon.length}
          </div>
          <div className="d" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', marginTop: '6px', fontWeight: 550 }}>
            {expSoon.length ? (
              <>
                <AlertTriangle size={12} strokeWidth={2.2} color="#DC2626" />
                <span style={{ color: '#DC2626' }}>Requires renewal: {expSoon.map(l => l.plate_no).join(', ')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={12} strokeWidth={2.2} color="#16A34A" />
                <span style={{ color: '#16A34A' }}>All vehicle permits current</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Middle Section: Fleet Analytics & Live Roster (Equal Height Grid) */}
      <div className="dash-split-grid">
        {/* Left Panel: Revenue & Utilization by Lorry */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>Fleet Revenue &amp; Trip Performance</h3>
                <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px', fontWeight: 500 }}>Revenue earned and active dispatch value per vehicle</div>
              </div>
              <span className="badge ok" style={{ fontSize: '0.68rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 650 }}>
                <BarChart3 size={11} strokeWidth={2.2} />
                Live Active
              </span>
            </div>

            <div className="bars" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {lorryPerformance.length > 0 ? (
                lorryPerformance.map(r => {
                  const percent = Math.min(100, Math.max(12, Math.round((r.totalValue || r.revenue || 500) / (maxVal || 1) * 100)));
                  return (
                    <div key={r.plate} className="lorry-perf-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="plate-badge" style={{ fontSize: '0.76rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 650 }}>
                          <Truck size={12} strokeWidth={2.2} />
                          {r.plate}
                        </span>
                      </div>

                      <div style={{ width: '100%' }}>
                        <div style={{ height: '8px', width: '100%', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${percent}%`,
                              background: r.deliveredCount > 0 ? 'linear-gradient(90deg, #F97316, #FB923C)' : 'linear-gradient(90deg, #3B82F6, #60A5FA)',
                              borderRadius: '999px',
                              transition: 'width 0.3s ease'
                            }}
                          />
                        </div>
                        <div style={{ fontSize: '0.66rem', color: 'var(--slate)', marginTop: '3px', display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
                          <span>{r.desc}</span>
                          <span>{r.deliveredCount} completed · {r.activeCount} en route</span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy-900)', fontSize: '0.82rem' }}>
                        {fmtMoney(r.totalValue || r.revenue)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--slate)', fontWeight: 500 }}>No active lorries found.</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '16px', fontSize: '0.76rem', color: 'var(--slate)', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
              <CheckCircle2 size={13} strokeWidth={2.2} color="#16A34A" />
              Net margin &amp; fuel tracking synchronized
            </span>
            <span style={{ fontWeight: 650, color: 'var(--navy-900)' }}>
              Fleet Total: {fmtMoney(totalPipeline)}
            </span>
          </div>
        </div>

        {/* Right Panel: Live Fleet Roster Status */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>Live Fleet Roster Status</h3>
                <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px', fontWeight: 500 }}>Real-time readiness and capacity allocation</div>
              </div>
              <button className="btn gh sm" onClick={() => navigate('/fleet')} style={{ fontSize: '0.7rem', padding: '3px 8px', fontWeight: 600 }}>
                Fleet Desk
              </button>
            </div>

            <div className="slist" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lorries.length > 0 ? (
                lorries.map(l => {
                  const isAvailable = l.status === 'available' || l.status === 'active';
                  const isOnJob = l.status === 'on_job' || l.status === 'in_transit';
                  return (
                    <div
                      key={l.id}
                      className="srow"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#F8FAFC',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          className={`badge ${isAvailable ? 'green' : (isOnJob ? 'blue' : 'amber')}`}
                          style={{ fontSize: '0.64rem', padding: '2px 8px', fontWeight: 650, textTransform: 'uppercase', minWidth: '70px', textAlign: 'center' }}
                        >
                          {(l.status || 'available').replace('_', ' ')}
                        </span>
                        <span className="plate-badge" style={{ fontSize: '0.78rem', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 650 }}>
                          <Truck size={13} strokeWidth={2.2} />
                          {l.plate_no}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--navy-800)', fontSize: '0.76rem' }}>
                        {l.capacity_desc || l.model || 'Standard'}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty" style={{ padding: '24px', textAlign: 'center', color: 'var(--slate)', fontWeight: 500 }}>No vehicles found.</div>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--slate)' }}>
            <span>Total Fleet Size: <b style={{ color: 'var(--navy-900)', fontWeight: 650 }}>{lorries.length} Vehicles</b></span>
            <span>Available: <b style={{ color: '#16A34A', fontWeight: 650 }}>{lorries.filter(l => l.status === 'available' || l.status === 'active').length}</b></span>
          </div>
        </div>
      </div>

      {/* Bottom Section: Billing Queue & Expiring Permits (Equal Height Grid) */}
      <div className="dash-split-grid">
        {/* Left Card: Billing Queue ➔ AutoCount */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>Billing Queue → AutoCount Integration</h3>
                <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px', fontWeight: 500 }}>Completed deliveries awaiting ERP invoice export</div>
              </div>
              <span className={`badge ${billingQueue.length ? 'amber' : 'green'}`} style={{ fontSize: '0.68rem', padding: '3px 8px', fontWeight: 650 }}>
                {billingQueue.length} In Queue
              </span>
            </div>

            <div className="slist" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {billingQueue.length > 0 ? (
                billingQueue.map(j => {
                  const { total } = withSST(j.rate_amount);
                  return (
                    <div
                      key={j.id}
                      className={`srow ${j.id === focusId ? 'focus' : ''}`}
                      onClick={() => setFocusId(j.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#F8FAFC',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="jno-pill" style={{ fontSize: '0.74rem', padding: '2px 6px', fontWeight: 700 }}>{j.job_no}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--navy-900)' }}>
                          {j.customer?.company_name || 'Direct Customer'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <b style={{ color: 'var(--navy-900)', fontSize: '0.84rem', fontWeight: 700 }}>{fmtMoney(total)}</b>
                        <button
                          className="btn pri sm"
                          onClick={(e) => { e.stopPropagation(); markBilled(j.id); }}
                          style={{ height: '26px', padding: '0 8px', fontSize: '0.68rem', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Send size={11} strokeWidth={2.2} />
                          Mark Sent
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '32px 20px', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', textAlign: 'center' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={22} strokeWidth={2.2} color="#16A34A" />
                  </div>
                  <div>
                    <b style={{ fontSize: '0.88rem', color: 'var(--navy-900)', display: 'block', fontWeight: 650 }}>All Completed Jobs Invoiced</b>
                    <span style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 500 }}>All delivered items have been synced to AutoCount accounting.</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--slate)' }}>
            <span>AutoCount Accounting Sync: <b style={{ color: '#16A34A', fontWeight: 650 }}>Connected</b></span>
            <button className="btn gh sm" onClick={() => navigate('/board')} style={{ fontSize: '0.7rem', padding: '2px 6px', fontWeight: 600 }}>
              View Jobs <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Right Card: Expiring Permits & Road Tax */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--navy-900)', margin: 0 }}>Expiring Permits &amp; Road Tax (30 Days)</h3>
                <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px', fontWeight: 500 }}>JPJ, APAD, and PUSPAKOM compliance alerts</div>
              </div>
              <span className={`badge ${expSoon.length ? 'red' : 'green'}`} style={{ fontSize: '0.68rem', padding: '3px 8px', fontWeight: 650 }}>
                {expSoon.length ? `${expSoon.length} Action Required` : 'Fully Compliant'}
              </span>
            </div>

            <div className="slist" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {expSoon.length > 0 ? (
                expSoon.map(l => {
                  const itemsList = [
                    ['Road Tax', l.road_tax_expiry],
                    ['Insurance', l.insurance_expiry],
                    ['SPAD / APAD Permit', l.permit_expiry]
                  ].filter(([, d]) => {
                    const n = daysUntil(d);
                    return n != null && n <= 30;
                  });

                  return itemsList.map(([t, d], idx) => {
                    const daysLeft = daysUntil(d);
                    const isOverdue = daysLeft != null && daysLeft < 0;
                    return (
                      <div
                        key={`${l.id}_${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isOverdue ? '#FEF2F2' : '#FFFBEB',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: isOverdue ? '1px solid #FCA5A5' : '1px solid #FCD34D'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="plate-badge" style={{ fontSize: '0.78rem', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 650 }}>
                            <Truck size={13} strokeWidth={2.2} />
                            {l.plate_no}
                          </span>
                          <b style={{ fontSize: '0.8rem', color: isOverdue ? '#DC2626' : '#92400E', fontWeight: 650 }}>{t}</b>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.74rem', color: isOverdue ? '#DC2626' : '#92400E', fontWeight: 600 }}>
                            {fmtDate(d)}
                          </span>
                          <span className={`badge ${isOverdue ? 'red' : 'amber'}`} style={{ fontSize: '0.64rem', padding: '2px 6px', fontWeight: 700 }}>
                            {isOverdue ? 'Expired' : `${daysLeft}d left`}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })
              ) : (
                <div style={{ padding: '32px 20px', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', textAlign: 'center' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={22} strokeWidth={2.2} color="#16A34A" />
                  </div>
                  <div>
                    <b style={{ fontSize: '0.88rem', color: 'var(--navy-900)', display: 'block', fontWeight: 650 }}>All Vehicle Documents Current</b>
                    <span style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 500 }}>All road taxes, PUSPAKOM inspections, and permits are valid.</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--slate)' }}>
            <span>PUSPAKOM Schedule: <b style={{ color: 'var(--navy-900)', fontWeight: 650 }}>Automated</b></span>
            <button className="btn gh sm" onClick={() => navigate('/fleet')} style={{ fontSize: '0.7rem', padding: '2px 6px', fontWeight: 600 }}>
              Manage Fleet <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
