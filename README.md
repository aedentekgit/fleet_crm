# Rens Dynamics — Operations ERP

Dispatch, quotations, owner approvals, fleet office, an owner dashboard, and a
keyboard-first workflow — plus a **Driver PWA** as the primary field channel.
Built on your existing stack: static HTML + `@supabase/supabase-js` from CDN +
Vercel serverless functions. No build step for the front end.

**Invoicing stays in AutoCount.** This system produces the numbers (rates, SST,
delivered jobs) and hands a billing queue to AutoCount; it does not issue invoices.

---

## What's in the box

| File | Role |
|---|---|
| `schema.sql` | Full Postgres schema, triggers, realtime, RLS, seed staff |
| `styles.css` | Shared Sen design system (keyboard-first components) |
| `shared.js` | Supabase client, helpers, staff gate, toast, **command palette + keyboard engine** |
| `board.html` | Job board (kanban) — assign lorry + crew, start/deliver, keyboard nav |
| `quotations.html` | Paste → parse → price → send; client-confirm |
| `approvals.html` | Owner queue: quotations + stock issuances (`Y` approve / `B` send back) |
| `fleet.html` | Vehicles · Drivers & crew · Maintenance · Inventory (approval-gated issuance) |
| `dashboard.html` | Owner KPIs, revenue-by-lorry, live fleet, billing queue, expiries |
| `driver.html` | **Driver PWA** — phone+PIN login, today's jobs, offline capture |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | PWA install + offline shell |
| `api/parse-jobs.js` | Booking text → structured quotation (Claude) |
| `api/notify.js` | Customer WhatsApp on confirm/deliver (+ Telegram fallback stub) |
| `api/webhook.js` | Inbound WhatsApp/Telegram replies → status updates (fallback channel) |

---

## Go-live in 6 steps

### 1. Create the database
In a **fresh** Supabase project, open the SQL editor and run `schema.sql` whole.
It creates every table, trigger, realtime publication, open RLS policy, and seeds
two staff logins.

### 2. Wire the front end to Supabase
Edit the top of **`shared.js`**:
```js
const SUPABASE_URL = 'https://YOURPROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';   // Project Settings → API → anon public
```

### 3. Deploy to Vercel
Push this folder to a Git repo and import it in Vercel (or `vercel` from the CLI).
`package.json` makes Vercel install `@supabase/supabase-js` for the `api/` functions.
Set these **Environment Variables** in the Vercel project:

| Variable | Needed for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `parse-jobs` | AI booking parse. Without it the page falls back to a local parser. |
| `SUPABASE_URL` | `notify`, `webhook` | same project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `notify`, `webhook` | **server-only** — never put this in `shared.js` |
| `WHATSAPP_TOKEN` | `notify` | Meta WhatsApp Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | `notify` | Cloud API sender ID |
| `WHATSAPP_VERIFY_TOKEN` | `webhook` | any string; must match the value you set in Meta |
| `TELEGRAM_BOT_TOKEN` | `notify`/`webhook` | optional driver fallback |

The app runs fine before the WhatsApp/Telegram vars exist — those calls are
best-effort and simply no-op.

### 4. Point Meta's webhook (only if using WhatsApp)
Callback URL `https://YOURAPP.vercel.app/api/webhook`, verify token =
`WHATSAPP_VERIFY_TOKEN`. Subscribe to `messages`.

### 5. Lock the seed
`schema.sql` seeds **Owner / PIN 4321** and **Dispatch Admin / PIN 1234**.
After first login, change them (or delete and re-add via the `staff` table):
```sql
update staff set pin = 'NEW_PIN' where role = 'owner';
```

### 6. Install the Driver PWA
On the driver's phone open `https://YOURAPP.vercel.app/driver.html` →
"Add to Home screen". They log in with their **phone number + 4-digit PIN**
(set per person in Fleet → Drivers & Crew). Jobs appear live; taps made with no
signal are saved and sync on reconnect.

---

## How the workflow hangs together

```
Quotation (paste→price→send)
   → customer confirms
   → OWNER APPROVES  ──trigger──▶ Job spawned (unassigned)
Board: assign lorry + crew (driver + up to 2)  → Start → Delivered
Delivered → billing queue on the dashboard → mark sent → AutoCount

Stock issuance → OWNER APPROVES → stock deducts
   (issuance with no linked service is auto-FLAGGED red)
```

Owner sees **one** approval screen for both quotes and parts — the two places
money commits — and flagged items sort to the top.

### Keyboard-first
- `⌘K` / `Ctrl+K` or `/` — command palette
- `G` then `B/Q/A/F/D` — jump between pages
- `J K H L` — move focus; `Enter` open; single letters act (`A` assign, `S` start,
  `V` deliver, `Y` approve, `B` send back, `N` new)
- `?` — shortcut sheet

---

## Migrating from the old dispatch/fleet MVP
`schema.sql` targets a **fresh** project. The important behaviour changes if you
port old data:

1. **Stock now deducts on APPROVAL, not on insert.** `inventory_issuances` gained
   `approval_status`; the deduct trigger fires on approve. Existing issuances
   should be back-filled to `approved` so balances stay correct.
2. **New front-of-funnel**: `quotations`, `job_crew`, `approvals`, `staff`,
   `lorry_crew`. Old jobs simply have no `quotation_id` — that's fine.
3. Jobs previously used `customer_id`; that's unchanged.

Write these as an idempotent migration rather than re-running `schema.sql` over
live data.

---

## ⚠️ Security — read before trusting the numbers for money decisions
This ships on your existing **anon-key + PIN** model. That's a **deterrent tier**,
not hard security: the anon key is visible in the browser, and RLS is currently
"anon full access". Good enough to go live and get the team working; **not** good
enough to treat the dashboard as evidence in a dispute, because a determined
insider with the key can bypass the app.

The Phase-2 hardening is scoped in `schema.sql` (bottom block): real Supabase Auth
per staff member, a scoped session for drivers instead of the anon key, and RLS
policies that tie every row to `auth.uid()`. Until that's in, the `staff`/`approved_by`
stamps give you **attribution and a deterrent**, not proof. I'd do this before the
fraud-prevention goal is load-bearing.

---

## Still on the roadmap (needs external feeds)
Profit-per-lorry and fuel-vs-actual need the TDT / DHBS / Petronas / Touch'nGo
data feeds wired in. The dashboard leaves a home for these; the cost maths slots
in once the feeds exist.
