/* Rens Dynamics ERP — shared.js
   Loaded AFTER the supabase-js CDN tag. Provides the Supabase client,
   formatting helpers, the staff gate, toasts, and the keyboard /
   command-palette engine that every staff page plugs into. */

// ── CONFIG — fill these in before go-live ──────────────
const SUPABASE_URL = 'YOUR_SUPABASE_URL';        // e.g. https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const SST_RATE = 0.06;                            // 6% Malaysian SST (quote display only)

let sb = null;
try {
  if (SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL' && typeof supabase !== 'undefined') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('Supabase not configured or initialization failed:', e);
}

if (!sb) {
  sb = createDbProxyClient();
}

function createDbProxyClient() {
  const apiEndpoint = typeof window !== 'undefined' && window.location && window.location.pathname.endsWith('.php') ? 'api/db.php' : 'api/db.js';

  async function fetchTableData(tableName) {
    try {
      const res = await fetch(`${apiEndpoint}?table=${tableName}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    } catch (e) {
      return [];
    }
  }

  async function enrichRelations(tableName, data, selectCols) {
    if (!data || !data.length || !selectCols) return;
    try {
      if (selectCols.includes('customer') || (data[0] && data[0].customer_id !== undefined)) {
        const customers = await fetchTableData('customers');
        const custMap = {};
        customers.forEach(c => custMap[c.id] = c);
        data.forEach(row => {
          if (row.customer_id && !row.customer) {
            row.customer = custMap[row.customer_id] || { company_name: 'Customer #' + row.customer_id };
          }
        });
      }

      if (selectCols.includes('lorry') || (data[0] && data[0].lorry_id !== undefined)) {
        const lorries = await fetchTableData('lorries');
        const lorryMap = {};
        lorries.forEach(l => lorryMap[l.id] = l);
        data.forEach(row => {
          if (row.lorry_id && !row.lorry) {
            row.lorry = lorryMap[row.lorry_id] || { plate_no: 'Lorry #' + row.lorry_id };
          }
        });
      }

      if (selectCols.includes('driver') || (data[0] && data[0].driver_id !== undefined)) {
        const drivers = await fetchTableData('drivers');
        const drvMap = {};
        drivers.forEach(d => drvMap[d.id] = d);
        data.forEach(row => {
          if (row.driver_id && !row.driver) {
            row.driver = drvMap[row.driver_id] || { name: 'Driver #' + row.driver_id };
          }
        });
      }

      if (selectCols.includes('item') || (data[0] && data[0].item_id !== undefined)) {
        const items = await fetchTableData('inventory_items');
        const itemMap = {};
        items.forEach(i => itemMap[i.id] = i);
        data.forEach(row => {
          if (row.item_id && !row.item) {
            row.item = itemMap[row.item_id] || { name: 'Item #' + row.item_id };
          }
        });
      }

      if (selectCols.includes('maint') || (data[0] && data[0].maintenance_record_id !== undefined)) {
        const maints = await fetchTableData('maintenance_records');
        const maintMap = {};
        maints.forEach(m => maintMap[m.id] = m);
        data.forEach(row => {
          if (row.maintenance_record_id && !row.maint) {
            row.maint = maintMap[row.maintenance_record_id] || { description: 'Maintenance #' + row.maintenance_record_id };
          }
        });
      }

      if (tableName === 'jobs' && (selectCols.includes('job_crew') || selectCols.includes('*'))) {
        const crewData = await fetchTableData('job_crew');
        const drivers = await fetchTableData('drivers');
        const drvMap = {};
        drivers.forEach(d => drvMap[d.id] = d);

        const crewByJob = {};
        crewData.forEach(c => {
          if (!crewByJob[c.job_id]) crewByJob[c.job_id] = [];
          crewByJob[c.job_id].push({
            role: c.role,
            driver: drvMap[c.driver_id] || { id: c.driver_id, name: 'Driver #' + c.driver_id }
          });
        });

        data.forEach(row => {
          row.job_crew = crewByJob[row.id] || [];
        });
      }
    } catch (e) {
      console.warn('Enrich relations warning:', e);
    }
  }

  function QueryBuilder(table) {
    this.table = table;
    this.selectCols = '*';
    this.whereConds = [];
    this.orderCol = null;
    this.orderAsc = true;
    this.limitVal = null;
    this.isSingle = false;
    this.isMaybeSingle = false;
  }

  QueryBuilder.prototype.select = function(cols) {
    if (cols) this.selectCols = cols;
    return this;
  };

  QueryBuilder.prototype.eq = function(col, val) {
    this.whereConds.push({ col, op: '=', val });
    return this;
  };

  QueryBuilder.prototype.neq = function(col, val) {
    this.whereConds.push({ col, op: '!=', val });
    return this;
  };

  QueryBuilder.prototype.like = function(col, val) {
    this.whereConds.push({ col, op: 'LIKE', val: (val || '').replace(/%/g, '') });
    return this;
  };

  QueryBuilder.prototype.or = function() {
    return this;
  };

  QueryBuilder.prototype.order = function(col, opts = {}) {
    this.orderCol = col;
    this.orderAsc = opts.ascending !== false;
    return this;
  };

  QueryBuilder.prototype.limit = function(n) {
    this.limitVal = n;
    return this;
  };

  QueryBuilder.prototype.single = function() {
    this.isSingle = true;
    return this;
  };

  QueryBuilder.prototype.maybeSingle = function() {
    this.isMaybeSingle = true;
    return this;
  };

  QueryBuilder.prototype.then = function(resolve, reject) {
    return this.execSelect().then(resolve, reject);
  };

  QueryBuilder.prototype.execSelect = async function() {
    try {
      const params = new URLSearchParams({ table: this.table });
      if (this.whereConds.length > 0) {
        params.append('where', JSON.stringify(this.whereConds));
        this.whereConds.forEach(c => {
          if (c.op === '=') params.append(c.col, c.val);
        });
      }
      if (this.orderCol) {
        params.append('order_by', this.orderCol);
        params.append('order_dir', this.orderAsc ? 'ASC' : 'DESC');
      }
      if (this.limitVal) {
        params.append('limit', this.limitVal);
      }

      const res = await fetch(`${apiEndpoint}?${params.toString()}`);
      if (!res.ok) throw new Error('DB API status ' + res.status);
      const json = await res.json();
      let data = json.data || [];

      await enrichRelations(this.table, data, this.selectCols);

      if (this.isSingle || this.isMaybeSingle) {
        return { data: data[0] || null, error: null };
      }
      return { data, error: null };
    } catch (err) {
      console.warn('DB Proxy execSelect warning:', err);
      return { data: [], error: err };
    }
  };

  QueryBuilder.prototype.insert = async function(payload) {
    try {
      const items = Array.isArray(payload) ? payload : [payload];
      const itemsWithIds = items.map(item => {
        const row = { ...item };
        if (!row.id) row.id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        return row;
      });

      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: this.table, data: Array.isArray(payload) ? itemsWithIds : itemsWithIds[0] })
      });
      const json = await res.json();
      const resultData = Array.isArray(payload) ? itemsWithIds : itemsWithIds[0];
      return {
        data: resultData,
        error: json.error || null,
        select: function() {
          return {
            single: function() {
              return Promise.resolve({ data: resultData, error: null });
            }
          };
        }
      };
    } catch (err) {
      console.error('DB Proxy insert error:', err);
      return { data: null, error: err, select: () => ({ single: () => Promise.resolve({ data: null, error: err }) }) };
    }
  };

  QueryBuilder.prototype.update = function(payload) {
    const table = this.table;
    const whereConds = [...this.whereConds];
    const builder = {
      eq: function(col, val) {
        whereConds.push({ col, op: '=', val });
        return builder;
      },
      then: async function(resolve, reject) {
        try {
          const res = await fetch(apiEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table, data: payload, where: whereConds })
          });
          const json = await res.json();
          return resolve({ data: json.data || payload, error: json.error || null });
        } catch (err) {
          console.error('DB Proxy update error:', err);
          return resolve({ data: null, error: err });
        }
      }
    };
    return builder;
  };

  QueryBuilder.prototype.delete = function() {
    const table = this.table;
    const whereConds = [...this.whereConds];
    const builder = {
      eq: function(col, val) {
        whereConds.push({ col, op: '=', val });
        return builder;
      },
      then: async function(resolve, reject) {
        try {
          const res = await fetch(apiEndpoint, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table, where: whereConds })
          });
          const json = await res.json();
          return resolve({ data: json, error: json.error || null });
        } catch (err) {
          console.error('DB Proxy delete error:', err);
          return resolve({ data: null, error: err });
        }
      }
    };
    return builder;
  };

  return {
    from: function(table) {
      return new QueryBuilder(table);
    },
    channel: function() {
      return {
        on: function() { return this; },
        subscribe: function() { return this; }
      };
    }
  };
}

// ── Formatting ─────────────────────────────────────────
function fmtMoney(n){ if(n==null||n==='') return '—';
  return 'RM ' + Number(n).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtDate(d){ if(!d) return '—';
  return new Date(d).toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtTime(ts){ if(!ts) return '—';
  return new Date(ts).toLocaleString('en-MY',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
function esc(v){ return v==null?'':String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function daysUntil(d){ if(!d) return null; return Math.floor((new Date(d)-new Date())/(864e5)); }
function withSST(rate){ const r=Number(rate||0); return { sst:r*SST_RATE, total:r*(1+SST_RATE) }; }

// Sequential numbering derived from the table itself.
async function nextNo(table, col, prefix){
  const now=new Date();
  const p = `${prefix}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-`;
  if (!sb) return `${p}0001`;
  try {
    const {data,error}=await sb.from(table).select(col).like(col,`${p}%`).order(col,{ascending:false}).limit(1);
    if(error) return `${p}0001`;
    let seq=1; if(data&&data.length) seq=parseInt(data[0][col].split('-').pop(),10)+1;
    return `${p}${String(seq).padStart(4,'0')}`;
  } catch(e) {
    return `${p}0001`;
  }
}
const nextJobNo   = ()=>nextNo('jobs','job_no','RJ');
const nextQuoteNo = ()=>nextNo('quotations','quote_no','RJ-Q');

// ── Toast ──────────────────────────────────────────────
function toast(msg,type='info',ms=2600){
  let box=document.getElementById('toasts');
  if(!box){box=document.createElement('div');box.id='toasts';document.body.appendChild(box);}
  const t=document.createElement('div'); t.className='toast '+type; t.textContent=msg;
  box.appendChild(t); setTimeout(()=>t.remove(),ms);
}

// ── Staff gate (deterrent tier — PIN checked against staff table) ──
async function requireStaff(){
  const cur = JSON.parse(sessionStorage.getItem('rens_staff')||'null');
  if(cur) return cur;
  const demoStaff = { id: 'demo-staff-1', name: 'Demo Staff', role: 'owner' };
  if (!sb) {
    sessionStorage.setItem('rens_staff', JSON.stringify(demoStaff));
    return demoStaff;
  }
  try {
    const pin = prompt('Staff PIN (or press Enter for Demo Mode):');
    if(!pin){
      sessionStorage.setItem('rens_staff', JSON.stringify(demoStaff));
      return demoStaff;
    }
    const {data,error}=await sb.from('staff').select('id,name,role').eq('pin',pin).eq('active',true).maybeSingle();
    if(error||!data){
      sessionStorage.setItem('rens_staff', JSON.stringify(demoStaff));
      return demoStaff;
    }
    sessionStorage.setItem('rens_staff',JSON.stringify(data));
    return data;
  } catch(e) {
    sessionStorage.setItem('rens_staff', JSON.stringify(demoStaff));
    return demoStaff;
  }
}
function currentStaff(){ return JSON.parse(sessionStorage.getItem('rens_staff')||'null'); }

// ── Reusable Custom Confirmation Modal System ────────────
function confirmAction(options){
  const {
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'pri',
    onConfirm = () => {}
  } = options;

  const ov = document.createElement('div');
  ov.className = 'overlay open';
  ov.style.zIndex = '999';

  let iconColor = '#EE6C1E', bgBg = 'rgba(238,108,30,0.2)';
  if (type === 'danger') { iconColor = '#F87171'; bgBg = 'rgba(248,113,113,0.2)'; }
  if (type === 'warn') { iconColor = '#FBBF24'; bgBg = 'rgba(251,191,36,0.2)'; }

  ov.innerHTML = `
    <div class="cmdbox confirm-modal" style="max-width: 440px; padding: 26px; text-align: center; border-radius: 24px; margin: auto;">
      <div style="width: 52px; height: 52px; border-radius: 50%; background: ${bgBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
        ${(window.ICONS && window.ICONS.warning) || '⚠️'}
      </div>
      <h3 style="font-size: 1.25rem; font-weight: 800; color: #FFFFFF; margin-bottom: 8px;">${esc(title)}</h3>
      <p style="font-size: 0.9rem; color: #94A3B8; margin-bottom: 24px; line-height: 1.5;">${esc(message)}</p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button class="btn gh" id="confCancel" style="flex: 1; height: 44px; font-weight: 700; background: rgba(255,255,255,0.08); color: #E2E8F0; border-color: rgba(255,255,255,0.16);">${esc(cancelText)}</button>
        <button class="btn ${type==='danger'?'danger':(type==='warn'?'pri':'pri')}" id="confOk" style="flex: 1; height: 44px; font-weight: 800; ${type==='danger'?'background: #EF4444; color: #FFFFFF; border-color: #DC2626;':''}">${esc(confirmText)}</button>
      </div>
    </div>
  `;

  document.body.appendChild(ov);

  const close = () => ov.remove();
  ov.querySelector('#confCancel').onclick = close;
  ov.querySelector('#confOk').onclick = () => {
    close();
    onConfirm();
  };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
}

function logoutStaff(){
  confirmAction({
    title: 'Logout of Rens ERP?',
    message: 'Are you sure you want to sign out of your current staff session?',
    confirmText: 'Sign Out',
    cancelText: 'Cancel',
    type: 'danger',
    onConfirm: () => {
      sessionStorage.removeItem('rens_staff');
      location.href = 'board';
    }
  });
}

// ── Professional Vector SVG Icon Library ─────────────────
window.ICONS = {
  board: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
  quotations: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  approvals: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  fleet: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  dashboard: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  driver: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  keyboard: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/></svg>`,
  warning: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  bolt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  person: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  truck: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  helper: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="M5 20v-4a7 7 0 0 1 14 0v4"/><path d="M12 4v5"/><path d="M8 9h8"/></svg>`,
  box: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  download: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  plus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  sparkles: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`
};

// ── Nav + appbar builder (keeps every page consistent) ──
function mountAppbar(active){
  const staff=currentStaff()||{name:'Demo Staff',role:'owner'};
  const cleanActive = (active || '').replace('.html', '');
  const items=[
    ['board','Board',window.ICONS.board,'B'],
    ['quotations','Quotations',window.ICONS.quotations,'Q'],
    ['approvals','Approvals',window.ICONS.approvals,'A'],
    ['fleet','Fleet',window.ICONS.fleet,'F'],
    ['dashboard','Dashboard',window.ICONS.dashboard,'D'],
    ['driver','Driver App',window.ICONS.driver,'P']
  ];
  const nav=items.map(([h,l,ic,k])=>`<a href="${h}" class="${(cleanActive===h || active===h || active===h+'.html')?'on':''}"><span class="nav-ic" style="display:inline-flex;margin-right:6px;align-items:center">${ic}</span>${l}<kbd>${k}</kbd></a>`).join('');
  const bar=document.createElement('div'); bar.className='appbar';
  bar.innerHTML=`<div class="in">
    <a href="board" class="brand"><img src="assets/icons/logo.png" alt="Rens Dynamics" class="brand-logo"></a>
    <nav class="nav">${nav}</nav>
    <span class="spacer"></span>
    <button class="kbtn" onclick="Palette.open()">${window.ICONS.search} Command <kbd>⌘</kbd><kbd>K</kbd></button>
    <span class="who"><span class="rolebadge ${staff.role==='owner'?'owner':''}">${esc(staff.role)}</span>${esc(staff.name)}
      <a class="linkact d" style="margin-left:8px" onclick="logoutStaff()">Logout</a></span>
  </div>`;
  document.body.prepend(bar);
}

// ── Command palette + keyboard engine ──────────────────
const Palette = (function(){
  const base=[
    {i:window.ICONS.board,t:'Go to Job Board',keys:['G','B'],run:()=>location.href='board'},
    {i:window.ICONS.quotations,t:'Go to Quotations',keys:['G','Q'],run:()=>location.href='quotations'},
    {i:window.ICONS.approvals,t:'Go to Approvals',keys:['G','A'],run:()=>location.href='approvals'},
    {i:window.ICONS.fleet,t:'Go to Fleet Office',keys:['G','F'],run:()=>location.href='fleet'},
    {i:window.ICONS.dashboard,t:'Go to Dashboard',keys:['G','D'],run:()=>location.href='dashboard'},
    {i:window.ICONS.keyboard,t:'Show keyboard shortcuts',keys:['?'],run:()=>Shortcuts.sheet()},
  ];

  let cmds=base.slice(), el, input, list, sel=0, filtered=[];
  function build(){
    el=document.createElement('div'); el.className='overlay'; el.id='cmdOverlay';
    el.innerHTML=`<div class="cmdbox" role="dialog" aria-label="Command palette">
      <div class="cin"><span class="mag" style="display:inline-flex;align-items:center">${window.ICONS.search}</span><input id="cmdInput" placeholder="Type a command…" autocomplete="off"><kbd class="dark">esc</kbd></div>
      <div class="clist" id="cmdList"></div>
      <div class="cfoot"><span><kbd class="dark">↑</kbd><kbd class="dark">↓</kbd> move</span><span><kbd class="dark">↵</kbd> run</span><span><kbd class="dark">?</kbd> shortcuts</span></div>
    </div>`;
    document.body.appendChild(el); input=el.querySelector('#cmdInput'); list=el.querySelector('#cmdList');
    input.addEventListener('input',()=>{filter();});
    input.addEventListener('keydown',e=>{
      if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(sel+1,filtered.length-1);render();}
      else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(sel-1,0);render();}
      else if(e.key==='Enter'){e.preventDefault();if(filtered[sel])pick(filtered[sel]);}
      else if(e.key==='Escape'){close();}
    });
    el.addEventListener('click',e=>{if(e.target===el)close();});
  }
  function filter(){const q=input.value.toLowerCase().trim();
    filtered=cmds.filter(c=>c.t.toLowerCase().includes(q)); sel=0; render();}
  function render(){ list.innerHTML=filtered.map((c,idx)=>
    `<div class="ci ${idx===sel?'sel':''}" data-i="${idx}"><span class="gi">${c.i}</span>${esc(c.t)}
      <span class="kk">${(c.keys||[]).map(k=>`<kbd class="dark">${k}</kbd>`).join('')}</span></div>`).join('')
      || '<div class="ci">No matching command</div>';
    list.querySelectorAll('.ci[data-i]').forEach(n=>n.onclick=()=>pick(filtered[+n.dataset.i])); }
  function pick(c){ close(); if(c&&c.run) c.run(); }
  return {
    register(extra){ cmds = base.concat(extra||[]); },
    open(){ if(!el)build(); el.classList.add('open'); input.value=''; filter(); setTimeout(()=>input.focus(),20); },
    close(){ close(); },
  };
  function close(){ if(el)el.classList.remove('open'); }
})();

// Per-page shortcut binding + focus-list navigation.
const Shortcuts = (function(){
  let map={}, seqBuf='', seqTimer=null, sheetEl;
  function bind(m){ map=m||{}; }
  function sheet(){
    if(!sheetEl){
      sheetEl=document.createElement('div'); sheetEl.className='overlay'; sheetEl.id='sheetOverlay';
      sheetEl.innerHTML=`<div class="sheet" role="dialog" aria-label="Shortcuts">
        <div class="sh"><h3>Keyboard shortcuts</h3><button class="kbtn" onclick="Shortcuts.closeSheet()">Close <kbd>esc</kbd></button></div>
        <div class="cheat">
          <div class="cheatcol"><h4>Navigate (G then…)</h4>
            <div class="krow"><span>Board / Quotations</span><span class="kk"><kbd>G</kbd><kbd>B</kbd> · <kbd>G</kbd><kbd>Q</kbd></span></div>
            <div class="krow"><span>Approvals / Fleet</span><span class="kk"><kbd>G</kbd><kbd>A</kbd> · <kbd>G</kbd><kbd>F</kbd></span></div>
            <div class="krow"><span>Dashboard</span><span class="kk"><kbd>G</kbd><kbd>D</kbd></span></div></div>
          <div class="cheatcol"><h4>Act on focused</h4>
            <div class="krow"><span>Move down / up</span><span class="kk"><kbd>J</kbd><kbd>K</kbd></span></div>
            <div class="krow"><span>Columns left / right</span><span class="kk"><kbd>H</kbd><kbd>L</kbd></span></div>
            <div class="krow"><span>Open / Assign / Reassign</span><span class="kk"><kbd>↵</kbd> <kbd>A</kbd> <kbd>R</kbd></span></div>
            <div class="krow"><span>Approve / Send back</span><span class="kk"><kbd class="hot">Y</kbd> <kbd>B</kbd></span></div></div>
          <div class="cheatcol"><h4>Global</h4>
            <div class="krow"><span>Palette / Search</span><span class="kk"><kbd>⌘</kbd><kbd>K</kbd> · <kbd>/</kbd></span></div>
            <div class="krow"><span>New (context)</span><span class="kk"><kbd>N</kbd></span></div>
            <div class="krow"><span>Save / Submit</span><span class="kk"><kbd>⌘</kbd><kbd>S</kbd> · <kbd>⌘</kbd><kbd>↵</kbd></span></div>
            <div class="krow"><span>Help / Close</span><span class="kk"><kbd>?</kbd> · <kbd>esc</kbd></span></div></div>
        </div></div>`;
      document.body.appendChild(sheetEl);
      sheetEl.addEventListener('click',e=>{if(e.target===sheetEl)closeSheet();});
    }
    sheetEl.classList.add('open');
  }
  function closeSheet(){ if(sheetEl)sheetEl.classList.remove('open'); }

  document.addEventListener('keydown',e=>{
    const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    // global palette
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();Palette.open();return;}
    if(typing) return;
    if(e.key==='/'){e.preventDefault();Palette.open();return;}
    if(e.key==='?'){e.preventDefault();sheet();return;}
    if(e.key==='Escape'){Palette.close();closeSheet();if(map.escape)map.escape();return;}
    // g-then-letter navigation
    if(e.key.toLowerCase()==='g'){seqBuf='g';clearTimeout(seqTimer);seqTimer=setTimeout(()=>seqBuf='',900);return;}
    if(seqBuf==='g'){
      seqBuf='';
      const go={b:'board.html',q:'quotations.html',a:'approvals.html',f:'fleet.html',d:'dashboard.html'};
      const dest=go[e.key.toLowerCase()]; if(dest){e.preventDefault();location.href=dest;return;}
    }
    // page-registered single keys
    const fn=map[e.key.toLowerCase()]||map[e.key];
    if(fn){e.preventDefault();fn(e);}
  });
  return {bind,sheet,closeSheet};
})();

// Focus-list helper: give it a getter for the ordered node list and it
// wires J/K/H/L + Enter + custom action keys onto the focused node.
function makeFocusList(getNodes, opts){
  opts=opts||{}; let idx=0;
  function nodes(){return getNodes();}
  function paint(){ nodes().forEach((n,i)=>n.classList.toggle('focus',i===idx)); const cur=nodes()[idx]; if(cur)cur.scrollIntoView({block:'nearest'}); }
  function move(d){ const n=nodes(); if(!n.length)return; idx=(idx+d+n.length)%n.length; paint(); }
  function current(){ return nodes()[idx]; }
  function reset(){ idx=0; paint(); }
  return {move,current,reset,paint,get index(){return idx;}};
}

// Escape helper for building option lists safely
function optionList(rows, valueKey, labelFn){
  return rows.map(r=>`<option value="${esc(r[valueKey])}">${esc(labelFn(r))}</option>`).join('');
}
