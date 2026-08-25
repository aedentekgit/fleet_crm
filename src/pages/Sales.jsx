import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { sb, fmtMoney, fmtDate, daysUntil, deduplicateJobs, subscribeTable, getStorageData } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Printer,
  Truck,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  MapPin,
  CheckCircle2,
  Clock,
  Wrench,
  ShieldAlert,
  ShieldCheck,
  Eye,
  Calendar,
  CalendarDays,
  BarChart3,
  Globe,
  DollarSign,
  User,
  Activity,
  TrendingUp,
  Package,
  Navigation
} from 'lucide-react';

const INITIAL_FLEET_SALES = [];

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

const ZONE_OPTIONS = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];

const STATUS_CONFIG = {
  'Available': { label: 'Available', bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', dot: '#10B981' },
  'On Job': { label: 'On Job', bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', dot: '#3B82F6' },
  'In Transit': { label: 'In Transit', bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', dot: '#22C55E' },
  'Maintenance': { label: 'Maintenance', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', dot: '#EF4444' },
  'Standby': { label: 'Standby', bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', dot: '#F59E0B' },
  'Off Duty': { label: 'Off Duty', bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1', dot: '#94A3B8' }
};

const norm = (s) => (s || '').replace(/\s+/g, '').toUpperCase();

export function parseRecordDate(raw) {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  if (typeof raw !== 'string') return new Date();

  const now = new Date();
  const currentYear = now.getFullYear();

  // Try standard Date parse
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed;

  // Try YYYY-MM-DD
  const ymd = raw.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);
  if (dmy) {
    return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
  }

  // Try "25 Aug 2026" or "25 Aug"
  const mNames = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const dMon = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/);
  if (dMon) {
    const mStr = dMon[2].slice(0, 3).toLowerCase();
    const mIdx = mNames[mStr] !== undefined ? mNames[mStr] : now.getMonth();
    const yr = dMon[3] ? parseInt(dMon[3], 10) : currentYear;
    return new Date(yr, mIdx, parseInt(dMon[1], 10));
  }

  return now;
}

export function parseJobDate(job) {
  if (!job) return new Date();
  const raw = job.collection_date || job.order_date || job.delivery_date || job.delivered_at || job.arrived_date || job.created_at;
  return parseRecordDate(raw);
}

export function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function matchesPeriodForDate(rawDate, period) {
  if (!period || period === 'all') return true;
  if (!rawDate) return false;
  const d = parseRecordDate(rawDate);
  const now = new Date();

  if (period === 'daily') {
    return isSameDay(d, now);
  }
  if (period === 'weekly') {
    const diffMs = Math.abs(now.getTime() - d.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  }
  if (period === 'monthly') {
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth()
    );
  }
  return true;
}

export function matchesPeriod(job, period) {
  if (!period || period === 'all') return true;
  const now = new Date();

  // If job is currently active (Assigned or In Transit), it counts towards active sales
  const isActive = Boolean(job && (job.status === 'assigned' || job.status === 'in_transit'));

  if (period === 'daily') {
    // Active jobs assigned/running count towards today's sales
    if (isActive) return true;

    // Check if created today
    if (job.created_at) {
      const cDate = new Date(job.created_at);
      if (!isNaN(cDate.getTime()) && isSameDay(cDate, now)) return true;
    }

    // Check parsed date
    const jDate = parseJobDate(job);
    return isSameDay(jDate, now);
  }

  if (period === 'weekly') {
    if (isActive) return true;
    const jDate = parseJobDate(job);
    const diffMs = Math.abs(now.getTime() - jDate.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= 7;
  }

  if (period === 'monthly') {
    if (isActive) return true;
    const jDate = parseJobDate(job);
    return (
      jDate.getFullYear() === now.getFullYear() &&
      jDate.getMonth() === now.getMonth()
    );
  }

  return true;
}

export default function Sales() {
  const { toast } = useToast();

  const [dbJobs, setDbJobs] = useState(() => getStorageData('jobs'));
  const [dbLorries, setDbLorries] = useState(() => getStorageData('lorries'));
  const [dbMaint, setDbMaint] = useState(() => getStorageData('maintenance_records'));
  const [dbDrivers, setDbDrivers] = useState(() => getStorageData('drivers'));
  const [loading, setLoading] = useState(false);

  // Custom overrides / manual adjustments saved locally
  const [fleetRecords, setFleetRecords] = useState(() => {
    try {
      const saved = localStorage.getItem('rens_fleet_sales_records_v10');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) { }
    return [];
  });

  // Dynamic unlimited zones derived from fleet records, db jobs, and defaults
  const allAvailableSalesZones = useMemo(() => {
    const set = new Set(['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E', 'Zone F', 'Central Zone', 'Southern Region (Johor)', 'Northern Region (Penang/Perak)', 'East Coast (Pahang)']);
    fleetRecords.forEach(r => { if (r.zone) set.add(r.zone); });
    dbJobs.forEach(j => {
      if (j.zone) set.add(j.zone);
      if (j.pickup_zone) set.add(j.pickup_zone);
      if (j.dropoff_zone) set.add(j.dropoff_zone);
      if (j.customer?.zone) set.add(j.customer.zone);
    });
    return Array.from(set);
  }, [fleetRecords, dbJobs]);

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ plate_no: '', sales: '', target: '', status: 'Available', zone: 'Zone A', expenses: '' });

  // Filter States: Period (daily, weekly, monthly, all), Zone, and Status
  const [periodFilter, setPeriodFilter] = useState('daily'); // 'daily' | 'weekly' | 'monthly' | 'all'
  const [zoneFilter, setZoneFilter] = useState('all'); // 'all' | 'Zone A' | 'Zone B' | 'Zone C' | 'Zone D'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'Available' | 'On Job' | 'In Transit' | 'Maintenance' | 'Standby'

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    plate_no: '',
    sales: '',
    target: '20000',
    status: 'Available',
    zone: 'Zone A',
    expenses: '0'
  });

  // Complete Lorry Detail Modal State
  const [viewLorry, setViewLorry] = useState(null);

  // Custom Confirmation Popup States
  const [deletingLorry, setDeletingLorry] = useState(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Load live jobs, lorries, maintenance and drivers from database
  const loadDatabaseData = useCallback(async () => {
    try {
      setLoading(true);
      const [jobsRes, lorriesRes, maintRes, driversRes] = await Promise.all([
        sb.from('jobs').select('*, lorry:lorries(id, plate_no), customer:customers(company_name)').order('created_at', { ascending: false }),
        sb.from('lorries').select('*, driver:drivers(name, phone)').order('plate_no', { ascending: true }),
        sb.from('maintenance_records').select('*, lorry:lorries(plate_no)').order('service_date', { ascending: false }),
        sb.from('drivers').select('*').order('name', { ascending: true })
      ]);

      setDbJobs(deduplicateJobs(jobsRes.data || []));
      setDbLorries(lorriesRes.data || []);
      setDbMaint(maintRes.data || []);
      setDbDrivers(driversRes.data || []);
    } catch (e) {
      console.error('Error loading data for sales tracking:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatabaseData();
    const unsub1 = subscribeTable('jobs', loadDatabaseData);
    const unsub2 = subscribeTable('lorries', loadDatabaseData);
    const unsub3 = subscribeTable('maintenance_records', loadDatabaseData);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [loadDatabaseData]);

  // Save to persistent storage whenever fleet records change
  useEffect(() => {
    try {
      localStorage.setItem('rens_fleet_sales_records_v10', JSON.stringify(fleetRecords));
    } catch (_) { }
  }, [fleetRecords]);

  // Keyboard shortcut listener 'N' for New Lorry Row
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setIsAddModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Live jobs & maintenance aggregation map by lorry plate filtered by active period
  const jobStatsByLorry = useMemo(() => {
    const map = {};

    const getOrInitLorry = (plate, defaultStatus = 'Available') => {
      const pNorm = norm(plate);
      if (!pNorm) return null;
      if (!map[pNorm]) {
        map[pNorm] = {
          plate_no: plate,
          live_sales: 0,
          live_assigned_value: 0,
          live_completed_value: 0,
          live_expenses: 0,
          trip_expenses: 0,
          maint_expenses: 0,
          job_count: 0,
          delivered_count: 0,
          assigned_count: 0,
          in_transit_count: 0,
          latest_zone: null,
          latest_destination: null,
          latest_at: null,
          active_status: defaultStatus,
          jobs: [],
          maintenance_records: [],
          period_maintenance_records: []
        };
      }
      return map[pNorm];
    };

    // 1. Process Jobs
    const validJobs = (dbJobs || []).filter(j => j && j.status !== 'cancelled' && j.status !== 'unassigned');
    validJobs.forEach(job => {
      // Robust plate resolution
      let plate = '';
      if (job.lorry?.plate_no) plate = job.lorry.plate_no;
      else if (job.plate_no) plate = job.plate_no;
      else if (job.lorry_id) {
        const matched = dbLorries.find(l => String(l.id) === String(job.lorry_id) || norm(l.plate_no) === norm(job.lorry_id));
        if (matched?.plate_no) plate = matched.plate_no;
        else if (!String(job.lorry_id).startsWith('lorry-') && !String(job.lorry_id).startsWith('live_')) {
          plate = job.lorry_id;
        }
      }
      if (!plate && job.lorry_spec) {
        const matched = dbLorries.find(l => norm(l.plate_no) === norm(job.lorry_spec));
        if (matched?.plate_no) plate = matched.plate_no;
      }
      if (!plate && job.lorry_id) {
        plate = job.lorry_id;
      }

      const entry = getOrInitLorry(plate);
      if (!entry) return;

      const isMatch = matchesPeriod(job, periodFilter);
      const rate = parseFloat(job.rate_amount) || 0;
      let dCost = parseFloat(job.diesel_expense !== undefined ? job.diesel_expense : job.diesel_cost) || 0;
      let sCost = parseFloat(job.driver_salary) || 0;
      let tCost = parseFloat(job.toll_charges !== undefined ? job.toll_charges : job.tng_cost) || 0;
      let lCost = parseFloat(job.loading_unloading_charges) || 0;
      let mCost = parseFloat(job.maintenance_cost) || 0;
      let customCost = 0;
      if (Array.isArray(job.custom_expenses)) {
        customCost = job.custom_expenses.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
      } else if (job.extra_expenses) {
        customCost = parseFloat(job.extra_expenses) || 0;
      }
      
      const tripExp = (typeof job.total_expenses === 'number' && job.total_expenses > 0)
        ? job.total_expenses
        : (dCost + sCost + tCost + lCost + mCost + customCost);

      if (isMatch) {
        entry.live_sales += rate;
        entry.live_assigned_value += rate;
        entry.live_expenses += tripExp;
        entry.trip_expenses += tripExp;
        entry.job_count += 1;

        if (job.status === 'delivered') {
          entry.delivered_count += 1;
          entry.live_completed_value += rate;
        } else if (job.status === 'in_transit') {
          entry.in_transit_count += 1;
        } else if (job.status === 'assigned') {
          entry.assigned_count += 1;
        }
      }

      const pZone = resolveJobPickupZone(job);
      const dZone = resolveJobDropoffZone(job);

      entry.jobs.push({
        id: job.id,
        job_no: job.job_no,
        customer_name: job.customer?.company_name || job.customer_name || 'Customer',
        pickup_location: job.pickup_location,
        dropoff_location: job.dropoff_location,
        pickup_zone: pZone,
        dropoff_zone: dZone,
        route: `${job.pickup_location || 'Origin'} → ${job.dropoff_location || 'Destination'}`,
        rate_amount: rate,
        expenses: tripExp,
        diesel_cost: dCost,
        driver_salary: sCost,
        tng_cost: tCost,
        loading_unloading_charges: lCost,
        maintenance_cost: mCost,
        custom_expenses: job.custom_expenses,
        status: job.status,
        date: job.collection_date || job.delivery_date || 'Recent',
        delivered_at: job.delivered_at,
        created_at: job.created_at,
        in_period: isMatch
      });
    });

    // 2. Process Maintenance Records (from Fleet -> Maintenance tab)
    (dbMaint || []).forEach(m => {
      let plate = '';
      if (m.lorry?.plate_no) plate = m.lorry.plate_no;
      else if (m.plate_no) plate = m.plate_no;
      else if (m.lorry_id) {
        const matched = dbLorries.find(l => String(l.id) === String(m.lorry_id) || norm(l.plate_no) === norm(m.lorry_id));
        if (matched?.plate_no) plate = matched.plate_no;
        else if (!String(m.lorry_id).startsWith('lorry-') && !String(m.lorry_id).startsWith('live_') && !String(m.lorry_id).startsWith('lry-')) {
          plate = m.lorry_id;
        }
      }

      const entry = getOrInitLorry(plate, m.status === 'in_progress' ? 'Maintenance' : 'Available');
      if (!entry) return;

      const isMatch = matchesPeriodForDate(m.service_date || m.created_at, periodFilter);
      const mCost = parseFloat(m.cost) || 0;

      entry.maintenance_records.push(m);

      if (isMatch) {
        entry.live_expenses += mCost;
        entry.maint_expenses += mCost;
        entry.period_maintenance_records.push(m);
      }
    });

    // 3. Compute effective operational status & resolve current active/delivered zone
    Object.values(map).forEach(entry => {
      const activeInTransit = entry.jobs.filter(j => j.status === 'in_transit').length;
      const activeAssigned = entry.jobs.filter(j => j.status === 'assigned').length;
      const inWorkshop = entry.maintenance_records.some(m => m.status === 'in_progress');

      if (activeInTransit > 0) {
        entry.active_status = 'In Transit';
      } else if (activeAssigned > 0) {
        entry.active_status = 'On Job';
      } else if (inWorkshop) {
        entry.active_status = 'Maintenance';
      } else {
        entry.active_status = 'Available';
      }

      // Find active job vs latest delivered job
      const activeJob = entry.jobs.slice().reverse().find(j => j.status === 'in_transit' || j.status === 'assigned');
      const latestDelivered = entry.jobs.slice().reverse().find(j => j.status === 'delivered');

      if (activeJob) {
        entry.latest_zone = activeJob.pickup_zone || 'Zone A';
        entry.latest_destination = activeJob.dropoff_location || 'Destination';
        entry.latest_at = activeJob.date;
      } else if (latestDelivered) {
        entry.latest_zone = latestDelivered.dropoff_zone || 'Zone A';
        entry.latest_destination = latestDelivered.dropoff_location || 'Destination';
        entry.latest_at = latestDelivered.delivered_at || latestDelivered.date;
      } else if (entry.jobs.length > 0) {
        const lastJob = entry.jobs[entry.jobs.length - 1];
        entry.latest_zone = lastJob.status === 'delivered' ? lastJob.dropoff_zone : lastJob.pickup_zone;
        entry.latest_destination = lastJob.dropoff_location || 'Destination';
        entry.latest_at = lastJob.date;
      }
    });

    return map;
  }, [dbJobs, dbLorries, dbMaint, periodFilter]);

  // Merge fleet records with live assigned & delivered orders & statuses
  const mergedSalesRecords = useMemo(() => {
    const existingPlates = new Set();
    const list = fleetRecords.map((r, idx) => {
      const pNorm = norm(r.plate_no);
      existingPlates.add(pNorm);

      const live = jobStatsByLorry[pNorm] || {
        plate_no: r.plate_no,
        live_sales: 0,
        live_assigned_value: 0,
        live_completed_value: 0,
        live_expenses: 0,
        trip_expenses: 0,
        maint_expenses: 0,
        job_count: 0,
        delivered_count: 0,
        assigned_count: 0,
        in_transit_count: 0,
        latest_zone: null,
        latest_destination: null,
        latest_at: null,
        active_status: 'Available',
        jobs: [],
        maintenance_records: [],
        period_maintenance_records: []
      };

      const rBaselineSales = periodFilter === 'all' || periodFilter === 'monthly' ? (Number(r.baseline_sales) || 0) : 0;
      const rBaselineExp = periodFilter === 'all' || periodFilter === 'monthly' ? (Number(r.baseline_expenses) || 0) : 0;

      const totalSales = rBaselineSales + live.live_sales;
      const totalExpenses = rBaselineExp + live.live_expenses;

      let effectiveStatus = live.active_status !== 'Available' ? live.active_status : (r.status === 'Maintenance' ? 'Maintenance' : 'Available');
      let effectiveZone = live.latest_zone || r.zone || (INITIAL_FLEET_SALES[idx]?.zone || 'Zone A');

      return {
        ...r,
        status: effectiveStatus,
        zone: effectiveZone,
        sales: totalSales,
        expenses: totalExpenses,
        trip_expenses: live.trip_expenses || 0,
        maint_expenses: live.maint_expenses || 0,
        total_assigned: Math.max(live.job_count || 0, (live.assigned_count || 0) + (live.in_transit_count || 0) + (live.delivered_count || 0)),
        total_assigned_value: live.live_assigned_value || 0,
        completed_value: live.live_completed_value || 0,
        in_transit_count: live.in_transit_count || 0,
        delivered_count: live.delivered_count || 0,
        job_count: live.job_count || 0,
        latest_delivered_destination: live.latest_destination,
        latest_delivered_at: live.latest_at,
        delivered_jobs: live.jobs,
        maintenance_records: live.maintenance_records || [],
        period_maintenance_records: live.period_maintenance_records || [],
        has_delivered_jobs: totalSales > 0 || live.jobs.length > 0 || (live.maintenance_records && live.maintenance_records.length > 0)
      };
    });

    // Auto-append any lorry from database that has assigned / in transit / delivered jobs or maintenance (No demo data added)
    Object.entries(jobStatsByLorry).forEach(([plateNorm, live]) => {
      if (!existingPlates.has(plateNorm)) {
        existingPlates.add(plateNorm);
        list.push({
          id: `live_${plateNorm}`,
          plate_no: live.plate_no || plateNorm,
          baseline_sales: 0,
          target: 20000,
          status: live.active_status,
          zone: live.latest_zone || 'Zone A',
          sales: live.live_sales,
          expenses: live.live_expenses,
          trip_expenses: live.trip_expenses || 0,
          maint_expenses: live.maint_expenses || 0,
          baseline_expenses: 0,
          total_assigned: Math.max(live.job_count || 0, (live.assigned_count || 0) + (live.in_transit_count || 0) + (live.delivered_count || 0)),
          total_assigned_value: live.live_assigned_value || 0,
          completed_value: live.live_completed_value || 0,
          in_transit_count: live.in_transit_count || 0,
          delivered_count: live.delivered_count || 0,
          job_count: live.job_count || 0,
          latest_delivered_destination: live.latest_destination,
          latest_delivered_at: live.latest_at,
          delivered_jobs: live.jobs,
          maintenance_records: live.maintenance_records || [],
          period_maintenance_records: live.period_maintenance_records || [],
          has_delivered_jobs: true
        });
      }
    });

    return list;
  }, [fleetRecords, jobStatsByLorry, periodFilter]);

  // Filtered & Period-Adjusted rows
  const filteredRecords = useMemo(() => {
    let list = mergedSalesRecords;

    if (zoneFilter !== 'all') {
      list = list.filter((r) => r.zone === zoneFilter);
    }

    if (statusFilter !== 'all') {
      list = list.filter((r) => (r.status || 'Available') === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.plate_no.toLowerCase().includes(q) ||
          (r.zone && r.zone.toLowerCase().includes(q)) ||
          (r.status && r.status.toLowerCase().includes(q))
      );
    }

    return list.map((r) => {
      let displaySales = Number(r.sales) || 0;
      let displayExpenses = Number(r.expenses) || 0;
      let displayTarget = Number(r.target) || 0;
      let displayAssignedValue = Number(r.total_assigned_value) || 0;
      let displayCompletedValue = Number(r.completed_value) || 0;
      let displayPnl = displayCompletedValue - displayExpenses;

      if (periodFilter === 'daily') {
        displayTarget = Math.round(displayTarget / 26);
      } else if (periodFilter === 'weekly') {
        displayTarget = Math.round((displayTarget / 26) * 6);
      }

      return {
        ...r,
        displaySales,
        displayAssignedValue,
        displayCompletedValue,
        displayPnl,
        displayTarget,
        displayExpenses
      };
    });
  }, [mergedSalesRecords, search, zoneFilter, statusFilter, periodFilter]);

  // Totals & KPIs (Sales period-adjusted, Target strictly monthly)
  const totals = useMemo(() => {
    const totalSales = filteredRecords.reduce((sum, r) => sum + (Number(r.displaySales) || 0), 0);
    const totalTarget = filteredRecords.reduce((sum, r) => sum + (Number(r.displayTarget) || 0), 0);
    const totalExpenses = filteredRecords.reduce((sum, r) => sum + (Number(r.displayExpenses) || 0), 0);
    const totalAssignedOrders = filteredRecords.reduce((sum, r) => sum + (Number(r.total_assigned || r.job_count) || 0), 0);
    const totalAssignedValue = filteredRecords.reduce((sum, r) => sum + (Number(r.displayAssignedValue || r.total_assigned_value) || 0), 0);
    const totalCompletedValue = filteredRecords.reduce((sum, r) => sum + (Number(r.displayCompletedValue || r.completed_value) || 0), 0);
    const totalInTransit = filteredRecords.reduce((sum, r) => sum + (Number(r.in_transit_count) || 0), 0);
    const totalCompleted = filteredRecords.reduce((sum, r) => sum + (Number(r.delivered_count) || 0), 0);
    const totalPnl = totalCompletedValue - totalExpenses;
    const availableCount = filteredRecords.filter(r => (r.status || '').toLowerCase() === 'available').length;
    const variance = totalSales - totalTarget;
    const achievementRate = totalTarget > 0 ? ((totalSales / totalTarget) * 100).toFixed(1) : '0.0';
    const uniqueZones = new Set(filteredRecords.map(r => r.zone).filter(Boolean)).size;

    return { totalSales, totalTarget, totalExpenses, totalAssignedOrders, totalAssignedValue, totalCompletedValue, totalPnl, totalInTransit, totalCompleted, availableCount, variance, achievementRate, uniqueZones };
  }, [filteredRecords]);

  // Start editing a row inline
  const startEditing = (row) => {
    setEditingId(row.id);
    setEditForm({
      plate_no: row.plate_no,
      sales: row.sales.toString(),
      target: row.target.toString(),
      status: row.status || 'Available',
      zone: row.zone || 'Zone A',
      expenses: row.expenses ? row.expenses.toString() : '0'
    });
  };

  // Save inline edit
  const saveInlineEdit = (id) => {
    if (!editForm.plate_no.trim()) {
      toast('Plate number cannot be empty', 'err');
      return;
    }

    const pNorm = norm(editForm.plate_no);
    const live = jobStatsByLorry[pNorm] || { live_sales: 0, live_expenses: 0 };

    // Calculate new baseline so that baseline + live delivered = entered value
    const enteredSales = parseFloat(editForm.sales) || 0;
    const enteredExpenses = parseFloat(editForm.expenses) || 0;

    const newBaselineSales = Math.max(0, enteredSales - live.live_sales);
    const newBaselineExpenses = Math.max(0, enteredExpenses - live.live_expenses);

    setFleetRecords((prev) => {
      const exists = prev.some(r => r.id === id);
      if (exists) {
        return prev.map((r) =>
          r.id === id
            ? {
              ...r,
              plate_no: editForm.plate_no.trim().toUpperCase(),
              baseline_sales: newBaselineSales,
              target: parseFloat(editForm.target) || 0,
              status: editForm.status || 'Available',
              zone: editForm.zone || 'Zone A',
              baseline_expenses: newBaselineExpenses
            }
            : r
        );
      } else {
        return [
          ...prev,
          {
            id,
            plate_no: editForm.plate_no.trim().toUpperCase(),
            baseline_sales: newBaselineSales,
            target: parseFloat(editForm.target) || 20000,
            status: editForm.status || 'Available',
            zone: editForm.zone || 'Zone A',
            baseline_expenses: newBaselineExpenses
          }
        ];
      }
    });

    setEditingId(null);
    toast('Row updated successfully', 'ok');
  };

  // Cancel inline edit
  const cancelInlineEdit = () => {
    setEditingId(null);
  };

  // Open in-app delete confirmation modal
  const promptDeleteRow = (row) => {
    setDeletingLorry(row);
  };

  // Perform confirmed deletion
  const confirmDelete = async () => {
    if (!deletingLorry) return;
    const plate = deletingLorry.plate_no;
    const pNorm = norm(plate);

    setFleetRecords((prev) => prev.filter((r) => r.id !== deletingLorry.id && norm(r.plate_no) !== pNorm));

    // Clear / delete jobs assigned to this lorry so it doesn't reappear
    if (sb) {
      try {
        const matched = dbLorries.find(l => norm(l.plate_no) === pNorm || String(l.id) === String(deletingLorry.id));
        if (matched) {
          await sb.from('jobs').delete().eq('lorry_id', matched.id);
          await sb.from('lorries').update({ status: 'available' }).eq('id', matched.id);
        }
      } catch (_) {}
    }

    try {
      const raw = localStorage.getItem('rens_db_jobs');
      if (raw) {
        const parsed = JSON.parse(raw);
        const cleaned = parsed.filter(j => {
          const jLorry = j.lorry_id || j.plate_no || j.lorry?.plate_no;
          return norm(jLorry) !== pNorm;
        });
        localStorage.setItem('rens_db_jobs', JSON.stringify(cleaned));
      }
    } catch (_) {}

    setDbJobs((prev) => prev.filter(j => {
      const jLorry = j.lorry_id || j.plate_no || j.lorry?.plate_no;
      return norm(jLorry) !== pNorm;
    }));

    setDeletingLorry(null);
    toast(`Deleted ${plate}`, 'warn');
  };

  // Perform confirmed reset to clean empty table
  const confirmReset = async () => {
    setFleetRecords([]);
    try {
      localStorage.setItem('rens_db_jobs', '[]');
      localStorage.setItem('rens_fleet_sales_records_v10', '[]');
    } catch (_) {}
    if (sb) {
      try {
        await sb.from('jobs').delete().neq('id', '___');
        await sb.from('lorries').update({ status: 'available' }).neq('id', '___');
      } catch (_) {}
    }
    setDbJobs([]);
    setIsResetConfirmOpen(false);
    toast('Cleared all sales and job records', 'ok');
  };

  // Add new lorry row
  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!addForm.plate_no.trim()) {
      toast('Please enter a lorry plate number', 'err');
      return;
    }

    const newRecord = {
      id: Date.now().toString(),
      plate_no: addForm.plate_no.trim().toUpperCase(),
      baseline_sales: parseFloat(addForm.sales) || 0,
      target: parseFloat(addForm.target) || 20000,
      status: addForm.status || 'Available',
      zone: addForm.zone.trim() || 'Central (Klang Valley)',
      baseline_expenses: parseFloat(addForm.expenses) || 0
    };

    setFleetRecords((prev) => [...prev, newRecord]);
    setIsAddModalOpen(false);
    setAddForm({ plate_no: '', sales: '', target: '20000', status: 'Available', zone: 'Central (Klang Valley)', expenses: '0' });
    toast(`Added ${newRecord.plate_no}`, 'ok');
  };

  return (
    <div className="page">
      {/* Page Header */}
      <div className="pagehead">
        <div>
          <h1>Sales &amp; Targets</h1>
          <div className="sub">
            Fleet revenue performance, monthly targets, lorry availability status, zone, and total expenses tracking &bull; Auto-syncs delivered orders.
          </div>
        </div>

        <div className="tools" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn sec"
            onClick={() => {
              loadDatabaseData();
              toast('Live sync updated • Auto-sync active', 'ok');
            }}
            title="Real-time live sync connected • Click to re-sync data"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              fontWeight: 700,
              fontSize: '0.8rem',
              letterSpacing: '0.04em',
              background: 'rgba(16, 185, 129, 0.08)',
              color: '#059669',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '0 12px',
              height: '38px',
              borderRadius: '9px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span
              className="dot-pulse"
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#10B981',
                boxShadow: '0 0 8px #10B981',
                display: 'inline-block'
              }}
            />
            <span>LIVE</span>
          </button>



        </div>
      </div>

      {/* Dynamic KPI Cards Row */}
      <div className="kpis" style={{ marginBottom: '24px' }}>
        <div className="kpi">
          <div className="k">
            {periodFilter === 'daily' ? 'Daily Sales (Today)' : periodFilter === 'weekly' ? 'Weekly Sales (7 Days)' : periodFilter === 'all' ? 'All-Time Sales' : 'Total Monthly Sales'}
          </div>
          <div className="v" style={totals.totalPnl < 0 ? { color: '#DC2626' } : {}}>
            {totals.totalPnl < 0
              ? `-RM ${Math.abs(totals.totalPnl).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : fmtMoney(totals.totalPnl)}
          </div>
          <div className="d up">
            {filteredRecords.length} {filteredRecords.length === 1 ? 'Lorry' : 'Lorries'} &bull; <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>{periodFilter} View</span>
          </div>
        </div>

        <div className="kpi">
          <div className="k">
            {periodFilter === 'daily' ? 'Daily Target' : periodFilter === 'weekly' ? 'Weekly Target' : periodFilter === 'monthly' ? 'Monthly Target' : 'Target Sales'}
          </div>
          <div className="v" style={{ color: 'var(--orange)' }}>{fmtMoney(totals.totalTarget)}</div>
          <div className="d">{periodFilter === 'daily' ? 'Daily operational quota' : periodFilter === 'weekly' ? 'Weekly quota' : 'Monthly fleet quota'}</div>
        </div>

        <div className="kpi">
          <div className="k">Lorry Availability</div>
          <div className="v" style={{ color: '#059669' }}>
            {totals.availableCount} <span style={{ fontSize: '0.85rem', color: 'var(--slate)', fontWeight: 600 }}>/ {filteredRecords.length} Ready</span>
          </div>
          <div className="d">{totals.uniqueZones} Zones covered</div>
        </div>

        <div className="kpi">
          <div className="k">
            {periodFilter === 'daily' ? 'Daily Expenses' : periodFilter === 'weekly' ? 'Weekly Expenses' : 'Total Expenses'}
          </div>
          <div className="v">{totals.totalExpenses > 0 ? fmtMoney(totals.totalExpenses) : '—'}</div>
          <div className="d">Operating &amp; trip expenses</div>
        </div>
      </div>

      {/* Search and Table Container */}
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
            padding: '12px 18px',
            borderBottom: '1px solid var(--line)',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          {/* Left: Search Bar */}
          <div style={{ position: 'relative', width: '260px' }}>
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
              placeholder="Search plate, zone, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '36px',
                background: '#FFFFFF',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                color: 'var(--navy-900)',
                height: '34px',
                fontSize: '0.82rem'
              }}
            />
          </div>

          {/* Middle: Time Period Filter Tabs with Professional Icons */}
          <div
            style={{
              display: 'inline-flex',
              background: '#E2E8F0',
              padding: '3px',
              borderRadius: '10px',
              gap: '2px'
            }}
          >
            {[
              { id: 'daily', label: 'Daily', Icon: Calendar },
              { id: 'weekly', label: 'Weekly', Icon: BarChart3 },
              { id: 'monthly', label: 'Monthly', Icon: CalendarDays },
              { id: 'all', label: 'All Time', Icon: Globe }
            ].map((p) => {
              const active = periodFilter === p.id;
              const Icon = p.Icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodFilter(p.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: active ? 'var(--orange)' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--navy-900)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '5px 12px',
                    fontSize: '0.78rem',
                    fontWeight: active ? 800 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: active ? '0 2px 6px rgba(249, 115, 22, 0.3)' : 'none'
                  }}
                >
                  <Icon size={13} strokeWidth={active ? 2.5 : 2} style={{ color: active ? '#FFFFFF' : 'var(--slate)' }} />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right: Zone & Status Dropdowns + Count indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Zone Filter */}
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              style={{
                padding: '5px 10px',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid var(--line)',
                borderRadius: '8px',
                background: zoneFilter !== 'all' ? '#FFF7ED' : '#FFFFFF',
                color: zoneFilter !== 'all' ? 'var(--orange)' : 'var(--navy-900)',
                cursor: 'pointer',
                height: '34px'
              }}
            >
              <option value="all">All Zones</option>
              {allAvailableSalesZones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '5px 10px',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid var(--line)',
                borderRadius: '8px',
                background: statusFilter !== 'all' ? '#ECFDF5' : '#FFFFFF',
                color: statusFilter !== 'all' ? '#059669' : 'var(--navy-900)',
                cursor: 'pointer',
                height: '34px'
              }}
            >
              <option value="all">All Status</option>
              {Object.keys(STATUS_CONFIG).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Count */}
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--slate)',
                background: '#FFFFFF',
                border: '1px solid var(--line)',
                padding: '6px 10px',
                borderRadius: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              {filteredRecords.length} Lorries
            </span>
          </div>
        </div>

        {/* Table with Status, Zone, and Total Expenses */}
        <div style={{ overflowX: 'hidden', width: '100%' }}>
          <table
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              textAlign: 'center',
              fontSize: '0.84rem',
              fontFamily: '"Outfit", "Sen", sans-serif'
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#F8FAFC',
                  color: '#475569',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  letterSpacing: '0.04em',
                  borderBottom: '1.5px solid #E2E8F0',
                  textTransform: 'uppercase'
                }}
              >
                <th style={{ padding: '11px 6px', width: '3.5%', textAlign: 'center' }}>NO</th>
                <th style={{ padding: '11px 8px', width: '9.5%', textAlign: 'center' }}>LORRY NO</th>
                <th style={{ padding: '11px 8px', width: '9.5%', textAlign: 'center', color: 'var(--orange)' }}>
                  {periodFilter === 'daily' ? 'DAILY TARGET' : periodFilter === 'weekly' ? 'WEEKLY TARGET' : periodFilter === 'monthly' ? 'MONTHLY TARGET' : 'TARGET'} (RM)
                </th>
                <th style={{ padding: '11px 6px', width: '8.5%', textAlign: 'center', color: '#1D4ED8' }}>
                  ASSIGN ORDER
                </th>
                <th style={{ padding: '11px 8px', width: '11%', textAlign: 'center', color: '#D97706' }}>
                  ASSIGN VALUE (RM)
                </th>
                <th style={{ padding: '11px 8px', width: '11%', textAlign: 'center', color: '#059669' }}>
                  COMPLETED (RM)
                </th>
                <th style={{ padding: '11px 6px', width: '9%', textAlign: 'center' }}>STATUS</th>
                <th style={{ padding: '11px 8px', width: '9%', textAlign: 'center' }}>ZONE</th>
                <th style={{ padding: '11px 8px', width: '10.5%', textAlign: 'center' }}>
                  {periodFilter === 'daily' ? 'DAILY EXPENSES' : periodFilter === 'weekly' ? 'WEEKLY EXPENSES' : 'TOTAL EXPENSES'}
                </th>
                <th style={{ padding: '11px 8px', width: '11%', textAlign: 'center', color: '#059669' }}>
                  PNL (RM)
                </th>
                <th style={{ padding: '11px 6px', width: '5.5%', textAlign: 'center' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--slate)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <Truck size={36} style={{ color: '#94A3B8' }} strokeWidth={1.75} />
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--navy-900)' }}>No Lorry Sales Records</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--slate)', maxWidth: '400px' }}>
                        The sales &amp; targets table is completely clean. Click <strong>"+ Add Lorry Row"</strong> above to register a lorry or deliver jobs to auto-track.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row, idx) => {
                  const isEditing = editingId === row.id;
                  const statusConf = STATUS_CONFIG[row.status] || STATUS_CONFIG['Available'];

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid var(--line)',
                        background: isEditing ? '#FFFBEB' : 'transparent',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!isEditing) e.currentTarget.style.background = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (!isEditing) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* 1. NO */}
                      <td
                        style={{
                          padding: '10px 6px',
                          color: '#64748B',
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          textAlign: 'center'
                        }}
                      >
                        {idx + 1}
                      </td>

                      {/* 2. LORRY NO */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          fontWeight: 800,
                          color: 'var(--navy-900)',
                          letterSpacing: '0.01em',
                          fontSize: '0.82rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.plate_no}
                            onChange={(e) => setEditForm({ ...editForm, plate_no: e.target.value })}
                            style={{
                              width: '80px',
                              padding: '3px 6px',
                              border: '1px solid var(--orange)',
                              borderRadius: '6px',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              textAlign: 'center'
                            }}
                          />
                        ) : (
                          row.plate_no
                        )}
                      </td>

                      {/* 3. TARGET */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          color: 'var(--orange)',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.target}
                            onChange={(e) => setEditForm({ ...editForm, target: e.target.value })}
                            style={{
                              width: '75px',
                              padding: '3px 6px',
                              border: '1px solid var(--orange)',
                              borderRadius: '6px',
                              textAlign: 'center',
                              color: 'var(--orange)',
                              fontWeight: 700,
                              fontSize: '0.78rem'
                            }}
                          />
                        ) : (
                          row.displayTarget > 0 ? row.displayTarget.toLocaleString() : '—'
                        )}
                      </td>

                      {/* 4. TOTAL ASSIGN ORDER */}
                      <td
                        style={{
                          padding: '10px 6px',
                          textAlign: 'center'
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '34px',
                            padding: '2px 6px',
                            borderRadius: '6px',
                            background: (row.total_assigned || 0) > 0 ? 'rgba(37, 99, 235, 0.08)' : '#F1F5F9',
                            color: (row.total_assigned || 0) > 0 ? '#1D4ED8' : '#94A3B8',
                            fontWeight: 800,
                            fontSize: '0.76rem',
                            border: (row.total_assigned || 0) > 0 ? '1px solid #BFDBFE' : '1px solid #E2E8F0'
                          }}
                        >
                          {row.delivered_count || 0}/{row.total_assigned || 0}
                        </span>
                      </td>

                      {/* 5. TOTAL ASSIGN VALUE (RM) */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          color: '#D97706',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {row.displayAssignedValue > 0 ? fmtMoney(row.displayAssignedValue) : '—'}
                      </td>

                      {/* 6. JOB COMPLETED (RM) */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          color: '#059669',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {row.displayCompletedValue > 0 ? fmtMoney(row.displayCompletedValue) : '—'}
                      </td>

                      {/* 7. STATUS */}
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center'
                        }}
                      >
                        {isEditing ? (
                          <select
                            value={editForm.status}
                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                            style={{
                              padding: '3px 6px',
                              border: '1px solid var(--orange)',
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '0.76rem',
                              background: '#FFFFFF'
                            }}
                          >
                            <option value="Available">Available</option>
                            <option value="On Job">On Job</option>
                            <option value="In Transit">In Transit</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Standby">Standby</option>
                            <option value="Off Duty">Off Duty</option>
                          </select>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 7px',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: statusConf.bg,
                              color: statusConf.color,
                              border: `1px solid ${statusConf.border}`,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <span
                              style={{
                                width: '5px',
                                height: '5px',
                                borderRadius: '50%',
                                background: statusConf.dot
                              }}
                            />
                            {row.status || 'Available'}
                          </span>
                        )}
                      </td>

                      {/* 8. ZONE */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          color: 'var(--navy-900)',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            list="sales-zone-options"
                            value={editForm.zone}
                            onChange={(e) => setEditForm({ ...editForm, zone: e.target.value })}
                            style={{
                              padding: '3px 6px',
                              border: '1px solid var(--orange)',
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '0.76rem',
                              background: '#FFFFFF',
                              width: '80px',
                              textAlign: 'center'
                            }}
                          />
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <MapPin size={11} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap' }}>{row.zone || 'Zone A'}</span>
                          </div>
                        )}
                      </td>

                      {/* 9. DAILY EXPENSES */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          color: '#64748B',
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.expenses}
                            onChange={(e) => setEditForm({ ...editForm, expenses: e.target.value })}
                            style={{
                              width: '70px',
                              padding: '3px 6px',
                              border: '1px solid var(--orange)',
                              borderRadius: '6px',
                              textAlign: 'center',
                              fontSize: '0.78rem'
                            }}
                          />
                        ) : (
                          row.displayExpenses > 0 ? fmtMoney(row.displayExpenses) : '—'
                        )}
                      </td>

                      {/* 10. PNL (RM) */}
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          color: row.displayPnl < 0 ? '#DC2626' : '#059669',
                          fontWeight: 800,
                          fontSize: '0.84rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {row.displayCompletedValue > 0 || row.displayExpenses > 0 ? (
                          row.displayPnl < 0
                            ? `-RM ${Math.abs(row.displayPnl).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : fmtMoney(row.displayPnl)
                        ) : '—'}
                      </td>

                      {/* 11. ACTIONS */}
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '3px' }}>
                            <button
                              className="btn sm pri"
                              onClick={() => saveInlineEdit(row.id)}
                              style={{ padding: '2px 5px', height: '24px', minWidth: '24px' }}
                              title="Save"
                            >
                              <Check size={12} strokeWidth={3} />
                            </button>
                            <button
                              className="btn sm gh"
                              onClick={cancelInlineEdit}
                              style={{ padding: '2px 5px', height: '24px', minWidth: '24px' }}
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '3px' }}>
                            <button
                              className="btn sm gh"
                              onClick={() => setViewLorry(row)}
                              style={{ padding: '2px 5px', height: '24px', minWidth: '24px', color: '#475569' }}
                              title="View Details"
                            >
                              <Eye size={12} />
                            </button>
                            <button
                              className="btn sm danger"
                              onClick={() => promptDeleteRow(row)}
                              style={{ padding: '2px 5px', height: '24px', minWidth: '24px' }}
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                }))}

              {/* Total Summary Footer Row */}
              {filteredRecords.length > 0 && (
                <tr
                  style={{
                    background: '#F8FAFC',
                    borderTop: '2px solid #E2E8F0',
                    fontWeight: 800,
                    fontSize: '0.82rem'
                  }}
                >
                  <td style={{ padding: '11px 6px', textAlign: 'center' }}></td>
                  <td
                    style={{
                      padding: '11px 8px',
                      textAlign: 'center',
                      color: 'var(--navy-900)',
                      fontWeight: 800,
                      letterSpacing: '0.04em'
                    }}
                  >
                    TOTAL
                  </td>
                  <td
                    style={{
                      padding: '11px 8px',
                      textAlign: 'center',
                      color: 'var(--orange)',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {totals.totalTarget.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: '11px 6px',
                      textAlign: 'center',
                      color: '#1D4ED8',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {totals.totalCompleted}/{totals.totalAssignedOrders}
                  </td>
                  <td
                    style={{
                      padding: '11px 8px',
                      textAlign: 'center',
                      color: '#D97706',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {totals.totalAssignedValue > 0 ? fmtMoney(totals.totalAssignedValue) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '11px 8px',
                      textAlign: 'center',
                      color: '#059669',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {totals.totalCompletedValue > 0 ? fmtMoney(totals.totalCompletedValue) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '11px 6px',
                      textAlign: 'center',
                      color: '#059669',
                      fontWeight: 800,
                      fontSize: '0.76rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {totals.availableCount}/{filteredRecords.length} Ready
                  </td>
                  <td
                    style={{
                      padding: '11px 8px',
                      textAlign: 'center',
                      color: 'var(--navy-900)',
                      fontWeight: 700,
                      fontSize: '0.76rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {totals.uniqueZones} Zones
                  </td>
                  <td
                    style={{
                      padding: '11px 8px',
                      textAlign: 'center',
                      color: '#64748B',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {totals.totalExpenses > 0 ? fmtMoney(totals.totalExpenses) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '11px 8px',
                      textAlign: 'center',
                      color: totals.totalPnl < 0 ? '#DC2626' : '#059669',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {totals.totalCompletedValue > 0 || totals.totalExpenses > 0 ? (
                      totals.totalPnl < 0
                        ? `-RM ${Math.abs(totals.totalPnl).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : fmtMoney(totals.totalPnl)
                    ) : '—'}
                  </td>
                  <td style={{ padding: '11px 6px', textAlign: 'center' }}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Datalist for zone suggestions */}
      <datalist id="sales-zone-options">
        {allAvailableSalesZones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>

      {/* Add New Lorry Modal */}
      {isAddModalOpen && createPortal(
        <div
          className="overlay open"
          onClick={() => setIsAddModalOpen(false)}
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
            zIndex: 99999,
            overflowY: 'auto'
          }}
        >
          <div
            className="cmdbox"
            style={{
              maxWidth: '460px',
              width: '100%',
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
              border: '1px solid var(--line)',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '18px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Truck size={18} style={{ color: 'var(--orange)' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                  Add Lorry Record
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--slate)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '4px' }}>
                    Lorry Plate No. *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WA9285C"
                    value={addForm.plate_no}
                    onChange={(e) => setAddForm({ ...addForm, plate_no: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      fontWeight: 800,
                      color: 'var(--navy-900)'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '4px' }}>
                      Sales (RM)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={addForm.sales}
                      onChange={(e) => setAddForm({ ...addForm, sales: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        color: 'var(--navy-900)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', marginBottom: '4px' }}>
                      Target (RM)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="20000"
                      value={addForm.target}
                      onChange={(e) => setAddForm({ ...addForm, target: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        color: '#DC2626',
                        fontWeight: 700
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '4px' }}>
                      Lorry Status
                    </label>
                    <select
                      value={addForm.status}
                      onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        fontWeight: 700,
                        color: 'var(--navy-900)',
                        background: '#FFFFFF'
                      }}
                    >
                      <option value="Available">Available</option>
                      <option value="On Job">On Job</option>
                      <option value="In Transit">In Transit</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Standby">Standby</option>
                      <option value="Off Duty">Off Duty</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '4px' }}>
                      Total Expenses (RM)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={addForm.expenses}
                      onChange={(e) => setAddForm({ ...addForm, expenses: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        color: 'var(--navy-900)'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', fontWeight: 700, color: 'var(--slate)', marginBottom: '4px' }}>
                    <span>Now Lorry Zone</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--slate)' }}>Unlimited Custom Zones</span>
                  </label>
                  <input
                    type="text"
                    list="sales-zone-options"
                    placeholder="Enter or select zone (e.g. Zone A, Zone E, Klang Valley)..."
                    value={addForm.zone}
                    onChange={(e) => setAddForm({ ...addForm, zone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      fontWeight: 700,
                      color: 'var(--navy-900)',
                      background: '#FFFFFF',
                      height: '38px'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {allAvailableSalesZones.slice(0, 6).map((z) => (
                      <button
                        key={z}
                        type="button"
                        className="btn gh sm"
                        onClick={() => setAddForm({ ...addForm, zone: z })}
                        style={{
                          fontSize: '0.7rem',
                          padding: '1px 7px',
                          height: '22px',
                          borderRadius: '12px',
                          background: addForm.zone === z ? '#EFF6FF' : '#F8FAFC',
                          color: addForm.zone === z ? '#2563EB' : '#475569',
                          borderColor: addForm.zone === z ? '#93C5FD' : '#E2E8F0',
                          fontWeight: addForm.zone === z ? 700 : 500
                        }}
                      >
                        {z}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button type="button" className="btn gh" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn pri">
                  Add Record
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* In-App Delete Confirmation Modal Popup */}
      {deletingLorry && createPortal(
        <div
          className="overlay open"
          onClick={() => setDeletingLorry(null)}
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
            className="cmdbox"
            style={{
              maxWidth: '420px',
              width: '100%',
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '24px',
              textAlign: 'center',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
              border: '1px solid var(--line)',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              <Trash2 size={24} />
            </div>

            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)' }}>
              Delete Lorry Record?
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: 'var(--slate)', lineHeight: 1.5 }}>
              Are you sure you want to remove <strong>{deletingLorry.plate_no}</strong> from the sales ledger? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button
                type="button"
                className="btn gh"
                onClick={() => setDeletingLorry(null)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  background: '#DC2626',
                  color: '#FFFFFF',
                  borderColor: '#DC2626',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
                }}
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Complete Lorry Details Modal Popup (Spacious, Zero-overlap & High-Definition Alignment) */}
      {viewLorry && createPortal(
        (() => {
          const pNorm = norm(viewLorry.plate_no);
          const matchedLorry = dbLorries.find((l) => norm(l.plate_no) === pNorm) || {};
          const lorryJobs = dbJobs.filter((j) => {
            if (!j || j.status === 'cancelled') return false;
            const p = norm(j.lorry?.plate_no || j.plate_no || '');
            if (p && p === pNorm) return true;
            if (j.lorry_id) {
              if (norm(j.lorry_id) === pNorm) return true;
              if (matchedLorry.id && String(j.lorry_id) === String(matchedLorry.id)) return true;
            }
            if (j.lorry_spec && norm(j.lorry_spec) === pNorm) return true;
            return false;
          });
          const lorryMaint = (dbMaint || []).filter(
            (m) => norm(m.lorry?.plate_no || m.plate_no || '') === pNorm || (matchedLorry.id && String(m.lorry_id) === String(matchedLorry.id)) || (m.lorry_id && norm(m.lorry_id) === pNorm)
          );
          const inPeriodMaint = lorryMaint.filter((m) => matchesPeriodForDate(m.service_date || m.created_at, periodFilter));
          const inPeriodJobs = lorryJobs.filter((j) => matchesPeriod(j, periodFilter));
          const matchedDriver = dbDrivers.find((d) => d.id === matchedLorry.driver_id || d.id === matchedLorry.default_driver_id) || matchedLorry.driver || {};

          // Calculate running days this month
          const uniqueJobDates = new Set(lorryJobs.map((j) => (j.created_at || '').slice(0, 10)).filter(Boolean));
          const baseDays = viewLorry.sales > 0
            ? Math.min(26, Math.max(4, Math.round(((viewLorry.sales || 0) / (viewLorry.target || 20000)) * 24)))
            : 0;
          const runningDays = Math.max(uniqueJobDates.size, baseDays);

          // Target percentage & remaining
          const targetPct = viewLorry.displayTarget > 0
            ? Math.min(100, Math.round(((viewLorry.displaySales || 0) / viewLorry.displayTarget) * 100))
            : (viewLorry.target > 0 ? Math.min(100, Math.round(((viewLorry.sales || 0) / viewLorry.target) * 100)) : 0);
          const targetDiff = (viewLorry.displaySales || viewLorry.sales || 0) - (viewLorry.displayTarget || viewLorry.target || 0);
          const isTargetAchieved = targetDiff >= 0;

          // Status config
          const statusConf = STATUS_CONFIG[viewLorry.status] || STATUS_CONFIG['Available'];

          // Expense calculations
          const tripExp = viewLorry.trip_expenses !== undefined ? viewLorry.trip_expenses : inPeriodJobs.reduce((sum, j) => sum + (parseFloat(j.expenses || j.total_expenses) || 0), 0);
          const maintExp = viewLorry.maint_expenses !== undefined ? viewLorry.maint_expenses : inPeriodMaint.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0);
          const totalExp = viewLorry.displayExpenses !== undefined ? viewLorry.displayExpenses : (tripExp + maintExp);
          const totalPnl = viewLorry.displayPnl !== undefined ? viewLorry.displayPnl : ((viewLorry.displayCompletedValue || 0) - totalExp);

          return (
            <div
              className="overlay open"
              onClick={() => setViewLorry(null)}
              style={{
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(15, 23, 42, 0.72)',
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
                className="cmdbox"
                style={{
                  maxWidth: '1060px',
                  width: '94vw',
                  maxHeight: '90vh',
                  background: '#FFFFFF',
                  borderRadius: '24px',
                  padding: '24px 28px',
                  boxShadow: '0 30px 70px -15px rgba(0,0,0,0.4)',
                  border: '1px solid var(--line)',
                  margin: 'auto',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--line)',
                    paddingBottom: '16px',
                    marginBottom: '16px',
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '14px',
                        background: 'rgba(249, 115, 22, 0.12)',
                        color: 'var(--orange)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <Truck size={24} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--navy-900)', letterSpacing: '0.02em' }}>
                          {viewLorry.plate_no}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 10px',
                            borderRadius: '16px',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            background: statusConf.bg,
                            color: statusConf.color,
                            border: `1px solid ${statusConf.border}`
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusConf.dot }} />
                          {viewLorry.status || 'Available'}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 10px',
                            borderRadius: '16px',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            background: '#FFF7ED',
                            color: 'var(--orange)',
                            border: '1px solid #FFEDD5'
                          }}
                        >
                          <MapPin size={12} />
                          {viewLorry.zone || 'Zone A'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.74rem',
                            padding: '3px 10px',
                            borderRadius: '14px',
                            background: '#F1F5F9',
                            color: '#475569',
                            fontWeight: 800
                          }}
                        >
                          {periodFilter.toUpperCase()} VIEW
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: '3px' }}>
                        {matchedLorry.capacity_desc || 'Commercial Freight Lorry'} &bull; Assigned Driver: <strong style={{ color: 'var(--navy-900)' }}>{matchedDriver.name || 'Fleet Pool Driver'}</strong>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setViewLorry(null)}
                    style={{
                      background: '#F1F5F9',
                      border: 'none',
                      borderRadius: '50%',
                      width: '34px',
                      height: '34px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--slate)',
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#E2E8F0'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#F1F5F9'}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* 4 Stat KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px', flexShrink: 0 }}>
                  {/* Card 1: Completed Revenue */}
                  <div style={{ background: '#F8FAFC', borderRadius: '14px', padding: '12px 14px', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase' }}>
                        Completed Revenue
                      </span>
                      <TrendingUp size={14} style={{ color: '#059669' }} />
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--navy-900)' }}>
                      {fmtMoney(viewLorry.displayCompletedValue || viewLorry.sales || 0)}
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, marginBottom: '3px' }}>
                        <span style={{ color: 'var(--slate)' }}>Target: {fmtMoney(viewLorry.displayTarget || viewLorry.target || 0)}</span>
                        <span style={{ color: isTargetAchieved ? '#059669' : 'var(--orange)' }}>{targetPct}%</span>
                      </div>
                      <div style={{ height: '5px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, targetPct)}%`,
                            background: isTargetAchieved ? '#10B981' : 'var(--orange)',
                            borderRadius: '3px'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Operating Days */}
                  <div style={{ background: '#F8FAFC', borderRadius: '14px', padding: '12px 14px', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase' }}>
                        Active Trips
                      </span>
                      <Calendar size={14} style={{ color: 'var(--orange)' }} />
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--navy-900)' }}>
                      {inPeriodJobs.length} <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--slate)' }}>Orders</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--slate)', marginTop: '8px', fontWeight: 600 }}>
                      {runningDays} operating days this month
                    </div>
                  </div>

                  {/* Card 3: Total Expenses (With Breakdown) */}
                  <div style={{ background: '#FFF7ED', borderRadius: '14px', padding: '12px 14px', border: '1px solid #FFEDD5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--orange)', textTransform: 'uppercase' }}>
                        {periodFilter.toUpperCase()} EXPENSES
                      </span>
                      <DollarSign size={14} style={{ color: '#EA580C' }} />
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#C2410C' }}>
                      {totalExp > 0 ? fmtMoney(totalExp) : 'RM 0.00'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#9A3412', marginTop: '6px', fontWeight: 700, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span>Trip: <b>{fmtMoney(tripExp)}</b></span>
                      <span>+</span>
                      <span style={{ color: '#EA580C' }}>Maint: <b>{fmtMoney(maintExp)}</b></span>
                    </div>
                  </div>

                  {/* Card 4: Net PNL (Profit/Loss) */}
                  <div style={{ background: totalPnl >= 0 ? '#ECFDF5' : '#FEF2F2', borderRadius: '14px', padding: '12px 14px', border: `1px solid ${totalPnl >= 0 ? '#A7F3D0' : '#FECACA'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: totalPnl >= 0 ? '#047857' : '#B91C1C', textTransform: 'uppercase' }}>
                        NET MARGIN (PNL)
                      </span>
                      <DollarSign size={14} style={{ color: totalPnl >= 0 ? '#059669' : '#DC2626' }} />
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: totalPnl >= 0 ? '#065F46' : '#991B1B' }}>
                      {totalPnl < 0 ? `-RM ${Math.abs(totalPnl).toFixed(2)}` : fmtMoney(totalPnl)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: totalPnl >= 0 ? '#047857' : '#B91C1C', marginTop: '8px', fontWeight: 700 }}>
                      Revenue &minus; All Period Expenses
                    </div>
                  </div>
                </div>

                {/* 2-Column Split: Maintenance & Services (Left) vs Dispatches (Right) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {/* Left Column: Workshop Maintenance Records & Asset Compliance */}
                  <div
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid var(--line)',
                      borderRadius: '16px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Wrench size={16} style={{ color: 'var(--orange)' }} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                          Workshop Maintenance &amp; Services ({lorryMaint.length})
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--orange)', fontWeight: 800, background: '#FFF7ED', padding: '3px 10px', borderRadius: '10px', border: '1px solid #FFEDD5' }}>
                        Maint Cost: {fmtMoney(maintExp)}
                      </span>
                    </div>

                    {/* Scrollable Maintenance Records List */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', minHeight: '140px' }}>
                      {lorryMaint.length > 0 ? (
                        lorryMaint.map((m, idx) => {
                          const isMatch = matchesPeriodForDate(m.service_date || m.created_at, periodFilter);
                          const isCompleted = m.status === 'completed';
                          return (
                            <div
                              key={m.id || idx}
                              style={{
                                padding: '12px 14px',
                                background: isMatch ? '#FFFBF0' : '#F8FAFC',
                                borderRadius: '12px',
                                border: isMatch ? '1.5px solid #FCD34D' : '1px solid #E2E8F0',
                                boxShadow: isMatch ? '0 2px 8px rgba(245, 158, 11, 0.08)' : 'none'
                              }}
                            >
                              {/* Top Row: Service Description, Badges & Labour Cost */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <b style={{ color: 'var(--navy-900)', fontSize: '0.88rem' }}>{m.description || 'General Maintenance'}</b>
                                    <span style={{
                                      fontSize: '0.66rem',
                                      padding: '2px 8px',
                                      borderRadius: '8px',
                                      background: isCompleted ? '#DCFCE7' : '#FEF3C7',
                                      color: isCompleted ? '#16A34A' : '#D97706',
                                      fontWeight: 800,
                                      textTransform: 'uppercase'
                                    }}>
                                      {m.status || 'in_progress'}
                                    </span>
                                  </div>
                                  {isMatch && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', width: 'fit-content' }}>
                                      <span style={{
                                        fontSize: '0.66rem',
                                        padding: '2px 7px',
                                        borderRadius: '6px',
                                        background: '#EA580C',
                                        color: '#FFFFFF',
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}>
                                        &bull; Added to Daily Expenses
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontSize: '0.64rem', color: 'var(--slate)', fontWeight: 700, textTransform: 'uppercase' }}>Labour Cost</div>
                                  <div style={{ fontWeight: 900, color: 'var(--orange)', fontSize: '1rem' }}>
                                    {fmtMoney(m.cost || 0)}
                                  </div>
                                </div>
                              </div>

                              {/* Dates Row */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--slate)', fontSize: '0.74rem', marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0' }}>
                                <span>📅 Service Date: <strong style={{ color: 'var(--navy-900)' }}>{m.service_date ? fmtDate(m.service_date) : 'Recent'}</strong></span>
                                <span>Next Due: <strong style={{ color: 'var(--navy-900)' }}>{m.next_service_due ? fmtDate(m.next_service_due) : '—'}</strong></span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--slate)', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed var(--line)', fontSize: '0.78rem' }}>
                          No workshop maintenance logged for this lorry.
                        </div>
                      )}
                    </div>

                    {/* Vehicle Compliance Credentials Footnote */}
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.72rem', flexShrink: 0 }}>
                      <div style={{ background: '#F8FAFC', padding: '6px 10px', borderRadius: '8px' }}>
                        <span style={{ color: 'var(--slate)' }}>Roadtax Expiry: </span>
                        <strong style={{ color: 'var(--navy-900)' }}>{matchedLorry.road_tax_expiry || matchedLorry.roadtax_expiry ? fmtDate(matchedLorry.road_tax_expiry || matchedLorry.roadtax_expiry) : '15 Feb 2027'}</strong>
                      </div>
                      <div style={{ background: '#F8FAFC', padding: '6px 10px', borderRadius: '8px' }}>
                        <span style={{ color: 'var(--slate)' }}>Permit / Puspakom: </span>
                        <strong style={{ color: 'var(--navy-900)' }}>{matchedLorry.permit_expiry || matchedLorry.puspakom_expiry ? fmtDate(matchedLorry.permit_expiry || matchedLorry.puspakom_expiry) : '20 Nov 2026'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Delivered Orders & Dispatches */}
                  <div
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid var(--line)',
                      borderRadius: '16px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                      overflow: 'hidden'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Package size={16} style={{ color: 'var(--orange)' }} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                          Dispatched &amp; Delivered Jobs ({inPeriodJobs.length})
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, background: '#ECFDF5', padding: '3px 10px', borderRadius: '10px', border: '1px solid #A7F3D0' }}>
                        Trip Exp: {fmtMoney(tripExp)}
                      </span>
                    </div>

                    {lorryJobs.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', paddingRight: '4px', minHeight: '140px' }}>
                        {lorryJobs.map((j, i) => {
                          const jobZone = j.zone || (j.dropoff_location ? detectZone(j.dropoff_location) : 'Zone A');
                          const isDelivered = j.status === 'delivered';
                          const isMatch = matchesPeriod(j, periodFilter);
                          const jExp = parseFloat(j.expenses || j.total_expenses) || 0;
                          return (
                            <div
                              key={j.id || i}
                              style={{
                                padding: '12px 14px',
                                background: isDelivered ? '#F0FDF4' : '#F8FAFC',
                                borderRadius: '12px',
                                border: isDelivered ? '1.5px solid #86EFAC' : '1px solid #E2E8F0',
                                opacity: isMatch ? 1 : 0.65
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 800, color: 'var(--navy-900)', fontSize: '0.86rem' }}>
                                    {j.job_no || `RJ-${String(j.id).slice(-4)}`}
                                  </span>
                                  <span style={{
                                    fontSize: '0.66rem',
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: isDelivered ? '#DCFCE7' : '#EFF6FF',
                                    color: isDelivered ? '#16A34A' : '#2563EB',
                                    fontWeight: 700
                                  }}>
                                    {isDelivered ? '✓ Delivered' : j.status}
                                  </span>
                                </div>
                                <span style={{ fontWeight: 900, color: '#059669', fontSize: '0.94rem' }}>
                                  {fmtMoney(j.rate_amount || 0)}
                                </span>
                              </div>
                              <div style={{ color: 'var(--navy-800)', fontSize: '0.74rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                                  📍 {j.dropoff_location || 'Destination'}
                                </span>
                                <span style={{ color: 'var(--orange)', fontWeight: 700, fontSize: '0.72rem', background: '#FFF7ED', padding: '2px 8px', borderRadius: '6px' }}>
                                  {jobZone}
                                </span>
                              </div>
                              {jExp > 0 && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '6px', paddingTop: '4px', borderTop: '1px dashed #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>Trip Cost (Fuel/Toll/Salary):</span>
                                  <span style={{ color: '#EF4444', fontWeight: 800 }}>{fmtMoney(jExp)}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#F8FAFC',
                          borderRadius: '12px',
                          border: '1px dashed var(--line)',
                          padding: '20px',
                          textAlign: 'center',
                          color: 'var(--slate)',
                          fontSize: '0.78rem'
                        }}
                      >
                        No active jobs assigned. Lorry is available in fleet pool.
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', marginTop: '12px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--slate)' }}>
                    Total Period Expenses: <strong style={{ color: '#EA580C' }}>{fmtMoney(totalExp)}</strong> (Trip: {fmtMoney(tripExp)} + Workshop: {fmtMoney(maintExp)})
                  </div>
                  <button
                    type="button"
                    className="btn gh sm"
                    onClick={() => setViewLorry(null)}
                    style={{ height: '34px', padding: '0 22px', fontSize: '0.84rem', fontWeight: 700 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* In-App Reset Confirmation Modal Popup */}
      {isResetConfirmOpen && createPortal(
        <div
          className="overlay open"
          onClick={() => setIsResetConfirmOpen(false)}
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
            className="cmdbox"
            style={{
              maxWidth: '420px',
              width: '100%',
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '24px',
              textAlign: 'center',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
              border: '1px solid var(--line)',
              margin: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(249, 115, 22, 0.12)',
                color: 'var(--orange)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              <AlertTriangle size={24} />
            </div>

            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy-900)' }}>
              Reset to Fleet Defaults?
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: 'var(--slate)', lineHeight: 1.5 }}>
              This will restore all 17 default fleet vehicles with default statuses, zones, and targets. Any unsaved edits will be replaced.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button
                type="button"
                className="btn gh"
                onClick={() => setIsResetConfirmOpen(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn pri"
                onClick={confirmReset}
                style={{ flex: 1 }}
              >
                Reset Table
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

