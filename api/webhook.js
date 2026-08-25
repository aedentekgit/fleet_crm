// GET  /api/webhook  -> Meta verification handshake
// POST /api/webhook  -> inbound WhatsApp/Telegram messages
//
// The Driver PWA is the primary channel, so this webhook is a FALLBACK: it lets
// a driver update a job by replying to a WhatsApp/Telegram message (e.g. sending
// "DELIVERED RJ-202608-0001") when they haven't installed the app. Customers
// confirming a quote by reply are also handled here.
//
// Env: WHATSAPP_VERIFY_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // ── Meta verification handshake ──
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(q['hub.challenge']);
    }
    return res.status(403).send('verify failed');
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const url = process.env.SUPABASE_URL, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = (url && srv) ? createClient(url, srv) : null;

  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  // Pull the message text out of a WhatsApp Cloud API payload (best-effort).
  let text = '', from = '';
  try {
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (msg) { from = msg.from || ''; text = (msg.text?.body || msg.button?.text || '').trim(); }
  } catch {}
  // Telegram shape
  if (!text && body?.message) { text = (body.message.text || '').trim(); from = String(body.message.from?.id || ''); }

  if (sb && text) {
    const m = text.match(/\b(started|start|delivered|deliver|arrived)\b.*?(RJ-\d{6}-\d{4})/i);
    if (m) {
      const verb = m[1].toLowerCase(), jobNo = m[2].toUpperCase();
      const status = verb.startsWith('deliver') || verb === 'arrived' ? 'delivered' : 'in_transit';
      const patch = { status };
      if (status === 'in_transit') patch.started_at = new Date().toISOString();
      if (status === 'delivered') patch.delivered_at = new Date().toISOString();
      await sb.from('jobs').update(patch).eq('job_no', jobNo);
    }
    // Customer confirming a quote by reply, e.g. "CONFIRM RJ-Q-202608-0001"
    const c = text.match(/\bconfirm\b.*?(RJ-Q-\d{6}-\d{4})/i);
    if (c && sb) {
      await sb.from('quotations').update({ status: 'client_confirmed', client_confirmed_at: new Date().toISOString() })
        .eq('quote_no', c[1].toUpperCase());
    }
  }

  // Always 200 quickly so Meta/Telegram don't retry.
  return res.status(200).json({ received: true });
}
