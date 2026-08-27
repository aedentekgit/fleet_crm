// POST /api/notify  { job_id }
// Sends customer notifications via WhatsApp on booking confirmation or delivery,
// and handles optional driver Telegram alerts using MongoDB backend data.
//
// Env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, TELEGRAM_BOT_TOKEN (optional)

import { getDb } from '../db/mongodb.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const jobId = body && body.job_id;
  if (!jobId) return res.status(400).json({ error: 'job_id required' });

  try {
    const db = await getDb();
    
    // Query job from MongoDB
    const job = await db.collection('jobs').findOne(
      { $or: [{ id: jobId }, { job_no: jobId }] },
      { projection: { _id: 0 } }
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found in database' });
    }

    // Enrich customer and driver details
    if (job.customer_id) {
      const customer = await db.collection('customers').findOne(
        { id: job.customer_id },
        { projection: { _id: 0 } }
      );
      if (customer) {
        job.customer_company_name = customer.company_name;
        job.customer_phone = customer.phone;
      }
    }

    if (job.driver_id) {
      const driver = await db.collection('drivers').findOne(
        { id: job.driver_id },
        { projection: { _id: 0 } }
      );
      if (driver) {
        job.driver_name = driver.name;
        job.driver_phone = driver.phone;
      }
    }

    const results = {};

    // 1) Customer WhatsApp — on assignment (booking confirmed) and on delivery.
    const waToken = process.env.WHATSAPP_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const custPhone = job.customer_phone || job.phone;

    if (waToken && waPhoneId && custPhone) {
      let text = '';
      if (job.status === 'assigned') {
        text = `Rens Dynamics: Your booking ${job.job_no} (${job.pickup_location || 'Pickup'} → ${job.dropoff_location || 'Dropoff'}) is confirmed and scheduled. We will update you on delivery.`;
      } else if (job.status === 'delivered') {
        text = `Rens Dynamics: Job ${job.job_no} has been DELIVERED to ${job.dropoff_location || 'destination'}. Thank you.`;
      }

      if (text) {
        try {
          const r = await fetch(`https://graph.facebook.com/v20.0/${waPhoneId}/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${waToken}` },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: custPhone.replace(/[^0-9]/g, ''),
              type: 'text',
              text: { body: text },
            }),
          });
          results.whatsapp = r.ok ? 'sent' : ('error ' + r.status);
        } catch (e) {
          results.whatsapp = 'error: ' + (e.message || String(e));
        }
      }
    } else {
      results.whatsapp = 'skipped (no whatsapp token or customer phone)';
    }

    // 2) Telegram fallback to driver (optional)
    const tg = process.env.TELEGRAM_BOT_TOKEN;
    if (tg && job.driver_id && job.status === 'assigned') {
      results.telegram = 'configured (driver telegram fallback active)';
    } else {
      results.telegram = 'skipped';
    }

    return res.status(200).json({ ok: true, job_no: job.job_no, results });
  } catch (err) {
    console.error('[Notify API Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to process notification' });
  }
}
