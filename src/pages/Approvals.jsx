import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb, fmtMoney, fmtTime, esc, withSST, nextJobNo, jobNoFromQuoteNo, subscribeTable, isContractQuotation, getStorageData } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/common/Pagination';
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
  Trash2,
  Paperclip,
  UploadCloud,
  FileUp,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileImage,
  Maximize2,
  Plus
} from 'lucide-react';

export function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function parseInvoiceAttachment(raw) {
  if (!raw) return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('http') || trimmed.startsWith('/')) {
      return {
        id: 'primary_doc',
        file_name: 'Attached Document',
        file_size: 0,
        file_type: trimmed.startsWith('data:image') ? 'image/jpeg' : 'application/octet-stream',
        file_data: trimmed,
        files: [{
          id: 'primary_doc',
          file_name: 'Attached Document',
          file_size: 0,
          file_type: trimmed.startsWith('data:image') ? 'image/jpeg' : 'application/octet-stream',
          file_data: trimmed,
          uploaded_at: new Date().toISOString()
        }]
      };
    }
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;

  if (Array.isArray(parsed)) {
    parsed = { files: parsed };
  }
  // Normalize files array for multi-photo / multi-file support
  let filesList = [];
  if (Array.isArray(parsed.files) && parsed.files.length > 0) {
    filesList = parsed.files.map((f, idx) => ({
      id: f.id || `file_${idx}_${Math.random().toString(36).substr(2, 6)}`,
      file_name: f.file_name || f.name || 'Document',
      file_size: f.file_size || f.size || 0,
      file_type: f.file_type || f.type || 'application/octet-stream',
      file_data: f.file_data || f.dataUrl || f.url || null,
      uploaded_at: f.uploaded_at || parsed.uploaded_at || new Date().toISOString()
    })).filter(f => f.file_data || f.file_name);
  } else if (parsed.file_data || parsed.file_name || parsed.dataUrl || parsed.url) {
    filesList = [{
      id: parsed.id || 'primary_doc',
      file_name: parsed.file_name || parsed.name || 'Document',
      file_size: parsed.file_size || parsed.size || 0,
      file_type: parsed.file_type || parsed.type || 'application/octet-stream',
      file_data: parsed.file_data || parsed.dataUrl || parsed.url || null,
      uploaded_at: parsed.uploaded_at || new Date().toISOString()
    }];
  }

  return {
    ...parsed,
    files: filesList,
    file_name: filesList[0]?.file_name || parsed.file_name || 'Document',
    file_size: filesList[0]?.file_size || parsed.file_size || 0,
    file_type: filesList[0]?.file_type || parsed.file_type || 'application/octet-stream',
    file_data: filesList[0]?.file_data || parsed.file_data || null
  };
}

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
  const [previewDocument, setPreviewDocument] = useState(null);

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

          const invAttachment = parseInvoiceAttachment(q.invoice_attachment) || parseInvoiceAttachment(existingAppr?.invoice_attachment) || parseInvoiceAttachment(q.quotation?.invoice_attachment);

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
            invoice_attachment: invAttachment,
            quotation: {
              ...q,
              invoice_attachment: invAttachment
            }
          };

          canonicalApprovals.push(apprRecord);

          // If existing approval record had an outdated title, ref_id or status, synchronize it in Supabase
          if (existingAppr && (existingAppr.title !== apprRecord.title || existingAppr.ref_id !== q.id || existingAppr.status !== apprStatus)) {
            try {
              const upd = { title: apprRecord.title, ref_id: q.id, status: apprStatus };
              if (invAttachment && !existingAppr.invoice_attachment) {
                upd.invoice_attachment = JSON.stringify(invAttachment);
              }
              sb.from('approvals').update(upd).eq('id', existingAppr.id);
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

  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
  }, [activeFilter, searchQuery]);

  const paginatedQueue = useMemo(() => {
    return filteredQueue.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredQueue, page, pageSize]);

  const waitingCount = waitingApprovals.length;
  const approvedCount = approvedApprovals.length;
  const flaggedCount = waitingApprovals.filter(x => x.flagged || x.quotation?.urgent).length;
  const totalValue = waitingApprovals.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalApprovedValue = approvedApprovals.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  const openApproveConfirmation = (item, e) => {
    if (e) e.stopPropagation();
    setApproveConfirmModalItem(item);
  };

  const confirmApprove = async (invoiceData = null) => {
    if (!approveConfirmModalItem) return;
    const a = approveConfirmModalItem;
    const id = a.id;

    setApprovingId(id);
    try {
      const qObj = a.quotation;
      const finalQuoteNo = qObj?.quote_no || a.ref_id || 'Quote';

      // Construct invoice payload for multi-file / photo attachment
      let invoicePayload = null;
      const filesList = Array.isArray(invoiceData?.files) && invoiceData.files.length > 0
        ? invoiceData.files
        : (invoiceData?.file ? [invoiceData.file] : []);

      if (filesList.length > 0) {
        invoicePayload = {
          invoice_no: invoiceData?.invoiceNo?.trim() || `INV-${finalQuoteNo}`,
          invoice_date: invoiceData?.invoiceDate || new Date().toISOString().split('T')[0],
          invoice_amount: parseFloat(invoiceData?.invoiceAmount) || a.amount || qObj?.rate_amount || 0,
          file_name: filesList[0].name || filesList[0].file_name || 'Document',
          file_size: filesList[0].size || filesList[0].file_size || 0,
          file_type: filesList[0].type || filesList[0].file_type || 'application/octet-stream',
          file_data: filesList[0].dataUrl || filesList[0].file_data || null,
          files: filesList.map((f, idx) => ({
            id: f.id || `file_${idx}_${Math.random().toString(36).substr(2, 6)}`,
            file_name: f.name || f.file_name || 'Document',
            file_size: f.size || f.file_size || 0,
            file_type: f.type || f.file_type || 'application/octet-stream',
            file_data: f.dataUrl || f.file_data || null,
            uploaded_at: new Date().toISOString()
          })),
          notes: invoiceData?.notes?.trim() || '',
          uploaded_at: new Date().toISOString(),
          uploaded_by: staff?.name || 'Executive Owner'
        };
      } else if (invoiceData?.invoiceNo?.trim()) {
        invoicePayload = {
          invoice_no: invoiceData.invoiceNo.trim(),
          invoice_date: invoiceData.invoiceDate || new Date().toISOString().split('T')[0],
          invoice_amount: parseFloat(invoiceData.invoiceAmount) || a.amount || 0,
          files: [],
          notes: invoiceData.notes?.trim() || '',
          uploaded_at: new Date().toISOString(),
          uploaded_by: staff?.name || 'Executive Owner'
        };
      }

      const apprUpdate = {
        status: 'approved',
        resolved_at: new Date().toISOString()
      };
      if (invoicePayload) {
        apprUpdate.invoice_attachment = JSON.stringify(invoicePayload);
      }

      await sb.from('approvals').update(apprUpdate).eq('id', id);

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
          const qPatch = { 
            status: 'approved', 
            owner_approved_at: new Date().toISOString(), 
            approved_by: staff?.id 
          };
          if (invoicePayload) {
            qPatch.invoice_attachment = JSON.stringify(invoicePayload);
            qPatch.invoice_no = invoicePayload.invoice_no;
          }
          await sb.from('quotations').update(qPatch).eq('id', targetQ.id);

          // Update approval record status to approved
          const apprPatch = {
            status: 'approved',
            resolved_at: new Date().toISOString()
          };
          if (invoicePayload) {
            apprPatch.invoice_attachment = JSON.stringify(invoicePayload);
          }
          await sb.from('approvals').update(apprPatch).eq('ref_id', targetQ.id);
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
        toast(invoicePayload ? 'Quotation & customer approved with invoice attachment!' : 'Quotation & customer approved! Customer & rate card activated for Orders.', 'ok');
      } else {
        toast('Approved & Released', 'ok');
      }
    } catch (err) {
      console.error('Error approving request:', err);
      toast('Error approving request', 'err');
    } finally {
      setApprovingId(null);
    }
  };

  const handleSaveInvoiceAttachment = async (item, invoicePayload) => {
    try {
      const jsonStr = JSON.stringify(invoicePayload);
      if (item.id) {
        await sb.from('approvals').update({ invoice_attachment: jsonStr }).eq('id', item.id);
      }
      if (item.ref_id) {
        await sb.from('approvals').update({ invoice_attachment: jsonStr }).eq('ref_id', item.ref_id);
        if (item.kind === 'quotation') {
          await sb.from('quotations').update({
            invoice_attachment: jsonStr,
            invoice_no: invoicePayload.invoice_no
          }).eq('id', item.ref_id);
        }
      }
      toast('Invoice attachment saved successfully!', 'ok');
      await loadData();
      setViewDetailItem(prev => prev ? {
        ...prev,
        invoice_attachment: invoicePayload,
        quotation: prev.quotation ? { ...prev.quotation, invoice_attachment: invoicePayload } : prev.quotation
      } : null);
    } catch (err) {
      console.error('Error saving invoice attachment:', err);
      toast('Failed to save invoice attachment', 'err');
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
              paginatedQueue.map((item) => {
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

                // Check for invoice attachment
                const invObj = item.invoice_attachment || parseInvoiceAttachment(q?.invoice_attachment);

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
                        {invObj && (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              border: '1px solid #BFDBFE',
                              borderRadius: '5px',
                              padding: '1px 6px',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              marginTop: '2px'
                            }}
                            title={`Invoice ${invObj.invoice_no || ''} attached (${invObj.file_name || 'Document'})`}
                          >
                            <Paperclip size={10} strokeWidth={2.4} />
                            <span>{invObj.invoice_no || 'Invoice Attached'}</span>
                          </div>
                        )}
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
                          title="View Details & Invoice in Popup Modal"
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
        <Pagination
          currentPage={page}
          totalItems={filteredQueue.length}
          pageSize={pageSize}
          onPageChange={setPage}
          itemName="approval requests"
        />
      </div>

      {/* Full Detail Inspection Modal */}
      {viewDetailItem && (
        <ApprovalDetailModal
          item={viewDetailItem}
          onClose={() => setViewDetailItem(null)}
          onApprove={(item) => openApproveConfirmation(item)}
          onDelete={(item) => openDeleteConfirmation(item)}
          onPreviewDocument={(doc) => setPreviewDocument(doc)}
          onSaveInvoiceAttachment={handleSaveInvoiceAttachment}
          isApproving={approvingId === viewDetailItem.id}
        />
      )}

      {/* Approve Confirmation Popup Modal */}
      {approveConfirmModalItem && (
        <ApproveConfirmationModal
          item={approveConfirmModalItem}
          onConfirm={confirmApprove}
          onClose={() => setApproveConfirmModalItem(null)}
          onPreviewDocument={(doc) => setPreviewDocument(doc)}
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

      {/* Lightbox / Document Preview Modal */}
      {previewDocument && (
        <DocumentPreviewModal
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
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

// Approval Detail Modal for In-Depth Verification & Multi-Photo / Document Gallery
function ApprovalDetailModal({ item, onClose, onApprove, onDelete, isApproving, onPreviewDocument, onSaveInvoiceAttachment }) {
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

  // Invoice Attachment Parsing with Multi-File support (checking item, q, and nested quotation)
  const invoiceAttachment = parseInvoiceAttachment(item?.invoice_attachment) || 
                            parseInvoiceAttachment(q?.invoice_attachment) || 
                            parseInvoiceAttachment(item?.quotation?.invoice_attachment);
  const existingFiles = invoiceAttachment?.files || [];

  // Upload/Edit State
  const [showUploadDrawer, setShowUploadDrawer] = useState(existingFiles.length === 0 && item.status === 'approved');
  const [newFiles, setNewFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleFilesSelect = (e) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length) return;

    fileList.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} exceeds 10MB limit and was skipped.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setNewFiles(prev => [
          ...prev,
          {
            id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            dataUrl: reader.result,
            isImage: file.type?.includes('image') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const fileList = Array.from(e.dataTransfer.files || []);
    if (!fileList.length) return;

    fileList.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} exceeds 10MB limit and was skipped.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setNewFiles(prev => [
          ...prev,
          {
            id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            dataUrl: reader.result,
            isImage: file.type?.includes('image') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeNewFile = (id) => {
    setNewFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleSaveAttachments = async () => {
    if (newFiles.length === 0 && existingFiles.length === 0) {
      alert('Please select at least one photo or document to attach.');
      return;
    }
    setIsSaving(true);
    try {
      const combinedFiles = [
        ...existingFiles,
        ...newFiles.map(f => ({
          id: f.id,
          file_name: f.name,
          file_size: f.size,
          file_type: f.type,
          file_data: f.dataUrl,
          uploaded_at: new Date().toISOString()
        }))
      ];

      const payload = {
        invoice_no: invoiceAttachment?.invoice_no || `INV-${quoteNo}`,
        invoice_date: invoiceAttachment?.invoice_date || new Date().toISOString().split('T')[0],
        invoice_amount: invoiceAttachment?.invoice_amount || q?.rate_amount || item?.amount || 0,
        file_name: combinedFiles[0]?.file_name || 'Document',
        file_size: combinedFiles[0]?.file_size || 0,
        file_type: combinedFiles[0]?.file_type || 'application/octet-stream',
        file_data: combinedFiles[0]?.file_data || null,
        files: combinedFiles,
        uploaded_at: new Date().toISOString(),
        uploaded_by: 'Executive Owner'
      };

      if (onSaveInvoiceAttachment) {
        await onSaveInvoiceAttachment(item, payload);
      }
      setShowUploadDrawer(false);
      setNewFiles([]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadFile = (f) => {
    if (!f.file_data) return;
    const link = document.createElement('a');
    link.href = f.file_data;
    link.download = f.file_name || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
          maxWidth: '760px',
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
                {existingFiles.length > 0 && (
                  <span style={{ fontSize: '0.68rem', padding: '2px 8px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '6px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Paperclip size={11} /> {existingFiles.length} Attachment{existingFiles.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--slate)', fontWeight: 500 }}>
                {isQuote ? 'Quotation verification & attached photos / document gallery.' : 'Inspect parts issuance details and maintenance records.'}
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

              {/* 📑 MULTIPLE ATTACHED PHOTOS & DOCUMENTS SECTION */}
              <div style={{ background: '#FFFFFF', border: '1.5px solid #CBD5E1', borderRadius: '14px', padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileImage size={18} strokeWidth={2.4} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.94rem', color: 'var(--navy-900)' }}>
                        Attached Photos &amp; Invoices {existingFiles.length > 0 ? `(${existingFiles.length})` : ''}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--slate)' }}>
                        {existingFiles.length > 0 ? `${existingFiles.length} photo(s) / document(s) saved for this quotation` : 'No photos or invoice attached yet'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn gh sm"
                    onClick={() => setShowUploadDrawer(!showUploadDrawer)}
                    style={{ fontSize: '0.74rem', height: '30px', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--orange-700)', borderColor: 'rgba(249, 115, 22, 0.3)', fontWeight: 700 }}
                  >
                    {showUploadDrawer ? 'Cancel' : '+ Add More Photos'}
                  </button>
                </div>

                {/* Existing Photos & Files Gallery */}
                {existingFiles.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: showUploadDrawer ? '16px' : 0 }}>
                    {existingFiles.map((file, idx) => {
                      const isImg = file.file_type?.includes('image') || /\.(png|jpe?g|webp|gif)$/i.test(file.file_name || '');
                      return (
                        <div
                          key={file.id || idx}
                          style={{
                            border: '1px solid #E2E8F0',
                            borderRadius: '10px',
                            background: '#F8FAFC',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {/* Visual Thumbnail */}
                          {isImg && file.file_data ? (
                            <div
                              onClick={() => onPreviewDocument && onPreviewDocument({
                                name: file.file_name,
                                size: file.file_size,
                                type: file.file_type,
                                dataUrl: file.file_data
                              })}
                              style={{
                                height: '110px',
                                background: '#0F172A',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                position: 'relative',
                                overflow: 'hidden'
                              }}
                            >
                              <img
                                src={file.file_data}
                                alt={file.file_name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <div style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(15, 23, 42, 0.8)', color: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Maximize2 size={10} /> View
                              </div>
                            </div>
                          ) : (
                            <div style={{ height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9', color: '#DC2626' }}>
                              <FileText size={32} />
                            </div>
                          )}

                          {/* File Details & Actions */}
                          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--navy-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.file_name}>
                              {file.file_name}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--slate)' }}>
                              {formatFileSize(file.file_size)}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                              {file.file_data && (
                                <button
                                  type="button"
                                  className="btn gh sm"
                                  onClick={() => onPreviewDocument && onPreviewDocument({
                                    name: file.file_name,
                                    size: file.file_size,
                                    type: file.file_type,
                                    dataUrl: file.file_data
                                  })}
                                  style={{ flex: 1, height: '26px', fontSize: '0.7rem', padding: 0, justifyContent: 'center' }}
                                >
                                  Preview
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn gh sm"
                                onClick={() => handleDownloadFile(file)}
                                style={{ height: '26px', width: '28px', padding: 0, justifyContent: 'center' }}
                                title="Download File"
                              >
                                <Download size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Upload More Photos / Files Drawer */}
                {showUploadDrawer && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #CBD5E1' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Upload Photos &amp; Documents</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--slate)' }}>Select multiple files at once</span>
                    </div>

                    {/* Multi-file Dropzone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      style={{
                        border: isDragging ? '2px dashed #F97316' : '2px dashed #CBD5E1',
                        borderRadius: '10px',
                        padding: '18px',
                        textAlign: 'center',
                        background: isDragging ? '#FFF7ED' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onClick={() => document.getElementById('viewModalMultiFileInput')?.click()}
                    >
                      <input
                        type="file"
                        id="viewModalMultiFileInput"
                        multiple
                        accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                        style={{ display: 'none' }}
                        onChange={handleFilesSelect}
                      />
                      <UploadCloud size={28} style={{ color: isDragging ? '#F97316' : 'var(--slate)', margin: '0 auto 6px' }} />
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                        Click to select multiple photos / documents, or drag &amp; drop
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--slate)', marginTop: '2px' }}>
                        Supports JPG, PNG, WEBP, PDF up to 10MB each
                      </div>
                    </div>

                    {/* Staged New Files Preview */}
                    {newFiles.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#065F46' }}>
                          Ready to Attach ({newFiles.length} file{newFiles.length > 1 ? 's' : ''}):
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                          {newFiles.map(f => (
                            <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#ECFDF5', borderRadius: '8px', border: '1px solid #A7F3D0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <CheckCircle2 size={14} color="#059669" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#065F46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                                  {f.name}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeNewFile(f.id)}
                                style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', padding: 0, flexShrink: 0, marginLeft: '4px' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="btn gh sm"
                        onClick={() => { setShowUploadDrawer(false); setNewFiles([]); }}
                        style={{ height: '32px', padding: '0 12px', fontSize: '0.78rem' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn pri sm"
                        disabled={isSaving || newFiles.length === 0}
                        onClick={handleSaveAttachments}
                        style={{ height: '32px', padding: '0 16px', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <FileCheck size={14} />
                        {isSaving ? 'Saving...' : `Save ${newFiles.length > 0 ? `(${newFiles.length})` : ''} Attachment${newFiles.length > 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                )}
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

// Approve Confirmation Modal Component with Multi-Photo & Document Upload
function ApproveConfirmationModal({ item, onConfirm, onClose, onPreviewDocument, isSubmitting }) {
  const isQuote = item?.kind === 'quotation';
  const q = item?.quotation;
  const quoteNo = q?.quote_no || item?.ref_id || 'Quotation';
  const companyName = q?.customer?.company_name || q?.customer_name || (item?.title && item.title.includes('-') ? item.title.split('-')[1].trim() : 'Customer');

  // Multiple Files / Photos State
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFilesSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    selected.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} exceeds 10MB limit and was skipped.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setFiles(prev => [
          ...prev,
          {
            id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            dataUrl: reader.result,
            isImage: file.type?.includes('image') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (!dropped.length) return;

    dropped.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File ${file.name} exceeds 10MB limit and was skipped.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setFiles(prev => [
          ...prev,
          {
            id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            dataUrl: reader.result,
            isImage: file.type?.includes('image') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleConfirmSubmit = () => {
    onConfirm({
      files: files
    });
  };

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
          maxWidth: '540px',
          width: '100%',
          maxHeight: '92vh',
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
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #DCFCE7' }}>
              <CheckCircle2 size={22} strokeWidth={2.4} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--navy-900)', fontWeight: 800 }}>
                {isQuote ? 'Confirm Quotation Approval' : 'Confirm Stock Approval'}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--slate)', fontWeight: 500 }}>
                Executive authorization &amp; multi-photo invoice attachment
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
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Target Item summary card */}
          <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '12px 16px', border: '1px solid #E2E8F0' }}>
            <div>
              <span className="jno-pill" style={{ fontSize: '0.8rem', padding: '2px 8px', fontWeight: 800 }}>
                {isQuote ? quoteNo : item?.ref_id}
              </span>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                <Building2 size={15} style={{ color: 'var(--slate)', flexShrink: 0 }} />
                <span>{companyName}</span>
              </div>
            </div>
          </div>

          {/* Multiple Photos / Invoices Upload Box */}
          {isQuote && (
            <div style={{ border: '1.5px solid #CBD5E1', borderRadius: '12px', padding: '14px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Paperclip size={15} style={{ color: 'var(--orange)' }} />
                  <span>Attach Photos / Invoice for this Quotation</span>
                </div>
                {files.length > 0 ? (
                  <span style={{ fontSize: '0.7rem', color: '#047857', background: '#ECFDF5', padding: '2px 8px', borderRadius: '6px', border: '1px solid #A7F3D0', fontWeight: 700 }}>
                    {files.length} Photo{files.length > 1 ? 's' : ''} / File{files.length > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: 'var(--slate)', background: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                    Optional / Multiple
                  </span>
                )}
              </div>

              {/* Multi-file Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                style={{
                  border: isDragging ? '2px dashed #F97316' : '1.5px dashed #CBD5E1',
                  borderRadius: '10px',
                  padding: files.length > 0 ? '12px' : '18px',
                  textAlign: 'center',
                  background: isDragging ? '#FFF7ED' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => document.getElementById('approveModalMultiFileInput')?.click()}
              >
                <input
                  type="file"
                  id="approveModalMultiFileInput"
                  multiple
                  accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                  style={{ display: 'none' }}
                  onChange={handleFilesSelect}
                />

                <UploadCloud size={24} style={{ color: isDragging ? '#F97316' : 'var(--slate)', margin: '0 auto 4px' }} />
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                  {files.length > 0 ? '+ Click to add more photos / files' : 'Click to upload multiple photos or drag & drop'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--slate)', marginTop: '2px' }}>
                  Supports multiple JPG, PNG, WEBP, PDF up to 10MB each
                </div>
              </div>

              {/* Uploaded Files Grid Preview */}
              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '4px 2px' }}>
                    {files.map((file, idx) => (
                      <div
                        key={file.id || idx}
                        style={{
                          border: '1px solid #A7F3D0',
                          background: '#ECFDF5',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative'
                        }}
                      >
                        {/* Image Thumbnail or File Icon */}
                        {file.isImage && file.dataUrl ? (
                          <div style={{ height: '70px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={file.dataUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9', color: '#DC2626' }}>
                            <FileText size={24} />
                          </div>
                        )}

                        {/* File Name & Remove Button */}
                        <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065F46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                              {file.name}
                            </div>
                            <div style={{ fontSize: '0.64rem', color: '#047857' }}>
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                            style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
                            title="Remove Photo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#065F46', fontWeight: 700 }}>
                      ✓ {files.length} photo{files.length > 1 ? 's' : ''} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles([])}
                      style={{ border: 'none', background: 'transparent', color: '#DC2626', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--navy-900)', lineHeight: '1.45' }}>
            Are you sure you want to authorize this request? Approving will:
          </p>

          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.78rem', color: 'var(--slate)', lineHeight: '1.6' }}>
            <li>Mark status as <b>Approved</b> and archive attached photos/invoice.</li>
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
            onClick={handleConfirmSubmit}
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
            {isSubmitting ? 'Authorising...' : `Confirm & Authorise${files.length > 0 ? ` (${files.length} Photo${files.length > 1 ? 's' : ''})` : ''}`}
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

// Lightbox Document / PDF / Image Preview Modal
function DocumentPreviewModal({ document: doc, onClose }) {
  if (!doc) return null;

  const isPdf = doc.type?.includes('pdf') || doc.name?.toLowerCase().endsWith('.pdf');
  const isImage = doc.type?.includes('image') || /\.(png|jpe?g|webp|gif)$/i.test(doc.name || '');

  const handleDownload = () => {
    if (!doc.dataUrl) return;
    const link = document.createElement('a');
    link.href = doc.dataUrl;
    link.download = doc.name || 'invoice_document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return createPortal(
    <div
      className="overlay open"
      id="docPreviewOverlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999999,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}
      onClick={(e) => e.target.id === 'docPreviewOverlay' && onClose()}
    >
      <div
        className="modalbox tab-fade-in"
        style={{
          maxWidth: '860px',
          width: '100%',
          maxHeight: '92vh',
          borderRadius: '18px',
          overflow: 'hidden',
          background: '#0F172A',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(249, 115, 22, 0.2)', color: '#F97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#FFFFFF', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {doc.name || 'Invoice Document'}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                {doc.size ? formatFileSize(doc.size) : ''} {doc.type ? `• ${doc.type}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn sm"
              onClick={handleDownload}
              style={{ background: '#F97316', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '0 12px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700 }}
            >
              <Download size={14} /> Download
            </button>
            <button
              onClick={onClose}
              style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Preview */}
        <div style={{ flex: 1, minHeight: '380px', maxHeight: '72vh', background: '#090D16', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          {isPdf ? (
            <iframe
              src={doc.dataUrl}
              title={doc.name || 'PDF Preview'}
              style={{ width: '100%', height: '65vh', border: 'none', borderRadius: '8px', background: '#FFFFFF' }}
            />
          ) : isImage ? (
            <img
              src={doc.dataUrl}
              alt={doc.name || 'Invoice Preview'}
              style={{ maxWidth: '100%', maxHeight: '68vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: '40px 20px' }}>
              <FileSpreadsheet size={48} style={{ color: '#F97316', marginBottom: '12px' }} />
              <div style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '1rem', marginBottom: '6px' }}>
                Preview Not Supported In-Browser
              </div>
              <div style={{ fontSize: '0.82rem', marginBottom: '16px' }}>
                Please download the file to view its full contents.
              </div>
              <button
                className="btn pri sm"
                onClick={handleDownload}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '0 auto' }}
              >
                <Download size={14} /> Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
