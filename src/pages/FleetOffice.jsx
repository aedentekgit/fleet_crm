import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { sb, fmtMoney, fmtDate, esc, daysUntil, subscribeTable, clearFleetData, getStorageData } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/common/Pagination';
import {
  Truck,
  Users,
  Wrench,
  Boxes,
  Plus,
  Sparkles,
  ArrowDownToLine,
  ArrowUpFromLine,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  X,
  Phone,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Star,
  Check,
  Eye
} from 'lucide-react';

const TABS = [
  ['drivers', 'Drivers & Crew', Users],
  ['vehicles', 'Vehicles', Truck],
  ['maintenance', 'Maintenance', Wrench]
];

export default function FleetOffice() {
  const { staff } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('drivers');

  const [lorries, setLorries] = useState(() => getStorageData('lorries'));
  const [drivers, setDrivers] = useState(() => getStorageData('drivers'));
  const [maint, setMaint] = useState(() => getStorageData('maintenance_records'));
  const [items, setItems] = useState(() => getStorageData('inventory_items'));
  const [issu, setIssu] = useState(() => getStorageData('inventory_issuances'));

  // Pagination states for tabs (10 items per page)
  const pageSize = 10;
  const [drvPage, setDrvPage] = useState(1);
  const [vehPage, setVehPage] = useState(1);
  const [maintPage, setMaintPage] = useState(1);
  const [invPage, setInvPage] = useState(1);

  const paginatedDrivers = useMemo(() => drivers.slice((drvPage - 1) * pageSize, drvPage * pageSize), [drivers, drvPage, pageSize]);
  const paginatedLorries = useMemo(() => lorries.slice((vehPage - 1) * pageSize, vehPage * pageSize), [lorries, vehPage, pageSize]);
  const paginatedMaint = useMemo(() => maint.slice((maintPage - 1) * pageSize, maintPage * pageSize), [maint, maintPage, pageSize]);
  const paginatedItems = useMemo(() => items.slice((invPage - 1) * pageSize, invPage * pageSize), [items, invPage, pageSize]);

  // Modal control
  const [modalType, setModalType] = useState(null); // 'veh', 'drv', 'maint', 'receive', 'issue'
  const [modalEditId, setModalEditId] = useState(null);

  const [fPlate, setFPlate] = useState('');
  const [fCap, setFCap] = useState('');
  const [fTarget, setFTarget] = useState('20000');
  const [fRoadTaxExp, setFRoadTaxExp] = useState('');
  const [fInsExp, setFInsExp] = useState('');
  const [fPermitExp, setFPermitExp] = useState('');
  const [fDefaultDriver, setFDefaultDriver] = useState('');
  const [fAssignedDrivers, setFAssignedDrivers] = useState([]);
  const [viewVeh, setViewVeh] = useState(null);

  const [fName, setFName] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fPin, setFPin] = useState('');
  const [fIsHelper, setFIsHelper] = useState(false);
  const [fLicClass, setFLicClass] = useState('');
  const [fLicExp, setFLicExp] = useState('');
  const [fIcNum, setFIcNum] = useState('');

  const [fMaintLorry, setFMaintLorry] = useState('');
  const [fMaintDesc, setFMaintDesc] = useState('');
  const [fMaintDate, setFMaintDate] = useState(new Date().toISOString().slice(0, 10));
  const [fMaintNext, setFMaintNext] = useState('');
  const [fMaintCost, setFMaintCost] = useState('');

  const [fRecItem, setFRecItem] = useState('');
  const [fRecCat, setFRecCat] = useState('spare');
  const [fRecUnit, setFRecUnit] = useState('pcs');
  const [fRecQty, setFRecQty] = useState('');
  const [fRecCost, setFRecCost] = useState('');

  const [fIssItem, setFIssItem] = useState('');
  const [fIssLorry, setFIssLorry] = useState('');
  const [fIssQty, setFIssQty] = useState('');
  const [fIssCost, setFIssCost] = useState('');
  const [fIssMaint, setFIssMaint] = useState('');

  const loadData = useCallback(async () => {
    let l = [], d = [], m = [], it = [], is = [], jb = [];
    if (sb) {
      try {
        const res = await Promise.all([
          sb.from('lorries').select('*, driver:drivers(name)').order('plate_no'),
          sb.from('drivers').select('*').order('name'),
          sb.from('maintenance_records').select('*, lorry:lorries(plate_no)').order('service_date', { ascending: false }),
          sb.from('inventory_items').select('*').order('name'),
          sb.from('inventory_issuances').select('*, item:inventory_items(name), lorry:lorries(plate_no)').order('issued_at', { ascending: false }).limit(40),
          sb.from('jobs').select('id, lorry_id, plate_no, status')
        ]);
        l = res[0].data || [];
        d = res[1].data || [];
        m = res[2].data || [];
        it = res[3].data || [];
        is = res[4].data || [];
        jb = res[5].data || [];
      } catch (e) {}
    }

    const normPlate = (s) => (s || '').replace(/\s+/g, '').toUpperCase();
    const activeMaintLorryIds = new Set((m || []).filter(mr => mr.status === 'in_progress').map(mr => String(mr.lorry_id)));
    const activeJobLorryIds = new Set((jb || []).filter(j => j.status === 'assigned' || j.status === 'in_transit').map(j => String(j.lorry_id)));
    const activeJobPlates = new Set((jb || []).filter(j => j.status === 'assigned' || j.status === 'in_transit').map(j => normPlate(j.plate_no || j.lorry_id)));

    // Reconcile real-time status: Maintenance > Active Job > Available
    const reconciledLorries = l.map(lorry => {
      const pNorm = normPlate(lorry.plate_no);
      let effectiveStatus = 'available';
      if (activeMaintLorryIds.has(String(lorry.id)) || lorry.status === 'maintenance' || lorry.status === 'in_workshop') {
        effectiveStatus = 'maintenance';
      } else if (activeJobLorryIds.has(String(lorry.id)) || activeJobPlates.has(pNorm)) {
        effectiveStatus = 'on_job';
      } else if (lorry.status === 'standby') {
        effectiveStatus = 'standby';
      } else {
        effectiveStatus = 'available';
      }
      return {
        ...lorry,
        status: effectiveStatus
      };
    });

    setLorries(reconciledLorries);
    setDrivers(d);
    setMaint(m);
    setItems(it);
    setIssu(is);
  }, []);

  const handleClearFleetData = async () => {
    if (!window.confirm('Are you sure you want to completely clear all Vehicles, Drivers, Maintenance, and Inventory data on this page?')) return;
    await clearFleetData();
    toast('All Fleet & Asset data removed', 'ok');
    loadData();
  };

  useEffect(() => {
    loadData();
    // Subscribe to local event bus for cross-page reactivity
    const unsub1 = subscribeTable('lorries', loadData);
    const unsub2 = subscribeTable('drivers', loadData);
    const unsub3 = subscribeTable('maintenance_records', loadData);
    const unsub4 = subscribeTable('inventory_items', loadData);
    const unsub5 = subscribeTable('inventory_issuances', loadData);
    const unsub6 = subscribeTable('jobs', loadData);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); };
  }, [loadData]);

  const expFlag = (d) => {
    const n = daysUntil(d);
    if (n == null) return fmtDate(d);
    if (n < 0) return <span className="exp" style={{ color: 'var(--red)', fontWeight: 700 }}>Expired {fmtDate(d)}</span>;
    if (n <= 30) return <span className="warn" style={{ color: 'var(--amber)', fontWeight: 700 }}>{fmtDate(d)}</span>;
    return fmtDate(d);
  };

  // Driver Assignment Helpers for Vehicle Modal
  const handleAddAssignedDriver = (id) => {
    if (!id) return;
    if (!fAssignedDrivers.includes(id)) {
      const next = [...fAssignedDrivers, id];
      setFAssignedDrivers(next);
      if (!fDefaultDriver) {
        setFDefaultDriver(id);
      }
    }
  };

  const handleRemoveAssignedDriver = (id) => {
    const next = fAssignedDrivers.filter(x => String(x) !== String(id));
    setFAssignedDrivers(next);
    if (String(fDefaultDriver) === String(id)) {
      setFDefaultDriver(next.length > 0 ? next[0] : '');
    }
  };

  const handleSetDefaultDriver = (id) => {
    setFDefaultDriver(id);
    if (id && !fAssignedDrivers.includes(id)) {
      setFAssignedDrivers([...fAssignedDrivers, id]);
    }
  };

  const getVehicleDrivers = (lorry) => {
    const rawAssigned = Array.isArray(lorry.assigned_driver_ids)
      ? lorry.assigned_driver_ids
      : (Array.isArray(lorry.driver_ids)
        ? lorry.driver_ids
        : (lorry.default_driver_id ? [lorry.default_driver_id] : []));
    const allIds = Array.from(new Set([...(lorry.default_driver_id ? [lorry.default_driver_id] : []), ...rawAssigned]));
    return allIds.map(id => {
      const drv = drivers.find(d => String(d.id) === String(id));
      return {
        id,
        name: drv ? drv.name : (lorry.driver?.name && id === lorry.default_driver_id ? lorry.driver.name : `Driver #${id}`),
        phone: drv?.phone || '',
        isDefault: String(id) === String(lorry.default_driver_id)
      };
    });
  };

  const openVehView = (lorry) => {
    setViewVeh(lorry);
    setModalType('view_veh');
  };

  // Generic Save Helpers
  const openVehForm = (id = null) => {
    const v = lorries.find(x => x.id === id) || {};
    setModalEditId(id);
    setFPlate(v.plate_no || '');
    setFCap(v.capacity_desc || '');
    setFTarget(v.target != null ? String(v.target) : (v.monthly_target != null ? String(v.monthly_target) : '20000'));
    setFRoadTaxExp(v.road_tax_expiry || '');
    setFInsExp(v.insurance_expiry || '');
    setFPermitExp(v.permit_expiry || '');
    const defDrv = v.default_driver_id || '';
    setFDefaultDriver(defDrv);
    const assigned = Array.isArray(v.assigned_driver_ids)
      ? v.assigned_driver_ids
      : (Array.isArray(v.driver_ids)
        ? v.driver_ids
        : (defDrv ? [defDrv] : []));
    setFAssignedDrivers(assigned);
    setModalType('veh');
  };

  const saveVeh = async () => {
    if (!fPlate.trim()) {
      toast('Please enter a plate number', 'err');
      return;
    }
    const row = {
      plate_no: fPlate.trim(),
      capacity_desc: fCap.trim() || null,
      target: fTarget ? parseFloat(fTarget) || 0 : 20000,
      monthly_target: fTarget ? parseFloat(fTarget) || 0 : 20000,
      road_tax_expiry: fRoadTaxExp || null,
      insurance_expiry: fInsExp || null,
      permit_expiry: fPermitExp || null,
      default_driver_id: fDefaultDriver || null,
      assigned_driver_ids: fAssignedDrivers || [],
      driver_ids: fAssignedDrivers || []
    };
    if (modalEditId) await sb.from('lorries').update(row).eq('id', modalEditId);
    else await sb.from('lorries').insert(row);
    toast('Saved vehicle', 'ok');
    setModalType(null);
    loadData();
  };

  const openDrvForm = (id = null) => {
    const d = drivers.find(x => x.id === id) || {};
    setModalEditId(id);
    setFName(d.name || '');
    setFPhone(d.phone || '');
    setFPin(d.pin || '1234');
    setFIsHelper(!!d.is_helper);
    setFLicClass(d.license_class || '');
    setFLicExp(d.license_expiry || '');
    setFIcNum(d.ic_number || '');
    setModalType('drv');
  };

  const saveDriver = async () => {
    const row = {
      name: fName.trim(),
      phone: fPhone.trim(),
      pin: fPin.trim() || '1234',
      is_helper: fIsHelper,
      license_class: fLicClass.trim() || null,
      license_expiry: fLicExp || null,
      ic_number: fIcNum.trim() || null,
    };
    if (modalEditId) await sb.from('drivers').update(row).eq('id', modalEditId);
    else await sb.from('drivers').insert(row);
    toast('Saved person', 'ok');
    setModalType(null);
    loadData();
  };

  const openMaintForm = () => {
    setFMaintLorry(lorries[0]?.id || '');
    setFMaintDesc('');
    setFMaintDate(new Date().toISOString().slice(0, 10));
    setFMaintNext('');
    setFMaintCost('');
    setModalType('maint');
  };

  const saveMaint = async () => {
    await sb.from('maintenance_records').insert({
      lorry_id: fMaintLorry,
      description: fMaintDesc.trim(),
      service_date: fMaintDate,
      next_service_due: fMaintNext || null,
      cost: parseFloat(fMaintCost) || null,
      status: 'in_progress'
    });
    if (fMaintLorry) {
      await sb.from('lorries').update({ status: 'maintenance' }).eq('id', fMaintLorry);
    }
    toast('Service logged', 'ok');
    setModalType(null);
    loadData();
  };

  const completeMaint = async (id) => {
    const record = maint.find(m => m.id === id);
    await sb.from('maintenance_records').update({ status: 'completed' }).eq('id', id);
    if (record && record.lorry_id) {
      await sb.from('lorries').update({ status: 'available' }).eq('id', record.lorry_id);
    }
    toast('Completed — lorry freed', 'ok');
    loadData();
  };

  const openReceiveForm = () => {
    setFRecItem('');
    setFName('');
    setFRecCat('spare');
    setFRecUnit('pcs');
    setFRecQty('');
    setFRecCost('');
    setModalType('receive');
  };

  const saveReceipt = async () => {
    let itemId = fRecItem;
    const qty = parseFloat(fRecQty) || 0;
    const unitCost = parseFloat(fRecCost) || null;
    if (!itemId) {
      const { data } = await sb.from('inventory_items').insert({
        name: fName.trim(),
        category: fRecCat,
        unit: fRecUnit || 'pcs',
        unit_cost: unitCost,
        quantity_on_hand: qty
      }).select().single();
      itemId = data ? data.id : null;
    } else {
      const item = items.find(x => x.id === itemId);
      const newQty = (parseFloat(item?.quantity_on_hand) || 0) + qty;
      const patch = { quantity_on_hand: newQty };
      if (unitCost) patch.unit_cost = unitCost;
      await sb.from('inventory_items').update(patch).eq('id', itemId);
    }
    if (itemId) {
      await sb.from('inventory_receipts').insert({ item_id: itemId, quantity: qty, unit_cost: unitCost });
    }
    toast('Stock received', 'ok');
    setModalType(null);
    loadData();
  };

  const openIssueForm = () => {
    setFIssItem(items[0]?.id || '');
    setFIssLorry(lorries[0]?.id || '');
    setFIssQty('');
    setFIssCost('');
    setFIssMaint('');
    setModalType('issue');
  };

  const saveIssue = async () => {
    const qty = parseFloat(fIssQty) || 0;
    const unitCost = parseFloat(fIssCost) || null;
    const itemObj = items.find(x => x.id === fIssItem);
    const lorryObj = lorries.find(x => x.id === fIssLorry);

    const res = await sb.from('inventory_issuances').insert({
      item_id: fIssItem,
      lorry_id: fIssLorry,
      maintenance_record_id: fIssMaint || null,
      quantity: qty,
      unit_cost: unitCost,
      requested_by: staff?.id,
      approval_status: 'pending'
    }).select().single();

    const issuanceId = (res && res.data && res.data.id) ? res.data.id : 'iss_' + Date.now();
    const title = (itemObj ? itemObj.name : 'Stock Item') + ' x' + qty + (lorryObj ? ' (' + lorryObj.plate_no + ')' : '');

    await sb.from('approvals').insert({
      kind: 'issuance',
      ref_id: issuanceId,
      title: title,
      amount: (unitCost || (itemObj ? itemObj.unit_cost : 0) || 0) * qty,
      status: 'waiting',
      flagged: fIssMaint ? 0 : 1
    });

    toast('Issue requested — awaiting owner approval', 'ok');
    setModalType(null);
    loadData();
  };

  const deleteRow = async (table, id) => {
    if (!window.confirm('Delete this row?')) return;
    await sb.from(table).delete().eq('id', id);
    toast('Deleted', 'warn');
    loadData();
  };

  const [focusId, setFocusId] = useState(null);

  // Keyboard shortcut listener for tab switching 1..4, N, J/K row navigation, E (edit), Delete, and modal submit
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

      if (modalType) {
        if ((e.metaKey || e.ctrlKey || e.key === 'Enter') && e.key === 'Enter') {
          e.preventDefault();
          if (modalType === 'veh') saveVeh();
          else if (modalType === 'drv') saveDriver();
          else if (modalType === 'maint') saveMaint();
          else if (modalType === 'receive') saveReceipt();
          else if (modalType === 'issue') saveIssue();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setModalType(null);
        }
        return;
      }

      if (isInput) return;

      let list = [];
      if (tab === 'drivers') list = drivers;
      else if (tab === 'vehicles') list = lorries;
      else if (tab === 'maintenance') list = maint;
      else if (tab === 'inventory') list = items;

      let curIdx = list.findIndex(x => x.id === focusId);

      if (e.key === '1') { setTab('drivers'); setFocusId(null); }
      else if (e.key === '2') { setTab('vehicles'); setFocusId(null); }
      else if (e.key === '3') { setTab('maintenance'); setFocusId(null); }
      else if (e.key === '4') { setTab('inventory'); setFocusId(null); }
      else if (e.key === 'n') {
        e.preventDefault();
        if (tab === 'drivers') openDrvForm();
        else if (tab === 'vehicles') openVehForm();
        else if (tab === 'maintenance') openMaintForm();
        else if (tab === 'inventory') openIssueForm();
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (list.length) {
          const next = (curIdx + 1) % list.length;
          setFocusId(list[next].id);
        }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.length) {
          const prev = (curIdx - 1 + list.length) % list.length;
          setFocusId(list[prev].id);
        }
      } else if (e.key === 'e' || e.key === 'Enter') {
        e.preventDefault();
        if (focusId) {
          if (tab === 'drivers') openDrvForm(focusId);
          else if (tab === 'vehicles') openVehForm(focusId);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (focusId) {
          if (tab === 'drivers') deleteRow('drivers', focusId);
          else if (tab === 'vehicles') deleteRow('lorries', focusId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tab, modalType, focusId, lorries, drivers, maint, items, fPlate, fCap, fTarget, fRoadTaxExp, fInsExp, fPermitExp, fDefaultDriver, fName, fPhone, fPin, fIsHelper, fLicClass, fLicExp, fIcNum, fMaintLorry, fMaintDesc, fMaintDate, fMaintNext, fMaintCost, fRecItem, fRecCat, fRecUnit, fRecQty, fRecCost, fIssItem, fIssLorry, fIssQty, fIssCost, fIssMaint]);

  const openMaintRecords = maint.filter(m => m.status === 'in_progress');

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Fleet &amp; Asset Management</h1>
          <div className="sub">Monitor active drivers, lorries, and workshop maintenance.</div>
        </div>
        <div className="tools">
     
          {tab === 'drivers' && (
            <button className="btn pri" onClick={() => openDrvForm()} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={14} strokeWidth={2.5} /> Add Person <kbd>N</kbd>
            </button>
          )}
          {tab === 'vehicles' && (
            <button className="btn pri" onClick={() => openVehForm()} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={14} strokeWidth={2.5} /> Add Vehicle <kbd>N</kbd>
            </button>
          )}
          {tab === 'maintenance' && (
            <button className="btn pri" onClick={openMaintForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={14} strokeWidth={2.5} /> Log Service <kbd>N</kbd>
            </button>
          )}
          {tab === 'inventory' && (
            <>
              <button className="btn gh" onClick={openReceiveForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <ArrowDownToLine size={14} strokeWidth={2.2} /> Receive Stock
              </button>
              <button className="btn pri" onClick={openIssueForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <ArrowUpFromLine size={14} strokeWidth={2.2} /> Issue to Lorry <kbd>N</kbd>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="statsrow">
        {TABS.map(([k, label, IconComp]) => (
          <span key={k} className={`statchip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <IconComp size={14} strokeWidth={2.2} />
            {label}
          </span>
        ))}
      </div>

      <div className="tab-fade-in">
        {tab === 'drivers' && (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-container">
              <div className="tablecard" style={{ width: '100%', boxSizing: 'border-box' }}>
                <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '16%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Name</th>
                      <th style={{ width: '9%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Role</th>
                      <th style={{ width: '13%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Phone (PWA Login)</th>
                      <th style={{ width: '6%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>PIN</th>
                      <th style={{ width: '19%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>License</th>
                      <th style={{ width: '12%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Expiry</th>
                      <th style={{ width: '11%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Status</th>
                      <th style={{ width: '14%', padding: '12px 10px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.length > 0 ? (
                      paginatedDrivers.map(d => (
                        <tr key={d.id} className={d.id === focusId ? 'focus' : ''} onClick={() => setFocusId(d.id)} style={{ cursor: 'pointer' }}>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', fontWeight: 800, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>{d.name}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            {d.is_helper ? <span className="badge grey" style={{ fontSize: '0.66rem' }}>Crew Helper</span> : <span className="badge blue" style={{ fontSize: '0.66rem' }}>Driver</span>}
                          </td>
                          <td className="mono" style={{ verticalAlign: 'middle', padding: '12px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.phone}</td>
                          <td className="mono" style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <kbd className="dark" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>{d.pin || '—'}</kbd>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.license_class || ''}>{d.license_class || '—'}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{expFlag(d.license_expiry)}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <span className={`badge ${(d.status || 'available') === 'available' ? 'green' : d.status === 'on_job' ? 'blue' : 'grey'}`} style={{ fontSize: '0.66rem', padding: '2px 8px' }}>
                              {(d.status || 'available').replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                              <button
                                className="btn gh sm"
                                style={{ height: '26px', padding: '0 8px', fontSize: '0.7rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={(e) => { e.stopPropagation(); openDrvForm(d.id); }}
                                title="Edit Person"
                              >
                                <Edit3 size={11} strokeWidth={2.2} /> Edit
                              </button>
                              <button
                                className="btn-act-cancel"
                                style={{ height: '26px', padding: '0 8px', fontSize: '0.7rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={(e) => { e.stopPropagation(); deleteRow('drivers', d.id); }}
                                title="Delete Person"
                              >
                                <Trash2 size={11} strokeWidth={2.2} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                            <span>No personnel registered in the system.</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--slate-light)' }}>Click "+ Register Personnel" to add your team.</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <Pagination
                  currentPage={drvPage}
                  totalItems={drivers.length}
                  pageSize={pageSize}
                  onPageChange={setDrvPage}
                  itemName="personnel"
                />
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-container">
              {drivers.length > 0 ? (
                paginatedDrivers.map(d => (
                  <div key={d.id} className={`mobile-card ${d.id === focusId ? 'focus' : ''}`} onClick={() => setFocusId(d.id)}>
                    <div className="mobile-card-header">
                      <div>
                        <b className="mobile-card-title">{d.name}</b>
                        <div style={{ marginTop: '3px' }}>
                          {d.is_helper ? <span className="badge grey" style={{ fontSize: '0.66rem' }}>Crew Helper</span> : <span className="badge blue" style={{ fontSize: '0.66rem' }}>Driver</span>}
                        </div>
                      </div>
                      <span className={`badge ${(d.status || 'available') === 'available' ? 'green' : d.status === 'on_job' ? 'blue' : 'grey'}`} style={{ fontSize: '0.72rem', padding: '3px 10px' }}>
                        {(d.status || 'available').replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mobile-card-row">
                      <span style={{ color: 'var(--slate)' }}>Phone:</span>
                      <b className="mono" style={{ color: 'var(--navy-900)' }}>{d.phone}</b>
                    </div>

                    <div className="mobile-card-row">
                      <span style={{ color: 'var(--slate)' }}>PWA Access PIN:</span>
                      <kbd className="dark" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>{d.pin || '—'}</kbd>
                    </div>

                    <div className="mobile-card-row">
                      <span style={{ color: 'var(--slate)' }}>License &amp; Expiry:</span>
                      <span><b>{d.license_class || '—'}</b> · {expFlag(d.license_expiry)}</span>
                    </div>

                    <div className="mobile-card-footer">
                      <span style={{ fontSize: '0.74rem', color: 'var(--slate)' }}>Driver ID: #{d.id}</span>
                      <div className="mobile-card-actions">
                        <button
                          className="btn gh sm"
                          style={{ height: '32px', padding: '0 12px', fontSize: '0.76rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={(e) => { e.stopPropagation(); openDrvForm(d.id); }}
                        >
                          <Edit3 size={13} strokeWidth={2.2} /> Edit
                        </button>
                        <button
                          className="btn-act-cancel"
                          style={{ height: '32px', padding: '0 10px', fontSize: '0.76rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={(e) => { e.stopPropagation(); deleteRow('drivers', d.id); }}
                        >
                          <Trash2 size={13} strokeWidth={2.2} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)', background: '#FFFFFF', borderRadius: '16px', border: '1px solid var(--line)' }}>
                  No personnel registered. Click "+ Add Driver/Helper".
                </div>
              )}
              <Pagination
                currentPage={drvPage}
                totalItems={drivers.length}
                pageSize={pageSize}
                onPageChange={setDrvPage}
                itemName="personnel"
                style={{ borderRadius: '12px', border: '1px solid var(--line)', marginTop: '12px' }}
              />
            </div>
          </>
        )}

        {tab === 'vehicles' && (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-container">
              <div className="tablecard" style={{ width: '100%', boxSizing: 'border-box' }}>
                <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '16%', padding: '14px 12px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Plate Number</th>
                      <th style={{ width: '18%', padding: '14px 12px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Specs &amp; Capacity</th>
                      <th style={{ width: '12%', padding: '14px 12px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Status</th>
                      <th style={{ width: '16%', padding: '14px 12px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Target (RM)</th>
                      <th style={{ width: '22%', padding: '14px 12px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Assigned Driver(s)</th>
                      <th style={{ width: '16%', padding: '14px 12px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lorries.length > 0 ? (
                      paginatedLorries.map(l => (
                        <tr key={l.id} className={l.id === focusId ? 'focus' : ''} onClick={() => setFocusId(l.id)} style={{ cursor: 'pointer' }}>
                          <td style={{ verticalAlign: 'middle', padding: '14px 12px', whiteSpace: 'nowrap' }}>
                            <span className="plate-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <Truck size={13} strokeWidth={2.2} />
                              {l.plate_no}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '14px 12px', fontWeight: 600, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.capacity_desc || ''}>
                            {l.capacity_desc || '—'}
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '14px 12px', whiteSpace: 'nowrap' }}>
                            <span className={`badge ${l.status === 'available' || l.status === 'active' ? 'green' : l.status === 'maintenance' || l.status === 'in_workshop' ? 'amber' : 'blue'}`} style={{ fontSize: '0.68rem', padding: '3px 10px' }}>
                              {(l.status || 'available').replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '14px 12px', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--orange, #f97316)', fontSize: '0.82rem' }}>
                            {l.target != null ? fmtMoney(l.target) : (l.monthly_target != null ? fmtMoney(l.monthly_target) : 'RM 20,000')}
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '14px 12px', fontWeight: 700, color: 'var(--navy-800)', fontSize: '0.82rem', whiteSpace: 'nowrap' }} title={getVehicleDrivers(l).map(d => `${d.name}${d.isDefault ? ' (Default)' : ''}`).join(', ')}>
                            {(() => {
                              const vehDrivers = getVehicleDrivers(l);
                              if (vehDrivers.length === 0) return <span style={{ color: 'var(--slate)' }}>— None —</span>;
                              const def = vehDrivers.find(d => d.isDefault) || vehDrivers[0];
                              const others = vehDrivers.filter(d => d.id !== def.id);
                              return (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>
                                    {def.name}
                                  </span>
                                  {others.length > 0 && (
                                    <span className="badge blue" style={{ fontSize: '0.64rem', padding: '1px 6px', fontWeight: 800, flexShrink: 0 }} title={others.map(o => o.name).join(', ')}>
                                      +{others.length}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '14px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                              <button
                                className="btn gh sm"
                                style={{ height: '28px', padding: '0 9px', fontSize: '0.72rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--navy-800)' }}
                                onClick={(e) => { e.stopPropagation(); openVehView(l); }}
                                title="View Full Vehicle Details"
                              >
                                <Eye size={13} strokeWidth={2.2} /> View
                              </button>
                              <button
                                className="btn gh sm"
                                style={{ height: '28px', padding: '0 9px', fontSize: '0.72rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={(e) => { e.stopPropagation(); openVehForm(l.id); }}
                                title="Edit Vehicle"
                              >
                                <Edit3 size={12} strokeWidth={2.2} /> Edit
                              </button>
                              <button
                                className="btn-act-cancel"
                                style={{ height: '28px', padding: '0 8px', fontSize: '0.72rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={(e) => { e.stopPropagation(); deleteRow('lorries', l.id); }}
                                title="Delete Vehicle"
                              >
                                <Trash2 size={12} strokeWidth={2.2} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                            <span>No vehicles registered in fleet.</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--slate-light)' }}>Click "+ Register Vehicle" to add lorries.</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <Pagination
                  currentPage={vehPage}
                  totalItems={lorries.length}
                  pageSize={pageSize}
                  onPageChange={setVehPage}
                  itemName="vehicles"
                />
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-container">
              {lorries.length > 0 ? (
                paginatedLorries.map(l => (
                  <div key={l.id} className={`mobile-card ${l.id === focusId ? 'focus' : ''}`} onClick={() => setFocusId(l.id)}>
                    <div className="mobile-card-header">
                      <span className="plate-badge" style={{ fontSize: '0.85rem', padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Truck size={14} strokeWidth={2.2} />
                        {l.plate_no}
                      </span>
                      <span className={`badge ${l.status === 'available' || l.status === 'active' ? 'green' : l.status === 'maintenance' || l.status === 'in_workshop' ? 'amber' : 'blue'}`} style={{ fontSize: '0.72rem', padding: '3px 10px' }}>
                        {(l.status || 'available').replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mobile-card-title" style={{ fontSize: '0.92rem' }}>
                      {l.capacity_desc || 'Standard Cargo Lorry'}
                    </div>

                    <div className="mobile-card-row">
                      <span style={{ color: 'var(--slate)' }}>Monthly Target:</span>
                      <b style={{ color: 'var(--orange, #f97316)' }}>{fmtMoney(l.target || l.monthly_target || 20000)}</b>
                    </div>

                    <div className="mobile-card-row" style={{ alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--slate)' }}>Assigned Driver(s):</span>
                      <div style={{ textAlign: 'right' }}>
                        {(() => {
                          const vehDrivers = getVehicleDrivers(l);
                          if (vehDrivers.length === 0) return <b style={{ color: 'var(--slate)' }}>— None —</b>;
                          const def = vehDrivers.find(d => d.isDefault) || vehDrivers[0];
                          const others = vehDrivers.filter(d => d.id !== def.id);
                          return (
                            <div>
                              <b style={{ color: 'var(--navy-900)' }}>{def.name}</b>
                              {others.length > 0 && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--primary, #0284c7)', marginTop: '2px', fontWeight: 600 }}>
                                  + {others.map(o => o.name).join(', ')}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="mobile-card-footer">
                      <span style={{ fontSize: '0.74rem', color: 'var(--slate)' }}>Lorry ID: #{l.id}</span>
                      <div className="mobile-card-actions">
                        <button
                          className="btn gh sm"
                          style={{ height: '32px', padding: '0 10px', fontSize: '0.76rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={(e) => { e.stopPropagation(); openVehView(l); }}
                        >
                          <Eye size={13} strokeWidth={2.2} /> View
                        </button>
                        <button
                          className="btn gh sm"
                          style={{ height: '32px', padding: '0 10px', fontSize: '0.76rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={(e) => { e.stopPropagation(); openVehForm(l.id); }}
                        >
                          <Edit3 size={13} strokeWidth={2.2} /> Edit
                        </button>
                        <button
                          className="btn-act-cancel"
                          style={{ height: '32px', padding: '0 10px', fontSize: '0.76rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={(e) => { e.stopPropagation(); deleteRow('lorries', l.id); }}
                        >
                          <Trash2 size={13} strokeWidth={2.2} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)', background: '#FFFFFF', borderRadius: '16px', border: '1px solid var(--line)' }}>
                  No vehicles in fleet. Click "+ Add Vehicle".
                </div>
              )}
              <Pagination
                currentPage={vehPage}
                totalItems={lorries.length}
                pageSize={pageSize}
                onPageChange={setVehPage}
                itemName="vehicles"
                style={{ borderRadius: '12px', border: '1px solid var(--line)', marginTop: '12px' }}
              />
            </div>
          </>
        )}

        {tab === 'maintenance' && (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-container">
              <div className="tablecard" style={{ width: '100%', boxSizing: 'border-box' }}>
                <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '14%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Lorry</th>
                      <th style={{ width: '28%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Service Description</th>
                      <th style={{ width: '12%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Service Date</th>
                      <th style={{ width: '12%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Next Due</th>
                      <th style={{ width: '12%', padding: '12px 10px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>Labour Cost</th>
                      <th style={{ width: '10%', padding: '12px 10px', verticalAlign: 'middle', textAlign: 'center', fontSize: '0.74rem' }}>Status</th>
                      <th style={{ width: '12%', padding: '12px 10px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maint.length > 0 ? (
                      paginatedMaint.map(m => (
                        <tr key={m.id}>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <span className="plate-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <Truck size={12} strokeWidth={2.2} />
                              {m.lorry?.plate_no || '—'}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', fontWeight: 600, color: 'var(--navy-900)' }}>{m.description}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{fmtDate(m.service_date)}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{fmtDate(m.next_service_due)}</td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '12px 10px', fontWeight: 800, color: 'var(--orange-600)', whiteSpace: 'nowrap' }}>
                            {fmtMoney(m.cost)}
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'center', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <span className={`badge ${m.status === 'completed' ? 'green' : 'amber'}`} style={{ fontSize: '0.66rem', padding: '2px 8px' }}>
                              {(m.status || 'in_progress').replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            {m.status === 'in_progress' ? (
                              <button
                                className="btn pri sm"
                                style={{ height: '26px', padding: '0 8px', fontSize: '0.68rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => completeMaint(m.id)}
                              >
                                <CheckCircle2 size={11} strokeWidth={2.2} /> Mark Completed
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: 'var(--slate)', fontWeight: 600 }}>Completed</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: 'var(--slate)' }}>No workshop service records.</td></tr>
                    )}
                  </tbody>
                </table>
                <Pagination
                  currentPage={maintPage}
                  totalItems={maint.length}
                  pageSize={pageSize}
                  onPageChange={setMaintPage}
                  itemName="service records"
                />
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-container">
              {maint.length > 0 ? (
                paginatedMaint.map(m => (
                  <div key={m.id} className="mobile-card">
                    <div className="mobile-card-header">
                      <span className="plate-badge" style={{ fontSize: '0.85rem', padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Truck size={14} strokeWidth={2.2} />
                        {m.lorry?.plate_no || '—'}
                      </span>
                      <span className={`badge ${m.status === 'completed' ? 'green' : 'amber'}`} style={{ fontSize: '0.72rem', padding: '3px 10px' }}>
                        {(m.status || 'in_progress').replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mobile-card-title">{m.description}</div>

                    <div className="mobile-card-row">
                      <span style={{ color: 'var(--slate)' }}>Service Date:</span>
                      <b>{fmtDate(m.service_date)}</b>
                    </div>

                    <div className="mobile-card-row">
                      <span style={{ color: 'var(--slate)' }}>Next Due:</span>
                      <b>{fmtDate(m.next_service_due)}</b>
                    </div>

                    <div className="mobile-card-footer">
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--slate)', display: 'block' }}>Labour Cost</span>
                        <b style={{ color: 'var(--orange-600)', fontSize: '1rem', fontWeight: 800 }}>{fmtMoney(m.cost)}</b>
                      </div>
                      <div className="mobile-card-actions">
                        {m.status === 'in_progress' ? (
                          <button
                            className="btn pri sm"
                            style={{ height: '32px', padding: '0 12px', fontSize: '0.76rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => completeMaint(m.id)}
                          >
                            <CheckCircle2 size={13} strokeWidth={2.2} /> Mark Done
                          </button>
                        ) : (
                          <span className="badge green" style={{ fontSize: '0.74rem', padding: '4px 10px' }}>Completed</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)', background: '#FFFFFF', borderRadius: '16px', border: '1px solid var(--line)' }}>
                  No workshop service records found.
                </div>
              )}
              <Pagination
                currentPage={maintPage}
                totalItems={maint.length}
                pageSize={pageSize}
                onPageChange={setMaintPage}
                itemName="service records"
                style={{ borderRadius: '12px', border: '1px solid var(--line)', marginTop: '12px' }}
              />
            </div>
          </>
        )}

        {tab === 'inventory' && (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-container">
              <div className="tablecard" style={{ width: '100%', boxSizing: 'border-box', marginBottom: '20px' }}>
                <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '32%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Item Description</th>
                      <th style={{ width: '18%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Category</th>
                      <th style={{ width: '20%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Stock On Hand</th>
                      <th style={{ width: '15%', padding: '12px 10px', verticalAlign: 'middle', textAlign: 'right', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Unit Cost</th>
                      <th style={{ width: '15%', padding: '12px 10px', verticalAlign: 'middle', textAlign: 'center', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Reorder Threshold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length > 0 ? (
                      paginatedItems.map(i => (
                        <tr key={i.id}>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', fontWeight: 800, color: 'var(--navy-900)' }}>{i.name}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px' }}><span className="badge grey" style={{ fontSize: '0.66rem' }}>{i.category}</span></td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', fontWeight: 800 }}>
                            {i.quantity_on_hand <= (i.reorder_threshold || 0) ? (
                              <span className="badge urgent" style={{ fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <AlertTriangle size={11} strokeWidth={2.4} />
                                {i.quantity_on_hand} {i.unit} (Low Stock)
                              </span>
                            ) : (
                              `${i.quantity_on_hand} ${i.unit}`
                            )}
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '12px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoney(i.unit_cost)}</td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'center', padding: '12px 10px' }}>{i.reorder_threshold || 0}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="5" style={{ padding: '36px', textAlign: 'center', color: 'var(--slate)' }}>No items in inventory. Click "Receive Stock".</td></tr>
                    )}
                  </tbody>
                </table>
                <Pagination
                  currentPage={invPage}
                  totalItems={items.length}
                  pageSize={pageSize}
                  onPageChange={setInvPage}
                  itemName="inventory items"
                />
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-container" style={{ marginBottom: '20px' }}>
              {items.length > 0 ? (
                paginatedItems.map(i => (
                  <div key={i.id} className="mobile-card">
                    <div className="mobile-card-header">
                      <b className="mobile-card-title">{i.name}</b>
                      <span className="badge grey" style={{ fontSize: '0.7rem' }}>{i.category}</span>
                    </div>

                    <div className="mobile-card-row">
                      <span style={{ color: 'var(--slate)' }}>Stock Available:</span>
                      <b>
                        {i.quantity_on_hand <= (i.reorder_threshold || 0) ? (
                          <span className="badge urgent" style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={11} strokeWidth={2.4} />
                            {i.quantity_on_hand} {i.unit} (Low Stock)
                          </span>
                        ) : (
                          `${i.quantity_on_hand} ${i.unit}`
                        )}
                      </b>
                    </div>

                    <div className="mobile-card-footer">
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--slate)', display: 'block' }}>Unit Cost</span>
                        <b style={{ color: 'var(--navy-900)', fontSize: '0.92rem' }}>{fmtMoney(i.unit_cost)}</b>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--slate)', display: 'block' }}>Reorder At</span>
                        <b style={{ color: 'var(--navy-800)', fontSize: '0.92rem' }}>{i.reorder_threshold || 0} {i.unit}</b>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)', background: '#FFFFFF', borderRadius: '16px', border: '1px solid var(--line)' }}>
                  No items in inventory. Click "Receive Stock".
                </div>
              )}
              <Pagination
                currentPage={invPage}
                totalItems={items.length}
                pageSize={pageSize}
                onPageChange={setInvPage}
                itemName="inventory items"
                style={{ borderRadius: '12px', border: '1px solid var(--line)', marginTop: '12px' }}
              />
            </div>

            <div className="panel" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0 }}>Issuance Audit Log</h3>
                  <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px' }}>Flagged = No linked service job</div>
                </div>
              </div>
              <div className="slist" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {issu.length > 0 ? (
                  issu.map(x => (
                    <div
                      key={x.id}
                      className={`srow ${x.maintenance_record_id ? '' : 'flagged'}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#F8FAFC',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0'
                      }}
                    >
                      <span className="l" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className={`badge ${x.approval_status === 'approved' ? 'green' : x.approval_status === 'rejected' ? 'red' : 'amber'}`} style={{ fontSize: '0.64rem', padding: '2px 6px' }}>
                          {x.approval_status}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{x.item?.name || ''}</span> × {x.quantity} →{' '}
                        <span className="plate-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Truck size={12} strokeWidth={2.2} />
                          {x.lorry?.plate_no || ''}
                        </span>
                        {!x.maintenance_record_id && (
                          <span className="badge red" style={{ fontSize: '0.62rem', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <AlertTriangle size={10} strokeWidth={2.4} />
                            Unlinked Issue
                          </span>
                        )}
                      </span>
                      <span className="r"><b style={{ color: 'var(--orange-600)', fontSize: '0.86rem' }}>{fmtMoney((x.unit_cost || 0) * x.quantity)}</b></span>
                    </div>
                  ))
                ) : (
                  <div className="empty" style={{ padding: '24px', textAlign: 'center', color: 'var(--slate)' }}>No stock issuances recorded.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal Dialog Mounts */}
      {modalType && createPortal(
        <div
          className="overlay open"
          id="modal"
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
            padding: '24px',
            boxSizing: 'border-box'
          }}
          onClick={(e) => e.target.id === 'modal' && setModalType(null)}
        >
            <div className="modalbox" style={{ maxWidth: (modalType === 'veh' || modalType === 'view_veh') ? '860px' : '640px', width: '100%', margin: 'auto', borderRadius: '18px', boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)', overflow: 'hidden' }}>
            <div className="mh" style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', background: '#FFFFFF' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {(modalType === 'veh' || modalType === 'view_veh') && (
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange-600, #ea580c)' }}>
                    <Truck size={20} strokeWidth={2.4} />
                  </div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                    {modalType === 'view_veh' && `Vehicle Profile · ${viewVeh?.plate_no || ''}`}
                    {modalType === 'veh' && (modalEditId ? 'Edit Vehicle Profile' : 'Register New Vehicle')}
                    {modalType === 'drv' && (modalEditId ? 'Edit Person' : 'Add Driver / Crew')}
                    {modalType === 'maint' && 'Log Maintenance Service'}
                    {modalType === 'receive' && 'Receive Stock Inventory'}
                    {modalType === 'issue' && 'Issue Stock to Vehicle'}
                  </h3>
                  {modalType === 'view_veh' && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px' }}>
                      Detailed specifications, driver crew allocation, and statutory compliance status.
                    </div>
                  )}
                  {modalType === 'veh' && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px' }}>
                      Configure fleet specs, assigned driver roster, and regulatory compliance dates.
                    </div>
                  )}
                </div>
              </div>
              <button className="kbtn" onClick={() => setModalType(null)}>Close <kbd>esc</kbd></button>
            </div>
            <div className="mb" style={{ padding: '20px 24px' }}>
              {modalType === 'veh' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Section 1: Vehicle Specifications */}
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                      1. Vehicle Specifications
                    </div>
                    <div className="grid3" style={{ gap: '14px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: '5px' }}>Plate Number</label>
                        <input value={fPlate} onChange={e => setFPlate(e.target.value)} placeholder="e.g. WYY 8832" autoFocus style={{ height: '40px' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: '5px' }}>Capacity / Type</label>
                        <input value={fCap} onChange={e => setFCap(e.target.value)} placeholder="e.g. 40ft Container / 10 Ton" style={{ height: '40px' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: '5px' }}>Monthly Target (RM)</label>
                        <input
                          type="number"
                          step="any"
                          value={fTarget}
                          onChange={e => setFTarget(e.target.value)}
                          placeholder="e.g. 20000"
                          style={{ height: '40px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Driver Roster & Allocation */}
                  <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                          <Users size={14} strokeWidth={2.4} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--navy-900)' }}>
                          2. Driver Allocation &amp; Assigned Roster
                        </span>
                        <span className="badge blue" style={{ fontSize: '0.64rem', padding: '1px 6px', fontWeight: 700 }}>
                          {fAssignedDrivers.length} Assigned
                        </span>
                      </div>
                      {fAssignedDrivers.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setFAssignedDrivers([]);
                            setFDefaultDriver('');
                          }}
                          style={{ border: 'none', background: 'transparent', color: 'var(--red, #ef4444)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, padding: 0 }}
                        >
                          Clear All Drivers
                        </button>
                      )}
                    </div>

                    <div className="grid2" style={{ gap: '14px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: '5px' }}>
                          <span>Default Primary Driver</span>
                          {fDefaultDriver ? (
                            <span style={{ fontSize: '0.62rem', background: '#DCFCE7', color: '#15803D', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                              Active Primary
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.62rem', color: 'var(--slate)' }}>Required for dispatch</span>
                          )}
                        </label>
                        <select value={fDefaultDriver} onChange={e => handleSetDefaultDriver(e.target.value)} style={{ height: '40px', fontSize: '0.82rem', background: '#FFFFFF' }}>
                          <option value="">— Select Primary Driver —</option>
                          {drivers.filter(d => !d.is_helper).map(d => (
                            <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: '5px' }}>
                          <span>+ Add Relief / Co-Driver</span>
                          <span style={{ fontSize: '0.62rem', color: 'var(--slate)' }}>Multi-driver pool</span>
                        </label>
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) {
                              handleAddAssignedDriver(e.target.value);
                            }
                          }}
                          style={{ height: '40px', fontSize: '0.82rem', background: '#FFFFFF' }}
                        >
                          <option value="">+ Add another driver to roster...</option>
                          {drivers
                            .filter(d => !d.is_helper && !fAssignedDrivers.includes(d.id))
                            .map(d => (
                              <option key={d.id} value={d.id}>
                                {d.name} {d.phone ? `(${d.phone})` : ''}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {/* Interactive Assigned Drivers Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '38px', alignItems: 'center', background: '#FFFFFF', padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
                      {fAssignedDrivers.length > 0 ? (
                        fAssignedDrivers.map(id => {
                          const drv = drivers.find(d => String(d.id) === String(id));
                          const isDefault = String(id) === String(fDefaultDriver);
                          return (
                            <span
                              key={id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: isDefault ? '#EFF6FF' : '#F8FAFC',
                                border: isDefault ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                                color: isDefault ? '#1D4ED8' : 'var(--navy-900)',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <UserCheck size={13} color={isDefault ? '#2563EB' : '#64748B'} strokeWidth={2.4} />
                              <span>{drv?.name || `Driver #${id}`}</span>
                              {isDefault ? (
                                <span style={{ fontSize: '0.6rem', background: '#DBEAFE', color: '#1E40AF', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                                  ★ Primary
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSetDefaultDriver(id)}
                                  title="Make this the default driver"
                                  style={{
                                    border: 'none',
                                    background: 'rgba(2, 132, 199, 0.1)',
                                    color: '#0284c7',
                                    cursor: 'pointer',
                                    fontSize: '0.64rem',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontWeight: 700
                                  }}
                                >
                                  Set Primary
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveAssignedDriver(id)}
                                title="Remove driver from vehicle"
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#94A3B8',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: 0,
                                  marginLeft: '2px'
                                }}
                              >
                                <X size={13} strokeWidth={2.4} />
                              </button>
                            </span>
                          );
                        })
                      ) : (
                        <span style={{ fontSize: '0.76rem', color: '#94A3B8', fontStyle: 'italic' }}>
                          No drivers assigned yet. Select a Primary Driver above or add backup drivers to the roster.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Section 3: Regulatory Compliance */}
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                      3. Regulatory &amp; Permit Compliance
                    </div>
                    <div className="grid3" style={{ gap: '14px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: '5px' }}>Road Tax Expiry</label>
                        <input type="date" value={fRoadTaxExp} onChange={e => setFRoadTaxExp(e.target.value)} style={{ height: '40px' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: '5px' }}>Insurance Expiry</label>
                        <input type="date" value={fInsExp} onChange={e => setFInsExp(e.target.value)} style={{ height: '40px' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-800)', marginBottom: '5px' }}>Permit Expiry</label>
                        <input type="date" value={fPermitExp} onChange={e => setFPermitExp(e.target.value)} style={{ height: '40px' }} />
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '6px', paddingTop: '14px', borderTop: '1px solid #F1F5F9' }}>
                    <button
                      type="button"
                      className="btn gh"
                      onClick={() => setModalType(null)}
                      style={{ height: '42px', padding: '0 18px', fontWeight: 600, fontSize: '0.84rem' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn pri"
                      onClick={saveVeh}
                      style={{
                        height: '42px',
                        padding: '0 24px',
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 14px rgba(249, 115, 22, 0.35)'
                      }}
                    >
                      <CheckCircle2 size={16} strokeWidth={2.4} />
                      {modalEditId ? 'Update Vehicle' : 'Save Vehicle'}
                    </button>
                  </div>
                </div>
              )}

              {/* View Full Vehicle Details Modal */}
              {modalType === 'view_veh' && viewVeh && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Top Overview Banner */}
                  <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', padding: '18px 20px', borderRadius: '14px', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FB923C' }}>
                        <Truck size={26} strokeWidth={2.4} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.28rem', fontWeight: 900, letterSpacing: '0.04em' }}>{viewVeh.plate_no}</span>
                          <span className={`badge ${viewVeh.status === 'available' || viewVeh.status === 'active' ? 'green' : viewVeh.status === 'maintenance' || viewVeh.status === 'in_workshop' ? 'amber' : 'blue'}`} style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                            {(viewVeh.status || 'available').replace('_', ' ')}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: '2px' }}>
                          {viewVeh.capacity_desc || 'Commercial Logistics Vehicle'}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monthly Target</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FB923C' }}>
                        {viewVeh.target != null ? fmtMoney(viewVeh.target) : (viewVeh.monthly_target != null ? fmtMoney(viewVeh.monthly_target) : 'RM 20,000')}
                      </div>
                    </div>
                  </div>

                  {/* Section 1: Driver Allocation & Assigned Crew */}
                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                        <Users size={14} strokeWidth={2.4} />
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--navy-900)' }}>
                        Driver Allocation &amp; Assigned Roster
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(() => {
                        const vehDrivers = getVehicleDrivers(viewVeh);
                        if (vehDrivers.length === 0) {
                          return (
                            <div style={{ fontSize: '0.8rem', color: 'var(--slate)', fontStyle: 'italic', padding: '8px 0' }}>
                              No drivers currently assigned to this vehicle.
                            </div>
                          );
                        }
                        return vehDrivers.map(d => (
                          <div
                            key={d.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: '#FFFFFF',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              border: d.isDefault ? '1px solid #93C5FD' : '1px solid #E2E8F0'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: d.isDefault ? '#EFF6FF' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: d.isDefault ? '#2563EB' : '#64748B' }}>
                                <UserCheck size={16} strokeWidth={2.4} />
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--navy-900)' }}>{d.name}</span>
                                  {d.isDefault && (
                                    <span style={{ fontSize: '0.6rem', background: '#DBEAFE', color: '#1E40AF', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                                      ★ Primary Driver
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.74rem', color: 'var(--slate)', marginTop: '2px' }}>
                                  {d.phone ? `Phone: ${d.phone}` : 'Active Fleet Driver'}
                                </div>
                              </div>
                            </div>
                            <span className="badge green" style={{ fontSize: '0.66rem' }}>Authorized</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Section 2: Compliance & Regulatory Expiry Dates */}
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                      Regulatory Compliance &amp; Statutory Expiries
                    </div>
                    <div className="grid3" style={{ gap: '12px' }}>
                      <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--slate)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Calendar size={13} color="#64748B" /> Road Tax
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '0.86rem' }}>
                          {expFlag(viewVeh.road_tax_expiry)}
                        </div>
                      </div>

                      <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--slate)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <ShieldAlert size={13} color="#64748B" /> Insurance
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '0.86rem' }}>
                          {expFlag(viewVeh.insurance_expiry)}
                        </div>
                      </div>

                      <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--slate)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <CheckCircle2 size={13} color="#64748B" /> Permit / APAD
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '0.86rem' }}>
                          {expFlag(viewVeh.permit_expiry)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '6px', paddingTop: '14px', borderTop: '1px solid #F1F5F9' }}>
                    <button
                      type="button"
                      className="btn gh"
                      onClick={() => setModalType(null)}
                      style={{ height: '40px', padding: '0 18px', fontWeight: 600, fontSize: '0.84rem' }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn pri"
                      onClick={() => openVehForm(viewVeh.id)}
                      style={{ height: '40px', padding: '0 20px', fontWeight: 700, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Edit3 size={14} strokeWidth={2.2} /> Edit Vehicle Profile
                    </button>
                  </div>
                </div>
              )}

              {modalType === 'drv' && (
                <div>
                  <div className="field"><label>Full Name</label><input value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Ahmad Razak" autoFocus /></div>
                  <div className="grid2">
                    <div className="field"><label>Phone (PWA Login)</label><input placeholder="60123456789" value={fPhone} onChange={e => setFPhone(e.target.value)} /></div>
                    <div className="field"><label>PWA PIN (4 Digits)</label><input value={fPin} onChange={e => setFPin(e.target.value)} placeholder="0000" /></div>
                  </div>
                  <div className="field">
                    <label><input type="checkbox" checked={fIsHelper} onChange={e => setFIsHelper(e.target.checked)} style={{ width: 'auto', marginRight: '6px' }} /> Helper / Crew Member (Non-Driver)</label>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>License Class</label><input placeholder="GDL / E" value={fLicClass} onChange={e => setFLicClass(e.target.value)} /></div>
                    <div className="field"><label>License Expiry</label><input type="date" value={fLicExp} onChange={e => setFLicExp(e.target.value)} /></div>
                  </div>
                  <div className="field"><label>IC / Passport Number</label><input value={fIcNum} onChange={e => setFIcNum(e.target.value)} /></div>
                  <div className="formfoot"><button className="btn pri" onClick={saveDriver}>Save Person</button></div>
                </div>
              )}

              {modalType === 'maint' && (
                <div>
                  <div className="field">
                    <label>Select Lorry</label>
                    <select value={fMaintLorry} onChange={e => setFMaintLorry(e.target.value)}>
                      {lorries.map(l => (
                        <option key={l.id} value={l.id}>{l.plate_no} - {l.capacity_desc || ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field"><label>Service Description</label><input placeholder="Engine overhaul, brake pads replacement" value={fMaintDesc} onChange={e => setFMaintDesc(e.target.value)} autoFocus /></div>
                  <div className="grid2">
                    <div className="field"><label>Service Date</label><input type="date" value={fMaintDate} onChange={e => setFMaintDate(e.target.value)} /></div>
                    <div className="field"><label>Next Service Due</label><input type="date" value={fMaintNext} onChange={e => setFMaintNext(e.target.value)} /></div>
                  </div>
                  <div className="field"><label>Labour / Service Cost (RM)</label><input type="number" value={fMaintCost} onChange={e => setFMaintCost(e.target.value)} placeholder="0.00" /></div>
                  <div className="formfoot"><button className="btn pri" onClick={saveMaint}>Log &amp; Set Lorry to Workshop</button></div>
                </div>
              )}

              {modalType === 'receive' && (
                <div>
                  <div className="field">
                    <label>Select Existing Item</label>
                    <select value={fRecItem} onChange={e => setFRecItem(e.target.value)}>
                      <option value="">— Create New Item Below —</option>
                      {items.map(i => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>
                  {!fRecItem && (
                    <div id="newitem">
                      <div className="field"><label>New Item Name</label><input placeholder="Bridgestone Tire 295/80R22.5" value={fName} onChange={e => setFName(e.target.value)} /></div>
                      <div className="grid2">
                        <div className="field">
                          <label>Category</label>
                          <select value={fRecCat} onChange={e => setFRecCat(e.target.value)}>
                            {['tire', 'oil', 'filter', 'spare', 'other'].map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field"><label>Unit of Measure</label><input placeholder="pcs / liters" value={fRecUnit} onChange={e => setFRecUnit(e.target.value)} /></div>
                      </div>
                    </div>
                  )}
                  <div className="grid2">
                    <div className="field"><label>Quantity Received</label><input type="number" value={fRecQty} onChange={e => setFRecQty(e.target.value)} placeholder="0" /></div>
                    <div className="field"><label>Unit Cost (RM)</label><input type="number" value={fRecCost} onChange={e => setFRecCost(e.target.value)} placeholder="0.00" /></div>
                  </div>
                  <div className="formfoot"><button className="btn pri" onClick={saveReceipt}>Add Stock to Inventory</button></div>
                </div>
              )}

              {modalType === 'issue' && (
                <div>
                  <div className="field">
                    <label>Item</label>
                    <select value={fIssItem} onChange={e => setFIssItem(e.target.value)}>
                      {items.map(i => (
                        <option key={i.id} value={i.id}>{i.name} ({i.quantity_on_hand} {i.unit} available)</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>To Vehicle</label>
                    <select value={fIssLorry} onChange={e => setFIssLorry(e.target.value)}>
                      {lorries.map(l => (
                        <option key={l.id} value={l.id}>{l.plate_no}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>Quantity</label><input type="number" value={fIssQty} onChange={e => setFIssQty(e.target.value)} placeholder="1" autoFocus /></div>
                    <div className="field"><label>Unit Cost (RM)</label><input type="number" value={fIssCost} onChange={e => setFIssCost(e.target.value)} placeholder="0.00" /></div>
                  </div>
                  <div className="field">
                    <label>Linked Service Job</label>
                    <select value={fIssMaint} onChange={e => setFIssMaint(e.target.value)}>
                      <option value="">⚠ None (will be flagged for owner review)</option>
                      {openMaintRecords.map(m => (
                        <option key={m.id} value={m.id}>{m.lorry?.plate_no || ''} · {m.description}</option>
                      ))}
                    </select>
                  </div>
                  <div className="formfoot">
                    <button className="btn pri" onClick={saveIssue}>
                      Submit Issue Request <kbd className="hot">⌘</kbd><kbd className="hot">↵</kbd>
                    </button>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--slate)', marginTop: '10px' }}>
                    Stock is held until the owner approves this issuance in the Approvals Queue.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
