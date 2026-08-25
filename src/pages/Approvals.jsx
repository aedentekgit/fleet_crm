import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb, fmtMoney, fmtTime, esc, withSST, nextJobNo, jobNoFromQuoteNo, subscribeTable, isContractQuotation, getStorageData } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { checkIsExistingCustomer } from './Quotations';
import {
  CheckCircle2,
  Check,
  X,
  Clock,
  ArrowRight,
  Building2,
  Calendar,
  Truck,
  Package,
  ShieldCheck,
  FileCheck,
  AlertTriangle,
  FileText,
  Eye,
  Search,
  Filter,
  RotateCcw,
  Trash2
} from 'lucide-react';

export default function Approvals() {
  const navigate = useNavigate();
  const { staff } = useAuth();
  const { toast } = useToast();
  
  // Single Unified Filter State: 'pending' | 'all' | 'approved' | 'quotation' | 'issuance' | 'urgent' | 'history'
  const [activeFilter, setActiveFilter] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [allApprovals, setAllApprovals] = useState(() => getStorageData('approvals'));
  const [focusId, setFocusId] = useState(null);
  const [viewDetailItem, setViewDetailItem] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  // Approve Confirmation Popup Modal State
  const [approveConfirmModalItem, setApproveConfirmModalItem] = useState(null);

  // Delete Confirmation Popup Modal State
  const [deleteConfirmModalItem, setDeleteConfirmModalItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    let data = [];
    if (sb) {
      try {
        const [apprRes, custRes, quoRes, issRes] = await Promise.all([
          sb.from('approvals').select('*').order('created_at', { ascending: false }),
          sb.from('customers').select('*'),
          sb.from('quotations').select('*, customer:customers(company_name, phone, contact_person)').order('created_at', { ascending: false }),
          sb.from('inventory_issuances').select('*, item:inventory_items(name,unit), lorry:lorries(plate_no), maint:maintenance_records(description)')
        ]);

        const rawApprovals = apprRes.data || [];
        const quotesList = (quoRes.data || []).filter(isContractQuotation);
        const issList = issRes.data || [];
        const customersList = custRes.data || [];

        // Build lookup maps for existing approval records
        const apprMapByRefId = new Map();
        const apprMapByQuoteNo = new Map();

        rawApprovals.forEach(a => {
          if (a.ref_id) apprMapByRefId.set(String(a.ref_id).toLowerCase().trim(), a);
          if (a.title && a.title.includes('Quotation')) {
            const parts = a.title.split(' ');
            if (parts[1]) apprMapByQuoteNo.set(parts[1].toLowerCase().trim(), a);
          }
        });

        const canonicalApprovals = [];
        const seenQuoteKeys = new Set();
        const matchedApprIds = new Set();

        // 1. Process active quotations as primary source of truth
        quotesList.forEach(q => {
          const qIdLower = String(q.id || '').toLowerCase().trim();
          const qNoLower = String(q.quote_no || '').toLowerCase().trim();
          const quoteKey = (q.quote_no || q.id || '').toLowerCase().trim();

          if (!quoteKey || seenQuoteKeys.has(quoteKey)) return;
          seenQuoteKeys.add(quoteKey);

          // Find existing approval record if present
          const existingAppr = apprMapByRefId.get(qIdLower) || apprMapByQuoteNo.get(qNoLower) || (qNoLower ? apprMapByRefId.get(qNoLower) : null);
          if (existingAppr) {
            matchedApprIds.add(existingAppr.id);
          }

          const custName = q.customer?.company_name || q.customer_name || 'Customer';
          const finalQuoteNo = q.quote_no || q.customer_ref || q.id;

          const isAppr = q.status === 'approved' || existingAppr?.status === 'approved';
          const isRej = q.status === 'declined' || q.status === 'rejected' || existingAppr?.status === 'rejected';
          const apprStatus = isAppr ? 'approved' : (isRej ? 'rejected' : (existingAppr?.status || 'waiting'));

          const apprRecord = {
            id: existingAppr?.id || ('appr_' + q.id),
            kind: 'quotation',
            ref_id: q.id,
            title: `Quotation ${finalQuoteNo} - ${custName}`,
            amount: q.rate_amount || q.quoted_rate || 0,
            status: apprStatus,
            flagged: Boolean(q.urgent || existingAppr?.flagged),
            created_at: q.created_at || existingAppr?.created_at || new Date().toISOString(),
            resolved_at: q.owner_approved_at || existingAppr?.resolved_at || (isAppr ? (q.created_at || new Date().toISOString()) : null),
            quotation: q
          };

          canonicalApprovals.push(apprRecord);

          // If existing approval record had an outdated title, ref_id or status, synchronize it in Supabase
          if (existingAppr && (existingAppr.title !== apprRecord.title || existingAppr.ref_id !== q.id || existingAppr.status !== apprStatus)) {
            try {
              sb.from('approvals').update({ title: apprRecord.title, ref_id: q.id, status: apprStatus }).eq('id', existingAppr.id);
            } catch (_) {}
          }
        });

        // 2. Process active inventory issuances
        issList.forEach(iss => {
          const issKey = String(iss.id || '').toLowerCase().trim();
          const existingAppr = apprMapByRefId.get(issKey);
          if (existingAppr) {
            matchedApprIds.add(existingAppr.id);
          }

          canonicalApprovals.push({
            id: existingAppr?.id || ('appr_iss_' + iss.id),
            kind: 'issuance',
            ref_id: iss.id,
            title: iss.item?.name || 'Stock Issuance',
            amount: 0,
            status: existingAppr?.status || 'waiting',
            flagged: Boolean(existingAppr?.flagged),
            created_at: iss.created_at || existingAppr?.created_at || new Date().toISOString(),
            resolved_at: existingAppr?.resolved_at || null,
            issuance: iss
          });
        });

        // 3. Purge orphaned or duplicate approval records in Supabase
        rawApprovals.forEach(a => {
          if (!matchedApprIds.has(a.id)) {
            try {
              sb.from('approvals').delete().eq('id', a.id);
            } catch (_) {}
          }
        });

        // Sort canonical list by creation date descending
        canonicalApprovals.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        data = canonicalApprovals;
      } catch (e) {
        console.error('Error loading approvals:', e);
      }
    }
    setAllApprovals(data || []);
  }, []);

  useEffect(() => {
    loadData();
    const unsub1 = subscribeTable('approvals', loadData);
    const unsub2 = subscribeTable('quotations', loadData);
    const unsub3 = subscribeTable('inventory_issuances', loadData);
    let ch = null;
    if (sb && typeof sb.channel === 'function') {
      ch = sb.channel('appr')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, loadData)
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

  // Derived filtered metrics
  const waitingApprovals = useMemo(() => allApprovals.filter(x => x.status === 'waiting'), [allApprovals]);
  const approvedApprovals = useMemo(() => allApprovals.filter(x => x.status === 'approved'), [allApprovals]);
  const historyApprovals = useMemo(() => allApprovals.filter(x => x.status === 'approved' || x.status === 'rejected'), [allApprovals]);

  const counts = useMemo(() => ({
    all: allApprovals.length,
    pending: waitingApprovals.length,
    approved: approvedApprovals.length,
    quotation: allApprovals.filter(x => x.kind === 'quotation').length,
    issuance: allApprovals.filter(x => x.kind === 'issuance').length,
    urgent: allApprovals.filter(x => Boolean(x.quotation?.urgent || x.flagged)).length,
    history: historyApprovals.length
  }), [allApprovals, waitingApprovals, approvedApprovals, historyApprovals]);

  // Filtered approval queue
  const filteredQueue = useMemo(() => {
    let list = [];
    if (activeFilter === 'all') {
      list = allApprovals;
    } else if (activeFilter === 'pending') {
      list = waitingApprovals;
    } else if (activeFilter === 'approved') {
      list = approvedApprovals;
    } else if (activeFilter === 'quotation') {
      list = allApprovals.filter(x => x.kind === 'quotation');
    } else if (activeFilter === 'issuance') {
      list = allApprovals.filter(x => x.kind === 'issuance');
    } else if (activeFilter === 'urgent') {
      list = allApprovals.filter(x => Boolean(x.quotation?.urgent || x.flagged));
    } else if (activeFilter === 'history') {
      list = historyApprovals;
    } else {
      list = allApprovals;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item => {
        const titleMatch = item.title?.toLowerCase().includes(q);
        const refMatch = item.ref_id?.toLowerCase().includes(q);
        const quoteNoMatch = item.quotation?.quote_no?.toLowerCase().includes(q);
        const custMatch = item.quotation?.customer?.company_name?.toLowerCase().includes(q) || item.quotation?.customer_name?.toLowerCase().includes(q);
        const pickupMatch = item.quotation?.pickup_location?.toLowerCase().includes(q);
        const dropoffMatch = item.quotation?.dropoff_location?.toLowerCase().includes(q);
        const cargoMatch = item.quotation?.cargo_desc?.toLowerCase().includes(q) || item.quotation?.lorry_spec?.toLowerCase().includes(q);
        const itemMatch = item.issuance?.item?.name?.toLowerCase().includes(q);
        const lorryMatch = item.issuance?.lorry?.plate_no?.toLowerCase().includes(q);
        return titleMatch || refMatch || quoteNoMatch || custMatch || pickupMatch || dropoffMatch || cargoMatch || itemMatch || lorryMatch;
      });
    }

    return list;
  }, [activeFilter, allApprovals, waitingApprovals, approvedApprovals, historyApprovals, searchQuery]);

  const waitingCount = waitingApprovals.length;
  const approvedCount = approvedApprovals.length;
  const flaggedCount = waitingApprovals.filter(x => x.flagged || x.quotation?.urgent).length;
  const totalValue = waitingApprovals.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalApprovedValue = approvedApprovals.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const openApproveConfirmation = (item, e) => {
    if (e) e.stopPropagation();
    setApproveConfirmModalItem(item);
  };

  const confirmApprove = async () => {
    if (!approveConfirmModalItem) return;
    const a = approveConfirmModalItem;
    const id = a.id;

    setApprovingId(id);
    try {
      await sb.from('approvals').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', id);

      if (a.kind === 'quotation') {
        let { data: q } = await sb.from('quotations').select('*, customer:customers(*)').eq('id', a.ref_id).maybeSingle();
        if (!q && a.ref_id) {
          const { data: q2 } = await sb.from('quotations').select('*, customer:customers(*)').eq('quote_no', a.ref_id).maybeSingle();
          q = q2;
        }
        if (!q) {
          const { data: allQ } = await sb.from('quotations').select('*, customer:customers(*)');
          q = (allQ || []).find(item => item.id === a.ref_id || item.quote_no === a.ref_id || a.title?.includes(item.quote_no));
        }

        const custName = q?.customer_name || q?.customer?.company_name || (q?.pickup_location && !q.pickup_location.toLowerCase().startsWith('pt ') && !q.pickup_location.toLowerCase().startsWith('no') ? q.pickup_location.split(',')[0].trim() : null);
        let resolvedCustId = q?.customer_id || q?.customer?.id;

        // 1. Mark customer as approved in customers table
        if (custName && custName !== 'Direct Customer') {
          try {
            let parsedNotes = null;
            try {
              if (q?.notes && q.notes.startsWith('{')) parsedNotes = JSON.parse(q.notes);
              if (q?.special_instructions && q.special_instructions.startsWith('{')) parsedNotes = JSON.parse(q.special_instructions);
            } catch (_) {}

            const phoneMatch = (q?.raw_message || q?.customer_ref || '').match(/\b(01\d{1}[\s\-]?\d{7,8}|0[3-9]\d{1}[\s\-]?\d{7,8})\b/);
            const extractedPhone = q?.phone || q?.customer?.phone || parsedNotes?.senderPhone || (phoneMatch ? phoneMatch[0] : '') || '';

            const attnMatch = (q?.raw_message || q?.customer_ref || '').match(/(?:Mr\.|Ms\.|Mrs\.|Encik|Puan|Attn:?)\s*([A-Za-z\s\/]+?)(?=\s*\(|\s*\||\s*[\d\n]|$)/i);
            const extractedAttn = q?.contact_person || q?.customer?.contact_person || (attnMatch ? attnMatch[0].replace(/Attn:?\s*/i, '').trim() : '') || 'Logistics Dept';

            const extractedTerms = q?.payment_terms || parsedNotes?.terms || '30 days credit';
            const extractedZone = q?.zone || parsedNotes?.zone || 'Zone A';

            const { data: existCust } = await sb.from('customers').select('*').eq('company_name', custName).maybeSingle();
            if (!existCust) {
              const { data: newCust } = await sb.from('customers').insert({
                company_name: custName,
                contact_person: extractedAttn,
                phone: extractedPhone,
                payment_terms: extractedTerms,
                zone: extractedZone,
                status: 'approved',
                is_new: 0,
                default_rate: q?.rate_amount || 1500.00
              }).select();
              if (newCust && newCust[0]) resolvedCustId = newCust[0].id;
            } else {
              resolvedCustId = existCust.id;
              const patch = { is_new: 0, status: 'approved' };
              if (!existCust.contact_person && extractedAttn) patch.contact_person = extractedAttn;
              if (!existCust.phone && extractedPhone) patch.phone = extractedPhone;
              if (!existCust.payment_terms && extractedTerms) patch.payment_terms = extractedTerms;
              await sb.from('customers').update(patch).eq('id', existCust.id);
            }
          } catch (e) {}
        } else if (resolvedCustId) {
          try {
            await sb.from('customers').update({ is_new: 0, status: 'approved' }).eq('id', resolvedCustId);
          } catch (e) {}
        }

        // 2. Cascade approval to ALL quotes/routes for this same customer
        const { data: allCustomerQuotes } = await sb.from('quotations').select('*');
        const matchingQuotes = (allCustomerQuotes || []).filter(item => {
          if (item.id === a.ref_id || item.id === q?.id) return true;
          if (resolvedCustId && String(item.customer_id) === String(resolvedCustId)) return true;
          if (custName && custName !== 'Direct Customer') {
            const itemCustName = (item.customer_name || '').toLowerCase().trim();
            if (itemCustName === custName.toLowerCase().trim()) return true;
          }
          return false;
        });

        const quotesToApprove = matchingQuotes.length > 0 ? matchingQuotes : (q ? [q] : []);

        // Update all customer quotes to approved
        for (const targetQ of quotesToApprove) {
          await sb.from('quotations').update({ 
            status: 'approved', 
            owner_approved_at: new Date().toISOString(), 
            approved_by: staff?.id 
          }).eq('id', targetQ.id);

          // Update approval record status to approved
          await sb.from('approvals').update({
            status: 'approved',
            resolved_at: new Date().toISOString()
          }).eq('ref_id', targetQ.id);
        }
      } else {
        await sb.from('inventory_issuances').update({ approval_status: 'approved', approved_by: staff?.id, approved_at: new Date().toISOString() }).eq('id', a.ref_id);
        const { data: iss } = await sb.from('inventory_issuances').select('item_id, quantity').eq('id', a.ref_id).maybeSingle();
        if (iss && iss.item_id) {
          const { data: item } = await sb.from('inventory_items').select('quantity_on_hand').eq('id', iss.item_id).maybeSingle();
          if (item) {
            const currentQty = parseFloat(item.quantity_on_hand) || 0;
            const deductQty = parseFloat(iss.quantity) || 0;
            const newQty = Math.max(0, currentQty - deductQty);
            await sb.from('inventory_items').update({ quantity_on_hand: newQty }).eq('id', iss.item_id);
          }
        }
      }

      setApproveConfirmModalItem(null);
      if (viewDetailItem?.id === id) {
        setViewDetailItem(null);
      }

      await loadData();

      if (a.kind === 'quotation') {
        toast('Quotation & customer approved! Customer & rate card activated for Orders.', 'ok');
      } else {
        toast('Approved & Released', 'ok');
      }
    } catch (err) {
      toast('Error approving request', 'err');
    } finally {
      setApprovingId(null);
    }
  };

  const openDeleteConfirmation = (item, e) => {
    if (e) e.stopPropagation();
    setDeleteConfirmModalItem(item);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmModalItem) return;
    const item = deleteConfirmModalItem;
    setIsDeleting(true);
    try {
      if (sb) {
        // Delete approval record
        if (item.id) {
          await sb.from('approvals').delete().eq('id', item.id);
        }
        if (item.ref_id) {
          await sb.from('approvals').delete().eq('ref_id', item.ref_id);
        }

        // Delete underlying entity
        if (item.kind === 'quotation' && item.ref_id) {
          await sb.from('quotations').delete().eq('id', item.ref_id);
        } else if (item.kind === 'issuance' && item.ref_id) {
          await sb.from('inventory_issuances').delete().eq('id', item.ref_id);
        }
      }

      setDeleteConfirmModalItem(null);
      if (viewDetailItem?.id === item.id) {
        setViewDetailItem(null);
      }
      toast('Record deleted successfully', 'ok');
      await loadData();
    } catch (err) {
      console.error('Error deleting item:', err);
      toast('Failed to delete item', 'err');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page tab-fade-in">
      {/* Header */}
      <div className="pagehead">
        <div>
          <h1>Executive Approvals</h1>
          <div className="sub">
            Unified authorization queue for quotations and operational requests. Review quotes, verify rates, and release to Job Board.
          </div>
        </div>
        <div className="tools">
          <span style={{ fontSize: '0.84rem', color: 'var(--slate)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} color="var(--green)" />
            Automated Governance
          </span>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="kpis" style={{ marginBottom: '20px' }}>
        <div className="kpi">
          <div className="k">Items Waiting</div>
          <div className="v">{waitingCount}</div>
          <div className="d warn">{flaggedCount} Requires Attention</div>
        </div>
        <div className="kpi">
          <div className="k">Approved Records</div>
          <div className="v" style={{ color: '#059669' }}>{approvedCount}</div>
          <div className="d up">{fmtMoney(totalApprovedValue)} Approved Volume</div>
        </div>
        <div className="kpi">
          <div className="k">Pending Queue Value</div>
          <div className="v">{fmtMoney(totalValue)}</div>
          <div className="d up">Requires Authorisation</div>
        </div>
        <div className="kpi">
          <div className="k">Authoriser Session</div>
          <div className="v">{staff?.name || 'Executive Owner'}</div>
          <div className="d" style={{ textTransform: 'capitalize' }}>{staff?.role || 'owner'} security clearance</div>
        </div>
      </div>

      {/* Single Clean Filter and Search Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: activeFilter === 'all' ? '1.5px solid var(--navy-900)' : '1px solid #E2E8F0',
              background: activeFilter === 'all' ? '#0F172A' : '#FFFFFF',
              color: activeFilter === 'all' ? '#FFFFFF' : 'var(--slate)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            All Records
            <span style={{ background: activeFilter === 'all' ? 'rgba(255,255,255,0.2)' : '#E2E8F0', color: activeFilter === 'all' ? '#FFFFFF' : 'var(--navy-900)', borderRadius: '10px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800 }}>
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('pending')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: activeFilter === 'pending' ? '1.5px solid var(--orange)' : '1px solid #E2E8F0',
              background: activeFilter === 'pending' ? '#FFF7ED' : '#FFFFFF',
              color: activeFilter === 'pending' ? 'var(--orange-700)' : 'var(--slate)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            Pending
            <span style={{ background: activeFilter === 'pending' ? 'var(--orange)' : '#E2E8F0', color: activeFilter === 'pending' ? '#FFFFFF' : 'var(--navy-900)', borderRadius: '10px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800 }}>
              {counts.pending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('approved')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: activeFilter === 'approved' ? '1.5px solid #059669' : '1px solid #E2E8F0',
              background: activeFilter === 'approved' ? '#ECFDF5' : '#FFFFFF',
              color: activeFilter === 'approved' ? '#059669' : 'var(--slate)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Check size={13} strokeWidth={2.5} />
            Approved
            <span style={{ background: activeFilter === 'approved' ? '#059669' : '#E2E8F0', color: activeFilter === 'approved' ? '#FFFFFF' : 'var(--navy-900)', borderRadius: '10px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800 }}>
              {counts.approved}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('quotation')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: activeFilter === 'quotation' ? '1.5px solid var(--orange)' : '1px solid #E2E8F0',
              background: activeFilter === 'quotation' ? '#FFF7ED' : '#FFFFFF',
              color: activeFilter === 'quotation' ? 'var(--orange-700)' : 'var(--slate)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={13} />
            Quotations
            <span style={{ background: activeFilter === 'quotation' ? 'var(--orange)' : '#E2E8F0', color: activeFilter === 'quotation' ? '#FFFFFF' : 'var(--navy-900)', borderRadius: '10px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800 }}>
              {counts.quotation}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('issuance')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: activeFilter === 'issuance' ? '1.5px solid var(--orange)' : '1px solid #E2E8F0',
              background: activeFilter === 'issuance' ? '#FFF7ED' : '#FFFFFF',
              color: activeFilter === 'issuance' ? 'var(--orange-700)' : 'var(--slate)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Package size={13} />
            Stock Issuances
            <span style={{ background: activeFilter === 'issuance' ? 'var(--orange)' : '#E2E8F0', color: activeFilter === 'issuance' ? '#FFFFFF' : 'var(--navy-900)', borderRadius: '10px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800 }}>
              {counts.issuance}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('urgent')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: activeFilter === 'urgent' ? '1.5px solid #DC2626' : '1px solid #E2E8F0',
              background: activeFilter === 'urgent' ? '#FEF2F2' : '#FFFFFF',
              color: activeFilter === 'urgent' ? '#DC2626' : 'var(--slate)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <AlertTriangle size={13} strokeWidth={2.4} />
            Urgent / Flagged
            <span style={{ background: activeFilter === 'urgent' ? '#DC2626' : '#E2E8F0', color: activeFilter === 'urgent' ? '#FFFFFF' : 'var(--navy-900)', borderRadius: '10px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800 }}>
              {counts.urgent}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('history')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: activeFilter === 'history' ? '1.5px solid var(--navy-900)' : '1px solid #E2E8F0',
              background: activeFilter === 'history' ? '#F1F5F9' : '#FFFFFF',
              color: activeFilter === 'history' ? 'var(--navy-900)' : 'var(--slate)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <RotateCcw size={12} strokeWidth={2.2} />
            Resolved History
            <span style={{ background: activeFilter === 'history' ? 'var(--navy-900)' : '#E2E8F0', color: activeFilter === 'history' ? '#FFFFFF' : 'var(--navy-900)', borderRadius: '10px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800 }}>
              {counts.history}
            </span>
          </button>
        </div>

        {/* Search Box */}
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)' }} />
          <input
            type="text"
            className="in"
            placeholder="Search quote #, customer, route..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '34px', height: '36px', fontSize: '0.84rem', width: '100%', borderRadius: '8px' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--slate)', padding: 0 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Approvals Table */}
      <div className="tablecard" style={{ width: '100%', boxSizing: 'border-box', overflowX: 'auto' }}>
        <table className="grid" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
          <thead>
            <tr>
              <th style={{ width: '18%', padding: '12px 14px', fontSize: '0.74rem' }}>Quote # &amp; Date</th>
              <th style={{ width: '27%', padding: '12px 14px', fontSize: '0.74rem' }}>Customer &amp; Ref</th>
              <th style={{ width: '30%', padding: '12px 14px', fontSize: '0.74rem' }}>Route &amp; Specifications</th>
              <th style={{ width: '10%', padding: '12px 10px', textAlign: 'center', fontSize: '0.74rem' }}>Status</th>
              <th style={{ width: '15%', padding: '12px 14px', textAlign: 'right', fontSize: '0.74rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQueue.length > 0 ? (
              filteredQueue.map((item) => {
                const isQuote = item.kind === 'quotation';
                const q = item.quotation;
                const iss = item.issuance;

                // Identification
                const quoteNo = q?.quote_no || (item.title?.includes('Quotation') ? item.title.split(' ')[1] : item.ref_id);
                const rawDate = q?.created_at || item.created_at;
                const formattedDate = rawDate ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const formattedTime = rawDate ? new Date(rawDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

                // Customer info
                const companyName = q?.customer?.company_name || q?.customer_name || (item.title && item.title.includes('-') ? item.title.split('-')[1].trim() : (isQuote ? 'Direct Customer' : (iss?.lorry?.plate_no ? `Lorry ${iss.lorry.plate_no}` : 'Internal Operations')));
                const customerPhone = q?.customer?.phone || q?.phone || '';
                const contactPerson = q?.customer?.contact_person || q?.contact_person || '';
                const customerRef = q?.customer_ref || '';

                // Route & Specs
                let pickup = q?.pickup_location || q?.pickup || '';
                let dropoff = q?.dropoff_location || q?.dropoff || '';
                if (companyName && pickup && pickup.toLowerCase().startsWith(companyName.toLowerCase())) {
                  const cleaned = pickup.slice(companyName.length).replace(/^[,.\s-]+/, '').trim();
                  if (cleaned) pickup = cleaned;
                }
                const cargoDesc = q?.cargo_desc || '';
                const lorrySpec = q?.lorry_spec || '';
                const weightDesc = q?.weight_desc || '';

                const isWaiting = item.status === 'waiting';
                const isApproved = item.status === 'approved';
                const isRejected = item.status === 'rejected';

                return (
                  <tr
                    key={item.id}
                    className="tab-fade-in"
                    style={{
                      cursor: 'pointer',
                      background: item.id === focusId ? '#FFFBF7' : undefined
                    }}
                    onClick={() => {
                      setFocusId(item.id);
                      setViewDetailItem(item);
                    }}
                  >
                    {/* 1. Quote # & Date */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="jno-pill" style={{ fontSize: '0.78rem', padding: '2px 8px', fontWeight: 800 }}>
                            {isQuote ? quoteNo : (item.ref_id || 'Issuance')}
                          </span>
                          {Boolean(q?.urgent || item.flagged) && isWaiting && (
                            <span className="badge urgent" style={{ fontSize: '0.62rem', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                              <AlertTriangle size={9} strokeWidth={2.4} /> Urgent
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', color: 'var(--slate)', fontWeight: 600 }}>
                          <Calendar size={11} strokeWidth={2.2} />
                          <span>{formattedDate}</span>
                          {formattedTime && <span style={{ opacity: 0.8 }}>· {formattedTime}</span>}
                        </div>
                      </div>
                    </td>

                    {/* 2. Customer & Contact */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Building2 size={13} strokeWidth={2.2} style={{ color: 'var(--slate)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={companyName}>
                            {companyName}
                          </span>
                        </div>
                        {(contactPerson || customerPhone || customerRef) && (
                          <div style={{ fontSize: '0.73rem', color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {contactPerson && <span>Attn: <b>{contactPerson}</b></span>}
                            {customerPhone && <span>· {customerPhone}</span>}
                            {customerRef && <span style={{ color: 'var(--orange-600)', fontWeight: 600 }}>Ref: {customerRef}</span>}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 3. Route & Specifications */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                      {isQuote ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {pickup && dropoff ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#F8FAFC', padding: '4px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', width: 'fit-content', maxWidth: '100%' }}>
                              <span className="r-dot pickup" style={{ flexShrink: 0 }}></span>
                              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={pickup}>
                                {pickup}
                              </span>
                              <ArrowRight size={11} strokeWidth={2.4} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                              <span className="r-dot dropoff" style={{ flexShrink: 0 }}></span>
                              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={dropoff}>
                                {dropoff}
                              </span>
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.76rem', color: 'var(--slate)' }}>General Logistics Route</div>
                          )}

                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {lorrySpec && (
                              <span className="cargo-spec-pill" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                                {lorrySpec}
                              </span>
                            )}
                            {weightDesc && (
                              <span className="cargo-spec-pill" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                                {weightDesc}
                              </span>
                            )}
                            {cargoDesc && !lorrySpec && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                {cargoDesc}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Package size={13} strokeWidth={2.2} />
                            <span>{iss?.item?.name || item.title || 'Stock Issuance'}</span>
                            {iss?.quantity && <span style={{ color: 'var(--slate)' }}>× {iss.quantity} {iss.item?.unit || 'pcs'}</span>}
                          </div>
                          {iss?.lorry?.plate_no && (
                            <span className="plate-badge" style={{ fontSize: '0.7rem', padding: '1px 6px', width: 'fit-content' }}>
                              <Truck size={10} style={{ marginRight: '3px' }} />
                              {iss.lorry.plate_no}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 4. Status Badge */}
                    <td style={{ padding: '12px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                      {isWaiting && (
                        <span className="badge amber" style={{ fontSize: '0.72rem', padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} strokeWidth={2.5} />
                          Pending
                        </span>
                      )}
                      {isApproved && (
                        <span className="badge green" style={{ fontSize: '0.72rem', padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={12} strokeWidth={2.5} />
                          Approved
                        </span>
                      )}
                      {isRejected && (
                        <span className="badge red" style={{ fontSize: '0.72rem', padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <RotateCcw size={11} strokeWidth={2.5} />
                          Sent Back
                        </span>
                      )}
                    </td>

                    {/* 5. Actions Column (View, Delete, and Approve) */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                        {/* View Button */}
                        <button
                          className="btn gh sm"
                          style={{ height: '32px', padding: '0 8px', fontSize: '0.74rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => {
                            setFocusId(item.id);
                            setViewDetailItem(item);
                          }}
                          title="View Details in Popup Modal"
                        >
                          <Eye size={13} strokeWidth={2.2} />
                          <span>View</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          className="btn sm"
                          style={{
                            height: '32px',
                            padding: '0 8px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#DC2626',
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          onClick={(e) => openDeleteConfirmation(item, e)}
                          title="Delete Record"
                        >
                          <Trash2 size={13} strokeWidth={2.2} />
                          <span>Delete</span>
                        </button>

                        {isWaiting && (
                          /* Primary Approve Button with confirmation popup */
                          <button
                            className="btn pri sm"
                            disabled={approvingId === item.id}
                            style={{
                              height: '32px',
                              padding: '0 12px',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                              boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)'
                            }}
                            onClick={(e) => openApproveConfirmation(item, e)}
                            title="Authorise and Release to Job Board"
                          >
                            <Check size={13} strokeWidth={2.8} />
                            <span>{approvingId === item.id ? 'Approving...' : 'Approve'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #DCFCE7' }}>
                      <CheckCircle2 size={32} strokeWidth={2.2} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--navy-900)' }}>
                      {activeFilter === 'pending' || activeFilter === 'quotation' || activeFilter === 'issuance' || activeFilter === 'urgent'
                        ? 'Approval Queue Cleared!'
                        : 'No Requests Found'}
                    </span>
                    <span style={{ color: 'var(--slate)', fontSize: '0.84rem', maxWidth: '340px' }}>
                      {activeFilter === 'pending' || activeFilter === 'quotation' || activeFilter === 'issuance' || activeFilter === 'urgent'
                        ? 'All incoming quotations and stock requests have been verified and processed.'
                        : 'No approval records match your current search and filter criteria.'}
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Full Detail Inspection Modal */}
      {viewDetailItem && (
        <ApprovalDetailModal
          item={viewDetailItem}
          onClose={() => setViewDetailItem(null)}
          onApprove={(item) => openApproveConfirmation(item)}
          onDelete={(item) => openDeleteConfirmation(item)}
          isApproving={approvingId === viewDetailItem.id}
        />
      )}

      {/* Approve Confirmation Popup Modal */}
      {approveConfirmModalItem && (
        <ApproveConfirmationModal
          item={approveConfirmModalItem}
          onConfirm={confirmApprove}
          onClose={() => setApproveConfirmModalItem(null)}
          isSubmitting={approvingId === approveConfirmModalItem.id}
        />
      )}

      {/* Delete Confirmation Popup Modal */}
      {deleteConfirmModalItem && (
        <DeleteConfirmationModal
          item={deleteConfirmModalItem}
          onConfirm={confirmDelete}
          onClose={() => setDeleteConfirmModalItem(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

// Helper to render special instructions & route matrix in clean table format
function renderSpecialInstructions(raw) {
  if (!raw) return null;
  let parsed = null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (e) {}
    }
  } else if (typeof raw === 'object') {
    parsed = raw;
  }

  if (parsed && typeof parsed === 'object') {
    const hasRoutes = Array.isArray(parsed.routes) && parsed.routes.length > 0;
    const lorryTypes = parsed.lorryTypes || ['Rate'];
    return (
      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Meta badges row */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '0.74rem' }}>
          {parsed.ref && (
            <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
              <b>Our Ref:</b> {parsed.ref}
            </span>
          )}
          {parsed.date && (
            <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
              <b>Date:</b> {parsed.date}
            </span>
          )}
          {parsed.zone && (
            <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
              <b>Zone:</b> {parsed.zone}
            </span>
          )}
          {parsed.sender && (
            <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
              <b>Sender:</b> {parsed.sender} {parsed.senderPhone ? `(${parsed.senderPhone})` : ''}
            </span>
          )}
          {parsed.includeDiesel && parsed.dieselPrice && (
            <span style={{ background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.25)', padding: '2px 8px', borderRadius: '6px', color: 'var(--orange-700)', fontWeight: 700 }}>
              <b>Diesel:</b> RM {parsed.dieselPrice}
            </span>
          )}
          {parsed.terms && (
            <span style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '6px', color: 'var(--navy-900)' }}>
              <b>Terms:</b> {parsed.terms}
            </span>
          )}
        </div>

        {/* Structured Route Matrix Table */}
        {hasRoutes && (
          <div style={{ overflowX: 'auto', border: '1px solid #CBD5E1', borderRadius: '8px', background: '#FFFFFF' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', color: 'var(--navy-900)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.68rem' }}>
                  <th style={{ padding: '7px 9px', width: '30px', textAlign: 'center', borderRight: '1px solid #E2E8F0' }}>#</th>
                  <th style={{ padding: '7px 10px', borderRight: '1px solid #E2E8F0' }}>Collection ➔ Unloading</th>
                  {parsed.includeDiesel && (
                    <th style={{ padding: '7px 8px', textAlign: 'center', borderRight: '1px solid #E2E8F0', width: '80px' }}>Diesel (RM)</th>
                  )}
                  {lorryTypes.map((t, idx) => (
                    <th key={idx} style={{ padding: '7px 8px', textAlign: 'right', borderRight: idx < lorryTypes.length - 1 ? '1px solid #E2E8F0' : 'none', minWidth: '70px' }}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.routes.map((rt, rIdx) => {
                  const dest = rt.isDropoint
                    ? `Dropoint — ${rt.collection || 'Location'}`
                    : (rt.collection && rt.unloading ? `${rt.collection} to ${rt.unloading}` : (rt.collection || rt.unloading || 'Route'));
                  const zInfo = [rt.collection_zone ? `From: ${rt.collection_zone}` : null, rt.unloading_zone ? `To: ${rt.unloading_zone}` : null].filter(Boolean).join(' • ');

                  return (
                    <tr key={rIdx} style={{ borderBottom: '1px solid #F1F5F9', background: rIdx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                      <td style={{ padding: '7px 9px', textAlign: 'center', fontWeight: 800, color: 'var(--slate)', borderRight: '1px solid #E2E8F0' }}>
                        {rIdx + 1}
                        {rt.code_word && <div style={{ fontSize: '0.62rem', color: '#64748B' }}>({rt.code_word})</div>}
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--navy-900)', borderRight: '1px solid #E2E8F0' }}>
                        <div>{dest}</div>
                        {zInfo && <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 500 }}>📍 {zInfo}</div>}
                      </td>
                      {parsed.includeDiesel && (
                        <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--slate)', borderRight: '1px solid #E2E8F0' }}>
                          {parsed.dieselPrice || '—'}
                        </td>
                      )}
                      {lorryTypes.map((t, tIdx) => {
                        const val = rt.rates && rt.rates[t] !== undefined && rt.rates[t] !== null ? rt.rates[t] : '—';
                        return (
                          <td key={tIdx} style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--navy-900)', borderRight: tIdx < lorryTypes.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                            {val !== '—' && !isNaN(Number(val)) && Number(val) > 0 ? Number(val).toFixed(2) : val}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: '4px', fontSize: '0.78rem', color: 'var(--navy-900)', background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>
      {raw}
    </div>
  );
}

// Approval Detail Modal for In-Depth Verification
function ApprovalDetailModal({ item, onClose, onApprove, onDelete, isApproving }) {
  const isQuote = item.kind === 'quotation';
  const q = item.quotation;
  const iss = item.issuance;

  const quoteNo = q?.quote_no || item.ref_id || 'Quotation';
  const companyName = q?.customer?.company_name || q?.customer_name || (item.title && item.title.includes('-') ? item.title.split('-')[1].trim() : 'Customer');
  let pickup = q?.pickup_location || q?.pickup || 'Port Klang';
  let dropoff = q?.dropoff_location || q?.dropoff || 'Depot';

  if (companyName && pickup.toLowerCase().startsWith(companyName.toLowerCase())) {
    const cleaned = pickup.slice(companyName.length).replace(/^[,.\s-]+/, '').trim();
    if (cleaned) pickup = cleaned;
  }

  return createPortal(
    <div
      className="overlay open"
      id="detailOverlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'detailOverlay' && onClose()}
    >
      <div
        className="modalbox tab-fade-in"
        style={{
          maxWidth: '680px',
          width: '100%',
          borderRadius: '18px',
          overflow: 'hidden',
          background: '#FFFFFF',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#FFF7ED', color: '#EA580C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #FFEDD5' }}>
              <FileCheck size={22} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--navy-900)', fontWeight: 800 }}>
                  {isQuote ? `Quotation ${quoteNo}` : 'Stock Issuance Review'}
                </h3>
                <span className={`badge ${item.status === 'approved' ? 'green' : (item.status === 'rejected' ? 'red' : 'amber')}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  {item.status === 'waiting' ? 'Awaiting Decision' : item.status.toUpperCase()}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--slate)', fontWeight: 500 }}>
                {isQuote ? 'Full verification details before dispatching to Job Board.' : 'Inspect parts issuance details and maintenance records.'}
              </p>
            </div>
          </div>
          <button
            className="btn gh sm"
            onClick={onClose}
            style={{ width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: 'var(--slate)' }}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {isQuote ? (
            <>
              {/* Customer & Route Card */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={18} strokeWidth={2.2} style={{ color: 'var(--slate)' }} />
                    <span>{companyName}</span>
                  </div>
                  {q?.created_at && (
                    <span style={{ fontSize: '0.76rem', color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} strokeWidth={2.2} />
                      {new Date(q.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>

                {/* Route Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '10px 14px', fontSize: '0.84rem', color: 'var(--navy-900)', fontWeight: 700 }}>
                  <span className="r-dot pickup" style={{ flexShrink: 0 }}></span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pickup}>
                    {pickup}
                  </span>
                  <ArrowRight size={14} strokeWidth={2.5} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                  <span className="r-dot dropoff" style={{ flexShrink: 0 }}></span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dropoff}>
                    {dropoff}
                  </span>
                </div>
              </div>

              {/* Cargo & Requirements */}
              {(q?.cargo_desc || q?.lorry_spec || q?.weight_desc || q?.special_instructions || q?.notes) && (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', background: '#FFFFFF' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--navy-900)', marginBottom: '8px' }}>
                    Operational Requirements &amp; Freight Schedule
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem' }}>
                    {q?.cargo_desc && (
                      <div>
                        <span style={{ color: 'var(--slate)', display: 'block', fontSize: '0.72rem' }}>Cargo:</span>
                        <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{q.cargo_desc}</span>
                      </div>
                    )}
                    {q?.lorry_spec && (
                      <div>
                        <span style={{ color: 'var(--slate)', display: 'block', fontSize: '0.72rem' }}>Vehicle Type:</span>
                        <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{q.lorry_spec}</span>
                      </div>
                    )}
                    {q?.weight_desc && (
                      <div>
                        <span style={{ color: 'var(--slate)', display: 'block', fontSize: '0.72rem' }}>Weight/Volume:</span>
                        <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{q.weight_desc}</span>
                      </div>
                    )}
                    {q?.customer_ref && (
                      <div>
                        <span style={{ color: 'var(--slate)', display: 'block', fontSize: '0.72rem' }}>Client Reference:</span>
                        <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>{q.customer_ref}</span>
                      </div>
                    )}
                  </div>

                  {/* Special instructions structured view */}
                  {(q?.special_instructions || q?.notes) && (
                    <div style={{ marginTop: '12px', borderTop: '1px dashed #E2E8F0', paddingTop: '10px' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--slate)', fontWeight: 700 }}>Rate Card / Special Matrix:</div>
                      {renderSpecialInstructions(q.special_instructions || q.notes)}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Stock Issuance Inspection */
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Package size={20} style={{ color: 'var(--orange)' }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--navy-900)' }}>
                    {iss?.item?.name || item.title || 'Stock Issuance Item'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--slate)' }}>
                    Quantity: <b>{iss?.quantity || 1} {iss?.item?.unit || 'units'}</b>
                  </div>
                </div>
              </div>

              {iss?.lorry?.plate_no && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', background: '#FFFFFF', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <Truck size={14} style={{ color: 'var(--slate)' }} />
                  <span>Target Vehicle: <b>{iss.lorry.plate_no}</b></span>
                </div>
              )}

              {iss?.maint?.description && (
                <div style={{ fontSize: '0.8rem', color: 'var(--slate)', background: '#FFFFFF', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <b>Maintenance Purpose:</b> {iss.maint.description}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: '#F8FAFC', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          {onDelete && (
            <button
              className="btn danger"
              onClick={() => onDelete(item)}
              style={{
                height: '38px',
                padding: '0 14px',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginRight: 'auto',
                background: '#FEF2F2',
                color: '#DC2626',
                borderColor: '#FECACA'
              }}
            >
              <Trash2 size={15} strokeWidth={2.2} />
              <span>Delete Record</span>
            </button>
          )}
          <button className="btn gh" onClick={onClose} style={{ height: '38px', padding: '0 16px', fontSize: '0.84rem', fontWeight: 600 }}>
            Close
          </button>
          {item.status === 'waiting' && (
            <button
              className="btn pri"
              disabled={isApproving}
              style={{
                height: '38px',
                padding: '0 20px',
                fontSize: '0.86rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)'
              }}
              onClick={() => onApprove(item)}
            >
              <Check size={16} strokeWidth={2.6} />
              <span>{isApproving ? 'Authorising...' : 'Authorise & Release'}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Approve Confirmation Modal Component
function ApproveConfirmationModal({ item, onConfirm, onClose, isSubmitting }) {
  const isQuote = item?.kind === 'quotation';
  const q = item?.quotation;
  const quoteNo = q?.quote_no || item?.ref_id || 'Quotation';
  const companyName = q?.customer?.company_name || q?.customer_name || (item?.title && item.title.includes('-') ? item.title.split('-')[1].trim() : 'Customer');

  return createPortal(
    <div
      className="overlay open"
      id="approveConfirmOverlay"
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
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'approveConfirmOverlay' && !isSubmitting && onClose()}
    >
      <div
        className="modalbox tab-fade-in"
        style={{
          maxWidth: '480px',
          width: '100%',
          borderRadius: '18px',
          overflow: 'hidden',
          background: '#FFFFFF',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #DCFCE7' }}>
              <CheckCircle2 size={22} strokeWidth={2.4} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--navy-900)', fontWeight: 800 }}>
                {isQuote ? 'Confirm Quotation Approval' : 'Confirm Stock Approval'}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--slate)', fontWeight: 500 }}>
                Executive authorization confirmation
              </p>
            </div>
          </div>
          <button
            className="btn gh sm"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: 'var(--slate)' }}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Target Item summary card */}
          <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <span className="jno-pill" style={{ fontSize: '0.8rem', padding: '2px 8px', fontWeight: 800 }}>
                {isQuote ? quoteNo : item.ref_id}
              </span>
            </div>

            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={15} style={{ color: 'var(--slate)', flexShrink: 0 }} />
              <span>{companyName}</span>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--navy-900)', lineHeight: '1.45' }}>
            Are you sure you want to authorize this request? Approving will:
          </p>

          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: 'var(--slate)', lineHeight: '1.6' }}>
            <li>Mark status as <b>Approved</b> in the executive audit trail.</li>
            <li>Activate customer account and pricing rate cards.</li>
            <li>Automatically dispatch an unassigned job to the <b>Job Board</b>.</li>
          </ul>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px 24px', background: '#F8FAFC', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            className="btn gh"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ height: '38px', padding: '0 16px', fontSize: '0.84rem', fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            className="btn pri"
            onClick={onConfirm}
            disabled={isSubmitting}
            style={{
              height: '38px',
              padding: '0 20px',
              fontSize: '0.86rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Check size={15} strokeWidth={2.8} />
            {isSubmitting ? 'Authorising...' : 'Confirm & Authorise'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Delete Confirmation Modal Component
function DeleteConfirmationModal({ item, onConfirm, onClose, isDeleting }) {
  const isQuote = item?.kind === 'quotation';
  const q = item?.quotation;
  const quoteNo = q?.quote_no || item?.ref_id || 'Record';
  const companyName = q?.customer?.company_name || q?.customer_name || (item?.title && item.title.includes('-') ? item.title.split('-')[1].trim() : 'Customer');

  return createPortal(
    <div
      className="overlay open"
      id="deleteConfirmOverlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'deleteConfirmOverlay' && !isDeleting && onClose()}
    >
      <div
        className="modalbox tab-fade-in"
        style={{
          maxWidth: '440px',
          width: '100%',
          borderRadius: '20px',
          overflow: 'hidden',
          background: '#FFFFFF',
          boxShadow: '0 25px 60px -15px rgba(220, 38, 38, 0.35)',
          border: '1px solid #FECACA',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #FEE2E2', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #FECACA' }}>
              <Trash2 size={22} strokeWidth={2.4} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#991B1B', fontWeight: 800 }}>
                Delete Approval Record
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#B91C1C', fontWeight: 500 }}>
                Permanent deletion confirmation
              </p>
            </div>
          </div>
          <button
            className="btn gh sm"
            onClick={onClose}
            disabled={isDeleting}
            style={{ width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', color: '#991B1B' }}
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Target Item summary card */}
          <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>
              <span className="jno-pill" style={{ fontSize: '0.8rem', padding: '2px 8px', fontWeight: 800 }}>
                {isQuote ? `Quote #${quoteNo}` : item.ref_id}
              </span>
            </div>

            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={14} style={{ color: 'var(--slate)', flexShrink: 0 }} />
              <span>{companyName}</span>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--navy-900)', lineHeight: '1.5' }}>
            Are you sure you want to permanently delete this approval request and its associated quotation record?
          </p>

          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 12px', fontSize: '0.78rem', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <span>This action cannot be undone.</span>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px 24px', background: '#F8FAFC', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            className="btn gh"
            onClick={onClose}
            disabled={isDeleting}
            style={{ height: '38px', padding: '0 16px', fontSize: '0.84rem', fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              height: '38px',
              padding: '0 20px',
              fontSize: '0.86rem',
              fontWeight: 700,
              background: '#DC2626',
              color: '#FFFFFF',
              borderColor: '#DC2626',
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Trash2 size={15} strokeWidth={2.4} />
            {isDeleting ? 'Deleting...' : 'Confirm & Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
