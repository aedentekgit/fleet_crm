// GET  /api/webhook  -> Meta verification handshake
// POST /api/webhook  -> Inbound WhatsApp / Telegram webhook events
//
// The Driver PWA is the primary channel. This webhook serves as a fallback:
// it allows drivers to update trip statuses via WhatsApp replies (e.g. "DELIVERED RJ-202608-0001")
// and customers to confirm quotations by replying ("CONFIRM RJ-Q-202608-0001").
//
// Env: WHATSAPP_VERIFY_TOKEN

import { getDb } from '../db/mongodb.js';

export default async function handler(req, res) {
  // ── Meta verification handshake ──
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(q['hub.challenge']);
    }
    return res.status(403).send('Verify failed');
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // Pull message text out of WhatsApp Cloud API payload
  let text = '', from = '';
  try {
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (msg) {
      from = msg.from || '';
      text = (msg.text?.body || msg.button?.text || '').trim();
    }
  } catch {}

  // Pull message text out of Telegram payload (fallback)
  if (!text && body?.message) {
    text = (body.message.text || '').trim();
    from = String(body.message.from?.id || '');
  }

  if (text) {
    try {
      const db = await getDb();

      // 1. Check for driver status updates: "started RJ-202608-0001" or "delivered RJ-202608-0001"
      const jobMatch = text.match(/\b(started|start|delivered|deliver|arrived|transit)\b.*?(RJ-\d{6}-\d{4})/i);
      if (jobMatch) {
        const verb = jobMatch[1].toLowerCase();
        const jobNo = jobMatch[2].toUpperCase();
        const isDelivered = verb.startsWith('deliver') || verb === 'arrived';
        const status = isDelivered ? 'delivered' : 'in_transit';
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        if (status === 'in_transit') {
          await db.collection('jobs').updateOne(
            { job_no: jobNo },
            { $set: { status }, $setOnInsert: { started_at: now } }
          );
        } else if (status === 'delivered') {
          await db.collection('jobs').updateOne(
            { job_no: jobNo },
            { $set: { status, delivered_at: now } }
          );
        }
      }

      // 2. Check for customer quotation confirmations: "CONFIRM RJ-Q-202608-0001"
      const quoteMatch = text.match(/\bconfirm\b.*?(RJ-Q-\d{6}-\d{4})/i);
      if (quoteMatch) {
        const quoteNo = quoteMatch[1].toUpperCase();
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await db.collection('quotations').updateOne(
          { quote_no: quoteNo },
          { $set: { status: 'client_confirmed', client_confirmed_at: now } }
        );
      }
    } catch (dbErr) {
      console.error('[Webhook MongoDB Error]:', dbErr);
    }
  }

  // Always respond with 200 OK immediately so Meta / Telegram do not retry
  return res.status(200).json({ received: true });
}
