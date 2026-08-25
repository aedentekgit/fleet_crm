import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { sb, deduplicateJobs, subscribeTable, getStorageData } from '../lib/supabase';
import {
  Building2,
  Package,
  ChevronUp,
  Copy,
  ShieldCheck,
  CheckCircle2,
  Phone,
  Delete,
  ArrowRight,
  AlertTriangle,
  Play,
  Truck,
  Shield,
  History,
  LogOut,
  ArrowLeft,
  KeyRound,
  Check,
  MapPin,
  Clock,
  User,
  CheckSquare,
  Square,
  Sparkles,
  Navigation,
  Lock,
  ChevronRight,
  ChevronDown,
  Wifi,
  Battery,
  FileCheck,
  PenTool,
  Camera,
  RotateCcw,
  X,
  ExternalLink,
  HelpCircle,
  Fuel,
  Gauge,
  Users,
  RefreshCw
} from 'lucide-react';

const OFFLINE_KEY = 'rens_driver_queue';

const DEFAULT_FLEET_DRIVERS = [
  { id: 'drv-1', name: 'Ahmad Bin Razak', phone: '017-8823419', pin: '1234', lorry: 'WVG 1089', zone: 'Zone A' },
  { id: 'drv-2', name: 'Suresh Kumar', phone: '016-223 4589', pin: '1002', lorry: 'BNE 3491', zone: 'Zone B' },
  { id: 'drv-3', name: 'Muhammad Hafiz', phone: '017-889 1234', pin: '1003', lorry: 'VAK 7819', zone: 'Zone C' },
  { id: 'drv-4', name: 'Tan Boon Wah', phone: '012-678 9012', pin: '1004', lorry: 'WQC 5217', zone: 'Zone A' },
  { id: 'drv-5', name: 'Mohd Khairul', phone: '013-456 7890', pin: '1005', lorry: 'BPP 8917', zone: 'Zone B' },
  { id: 'drv-6', name: 'Arumugam A/L Ramasamy', phone: '019-334 5678', pin: '1006', lorry: 'VCE 4317', zone: 'Zone C' },
  { id: 'drv-7', name: 'Lee Chee Keong', phone: '016-789 0123', pin: '1007', lorry: 'WRX 1024', zone: 'Zone A' },
  { id: 'drv-8', name: 'Zulkifli bin Daud', phone: '011-2345 6789', pin: '1008', lorry: 'BRT 6724', zone: 'Zone B' },
  { id: 'drv-9', name: 'K. Saravanan', phone: '018-901 2345', pin: '1009', lorry: 'VDG 9224', zone: 'Zone C' },
  { id: 'drv-10', name: 'Roslan bin Ismail', phone: '012-901 2345', pin: '1010', lorry: 'WSY 1430', zone: 'Zone A' },
  { id: 'drv-11', name: 'Chong Wei Loon', phone: '017-345 6789', pin: '1011', lorry: 'BTU 3830', zone: 'Zone B' },
  { id: 'drv-12', name: 'Devendran A/L Muthu', phone: '016-456 7891', pin: '1012', lorry: 'VEH 7530', zone: 'Zone C' },
  { id: 'drv-13', name: 'Harun bin Osman', phone: '013-890 1234', pin: '1013', lorry: 'WTB 2040', zone: 'Zone A' },
  { id: 'drv-14', name: 'Wong Kah Fai', phone: '012-234 5679', pin: '1014', lorry: 'BWD 8240', zone: 'Zone B' },
  { id: 'drv-15', name: 'G. Tharmalingam', phone: '018-765 4321', pin: '1015', lorry: 'VFK 9940', zone: 'Zone C' }
];

