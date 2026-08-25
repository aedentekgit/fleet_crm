import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { sb, fmtMoney, fmtDate, esc, daysUntil, subscribeTable, clearFleetData, seedFleetDemoData, getStorageData } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
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
  ShieldAlert
} from 'lucide-react';

const TABS = [
  ['vehicles', 'Vehicles', Truck],
  ['drivers', 'Drivers & Crew', Users],
  ['maintenance', 'Maintenance', Wrench]
];

export default function FleetOffice() {
  const { staff } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('vehicles');

  const [lorries, setLorries] = useState(() => getStorageData('lorries'));
  const [drivers, setDrivers] = useState(() => getStorageData('drivers'));
  const [maint, setMaint] = useState(() => getStorageData('maintenance_records'));
  const [items, setItems] = useState(() => getStorageData('inventory_items'));
  const [issu, setIssu] = useState(() => getStorageData('inventory_issuances'));

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
    if (!window.confirm('Are you sure you want to completely clear all Vehicles, Drivers, Maintenance, and Inventory demo data on this page?')) return;
    await clearFleetData();
    toast('All Fleet & Asset demo data completely removed', 'ok');
    loadData();
  };

  const handleSeedFleetDemoData = async () => {
    await seedFleetDemoData();
    toast('Demo fleet loaded (3 lorries per fleet type + 15 assigned drivers)', 'ok');
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
    setFDefaultDriver(v.default_driver_id || '');
    setModalType('veh');
  };

  const saveVeh = async () => {
    const row = {
      plate_no: fPlate.trim(),
      capacity_desc: fCap.trim() || null,
      target: fTarget ? parseFloat(fTarget) || 0 : 20000,
      monthly_target: fTarget ? parseFloat(fTarget) || 0 : 20000,
      road_tax_expiry: fRoadTaxExp || null,
      insurance_expiry: fInsExp || null,
      permit_expiry: fPermitExp || null,
      default_driver_id: fDefaultDriver || null,
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
    setFPin(d.pin || '0000');
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
      pin: fPin.trim() || '0000',
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
      if (tab === 'vehicles') list = lorries;
      else if (tab === 'drivers') list = drivers;
      else if (tab === 'maintenance') list = maint;
      else if (tab === 'inventory') list = items;

      let curIdx = list.findIndex(x => x.id === focusId);

      if (e.key === '1') { setTab('vehicles'); setFocusId(null); }
      else if (e.key === '2') { setTab('drivers'); setFocusId(null); }
      else if (e.key === '3') { setTab('maintenance'); setFocusId(null); }
      else if (e.key === '4') { setTab('inventory'); setFocusId(null); }
      else if (e.key === 'n') {
        e.preventDefault();
        if (tab === 'vehicles') openVehForm();
        else if (tab === 'drivers') openDrvForm();
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
          if (tab === 'vehicles') openVehForm(focusId);
          else if (tab === 'drivers') openDrvForm(focusId);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (focusId) {
          if (tab === 'vehicles') deleteRow('lorries', focusId);
          else if (tab === 'drivers') deleteRow('drivers', focusId);
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
          <div className="sub">Monitor active lorries, drivers, and workshop maintenance.</div>
        </div>
        <div className="tools">
          <button
            className="btn gh"
            onClick={handleSeedFleetDemoData}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--primary, #0284c7)', borderColor: 'rgba(2,132,199,0.3)' }}
            title="Populate demo lorries (3 for each fleet type) and drivers"
          >
            <Sparkles size={13} strokeWidth={2.2} /> Load Fleet Demo Data
          </button>
          {(lorries.length > 0 || drivers.length > 0 || maint.length > 0 || items.length > 0 || issu.length > 0) && (
            <button
              className="btn gh"
              onClick={handleClearFleetData}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--red, #ef4444)', borderColor: 'rgba(239,68,68,0.3)' }}
              title="Completely clear all fleet data for this page"
            >
              <Trash2 size={13} strokeWidth={2.2} /> Clear Fleet Data
            </button>
          )}
          {tab === 'vehicles' && (
            <button className="btn pri" onClick={() => openVehForm()} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={14} strokeWidth={2.5} /> Add Vehicle <kbd>N</kbd>
            </button>
          )}
          {tab === 'drivers' && (
            <button className="btn pri" onClick={() => openDrvForm()} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Plus size={14} strokeWidth={2.5} /> Add Person <kbd>N</kbd>
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
        {tab === 'vehicles' && (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-container">
              <div className="tablecard" style={{ width: '100%', boxSizing: 'border-box' }}>
                <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '13%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Plate Number</th>
                      <th style={{ width: '18%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Specs &amp; Capacity</th>
                      <th style={{ width: '9%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Status</th>
                      <th style={{ width: '11%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Target (RM)</th>
                      <th style={{ width: '10%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Road Tax</th>
                      <th style={{ width: '10%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Insurance</th>
                      <th style={{ width: '10%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>Permit</th>
                      <th style={{ width: '10%', padding: '12px 10px', verticalAlign: 'middle', fontSize: '0.74rem' }}>Assigned Driver</th>
                      <th style={{ width: '9%', padding: '12px 10px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.74rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lorries.length > 0 ? (
                      lorries.map(l => (
                        <tr key={l.id} className={l.id === focusId ? 'focus' : ''} onClick={() => setFocusId(l.id)} style={{ cursor: 'pointer' }}>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <span className="plate-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <Truck size={12} strokeWidth={2.2} />
                              {l.plate_no}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', fontWeight: 600, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.capacity_desc || ''}>
                            {l.capacity_desc || '—'}
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <span className={`badge ${l.status === 'available' || l.status === 'active' ? 'green' : l.status === 'maintenance' || l.status === 'in_workshop' ? 'amber' : 'blue'}`} style={{ fontSize: '0.66rem', padding: '2px 8px' }}>
                              {(l.status || 'available').replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--orange, #f97316)', fontSize: '0.78rem' }}>
                            {l.target != null ? fmtMoney(l.target) : (l.monthly_target != null ? fmtMoney(l.monthly_target) : 'RM 20,000')}
                          </td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{expFlag(l.road_tax_expiry)}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{expFlag(l.insurance_expiry)}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{expFlag(l.permit_expiry)}</td>
                          <td style={{ verticalAlign: 'middle', padding: '12px 10px', fontWeight: 700, color: 'var(--navy-800)', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.driver?.name || ''}>
                            {l.driver?.name || '—'}
                          </td>
                          <td style={{ verticalAlign: 'middle', textAlign: 'right', padding: '12px 10px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                              <button
                                className="btn gh sm"
                                style={{ height: '26px', padding: '0 8px', fontSize: '0.7rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={(e) => { e.stopPropagation(); openVehForm(l.id); }}
                                title="Edit Vehicle"
                              >
                                <Edit3 size={11} strokeWidth={2.2} /> Edit
                              </button>
                              <button
                                className="btn-act-cancel"
                                style={{ height: '26px', padding: '0 8px', fontSize: '0.7rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={(e) => { e.stopPropagation(); deleteRow('lorries', l.id); }}
                                title="Delete Vehicle"
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
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <span>No vehicles in fleet.</span>
                            <button
                              className="btn gh sm"
                              onClick={handleSeedFleetDemoData}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary, #0284c7)', borderColor: 'rgba(2,132,199,0.3)', fontWeight: 600 }}
                            >
                              <Sparkles size={13} strokeWidth={2.2} /> Load 15 Demo Lorries &amp; Drivers (3 per Fleet Type)
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-container">
              {lorries.length > 0 ? (
                lorries.map(l => (
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

                    <div className="mobile-card-row">
                      <span style={{ color: 'var(--slate)' }}>Assigned Driver:</span>
                      <b style={{ color: 'var(--navy-900)' }}>{l.driver?.name || '— None —'}</b>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', background: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.72rem' }}>
                      <div>
                        <span style={{ color: 'var(--slate)', display: 'block' }}>Road Tax</span>
                        <b>{expFlag(l.road_tax_expiry)}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--slate)', display: 'block' }}>Insurance</span>
                        <b>{expFlag(l.insurance_expiry)}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--slate)', display: 'block' }}>Permit</span>
                        <b>{expFlag(l.permit_expiry)}</b>
                      </div>
                    </div>

                    <div className="mobile-card-footer">
                      <span style={{ fontSize: '0.74rem', color: 'var(--slate)' }}>Lorry ID: #{l.id}</span>
                      <div className="mobile-card-actions">
                        <button
                          className="btn gh sm"
                          style={{ height: '32px', padding: '0 12px', fontSize: '0.76rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
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
            </div>
          </>
        )}

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
                      drivers.map(d => (
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
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <span>No personnel registered.</span>
                            <button
                              className="btn gh sm"
                              onClick={handleSeedFleetDemoData}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary, #0284c7)', borderColor: 'rgba(2,132,199,0.3)', fontWeight: 600 }}
                            >
                              <Sparkles size={13} strokeWidth={2.2} /> Load 15 Demo Lorries &amp; Drivers (3 per Fleet Type)
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-container">
              {drivers.length > 0 ? (
                drivers.map(d => (
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
                      maint.map(m => (
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
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-container">
              {maint.length > 0 ? (
                maint.map(m => (
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
                      items.map(i => (
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
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-container" style={{ marginBottom: '20px' }}>
              {items.length > 0 ? (
                items.map(i => (
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
          <div className="modalbox" style={{ maxWidth: '640px', width: '100%', margin: 'auto', boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)' }}>
            <div className="mh">
              <h3>
                {modalType === 'veh' && (modalEditId ? 'Edit Vehicle' : 'Add New Vehicle')}
                {modalType === 'drv' && (modalEditId ? 'Edit Person' : 'Add Driver / Crew')}
                {modalType === 'maint' && 'Log Maintenance Service'}
                {modalType === 'receive' && 'Receive Stock Inventory'}
                {modalType === 'issue' && 'Issue Stock to Vehicle'}
              </h3>
              <button className="kbtn" onClick={() => setModalType(null)}>Close <kbd>esc</kbd></button>
            </div>
            <div className="mb">
              {modalType === 'veh' && (
                <div>
                  <div className="grid2">
                    <div className="field"><label>Plate Number</label><input value={fPlate} onChange={e => setFPlate(e.target.value)} placeholder="e.g. WYY 8832" autoFocus /></div>
                    <div className="field"><label>Capacity / Type</label><input value={fCap} onChange={e => setFCap(e.target.value)} placeholder="e.g. 40ft Container" /></div>
                  </div>
                  <div className="grid2">
                    <div className="field">
                      <label>Monthly Target (RM)</label>
                      <input
                        type="number"
                        step="any"
                        value={fTarget}
                        onChange={e => setFTarget(e.target.value)}
                        placeholder="e.g. 20000"
                      />
                    </div>
                    <div className="field">
                      <label>Default Driver</label>
                      <select value={fDefaultDriver} onChange={e => setFDefaultDriver(e.target.value)}>
                        <option value="">— Select Driver —</option>
                        {drivers.filter(d => !d.is_helper).map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>Road Tax Expiry</label><input type="date" value={fRoadTaxExp} onChange={e => setFRoadTaxExp(e.target.value)} /></div>
                    <div className="field"><label>Insurance Expiry</label><input type="date" value={fInsExp} onChange={e => setFInsExp(e.target.value)} /></div>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>Permit Expiry</label><input type="date" value={fPermitExp} onChange={e => setFPermitExp(e.target.value)} /></div>
                  </div>
                  <div className="formfoot"><button className="btn pri" onClick={saveVeh}>Save Vehicle</button></div>
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
