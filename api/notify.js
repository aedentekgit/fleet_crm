// POST /api/notify  { job_id }
// Driver notification is handled IN-APP (the Driver PWA subscribes to realtime
// and the job simply appears). This endpoint covers the two things realtime
// can't: telling the CUSTOMER over WhatsApp, and an optional Telegram push to
// the driver as a fallback when the PWA isn't installed.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
//      TELEGRAM_BOT_TOKEN (optional)
//
// Uses the service-role key server-side so it never touches the browser.

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const jobId = body && body.job_id;
  if (!jobId) return res.status(400).json({ error: 'job_id required' });

  const url = process.env.SUPABASE_URL, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srv) return res.status(200).json({ ok: false, skipped: 'supabase server env not set' });
  const sb = createClient(url, srv);

  const { data: job } = await sb.from('jobs')
    .select('*, customer:customers(company_name,phone), driver:drivers(name,phone)')
    .eq('id', jobId).maybeSingle();
  if (!job) return res.status(404).json({ error: 'job not found' });

  const results = {};

  // 1) Customer WhatsApp — on assignment (booking confirmed) and on delivery.
  const waToken = process.env.WHATSAPP_TOKEN, waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const custPhone = job.customer && job.customer.phone;
  if (waToken && waPhoneId && custPhone) {
    let text;
    if (job.status === 'assigned') text = `Rens Dynamics: your booking ${job.job_no} (${job.pickup_location} → ${job.dropoff_location}) is confirmed and scheduled. We'll update you on delivery.`;
    else if (job.status === 'delivered') text = `Rens Dynamics: ${job.job_no} has been DELIVERED to ${job.dropoff_location}. Thank you.`;
    if (text) {
      try {
        const r = await fetch(`https://graph.facebook.com/v20.0/${waPhoneId}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${waToken}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: custPhone, type: 'text', text: { body: text } }),
        });
        results.whatsapp = r.ok ? 'sent' : ('error ' + r.status);
      } catch (e) { results.whatsapp = 'error ' + e; }
    }
  } else results.whatsapp = 'skipped (no token/customer phone)';

  // 2) Telegram fallback to driver (optional). Requires the driver to have
  //    started the bot; you'd store their chat_id. Left as best-effort stub.
  const tg = process.env.TELEGRAM_BOT_TOKEN;
  if (tg && job.driver && job.status === 'assigned') {
    results.telegram = 'configured (wire driver chat_id to enable)';
  } else results.telegram = 'skipped';

  return res.status(200).json({ ok: true, results });
}