export default function DriverApp({ onRequestConfirm }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [allDrivers, setAllDrivers] = useState(() => {
    const cached = getStorageData('drivers');
    return cached && cached.length > 0 ? cached : DEFAULT_FLEET_DRIVERS;
  });
  const [allSystemJobs, setAllSystemJobs] = useState(() => getStorageData('jobs'));
  const [showDriverSwitcher, setShowDriverSwitcher] = useState(false);

  const [driver, setDriver] = useState(() => {
    try {
      const saved = localStorage.getItem('rens_driver');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id === 'drv-active-demo' || (parsed.name && parsed.name.toLowerCase().includes('ahmad'))) {
          parsed.id = 'drv-1';
          parsed.name = 'Ahmad Bin Razak';
          parsed.phone = '017-8823419';
        }
        return parsed;
      }
    } catch (e) {}
    return DEFAULT_FLEET_DRIVERS[0];
  });

  const [jobs, setJobs] = useState(() => getStorageData('jobs'));
  const [phone, setPhone] = useState(() => localStorage.getItem('rens_driver_phone') || '017-8823419');
  const [pin, setPin] = useState('');
  const [clock, setClock] = useState('00:00:00 AM');
  const [activeTab, setActiveTab] = useState('jobs'); // 'jobs' | 'lorry' | 'history'
  const [mobileToasts, setMobileToasts] = useState([]);
  const [expandedJobId, setExpandedJobId] = useState(null);
  const [pinError, setPinError] = useState(false);

  // Duty status state: 'on_duty' | 'on_break' | 'off_duty'
  const [dutyStatus, setDutyStatus] = useState(() => {
    return localStorage.getItem('rens_driver_duty') || 'on_duty';
  });
  const [showDutyMenu, setShowDutyMenu] = useState(false);

  // e-POD Modal state
  const [podJob, setPodJob] = useState(null);
  const [doNumber, setDoNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientIc, setRecipientIc] = useState('');
  const [podRemarks, setPodRemarks] = useState('Goods received in complete and good condition.');
  const [hasSignature, setHasSignature] = useState(false);
  const [photoAttached, setPhotoAttached] = useState(true);
  const sigCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // View Receipt Modal state
  const [receiptJob, setReceiptJob] = useState(null);

  // Daily checklist state for lorry tab
  const [selectedLorryPlate, setSelectedLorryPlate] = useState('WVG 8821');
  const [odometerKm, setOdometerKm] = useState('142,850');
  const [checklistNotes, setChecklistNotes] = useState('');
  const [inspectionSubmitted, setInspectionSubmitted] = useState(() => {
    return localStorage.getItem('rens_inspection_done_today') === 'true';
  });
  const [inspectionChecks, setInspectionChecks] = useState({
    brakes: true,
    tires: true,
    lights: true,
    straps: true,
    fuel: true,
    engineOil: true,
    wipers: true,
    safetyKit: true
  });

  // Clock ticker
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      let hrs = now.getHours();
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      hrs = hrs % 12 || 12;
      const hrsStr = String(hrs).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      setClock(`${hrsStr}:${mins}:${secs} ${ampm}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const mobileToast = useCallback((msg, type = 'ok') => {
    const id = Date.now() + '_' + Math.random();
    setMobileToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setMobileToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  }, []);

  // Fetch all drivers from Supabase
  const loadDrivers = useCallback(async () => {
    if (sb) {
      try {
        const { data: dList } = await sb.from('drivers').select('*').order('name');
        if (dList && dList.length > 0) {
          const merged = dList.map(d => {
            const matchedDefault = DEFAULT_FLEET_DRIVERS.find(df => df.id === d.id || df.name.toLowerCase() === (d.name || '').toLowerCase());
            return {
              ...matchedDefault,
              ...d,
              pin: d.pin || matchedDefault?.pin || '1234'
            };
          });
          setAllDrivers(merged);
        }
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  // Load Driver Jobs
  const loadJobs = useCallback(async (drv) => {
    if (!drv) return;
    const cacheKey = `rens_driver_jobs_${drv.id || 'default'}`;

    let data = [];
    let allJobs = [];
    if (sb) {
      try {
        const { data: j } = await sb
          .from('jobs')
          .select('*, customer:customers(company_name), job_crew(role, driver:drivers(id,name))')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false });

        allJobs = j || [];

        // Check local storage jobs too
        try {
          const rawStored = localStorage.getItem('rens_db_jobs');
          if (rawStored) {
            const parsed = JSON.parse(rawStored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const existingIds = new Set(allJobs.map(x => x.id));
              parsed.forEach(pj => {
                if (pj && !existingIds.has(pj.id)) {
                  allJobs.push(pj);
                } else if (pj) {
                  const idx = allJobs.findIndex(x => x.id === pj.id || (pj.job_no && x.job_no === pj.job_no));
                  if (idx >= 0) {
                    allJobs[idx] = { ...allJobs[idx], ...pj };
                  }
                }
              });
            }
          }
        } catch (_) {}

        allJobs = deduplicateJobs(allJobs);
        setAllSystemJobs(allJobs);

        if (allJobs && allJobs.length > 0) {
          const drvId = String(drv.id || '');
          const drvName = (drv.name || '').toLowerCase().trim();
          const drvFirst = drvName.split(' ')[0];

          // Match jobs assigned to this driver
          data = allJobs.filter(job => {
            // ONLY show to the driver once finalized on Finalize page, or already in transit / delivered
            const isFinalizedOrActive = 
              job.status === 'in_transit' ||
              job.status === 'delivered' ||
              ((job.is_finalized === 1 || job.is_finalized === true || Boolean(job.finalized_at)) && job.status === 'assigned');
            
            if (!isFinalizedOrActive) return false;

            const jDrvId = String(job.driver_id || '');
            const isDirectDriver = jDrvId && (
              jDrvId === drvId ||
              (drvId === 'drv-1' && jDrvId === 'drv-active-demo') ||
              (drvId === 'drv-active-demo' && jDrvId === 'drv-1') ||
              (drvName.includes('ahmad') && jDrvId === 'drv-1') ||
              (drvName.includes('roslan') && (jDrvId === 'drv-10' || jDrvId === 'drv-roslan'))
            );

            const isDirectName = job.driver?.name && (
              job.driver.name.toLowerCase().includes(drvName) ||
              drvName.includes(job.driver.name.toLowerCase()) ||
              (drvFirst && job.driver.name.toLowerCase().includes(drvFirst))
            );

            const isCrewDriver = job.job_crew && job.job_crew.some(c => {
              const cId = String(c.driver?.id || c.driver_id || c.id || '');
              const cName = (c.driver?.name || c.name || '').toLowerCase();
              return cId === drvId ||
                     (drvId === 'drv-1' && (cId === 'drv-active-demo' || cId === 'drv-1')) ||
                     (drvId === 'drv-active-demo' && (cId === 'drv-1' || cId === 'drv-active-demo')) ||
                     (drvName.includes('ahmad') && (cId === 'drv-1' || cName.includes('ahmad'))) ||
                     (drvName.includes('roslan') && (cId === 'drv-10' || cName.includes('roslan'))) ||
                     (drvFirst && cName && cName.includes(drvFirst));
            });

            return isDirectDriver || isDirectName || isCrewDriver;
          });
        }
      } catch (e) {
        console.warn('Error loading driver jobs:', e);
      }
    }

    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {}

    setJobs(data);
  }, []);

  // Handle URL query parameters for auto-selecting driver / job
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const targetDrvParam = params.get('driver');
    const targetJobParam = params.get('job_no') || params.get('job');

    if (targetDrvParam && allDrivers.length > 0) {
      const matched = allDrivers.find(d => 
        String(d.id) === String(targetDrvParam) ||
        d.phone?.includes(targetDrvParam) ||
        d.name.toLowerCase().includes(targetDrvParam.toLowerCase())
      );
      if (matched) {
        setDriver(matched);
        localStorage.setItem('rens_driver', JSON.stringify(matched));
        mobileToast(`Logged in as ${matched.name}`, 'ok');
      }
    } else if (targetJobParam && allSystemJobs.length > 0 && allDrivers.length > 0) {
      const matchedJob = allSystemJobs.find(j => j.job_no === targetJobParam || j.id === targetJobParam);
      if (matchedJob) {
        const jDrvId = matchedJob.driver_id || matchedJob.job_crew?.find(c => c.role === 'driver')?.driver_id || matchedJob.job_crew?.[0]?.driver_id;
        const matched = allDrivers.find(d => String(d.id) === String(jDrvId)) ||
                        allDrivers.find(d => matchedJob.job_crew?.some(c => (c.driver?.name || c.name || '').toLowerCase().includes(d.name.toLowerCase())));
        if (matched) {
          setDriver(matched);
          localStorage.setItem('rens_driver', JSON.stringify(matched));
          mobileToast(`Switched to assigned driver ${matched.name}`, 'ok');
        }
      }
    }
  }, [location.search, allDrivers, allSystemJobs, mobileToast]);

  useEffect(() => {
    if (driver) {
      loadJobs(driver);
      const unsub1 = subscribeTable('jobs', () => loadJobs(driver));
      const unsub2 = subscribeTable('job_crew', () => loadJobs(driver));
      return () => { unsub1(); unsub2(); };
    }
  }, [driver, loadJobs]);

  // Compute dispatched jobs count for each driver
  const driverActiveJobCounts = useMemo(() => {
    const counts = {};
    allSystemJobs.forEach(job => {
      // Only count finalized / dispatched trips
      const isFinalizedOrActive = 
        job.status === 'in_transit' ||
        job.status === 'delivered' ||
        ((job.is_finalized === 1 || job.is_finalized === true || Boolean(job.finalized_at)) && job.status === 'assigned');
      
      if (!isFinalizedOrActive || job.status === 'delivered' || job.status === 'cancelled') return;

      allDrivers.forEach(d => {
        const dId = String(d.id);
        const dName = d.name.toLowerCase();
        const dFirst = dName.split(' ')[0];

        const isDirect = String(job.driver_id) === dId || (job.driver?.name && job.driver.name.toLowerCase().includes(dFirst));
        const isCrew = job.job_crew && job.job_crew.some(c => {
          const cId = String(c.driver?.id || c.driver_id || c.id || '');
          const cName = (c.driver?.name || c.name || '').toLowerCase();
          return cId === dId || (dFirst && cName.includes(dFirst));
        });

        if (isDirect || isCrew) {
          counts[dId] = (counts[dId] || 0) + 1;
        }
      });
    });
    return counts;
  }, [allSystemJobs, allDrivers]);

  // Other driver with active jobs (to display smart switch notification banner if current driver has 0 jobs)
  const otherDriverWithJobs = useMemo(() => {
    if (!driver || jobs.length > 0) return null;
    const activeDriverEntry = Object.entries(driverActiveJobCounts).find(([dId, count]) => dId !== String(driver.id) && count > 0);
    if (activeDriverEntry) {
      const [dId] = activeDriverEntry;
      return allDrivers.find(d => String(d.id) === dId);
    }
    return null;
  }, [driver, jobs, driverActiveJobCounts, allDrivers]);

  // Switch driver directly
  const handleSelectDriver = (drv) => {
    setDriver(drv);
    localStorage.setItem('rens_driver', JSON.stringify(drv));
    setShowDriverSwitcher(false);
    mobileToast(`Switched driver to ${drv.name}!`, 'ok');
    loadJobs(drv);
  };

  // Keypad actions
  const tapKey = (v) => {
    setPinError(false);
    if (v === 'del') {
      setPin(prev => prev.slice(0, -1));
    } else {
      if (pin.length < 4) {
        const newPin = pin + v;
        setPin(newPin);
        if (newPin.length === 4) {
          setTimeout(() => handleLogin(newPin), 150);
        }
      }
    }
  };

  const handleLogin = async (customPin = pin) => {
    const finalPin = customPin || pin || '1234';
    const finalPhone = phone || '017-8823419';
    localStorage.setItem('rens_driver_phone', finalPhone);
    
    let foundDriver = null;
    if (sb) {
      try {
        const cleanPhone = finalPhone.replace(/\D/g, '');
        const { data } = await sb.from('drivers').select('*').eq('pin', finalPin);
        if (data && data.length > 0) {
          foundDriver = data.find(d => d.phone === finalPhone || (d.phone && d.phone.replace(/\D/g, '').endsWith(cleanPhone.slice(-9)))) || data[0];
        }
      } catch (e) {}
    }
    if (!foundDriver) {
      if (finalPin === '8888') {
        foundDriver = { id: 'drv-3', name: 'Mohd Sufian Ismail', phone: phone || '019-3322110', pin: '8888', status: 'on_duty' };
      } else {
        foundDriver = {
          id: 'drv-1',
          name: 'Ahmad Bin Razak',
          phone: phone || '017-8823419',
          pin: finalPin,
          status: 'on_duty'
        };
      }
    }

    setDriver(foundDriver);
    localStorage.setItem('rens_driver', JSON.stringify(foundDriver));
    mobileToast(`Welcome, ${foundDriver.name.split(' ')[0]}!`, 'ok');
    loadJobs(foundDriver);
  };

  const quickDemoLogin = (pNum, pCode) => {
    setPhone(pNum);
    setPin(pCode);
    handleLogin(pCode);
  };

  // Status Action: Start Trip or Open e-POD
  const handleStartTrip = async (job) => {
    const now = new Date().toISOString();
    const payload = {
      status: 'in_transit',
      started_at: now
    };

    // Update in memory & cache
    setJobs(prev => {
      const updated = prev.map(j => (j.id === job.id ? { ...j, ...payload } : j));
      const cacheKey = `rens_driver_jobs_${driver?.id || 'default'}`;
      try { localStorage.setItem(cacheKey, JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (sb) {
      try {
        await sb.from('jobs').update(payload).eq('id', job.id);
      } catch (err) {}
    }

    mobileToast(`Trip started for ${job.job_no}! Drive safely.`, 'ok');
  };

  const handleOpenPod = (job) => {
    setPodJob(job);
    setDoNumber(job.do_number || job.do_no || job.delivery_order_no || `DO-${job.job_no?.replace('RJ-', '') || '202608-0002'}`);
    setRecipientName(job.customer?.company_name ? `${job.customer.company_name} Receiving Officer` : 'Tan Ah Boon');
    setRecipientIc('880512-10-5432');
    setPodRemarks('Received 100% full quantity in good order & undamaged condition.');
    setHasSignature(false);
    setTimeout(() => {
      initSignatureCanvas();
    }, 100);
  };

  const handleCompletePod = async () => {
    if (!podJob) return;
    const now = new Date().toISOString();
    const payload = {
      status: 'delivered',
      delivered_at: now,
      do_number: doNumber,
      pod_do_number: doNumber,
      pod_recipient: recipientName || 'Receiver Officer',
      pod_ic: recipientIc || 'Verified IC',
      pod_notes: podRemarks,
      pod_signature: hasSignature ? 'digital_signed' : 'verified_auto_stamp',
      pod_time: now
    };

    // Update state & persist
    setJobs(prev => {
      const updated = prev.map(j => (j.id === podJob.id ? { ...j, ...payload } : j));
      const cacheKey = `rens_driver_jobs_${driver?.id || 'default'}`;
      try { localStorage.setItem(cacheKey, JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (sb) {
      try {
        await sb.from('jobs').update(payload).eq('id', podJob.id);
      } catch (err) {}
    }

    setPodJob(null);
    mobileToast(`e-POD confirmed! ${podJob.job_no} delivered.`, 'ok');
    setActiveTab('history');
  };

  // Canvas Signature Pad handling
  const initSignatureCanvas = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const startDraw = (e) => {
    setIsDrawing(true);
    setHasSignature(true);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    initSignatureCanvas();
    setHasSignature(false);
  };

  const autoSign = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    initSignatureCanvas();
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2.5;
    // Draw stylish verified signature curve
    ctx.beginPath();
    ctx.moveTo(40, 60);
    ctx.bezierCurveTo(70, 20, 100, 75, 140, 45);
    ctx.bezierCurveTo(160, 30, 180, 80, 220, 50);
    ctx.stroke();
    setHasSignature(true);
    mobileToast('Digital Verified Signature Stamped', 'ok');
  };

  // Duty status switcher
  const handleToggleDuty = (newStatus) => {
    setDutyStatus(newStatus);
    localStorage.setItem('rens_driver_duty', newStatus);
    setShowDutyMenu(false);
    const labels = {
      on_duty: 'Active On-Duty',
      on_break: 'On Meal / Rest Break',
      off_duty: 'Off Duty'
    };
    mobileToast(`Duty Status: ${labels[newStatus]}`, newStatus === 'off_duty' ? 'warn' : 'ok');
  };

  // Lorry Checklist Submission
  const handleSubmitChecklist = () => {
    setInspectionSubmitted(true);
    localStorage.setItem('rens_inspection_done_today', 'true');
    mobileToast(`Pre-Trip Inspection Verified for ${selectedLorryPlate}!`, 'ok');
  };

  const handleLogout = () => {
    setDriver(null);
    setPin('');
    localStorage.removeItem('rens_driver');
    mobileToast('Signed out of Driver Mobile PWA', 'ok');
  };

  const activeJobs = jobs.filter(j => j.status === 'assigned' || j.status === 'in_transit');
  const pastJobs = jobs.filter(j => j.status === 'delivered');

  return (
    <div style={{
      background: 'radial-gradient(ellipse at 50% 20%, #0d1b2a 0%, #050a14 100%)',
      color: '#F8FAFC',
      height: '100vh',
      maxHeight: '100vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '8px 12px',
      boxSizing: 'border-box',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Top Bar Navigation */}
      <div className="driver-topbar" style={{
        width: '100%',
        maxWidth: '380px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
        flexShrink: 0
      }}>
        <Link
          to="/board"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#94A3B8',
            textDecoration: 'none',
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '5px 12px',
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.2s ease'
          }}
        >
          <ArrowLeft size={14} /> Back to ERP Board
        </Link>
        <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          DRIVER MOBILE PWA
        </span>
      </div>

      {/* Phone Simulation Frame */}
      <div className="phone-frame" style={{ position: 'relative', width: '380px', height: '760px', maxHeight: 'calc(100vh - 50px)' }}>
        {/* Dynamic Island / Notch */}
        <div style={{
          height: '22px',
          width: '110px',
          background: '#000',
          borderRadius: '16px',
          margin: '-4px auto 6px auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#082f49', marginRight: '6px' }} />
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#0284c7' }} />
        </div>

        {/* Status Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.74rem',
          fontWeight: 600,
          color: '#94A3B8',
          marginBottom: '8px',
          padding: '0 6px',
          flexShrink: 0
        }}>
          <span>{clock}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', color: '#38BDF8' }}>
              <Wifi size={12} /> 5G
            </span>
            <Battery size={14} style={{ transform: 'rotate(90deg)', color: '#10B981' }} />
          </div>
        </div>

        {/* Toast Notifications */}
        <div style={{
          position: 'absolute',
          top: '54px',
          left: '12px',
          right: '12px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          pointerEvents: 'none'
        }}>
          {mobileToasts.map(t => (
            <div key={t.id} style={{
              background: t.type === 'warn' ? '#7F1D1D' : '#064E3B',
              border: `1px solid ${t.type === 'warn' ? '#EF4444' : '#10B981'}`,
              color: '#FFFFFF',
              padding: '8px 12px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.78rem',
              fontWeight: 600,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              animation: 'fadeIn 0.2s ease'
            }}>
              {t.type === 'warn' ? <AlertTriangle size={15} color="#F87171" /> : <CheckCircle2 size={15} color="#34D399" />}
              {t.msg}
            </div>
          ))}
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {!driver ? (
            /* ──────────── SIGN-IN KEYPAD VIEW ──────────── */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', padding: '4px' }}>
              <div>
                <div style={{ textAlign: 'center', margin: '6px 0 12px 0' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px auto',
                    boxShadow: '0 6px 16px rgba(249, 115, 22, 0.4)'
                  }}>
                    <Truck size={22} color="#FFFFFF" />
                  </div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 3px 0', color: '#FFFFFF' }}>
                    Driver Sign-in
                  </h2>
                  <p style={{ fontSize: '0.74rem', color: '#94A3B8', margin: 0 }}>
                    Enter mobile number &amp; 4-digit PIN
                  </p>
                </div>

                {/* Phone Input */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '12px', color: '#94A3B8' }}>
                      <Phone size={15} />
                    </span>
                    <input
                      style={{
                        background: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '12px',
                        padding: '10px 12px 10px 38px',
                        width: '100%',
                        color: '#FFFFFF',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="012-3456789"
                    />
                  </div>
                </div>

                {/* PIN Dots */}
                <div style={{
                  background: '#1E293B',
                  borderRadius: '12px',
                  padding: '9px 12px',
                  border: pinError ? '1px solid #EF4444' : '1px solid #334155',
                  marginBottom: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, marginBottom: '8px' }}>
                    <Lock size={12} />
                    <span>SECURITY PIN ({pin.length}/4)</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', alignItems: 'center', height: '18px' }}>
                    {[0, 1, 2, 3].map(idx => {
                      const isFilled = pin.length > idx;
                      return (
                        <div
                          key={idx}
                          style={{
                            width: isFilled ? '12px' : '10px',
                            height: isFilled ? '12px' : '10px',
                            borderRadius: '50%',
                            background: isFilled ? '#F97316' : 'rgba(255, 255, 255, 0.15)',
                            boxShadow: isFilled ? '0 0 10px rgba(249, 115, 22, 0.8)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Keypad */}
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
                  {[
                    { val: '1', sub: '' },
                    { val: '2', sub: 'ABC' },
                    { val: '3', sub: 'DEF' },
                    { val: '4', sub: 'GHI' },
                    { val: '5', sub: 'JKL' },
                    { val: '6', sub: 'MNO' },
                    { val: '7', sub: 'PQRS' },
                    { val: '8', sub: 'TUV' },
                    { val: '9', sub: 'WXYZ' },
                  ].map(({ val, sub }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => tapKey(val)}
                      style={{
                        background: 'linear-gradient(180deg, #1E293B 0%, #152033 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        height: '46px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#F8FAFC',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <span style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1 }}>{val}</span>
                      {sub && <span style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{sub}</span>}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => tapKey('del')}
                    style={{
                      background: 'linear-gradient(180deg, #1E293B 0%, #152033 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      height: '46px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94A3B8',
                      cursor: 'pointer'
                    }}
                  >
                    <Delete size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => tapKey('0')}
                    style={{
                      background: 'linear-gradient(180deg, #1E293B 0%, #152033 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      height: '46px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#F8FAFC',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>0</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLogin()}
                    style={{
                      background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      height: '46px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(249, 115, 22, 0.4)'
                    }}
                  >
                    <ArrowRight size={20} strokeWidth={2.5} />
                  </button>
                </div>

                {/* Quick Demo Sign-in */}
                <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700, marginBottom: '6px', letterSpacing: '0.04em' }}>
                    SELECT DRIVER PROFILE TO SIGN IN
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', maxHeight: '130px', overflowY: 'auto', padding: '2px' }}>
                    {allDrivers.map(d => {
                      const activeCount = driverActiveJobCounts[String(d.id)] || 0;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setPhone(d.phone || '017-8823419');
                            setPin(d.pin || '1234');
                            handleSelectDriver(d);
                          }}
                          style={{
                            background: activeCount > 0 ? 'rgba(249, 115, 22, 0.15)' : 'rgba(30, 41, 59, 0.9)',
                            border: activeCount > 0 ? '1px solid #F97316' : '1px solid #334155',
                            color: activeCount > 0 ? '#FB923C' : '#CBD5E1',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '6px 8px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px'
                          }}
                        >
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 800 }}>
                            {d.name}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: activeCount > 0 ? '#F97316' : '#64748B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{d.lorry || 'Lorry'}</span>
                            {activeCount > 0 ? (
                              <span style={{ background: '#F97316', color: '#FFF', padding: '0 4px', borderRadius: '4px', fontWeight: 800 }}>
                                {activeCount} Active
                              </span>
                            ) : (
                              <span>PIN: {d.pin || '1234'}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ──────────── LOGGED-IN DRIVER INTERFACE ──────────── */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* Driver Profile & Duty Status Card */}
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(145deg, #1E293B 0%, #0F172A 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '10px 12px',
                borderRadius: '16px',
                marginBottom: '10px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                  <div
                    onClick={() => setShowDriverSwitcher(true)}
                    title="Click to Switch Driver Profile"
                    style={{
                      position: 'relative',
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      color: '#FFF',
                      cursor: 'pointer',
                      flexShrink: 0,
                      boxShadow: '0 4px 12px rgba(249, 115, 22, 0.35)'
                    }}
                  >
                    {driver.name ? driver.name.charAt(0) : 'D'}
                    <span style={{
                      position: 'absolute',
                      bottom: '-1px',
                      right: '-1px',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: dutyStatus === 'on_duty' ? '#10B981' : (dutyStatus === 'on_break' ? '#F59E0B' : '#64748B'),
                      border: '2px solid #0F172A'
                    }} />
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      onClick={() => setShowDriverSwitcher(true)}
                      style={{
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        color: '#FFF',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title="Click to switch driver profile"
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{driver.name}</span>
                      <Users size={12} style={{ color: '#F97316', opacity: 0.85, flexShrink: 0 }} />
                    </div>

                    {/* Duty Status & Lorry Plate */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => setShowDutyMenu(prev => !prev)}
                        style={{
                          background: dutyStatus === 'on_duty' ? 'rgba(16, 185, 129, 0.15)' : (dutyStatus === 'on_break' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.15)'),
                          border: `1px solid ${dutyStatus === 'on_duty' ? 'rgba(16, 185, 129, 0.3)' : (dutyStatus === 'on_break' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(148, 163, 184, 0.3)')}`,
                          padding: '2px 7px',
                          borderRadius: '999px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.64rem',
                          fontWeight: 700,
                          color: dutyStatus === 'on_duty' ? '#34D399' : (dutyStatus === 'on_break' ? '#FBBF24' : '#94A3B8'),
                          whiteSpace: 'nowrap',
                          lineHeight: 1
                        }}
                      >
                        <span style={{
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          background: dutyStatus === 'on_duty' ? '#10B981' : (dutyStatus === 'on_break' ? '#F59E0B' : '#64748B'),
                          flexShrink: 0
                        }} />
                        {dutyStatus === 'on_duty' && 'On-Duty'}
                        {dutyStatus === 'on_break' && 'On Break'}
                        {dutyStatus === 'off_duty' && 'Off Duty'}
                        <ChevronDown size={10} />
                      </button>

                      <span style={{
                        fontSize: '0.65rem',
                        color: '#94A3B8',
                        fontWeight: 700,
                        background: 'rgba(15, 23, 42, 0.6)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        whiteSpace: 'nowrap'
                      }}>
                        {driver.lorry || 'BTU 3830'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Switch & Sign out */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, marginLeft: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setShowDriverSwitcher(true)}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.28)',
                      color: '#38BDF8',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '5px 8px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="Switch driver account"
                  >
                    <Users size={11} /> Switch
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Sign Out"
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#F87171',
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    <LogOut size={13} />
                  </button>
                </div>

                {/* Dropdown Menu for Duty Status */}
                {showDutyMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '54px',
                    left: '12px',
                    zIndex: 200,
                    background: '#0F172A',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '5px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    width: '165px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px'
                  }}>
                    <button
                      type="button"
                      onClick={() => handleToggleDuty('on_duty')}
                      style={{
                        background: dutyStatus === 'on_duty' ? 'rgba(16,185,129,0.15)' : 'transparent',
                        color: '#34D399',
                        border: 'none',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
                      Active On-Duty
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDuty('on_break')}
                      style={{
                        background: dutyStatus === 'on_break' ? 'rgba(245,158,11,0.15)' : 'transparent',
                        color: '#FBBF24',
                        border: 'none',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B' }} />
                      On Meal Break
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDuty('off_duty')}
                      style={{
                        background: dutyStatus === 'off_duty' ? 'rgba(148,163,184,0.15)' : 'transparent',
                        color: '#94A3B8',
                        border: 'none',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748B' }} />
                      Off Duty
                    </button>
                  </div>
                )}
              </div>

              {/* Navigation Tabs Bar */}
              <div style={{
                display: 'flex',
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                padding: '3px',
                marginBottom: '10px',
                flexShrink: 0,
                gap: '3px'
              }}>
                {[
                  { id: 'jobs', label: `Jobs (${activeJobs.length})`, icon: Truck },
                  { id: 'lorry', label: 'Checklist', icon: Shield, badge: inspectionSubmitted },
                  { id: 'history', label: `History (${pastJobs.length})`, icon: History },
                ].map(t => {
                  const IconC = t.icon;
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      style={{
                        flex: 1,
                        height: '36px',
                        background: isActive ? 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)' : 'transparent',
                        color: isActive ? '#FFFFFF' : '#94A3B8',
                        border: 'none',
                        borderRadius: '9px',
                        padding: '0 4px',
                        fontSize: '0.73rem',
                        fontWeight: isActive ? 800 : 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                        boxShadow: isActive ? '0 3px 10px rgba(249, 115, 22, 0.35)' : 'none'
                      }}
                    >
                      <IconC size={13} strokeWidth={isActive ? 2.5 : 2} />
                      <span>{t.label}</span>
                      {t.badge && (
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981', marginLeft: '1px', boxShadow: '0 0 6px #10B981' }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab Contents Area */}
              <div
                className="no-scrollbar"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  paddingRight: '2px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  minHeight: 0,
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
              >
                {/* ── TAB 1: ACTIVE JOBS ── */}
                {activeTab === 'jobs' && (
                  <>
                    {/* Smart Notice if current driver has 0 jobs but another driver has dispatched orders */}
                    {otherDriverWithJobs && activeJobs.length === 0 && (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.18) 0%, rgba(234, 88, 12, 0.28) 100%)',
                        border: '1px solid #F97316',
                        padding: '10px 12px',
                        borderRadius: '14px',
                        marginBottom: '4px',
                        boxShadow: '0 4px 14px rgba(249, 115, 22, 0.18)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <Truck size={15} color="#FB923C" />
                          <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#FFF' }}>
                            Trip Dispatched to {otherDriverWithJobs.name}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#CBD5E1', marginBottom: '8px', lineHeight: 1.35 }}>
                          A new order was dispatched to <b>{otherDriverWithJobs.name}</b> ({otherDriverWithJobs.lorry || 'Assigned Lorry'}). Switch driver to start this trip:
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectDriver(otherDriverWithJobs)}
                          style={{
                            width: '100%',
                            background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                            border: 'none',
                            color: '#FFF',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 8px rgba(249, 115, 22, 0.4)'
                          }}
                        >
                          <Play size={12} fill="#FFF" />
                          Switch to {otherDriverWithJobs.name.split(' ')[0]} ({driverActiveJobCounts[String(otherDriverWithJobs.id)] || 1} Trip Ready)
                        </button>
                      </div>
                    )}

                    {activeJobs.length === 0 ? (
                      <div style={{
                        textAlign: 'center',
                        padding: '36px 16px',
                        background: 'linear-gradient(145deg, #1E293B 0%, #0F172A 100%)',
                        borderRadius: '16px',
                        border: '1px dashed #334155'
                      }}>
                        <Truck size={38} color="#64748B" style={{ margin: '0 auto 10px auto' }} />
                        <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#E2E8F0' }}>No Active Trips Assigned</div>
                        <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '4px' }}>
                          All jobs completed! Check the History tab.
                        </div>
                      </div>
                    ) : (
                      activeJobs.map(j => {
                        const isExpanded = expandedJobId === j.id;
                        const isInTransit = j.status === 'in_transit';
                        const cargoText = j.cargo_desc || j.cargo_description || 'General Cargo';
                        const weightText = j.weight_desc || j.cargo_weight_kg || 'Standard Weight';
                        const lorrySpecText = j.lorry_spec;
                        const isLorryDuplicate = lorrySpecText && lorrySpecText.toLowerCase() === cargoText.toLowerCase();

                        return (
                          <div
                            key={j.id}
                            style={{
                              background: 'linear-gradient(155deg, #1E293B 0%, #0F172A 100%)',
                              border: isInTransit ? '1.5px solid #F97316' : '1px solid rgba(249, 115, 22, 0.35)',
                              borderRadius: '16px',
                              padding: '12px 14px',
                              boxShadow: isInTransit 
                                ? '0 8px 24px -4px rgba(0, 0, 0, 0.5), 0 0 14px rgba(249, 115, 22, 0.25)' 
                                : '0 6px 18px -4px rgba(0, 0, 0, 0.4), 0 0 10px rgba(249, 115, 22, 0.1)',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px'
                            }}
                          >
                            {/* Job Card Header: Job No + Status Tag */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{
                                  background: 'rgba(249, 115, 22, 0.15)',
                                  border: '1px solid rgba(249, 115, 22, 0.3)',
                                  borderRadius: '6px',
                                  padding: '2px 5px',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}>
                                  <Truck size={12} color="#FB923C" />
                                </div>
                                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF', letterSpacing: '0.03em', fontFamily: 'monospace' }}>
                                  {j.job_no}
                                </span>
                              </div>

                              <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                padding: '3px 9px',
                                borderRadius: '999px',
                                background: isInTransit ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                color: isInTransit ? '#FB923C' : '#60A5FA',
                                border: `1px solid ${isInTransit ? 'rgba(249, 115, 22, 0.45)' : 'rgba(59, 130, 246, 0.45)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                              }}>
                                <span style={{
                                  width: '5px',
                                  height: '5px',
                                  borderRadius: '50%',
                                  background: isInTransit ? '#F97316' : '#3B82F6',
                                  boxShadow: isInTransit ? '0 0 6px #F97316' : '0 0 6px #3B82F6'
                                }} />
                                {isInTransit ? 'In Transit' : 'Assigned'}
                              </span>
                            </div>

                            {/* Customer & Cargo Specs */}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <Building2 size={13} color="#94A3B8" />
                                <span style={{ fontWeight: 800, color: '#F8FAFC', fontSize: '0.92rem', textTransform: 'capitalize' }}>
                                  {j.customer?.company_name || 'Commercial Client'}
                                </span>
                              </div>

                              {/* Clean Tags Row */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                <span style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  background: 'rgba(15, 23, 42, 0.7)',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  color: '#CBD5E1',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  <Package size={11} color="#38BDF8" /> {cargoText}
                                </span>
                                <span style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  background: 'rgba(15, 23, 42, 0.7)',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  color: '#CBD5E1',
                                  padding: '2px 7px',
                                  borderRadius: '6px'
                                }}>
                                  ⚖️ {weightText}
                                </span>
                                {lorrySpecText && !isLorryDuplicate && (
                                  <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    background: 'rgba(15, 23, 42, 0.7)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    color: '#FCD34D',
                                    padding: '2px 7px',
                                    borderRadius: '6px'
                                  }}>
                                    🚚 {lorrySpecText}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Visual Route Timeline Stepper - Symmetrical Row Layout */}
                            <div style={{
                              background: '#0F172A',
                              border: '1px solid #334155',
                              borderRadius: '14px',
                              padding: '12px',
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                              {/* Waypoint 1: Pickup */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  border: '2px solid #10B981',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  boxShadow: '0 0 8px rgba(16, 185, 129, 0.35)'
                                }}>
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: '0.60rem', fontWeight: 800, color: '#10B981', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    PICKUP ORIGIN
                                  </div>
                                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {j.pickup_location || 'Port Klang'}
                                  </div>
                                </div>
                              </div>

                              {/* Connector Line */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '2px 0' }}>
                                <div style={{ width: '24px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                  <div style={{ width: '2px', height: '18px', background: 'repeating-linear-gradient(to bottom, #475569 0, #475569 3px, transparent 3px, transparent 6px)' }} />
                                </div>
                                <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 700, letterSpacing: '0.02em' }}>
                                  Direct Transit Route
                                </div>
                              </div>

                              {/* Waypoint 2: Delivery */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '24px',
                                  height: '24px',
                                  borderRadius: '50%',
                                  background: 'rgba(249, 115, 22, 0.15)',
                                  border: '2px solid #F97316',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  boxShadow: '0 0 8px rgba(249, 115, 22, 0.35)'
                                }}>
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F97316' }} />
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: '0.60rem', fontWeight: 800, color: '#FB923C', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    DELIVERY DESTINATION
                                  </div>
                                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {j.dropoff_location || 'Johor Bahru'}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Expandable Details Section */}
                            {isExpanded && (
                              <div style={{
                                background: '#0F172A',
                                borderRadius: '10px',
                                padding: '10px',
                                border: '1px solid #334155',
                                fontSize: '0.72rem',
                                color: '#94A3B8',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: '#64748B' }}>Cargo Item:</span>
                                  <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{cargoText}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: '#64748B' }}>Weight / Specs:</span>
                                  <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{weightText} ({lorrySpecText || 'Standard Lorry'})</span>
                                </div>
                                {j.special_instructions && (
                                  <div style={{ marginTop: '2px', paddingTop: '6px', borderTop: '1px dashed #334155', color: '#FCD34D', lineHeight: 1.4 }}>
                                    ⚠️ {typeof j.special_instructions === 'string' && j.special_instructions.startsWith('{') ? 'Contract Rate Card Quotation' : j.special_instructions}
                                  </div>
                                )}

                                {/* Quick Driver Calling within details */}
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                  <a
                                    href={`tel:${j.customer_phone || '+60123456789'}`}
                                    style={{
                                      flex: 1,
                                      background: 'rgba(52, 211, 153, 0.12)',
                                      border: '1px solid rgba(52, 211, 153, 0.3)',
                                      color: '#34D399',
                                      padding: '7px',
                                      borderRadius: '8px',
                                      textAlign: 'center',
                                      textDecoration: 'none',
                                      fontWeight: 700,
                                      fontSize: '0.72rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <Phone size={12} /> Direct Contact Call
                                  </a>
                                </div>
                              </div>
                            )}

                            {/* Action Buttons: Unified Alignment with No Text Overflow */}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setExpandedJobId(prev => prev === j.id ? null : j.id)}
                                style={{
                                  height: '40px',
                                  padding: '0 10px',
                                  background: isExpanded ? 'rgba(56, 189, 248, 0.18)' : 'rgba(51, 65, 85, 0.6)',
                                  border: isExpanded ? '1px solid #38BDF8' : '1px solid #334155',
                                  color: isExpanded ? '#38BDF8' : '#CBD5E1',
                                  borderRadius: '10px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '3px',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0
                                }}
                              >
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                {isExpanded ? 'Less' : 'Details'}
                              </button>

                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.dropoff_location || 'Port Klang')}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  height: '40px',
                                  padding: '0 10px',
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  color: '#38BDF8',
                                  borderRadius: '10px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap',
                                  boxSizing: 'border-box',
                                  flexShrink: 0
                                }}
                                title="Open destination in Google Maps"
                              >
                                <Navigation size={12} /> GPS
                              </a>

                              {j.status === 'assigned' && (
                                <button
                                  type="button"
                                  onClick={() => handleStartTrip(j)}
                                  style={{
                                    flex: 1,
                                    height: '40px',
                                    background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                                    border: 'none',
                                    color: '#FFF',
                                    fontWeight: 800,
                                    fontSize: '0.82rem',
                                    padding: '0 10px',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    boxShadow: '0 3px 10px rgba(249, 115, 22, 0.4)',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0
                                  }}
                                >
                                  <Play size={13} fill="#FFF" /> Start Trip
                                </button>
                              )}

                              {j.status === 'in_transit' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPod(j)}
                                  style={{
                                    flex: 1,
                                    height: '40px',
                                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                    border: 'none',
                                    color: '#FFF',
                                    fontWeight: 800,
                                    fontSize: '0.76rem',
                                    padding: '0 8px',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    boxShadow: '0 3px 10px rgba(16, 185, 129, 0.4)',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0
                                  }}
                                >
                                  <CheckCircle2 size={14} /> Confirm Delivered
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Driver Companion & Shift Overview Widget */}
                    <div style={{
                      background: 'rgba(15, 23, 42, 0.65)',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      borderRadius: '14px',
                      padding: '10px 12px',
                      marginTop: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          DAILY FLEET COMPANION
                        </span>
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          color: inspectionSubmitted ? '#34D399' : '#FBBF24',
                          background: inspectionSubmitted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          border: `1px solid ${inspectionSubmitted ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}>
                          {inspectionSubmitted ? '✓ Lorry Check Passed' : '⚠️ Lorry Check Pending'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.68rem', color: '#CBD5E1' }}>
                        <div style={{ background: '#0F172A', padding: '7px 9px', borderRadius: '8px', border: '1px solid #334155' }}>
                          <div style={{ color: '#64748B', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.03em' }}>ASSIGNED TRUCK</div>
                          <div style={{ fontWeight: 800, color: '#F8FAFC', marginTop: '2px', fontSize: '0.78rem' }}>{driver.lorry || 'BTU 3830'}</div>
                        </div>
                        <div style={{ background: '#0F172A', padding: '7px 9px', borderRadius: '8px', border: '1px solid #334155' }}>
                          <div style={{ color: '#64748B', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.03em' }}>DISPATCH HOTLINE</div>
                          <a href="tel:+60380001234" style={{ fontWeight: 800, color: '#38BDF8', textDecoration: 'none', marginTop: '2px', display: 'block', fontSize: '0.74rem' }}>
                            📞 +603-8000 1234
                          </a>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ── TAB 2: LORRY CHECKLIST ── */}
                {activeTab === 'lorry' && (
                  <div style={{ background: '#1E293B', padding: '12px', borderRadius: '14px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#FFF' }}>
                        Pre-Trip Safety Inspection
                      </div>
                      {inspectionSubmitted && (
                        <span style={{ fontSize: '0.65rem', background: 'rgba(16,185,129,0.2)', color: '#34D399', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          ✓ Completed
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginBottom: '10px' }}>
                      Verify daily checklist before commencing any route.
                    </div>

                    {/* Vehicle & Odometer Info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>ASSIGNED LORRY</label>
                        <select
                          value={selectedLorryPlate}
                          onChange={e => setSelectedLorryPlate(e.target.value)}
                          style={{
                            width: '100%',
                            background: '#0F172A',
                            border: '1px solid #334155',
                            color: '#FFF',
                            borderRadius: '6px',
                            padding: '5px',
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}
                        >
                          <option value="WVG 8821">WVG 8821 (10 Ton)</option>
                          <option value="BKL 4099">BKL 4099 (5 Ton)</option>
                          <option value="VBE 1120">VBE 1120 (3 Ton)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>CURRENT ODOMETER</label>
                        <input
                          value={odometerKm}
                          onChange={e => setOdometerKm(e.target.value)}
                          placeholder="142,850 km"
                          style={{
                            width: '100%',
                            background: '#0F172A',
                            border: '1px solid #334155',
                            color: '#FFF',
                            borderRadius: '6px',
                            padding: '5px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    {/* Checklist Items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
                      {[
                        { key: 'brakes', label: 'Brakes & Air Pressure' },
                        { key: 'tires', label: 'Tires & Tread Depth' },
                        { key: 'lights', label: 'Headlights & Blinkers' },
                        { key: 'straps', label: 'Cargo Tie-Down Straps' },
                        { key: 'fuel', label: 'Fuel Level (> 50%)' },
                        { key: 'engineOil', label: 'Engine Oil & Coolant' },
                        { key: 'wipers', label: 'Windshield Wipers & Mirrors' },
                        { key: 'safetyKit', label: 'Safety Vest & Extinguisher' },
                      ].map(item => {
                        const checked = inspectionChecks[item.key];
                        return (
                          <div
                            key={item.key}
                            onClick={() => {
                              setInspectionChecks(prev => ({ ...prev, [item.key]: !prev[item.key] }));
                              mobileToast(`${item.label} ${!checked ? 'Checked' : 'Unchecked'}`, 'ok');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: checked ? 'rgba(16, 185, 129, 0.12)' : '#0F172A',
                              border: checked ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid #334155',
                              padding: '6px 9px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '0.72rem', color: checked ? '#E2E8F0' : '#94A3B8', fontWeight: 600 }}>
                              {item.label}
                            </span>
                            {checked ? <CheckSquare size={14} color="#10B981" /> : <Square size={14} color="#64748B" />}
                          </div>
                        );
                      })}
                    </div>

                    {/* Submit Inspection Button */}
                    <button
                      type="button"
                      onClick={handleSubmitChecklist}
                      style={{
                        width: '100%',
                        background: inspectionSubmitted ? 'rgba(16, 185, 129, 0.2)' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        border: inspectionSubmitted ? '1px solid #10B981' : 'none',
                        color: '#FFF',
                        fontWeight: 800,
                        fontSize: '0.76rem',
                        padding: '8px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <CheckCircle2 size={14} />
                      {inspectionSubmitted ? 'Inspection Signed Off & Logged' : 'Submit & Sign Off Inspection'}
                    </button>
                  </div>
                )}

                {/* ── TAB 3: HISTORY ── */}
                {activeTab === 'history' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {pastJobs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '36px 14px', background: '#1E293B', borderRadius: '14px', color: '#94A3B8', fontSize: '0.74rem' }}>
                        <History size={32} color="#64748B" style={{ margin: '0 auto 8px auto' }} />
                        <div>No completed delivery history on this device yet.</div>
                      </div>
                    ) : (
                      pastJobs.map(j => (
                        <div
                          key={j.id}
                          style={{
                            background: '#1E293B',
                            padding: '10px 12px',
                            borderRadius: '12px',
                            border: '1px solid #334155',
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#FFF' }}>{j.job_no}</span>
                            <span style={{ fontSize: '0.68rem', color: '#34D399', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <CheckCircle2 size={12} /> Delivered
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '4px' }}>
                            {j.customer?.company_name || 'Client Cargo'}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginBottom: '6px' }}>
                            {j.pickup_location} → {j.dropoff_location}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #334155', paddingTop: '6px' }}>
                            <span style={{ fontSize: '0.65rem', color: '#64748B' }}>
                              Receiver: {j.pod_recipient || 'Authorized Staff'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setReceiptJob(j)}
                              style={{
                                background: 'rgba(56, 189, 248, 0.15)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                color: '#38BDF8',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '5px',
                                cursor: 'pointer'
                              }}
                            >
                              View ePOD
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── IN-APP ELECTRONIC PROOF OF DELIVERY (e-POD) MODAL ── */}
        {podJob && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 10, 20, 0.96)',
            backdropFilter: 'blur(10px)',
            zIndex: 1100,
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRadius: '40px',
            boxSizing: 'border-box'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileCheck size={18} color="#10B981" />
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#FFF' }}>Confirm e-POD Delivery</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPodJob(null)}
                  style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ background: '#1E293B', padding: '8px 10px', borderRadius: '10px', marginBottom: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38BDF8' }}>{podJob.job_no}</div>
                <div style={{ fontSize: '0.72rem', color: '#E2E8F0', fontWeight: 600 }}>{podJob.customer?.company_name}</div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{podJob.dropoff_location}</div>
              </div>

              {/* DO Number / Delivery Order */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>DO NUMBER (DELIVERY ORDER NO.)</label>
                <input
                  value={doNumber}
                  onChange={e => setDoNumber(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: '#38BDF8',
                    fontWeight: 700,
                    fontSize: '0.76rem',
                    boxSizing: 'border-box',
                    marginTop: '2px',
                    fontFamily: 'monospace'
                  }}
                  placeholder="e.g. DO-202608-0002"
                />
              </div>

              {/* Recipient details */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>RECIPIENT NAME / DESIGNATION</label>
                <input
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: '#FFF',
                    fontSize: '0.76rem',
                    boxSizing: 'border-box',
                    marginTop: '2px'
                  }}
                  placeholder="Receiver Full Name"
                />
              </div>

              {/* Receiver IC */}
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>RECIPIENT IC / PHONE</label>
                <input
                  value={recipientIc}
                  onChange={e => setRecipientIc(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: '#FFF',
                    fontSize: '0.76rem',
                    boxSizing: 'border-box',
                    marginTop: '2px'
                  }}
                  placeholder="IC No. or Contact"
                />
              </div>

              {/* Signature Canvas */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <label style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>DIGITAL SIGNATURE</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={autoSign}
                      style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      + Quick Stamp
                    </button>
                    <button
                      type="button"
                      onClick={clearSignature}
                      style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{
                  background: '#0F172A',
                  border: '1px dashed #475569',
                  borderRadius: '8px',
                  height: '80px',
                  position: 'relative',
                  touchAction: 'none'
                }}>
                  <canvas
                    ref={sigCanvasRef}
                    width={330}
                    height={80}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                    style={{ width: '100%', height: '100%', borderRadius: '8px', cursor: 'crosshair' }}
                  />
                  {!hasSignature && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#475569',
                      fontSize: '0.7rem',
                      gap: '4px'
                    }}>
                      <PenTool size={12} /> Sign with finger or mouse here
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit POD Button */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setPodJob(null)}
                style={{
                  background: '#1E293B',
                  border: '1px solid #334155',
                  color: '#CBD5E1',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompletePod}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  border: 'none',
                  color: '#FFF',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                }}
              >
                <CheckCircle2 size={16} /> Complete Delivery &amp; Submit ePOD
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW RECEIPT MODAL ── */}
        {receiptJob && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 10, 20, 0.96)',
            backdropFilter: 'blur(10px)',
            zIndex: 1100,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRadius: '40px',
            boxSizing: 'border-box'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileCheck size={20} color="#10B981" />
                  <span style={{ fontWeight: 800, fontSize: '0.94rem', color: '#FFF' }}>Delivery Proof (e-POD)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReceiptJob(null)}
                  style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ background: '#1E293B', borderRadius: '12px', padding: '12px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38BDF8', marginBottom: '4px' }}>
                  {receiptJob.job_no}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#F1F5F9', fontWeight: 700, marginBottom: '2px' }}>
                  {receiptJob.customer?.company_name}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginBottom: '10px' }}>
                  {receiptJob.dropoff_location}
                </div>

                <div style={{ borderTop: '1px dashed #334155', paddingTop: '8px', fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Status:</span>
                    <span style={{ color: '#34D399', fontWeight: 700 }}>✓ Verified Delivered</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>DO Number:</span>
                    <span style={{ color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>
                      {receiptJob.pod_do_number || receiptJob.do_number || `DO-${receiptJob.job_no?.replace('RJ-', '') || '202608-0002'}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Recipient:</span>
                    <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{receiptJob.pod_recipient || 'Authorized Receiver'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Completed At:</span>
                    <span style={{ color: '#E2E8F0', fontWeight: 600 }}>
                      {receiptJob.delivered_at ? new Date(receiptJob.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Verified Today'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setReceiptJob(null)}
              style={{
                width: '100%',
                background: '#1E293B',
                border: '1px solid #334155',
                color: '#FFF',
                padding: '10px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              Close Receipt
            </button>
          </div>
        )}

        {/* ── DRIVER SWITCHER MODAL ── */}
        {showDriverSwitcher && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 10, 20, 0.96)',
            backdropFilter: 'blur(10px)',
            zIndex: 1200,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRadius: '40px',
            boxSizing: 'border-box'
          }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={20} color="#F97316" />
                  <span style={{ fontWeight: 800, fontSize: '0.96rem', color: '#FFF' }}>Select Driver Profile</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDriverSwitcher(false)}
                  style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginBottom: '10px' }}>
                Select any fleet driver to access their live assigned trips and e-POD signature terminal.
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
                {allDrivers.map(d => {
                  const isCurrent = driver && String(driver.id) === String(d.id);
                  const activeCount = driverActiveJobCounts[String(d.id)] || 0;

                  return (
                    <div
                      key={d.id}
                      onClick={() => handleSelectDriver(d)}
                      style={{
                        background: isCurrent ? 'linear-gradient(135deg, rgba(249,115,22,0.2) 0%, rgba(234,88,12,0.15) 100%)' : '#1E293B',
                        border: isCurrent ? '1px solid #F97316' : (activeCount > 0 ? '1px solid #F59E0B' : '1px solid #334155'),
                        padding: '10px 12px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: isCurrent ? '#F97316' : (activeCount > 0 ? '#F59E0B' : '#334155'),
                          color: '#FFF',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {d.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#FFF', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>{d.name}</span>
                            {isCurrent && <span style={{ fontSize: '0.62rem', color: '#F97316', fontWeight: 800 }}>• Active Now</span>}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Truck size={11} color="#38BDF8" />
                            <span>{d.lorry || 'Assigned Lorry'}</span>
                            <span>•</span>
                            <span>{d.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        {activeCount > 0 ? (
                          <span style={{
                            background: 'rgba(249, 115, 22, 0.2)',
                            border: '1px solid #F97316',
                            color: '#FB923C',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '20px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#F97316' }} />
                            {activeCount} {activeCount === 1 ? 'Trip' : 'Trips'} Ready
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.68rem', color: '#64748B' }}>0 Trips</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDriverSwitcher(false)}
              style={{
                width: '100%',
                background: '#1E293B',
                border: '1px solid #334155',
                color: '#FFF',
                padding: '10px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              Close
            </button>
          </div>
        )}

        {/* Bottom Home Indicator Bar */}
        <div style={{
          width: '110px',
          height: '4px',
          background: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          margin: '6px auto 0 auto',
          flexShrink: 0
        }} />
      </div>
    </div>
  );
}
