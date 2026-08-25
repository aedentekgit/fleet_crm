// POST /api/parse-jobs  { text }  ->  { candidates: [ {…quotation fields} ] }
// Turns a pasted WhatsApp/email booking into structured quotation candidates
// using Claude. Falls back gracefully: on any error returns 502 and the
// browser uses its local heuristic parser so the page keeps working.
//
// Env: ANTHROPIC_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(502).json({ error: 'ANTHROPIC_API_KEY not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const text = (body && body.text || '').toString().slice(0, 6000);
  if (!text.trim()) return res.status(400).json({ error: 'no text' });

  const system = `You extract lorry-booking details from messy Malaysian logistics WhatsApp/email messages.
Return ONLY a JSON object: {"candidates":[ ... ]}. Each candidate has these keys (use null if absent):
customer_name, pickup_location, dropoff_location, collection_date, pickup_time, dropoff_time, cargo_desc, lorry_spec, weight_desc,
loading_time (text or null), unloading_time (text or null),
customer_ref, special_instructions, suggested_driver, urgent (boolean).
Note: Malaysian WhatsApp order messages often format collection date ("Date arrive:", "Monday (20/07/2026)"), collection address with company name, contact numbers (Mr./Ms.), pickup time ("Part ready 8am"), dropoff time ("Time before : 8am"), material weight in MT, dropoff location ("Pls send part to..."), vehicle spec ("30ft SIDE CURTAIN"), special rules (e.g. blue canvas protection), and driver info. Extract all these fields cleanly. A single message may contain multiple trips -> multiple candidates. No prose, no markdown fences.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system,
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!r.ok) return res.status(502).json({ error: 'anthropic ' + r.status });
    const data = await r.json();
    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const clean = raw.replace(/^```json\s*/i, '').replace(/```$/,'').trim();
    let parsed; try { parsed = JSON.parse(clean); } catch { return res.status(502).json({ error: 'bad json from model' }); }
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    return res.status(200).json({ candidates });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
}
