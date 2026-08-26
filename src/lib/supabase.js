/* Rens Dynamics ERP — Local & MySQL DB Proxy Layer */
export const SST_RATE = 0.06;

let currentDbStatus = {
  connected: false,
  checked: false,
  error: null,
  details: null,
};

const statusListeners = new Set();

export function subscribeDbStatus(listener) {
  statusListeners.add(listener);
  listener(currentDbStatus);
  return () => statusListeners.delete(listener);
}

export function getDbStatus() {
  return currentDbStatus;
}

function updateDbStatus(newStatus) {
  currentDbStatus = { ...currentDbStatus, ...newStatus, checked: true };
  statusListeners.forEach((fn) => {
    try { fn(currentDbStatus); } catch {}
  });
}

// ── Local Event Bus for Reactivity ─────────────────────
const tableListeners = new Map();

export function subscribeTable(table, listener) {
  if (!tableListeners.has(table)) tableListeners.set(table, new Set());
  tableListeners.get(table).add(listener);
  return () => tableListeners.get(table)?.delete(listener);
}

function notifyTableChange(table) {
  const listeners = tableListeners.get(table);
  if (listeners) listeners.forEach(fn => { try { fn(); } catch {} });
  try {
    window.dispatchEvent(new CustomEvent('rens_db_change', { detail: { table } }));
  } catch {}
}

const ALL_TABLES = [
  'jobs', 'customers', 'lorries', 'drivers', 'quotations', 
  'approvals', 'inventory_items', 'inventory_issuances', 
  'inventory_receipts', 'maintenance_records', 'staff', 
  'lorry_crew', 'job_crew', 'customer_rates', 'customer_price_lists', 'sales_invoices',
  'customer_contacts'
];

export const DEMO_SEED_DATA = {
  customers: [],
  quotations: [],
  drivers: [],
  lorries: [],
  lorry_crew: [],
  customer_contacts: [],
  customer_rates: [],
  customer_price_lists: [],
  jobs: [],
  job_crew: [],
  maintenance_records: [],
  inventory_items: [],
  inventory_receipts: [],
  inventory_issuances: [],
  approvals: [],
  sales_invoices: [],
  staff: [
    {
      id: 'staff-owner-1',
      name: 'Rens Admin',
      username: 'Dynamic',
      role: 'owner',
      pin: '12345',
      active: 1
    },
    {
      id: 'staff-admin-1',
      name: 'Logistics Operations',
      username: 'Admin',
      role: 'admin',
      pin: '12345',
      active: 1
    }
  ]
};

// Automatic cleanup of legacy demo & mock data from localStorage
try {
  if (typeof window !== 'undefined' && localStorage.getItem('rens_clean_production_mode_v3') !== 'true') {
    const demoTables = [
      'customers', 'quotations', 'drivers', 'lorries', 'lorry_crew',
      'jobs', 'job_crew', 'customer_contacts', 'customer_rates',
      'customer_price_lists', 'sales_invoices', 'inventory_items',
      'inventory_issuances', 'inventory_receipts', 'maintenance_records', 'approvals'
    ];
    demoTables.forEach(table => {
      const stored = localStorage.getItem('rens_db_' + table);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const hasDemo = parsed.some(item => {
              const id = String(item.id || '');
              const plate = String(item.plate_no || '');
              const lorryId = String(item.lorry_id || '');
              return id.startsWith('cust-') || id.startsWith('qt-') || id.startsWith('quo-') ||
                     id.startsWith('drv-') || id.startsWith('lry-') || id.startsWith('lorry-') ||
                     id.startsWith('lc-') || id.startsWith('job-') || id.startsWith('cpl-') ||
                     id.startsWith('inv-') || id.startsWith('cc-') || id.startsWith('contact-') ||
                     id.startsWith('maint-') || id.startsWith('item-') || id.startsWith('rec-') ||
                     id.startsWith('iss-') || id.startsWith('app-') || plate.includes('lorry-001') ||
                     lorryId.includes('lorry-001');
            });
            if (hasDemo) {
              localStorage.setItem('rens_db_' + table, '[]');
            }
          }
        } catch (_) {}
      }
    });
    localStorage.removeItem('rens_fleet_sales_records_v10');
    localStorage.removeItem('rens_fleet_sales_records');
    localStorage.removeItem('rens_expenses_records');
    localStorage.removeItem('rens_demo_seed_v15');
    localStorage.removeItem('rens_demo_seed_v14');
    localStorage.removeItem('rens_demo_seed_v10');
    localStorage.setItem('rens_clean_production_mode_v3', 'true');

    // Trigger server cleanup to wipe demo records from MySQL
    try {
      fetch('/api/db.php?action=clear_all_data').catch(() => {});
      fetch('http://localhost:8080/api/db.php?action=clear_all_data').catch(() => {});
    } catch (_) {}
  }
} catch (_) {}

export async function clearCustomerContactsData() {
  try {
    localStorage.setItem('rens_db_customer_contacts', '[]');
    notifyTableChange('customer_contacts');
    try {
      if (sb) await sb.from('customer_contacts').delete();
    } catch (_) {}
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function clearFleetData() {
  try {
    const fleetTables = ['lorries', 'drivers', 'maintenance_records', 'inventory_items', 'inventory_issuances', 'inventory_receipts', 'lorry_crew'];
    fleetTables.forEach(table => {
      localStorage.setItem('rens_db_' + table, '[]');
      notifyTableChange(table);
    });

    try {
      for (const table of fleetTables) {
        await sb.from(table).delete();
      }
    } catch (_) {}

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function seedFleetDemoData() {
  try {
    const fleetTables = ['lorries', 'drivers', 'lorry_crew', 'maintenance_records', 'inventory_items', 'inventory_receipts', 'inventory_issuances'];
    fleetTables.forEach(table => {
      if (DEMO_SEED_DATA[table]) {
        saveLocalTableData(table, DEMO_SEED_DATA[table]);
        notifyTableChange(table);
      }
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function seedAllDemoData() {
  try {
    // 1. Populate local storage with all 10 demo records per module
    Object.entries(DEMO_SEED_DATA).forEach(([table, data]) => {
      saveLocalTableData(table, data);
      notifyTableChange(table);
    });

    // 2. Trigger backend MySQL database seed endpoint if available
    try {
      const endpoints = ['/api/db.js?action=seed_demo', '/api/db.php?action=seed_demo', 'api/db.js?action=seed_demo'];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep);
          if (res.ok) break;
        } catch (_) {}
      }
    } catch (_) {}

    return { success: true };
  } catch (e) {
    console.error('Error seeding demo data:', e);
    return { success: false, error: e.message };
  }
}

export async function clearDatabaseData() {
  try {
    // 1. Clear local storage cache for all tables
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('rens_db_')) {
        localStorage.setItem(key, '[]');
      }
    });
    localStorage.removeItem('rens_driver');
    localStorage.removeItem('rens_driver_phone');
    localStorage.removeItem('rens_fleet_sales_records_v10');

    // 2. Call backend DB clear endpoint
    try {
      const endpoints = ['/api/db.php?action=clear_all_data', '/api/db.js?action=clear_all_data', 'api/db.php?action=clear_all_data'];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep);
          if (res.ok) break;
        } catch (_) {}
      }
    } catch (_) {}

    // 3. Notify all table listeners
    ALL_TABLES.forEach(table => notifyTableChange(table));
    return { success: true };
  } catch (e) {
    console.error('Error clearing data:', e);
    return { success: false, error: e.message };
  }
}

export function clearAllDemoData() {
  clearDatabaseData();
}

export const clearAllData = clearDatabaseData;


// ── In-Memory Fast Cache & In-Flight Request Coalescing ─────────────────────
const memoryTableCache = new Map();
const inFlightTableFetches = new Map();
const tableFetchTimestamps = new Map();
const CACHE_TTL_MS = 15000; // 15 seconds fresh cache TTL

function mergeWithDemo(tableName, data) {
  return Array.isArray(data) ? data : [];
}


export function getLocalTableData(tableName) {
  if (memoryTableCache.has(tableName)) {
    const mem = memoryTableCache.get(tableName);
    if (tableName === 'staff' && (!mem || mem.length === 0)) {
      return DEMO_SEED_DATA.staff;
    }
    return mem;
  }
  try {
    const stored = localStorage.getItem('rens_db_' + tableName);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        if (tableName === 'staff' && parsed.length === 0) {
          memoryTableCache.set(tableName, DEMO_SEED_DATA.staff);
          return DEMO_SEED_DATA.staff;
        }
        memoryTableCache.set(tableName, parsed);
        return parsed;
      }
    }
  } catch (e) {}
  const fallback = DEMO_SEED_DATA[tableName] || [];
  memoryTableCache.set(tableName, fallback);
  return fallback;
}

export function saveLocalTableData(tableName, data) {
  try {
    memoryTableCache.set(tableName, data);
    tableFetchTimestamps.set(tableName, Date.now());
    localStorage.setItem('rens_db_' + tableName, JSON.stringify(data));
  } catch (e) {}
}

export function getStorageData(tableName) {
  return getLocalTableData(tableName);
}

function createDbProxyClient() {
  let activeApiEndpoint = '/api/db.php';

  async function apiFetch(queryStringOrPath = '', options = {}) {
    let url = '';
    if (queryStringOrPath.startsWith('?')) {
      url = `${activeApiEndpoint}${queryStringOrPath}`;
    } else if (queryStringOrPath.startsWith('/')) {
      url = queryStringOrPath;
    } else if (queryStringOrPath) {
      url = `${activeApiEndpoint}?${queryStringOrPath}`;
    } else {
      url = activeApiEndpoint;
    }

    try {
      const res = await fetch(url, options);
      const ct = res.headers.get('content-type') || '';
      // If endpoint returns non-JSON or 404, auto-try the alternate endpoint (.js <-> .php)
      if (!res.ok || !ct.includes('application/json')) {
        const altEndpoint = activeApiEndpoint.endsWith('.php') ? '/api/db.js' : '/api/db.php';
        const altUrl = url.replace(activeApiEndpoint, altEndpoint);
        const altRes = await fetch(altUrl, options);
        const altCt = altRes.headers.get('content-type') || '';
        if (altRes.ok && altCt.includes('application/json')) {
          activeApiEndpoint = altEndpoint;
          return altRes;
        }
      }
      return res;
    } catch (err) {
      const altEndpoint = activeApiEndpoint.endsWith('.php') ? '/api/db.js' : '/api/db.php';
      const altUrl = url.replace(activeApiEndpoint, altEndpoint);
      try {
        const altRes = await fetch(altUrl, options);
        if (altRes.ok) {
          activeApiEndpoint = altEndpoint;
          return altRes;
        }
      } catch (_) {}
      throw err;
    }
  }

  // Check DB status on startup
  apiFetch('?table=status')
    .then(r => r.json())
    .then(json => {
      if (json.connected) {
        updateDbStatus({ connected: true, error: null, details: null });
      } else {
        updateDbStatus({ connected: false, error: json.error || 'MySQL Connection Error', details: json.details });
      }
    })
    .catch(err => {
      updateDbStatus({ connected: false, error: err.message, details: 'Database offline' });
    });

  async function fetchTableData(tableName, force = false) {
    // 1. Return freshly cached data if within TTL and not forced
    const lastFetch = tableFetchTimestamps.get(tableName) || 0;
    if (!force && memoryTableCache.has(tableName) && (Date.now() - lastFetch < CACHE_TTL_MS)) {
      return memoryTableCache.get(tableName);
    }

    // 2. Return active in-flight fetch promise if already requesting
    if (inFlightTableFetches.has(tableName)) {
      return inFlightTableFetches.get(tableName);
    }

    // 3. Initiate single network fetch
    const fetchPromise = (async () => {
      try {
        const res = await apiFetch(`?table=${tableName}`);
        if (!res.ok) throw new Error('HTTP Error ' + res.status);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        updateDbStatus({ connected: true, error: null });
        const serverData = json.data || [];
        const merged = mergeWithDemo(tableName, serverData);
        saveLocalTableData(tableName, merged);
        return merged;
      } catch (e) {
        return getLocalTableData(tableName);
      } finally {
        inFlightTableFetches.delete(tableName);
      }
    })();

    inFlightTableFetches.set(tableName, fetchPromise);
    return fetchPromise;
  }

  async function enrichRelations(tableName, data, selectCols) {
    if (!data || !data.length || !selectCols) return;
    try {
      const needCustomers = selectCols.includes('customer') || (data[0] && data[0].customer_id !== undefined);
      const needLorries = selectCols.includes('lorry') || (data[0] && data[0].lorry_id !== undefined);
      const needDrivers = selectCols.includes('driver') || (data[0] && (data[0].driver_id !== undefined || data[0].default_driver_id !== undefined));
      const needItems = selectCols.includes('item') || (data[0] && data[0].item_id !== undefined);
      const needMaints = selectCols.includes('maint') || (data[0] && data[0].maintenance_record_id !== undefined);
      const needCrew = tableName === 'jobs' && (selectCols.includes('job_crew') || selectCols.includes('*'));

      // Fetch all needed relations in parallel with cached deduplication
      const [customers, lorries, drivers, items, maints, crewData] = await Promise.all([
        needCustomers ? fetchTableData('customers') : Promise.resolve(getLocalTableData('customers')),
        needLorries ? fetchTableData('lorries') : Promise.resolve(getLocalTableData('lorries')),
        (needDrivers || needCrew) ? fetchTableData('drivers') : Promise.resolve(getLocalTableData('drivers')),
        needItems ? fetchTableData('inventory_items') : Promise.resolve(getLocalTableData('inventory_items')),
        needMaints ? fetchTableData('maintenance_records') : Promise.resolve(getLocalTableData('maintenance_records')),
        needCrew ? fetchTableData('job_crew') : Promise.resolve(getLocalTableData('job_crew'))
      ]);

      if (needCustomers) {
        const custMap = {};
        (customers || []).forEach(c => custMap[c.id] = c);
        data.forEach(row => {
          if (row.customer_id && custMap[row.customer_id]) {
            row.customer = custMap[row.customer_id];
          }
        });
      }

      if (needLorries) {
        const lorryMap = {};
        (lorries || []).forEach(l => lorryMap[l.id] = l);
        data.forEach(row => {
          if (row.lorry_id && lorryMap[row.lorry_id]) {
            row.lorry = lorryMap[row.lorry_id];
          }
        });
      }

      if (needDrivers || needCrew) {
        const drvMap = {};
        (drivers || []).forEach(d => drvMap[d.id] = d);
        data.forEach(row => {
          if (row.driver_id && drvMap[row.driver_id]) {
            row.driver = drvMap[row.driver_id];
          } else if (row.default_driver_id && drvMap[row.default_driver_id]) {
            row.driver = drvMap[row.default_driver_id];
          }
        });

        if (needCrew && Array.isArray(crewData)) {
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
      }

      if (needItems) {
        const itemMap = {};
        (items || []).forEach(i => itemMap[i.id] = i);
        data.forEach(row => {
          if (row.item_id && !row.item) {
            row.item = itemMap[row.item_id] || { name: 'Item #' + row.item_id };
          }
        });
      }

      if (needMaints) {
        const maintMap = {};
        (maints || []).forEach(m => maintMap[m.id] = m);
        data.forEach(row => {
          if (row.maintenance_record_id && !row.maint) {
            row.maint = maintMap[row.maintenance_record_id] || { description: 'Maintenance #' + row.maintenance_record_id };
          }
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

  QueryBuilder.prototype.select = function (cols) {
    if (cols) this.selectCols = cols;
    return this;
  };

  QueryBuilder.prototype.eq = function (col, val) {
    this.whereConds.push({ col, op: '=', val });
    return this;
  };

  QueryBuilder.prototype.neq = function (col, val) {
    this.whereConds.push({ col, op: '!=', val });
    return this;
  };

  QueryBuilder.prototype.like = function (col, val) {
    this.whereConds.push({ col, op: 'LIKE', val: (val || '').replace(/%/g, '') });
    return this;
  };

  QueryBuilder.prototype.or = function () {
    return this;
  };

  QueryBuilder.prototype.order = function (col, opts = {}) {
    this.orderCol = col;
    this.orderAsc = opts.ascending !== false;
    return this;
  };

  QueryBuilder.prototype.limit = function (n) {
    this.limitVal = n;
    return this;
  };

  QueryBuilder.prototype.single = function () {
    this.isSingle = true;
    return this;
  };

  QueryBuilder.prototype.maybeSingle = function () {
    this.isMaybeSingle = true;
    return this;
  };

  QueryBuilder.prototype.then = function (resolve, reject) {
    return this.execSelect().then(resolve, reject);
  };

  QueryBuilder.prototype.execSelect = async function () {
    let data = [];
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

      const res = await apiFetch(`?${params.toString()}`);
      if (!res.ok) throw new Error('HTTP Error ' + res.status);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw new Error('Invalid response format');
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      updateDbStatus({ connected: true, error: null });
      data = json.data || [];
      if (data.length > 0 && !this.whereConds.length) {
        saveLocalTableData(this.table, data);
      }
    } catch (err) {
      updateDbStatus({ connected: false, error: err.message });
      data = getLocalTableData(this.table);
    }

    if (this.whereConds.length > 0) {
      data = data.filter(row => {
        return this.whereConds.every(cond => {
          if (cond.op === '=') return String(row[cond.col]) === String(cond.val);
          if (cond.op === '!=') return String(row[cond.col]) !== String(cond.val);
          if (cond.op === 'LIKE') return String(row[cond.col] || '').toLowerCase().includes(String(cond.val || '').toLowerCase());
          return true;
        });
      });
    }
    if (this.orderCol) {
      data.sort((a, b) => {
        const valA = a[this.orderCol] ?? '';
        const valB = b[this.orderCol] ?? '';
        if (valA < valB) return this.orderAsc ? -1 : 1;
        if (valA > valB) return this.orderAsc ? 1 : -1;
        return 0;
      });
    }
    if (this.limitVal) {
      data = data.slice(0, this.limitVal);
    }

    await enrichRelations(this.table, data, this.selectCols);

    if (this.isSingle || this.isMaybeSingle) {
      return { data: data[0] || null, error: null };
    }
    return { data, error: null };
  };

  QueryBuilder.prototype.insert = function (payload) {
    const table = this.table;
    let isSingle = false;

    const executeInsert = async () => {
      const items = Array.isArray(payload) ? payload : [payload];
      const itemsWithIds = items.map(item => {
        const row = { ...item };
        if (!row.id) row.id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        return row;
      });

      let serverErr = null;
      try {
        const res = await apiFetch('', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, data: Array.isArray(payload) ? itemsWithIds : itemsWithIds[0] })
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const json = await res.json();
          if (json.error) serverErr = json.error;
          else updateDbStatus({ connected: true, error: null });
        } else {
          serverErr = 'HTTP Error ' + res.status;
        }
      } catch (err) {
        serverErr = err.message;
        updateDbStatus({ connected: false, error: err.message });
      }

      // Always persist to local cache so offline mode re-reads keep the newly inserted rows
      const localData = getLocalTableData(table);
      itemsWithIds.forEach(newRow => {
        const idx = localData.findIndex(x => x.id === newRow.id);
        if (idx >= 0) localData[idx] = { ...localData[idx], ...newRow };
        else localData.unshift(newRow);
      });
      saveLocalTableData(table, localData);

      let resultData = itemsWithIds;
      if (isSingle) {
        resultData = resultData[0] || null;
      }

      notifyTableChange(table);
      return { data: resultData, error: serverErr };
    };

    const builder = {
      select: function () {
        return builder;
      },
      single: function () {
        isSingle = true;
        return builder;
      },
      maybeSingle: function () {
        isSingle = true;
        return builder;
      },
      then: function (resolve, reject) {
        return executeInsert().then(resolve, reject);
      },
      catch: function (reject) {
        return executeInsert().catch(reject);
      }
    };

    return builder;
  };

  QueryBuilder.prototype.update = function (payload) {
    const table = this.table;
    const whereConds = [...this.whereConds];
    const builder = {
      eq: function (col, val) {
        whereConds.push({ col, op: '=', val });
        return builder;
      },
      select: function () {
        return builder;
      },
      single: function () {
        return builder;
      },
      then: async function (resolve, reject) {
        try {
          await apiFetch('', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table, data: payload, where: whereConds })
          });
        } catch (err) {}

        const localData = getLocalTableData(table);
        localData.forEach((row, idx) => {
          const match = whereConds.every(cond => {
            if (cond.op === '=') return String(row[cond.col]) === String(cond.val);
            return true;
          });
          if (match) localData[idx] = { ...row, ...payload };
        });
        saveLocalTableData(table, localData);

        notifyTableChange(table);
        return resolve({ data: payload, error: null });
      }
    };
    return builder;
  };

  QueryBuilder.prototype.delete = function () {
    const table = this.table;
    const whereConds = [...this.whereConds];
    const builder = {
      eq: function (col, val) {
        whereConds.push({ col, op: '=', val });
        return builder;
      },
      neq: function (col, val) {
        whereConds.push({ col, op: '!=', val });
        return builder;
      },
      then: async function (resolve, reject) {
        try {
          await apiFetch('', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              table, 
              where: whereConds, 
              clear_all: whereConds.length === 0 
            })
          });
        } catch (err) {}

        let localData = getLocalTableData(table);
        if (whereConds.length > 0) {
          localData = localData.filter(row => {
            return !whereConds.every(cond => {
              if (cond.op === '=') return String(row[cond.col]) === String(cond.val);
              if (cond.op === '!=') return String(row[cond.col]) !== String(cond.val);
              return false;
            });
          });
        } else {
          localData = [];
        }
        saveLocalTableData(table, localData);

        notifyTableChange(table);
        return resolve({ data: { success: true }, error: null });
      }
    };
    return builder;
  };

  const channelObj = {
    on: function () { return channelObj; },
    subscribe: function () { return channelObj; },
    unsubscribe: function () { return channelObj; }
  };

  return {
    from: function (table) {
      return new QueryBuilder(table);
    },
    channel: function () {
      return channelObj;
    },
    removeChannel: function () {
      return Promise.resolve();
    }
  };
}

export const sb = createDbProxyClient();

// Ensure staff account exists for login
try {
  const existingStaff = localStorage.getItem('rens_db_staff');
  if (!existingStaff || existingStaff === '[]') {
    localStorage.setItem('rens_db_staff', JSON.stringify(DEMO_SEED_DATA.staff));
    saveLocalTableData('staff', DEMO_SEED_DATA.staff);
  }
} catch (_) {}

// ── Formatting ─────────────────────────────────────────
export function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const val = Number(n);
  if (isNaN(val)) return 'RM 0.00';
  return 'RM ' + val.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function esc(v) {
  return v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function daysUntil(d) {
  if (!d) return null;
  return Math.floor((new Date(d) - new Date()) / 864e5);
}

export function withSST(rate) {
  const r = Number(rate || 0);
  return { sst: r * SST_RATE, total: r * (1 + SST_RATE) };
}

export async function nextNo(table, col, prefix) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  if (prefix === 'rensorder' || prefix === 'order') {
    const p = 'rensorder';
    let maxSeq = 0;
    try {
      const localData = JSON.parse(localStorage.getItem('rens_db_' + table) || '[]');
      if (Array.isArray(localData)) {
        localData.forEach(item => {
          const val = item?.[col] || '';
          const match = String(val).match(new RegExp(`^${p}(\\d+)`, 'i'));
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
          }
        });
      }
    } catch (_) {}

    if (sb) {
      try {
        const { data, error } = await sb.from(table).select(col).ilike(col, `${p}%`);
        if (!error && data && data.length) {
          data.forEach(item => {
            const val = item?.[col] || '';
            const match = String(val).match(new RegExp(`^${p}(\\d+)`, 'i'));
            if (match && match[1]) {
              const num = parseInt(match[1], 10);
              if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
          });
        }
      } catch (e) {}
    }

    return `${p}${String(maxSeq + 1).padStart(2, '0')}`;
  }

  if (prefix === 'Rens' || prefix === 'RJ-Q') {
    const p = `Rens${year}${month}`;
    if (!sb) return `${p}01`;
    try {
      const { data, error } = await sb.from(table).select(col + ', is_contract, quote_type, special_instructions').like(col, `${p}%`).order(col, { ascending: false });
      if (error || !data || !data.length) return `${p}01`;
      let maxSeq = 0;
      data.forEach(item => {
        if (isContractQuotation(item)) return;
        const val = item[col] || '';
        const match = String(val).match(new RegExp(`^${p}(\\d+)`, 'i'));
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      });
      return `${p}${String(maxSeq + 1).padStart(2, '0')}`;
    } catch (e) {
      return `${p}01`;
    }
  }

  const p = `${prefix}-${year}${month}-`;
  if (!sb) return `${p}0001`;
  try {
    const { data, error } = await sb.from(table).select(col).like(col, `${p}%`).order(col, { ascending: false }).limit(1);
    if (error) return `${p}0001`;
    let seq = 1;
    if (data && data.length) seq = parseInt(data[0][col].split('-').pop(), 10) + 1;
    return `${p}${String(seq).padStart(4, '0')}`;
  } catch (e) {
    return `${p}0001`;
  }
}

export function jobNoFromQuoteNo(quoteNo) {
  if (!quoteNo) return null;
  const str = String(quoteNo).trim();

  // Format 0: rensorder## -> rensorder##
  const matchRensOrder = str.match(/^rensorder(\d+)/i);
  if (matchRensOrder) {
    const [, seq] = matchRensOrder;
    const num = parseInt(seq, 10);
    return `rensorder${String(isNaN(num) ? 1 : num).padStart(2, '0')}`;
  }

  // Format 0b: RJ-ORDER-#### -> rensorder##
  const matchRjOrder = str.match(/^RJ-ORDER-(\d+)/i);
  if (matchRjOrder) {
    const [, seq] = matchRjOrder;
    const num = parseInt(seq, 10);
    return `rensorder${String(isNaN(num) ? 1 : num).padStart(2, '0')}`;
  }

  // Format 1: RensYYYYMM## (e.g. Rens20260805 -> RJ-202608-0005)
  const matchRens = str.match(/^Rens(\d{4})(\d{2})(\d+)/i);
  if (matchRens) {
    const [, yr, mo, seq] = matchRens;
    return `RJ-${yr}${mo}-${seq.padStart(4, '0')}`;
  }

  // Format 2: RJ-Q-YYYYMM-#### -> RJ-YYYYMM-####
  if (str.startsWith('RJ-Q-')) {
    return str.replace('RJ-Q-', 'RJ-');
  }

  // Format 3: Already RJ-YYYYMM-####
  if (str.startsWith('RJ-')) {
    return str;
  }

  return str;
}

export function normalizeJobNo(no) {
  if (!no) return '';
  return String(no).trim().replace(/^RJ-Q-/i, 'RJ-').replace(/\s+/g, '');
}

export function deduplicateJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];
  
  const mergedMap = new Map();
  const aliasMap = new Map();

  jobs.forEach(rawJob => {
    if (!rawJob) return;
    
    const id = rawJob.id ? String(rawJob.id).trim() : null;
    const jobNo = rawJob.job_no ? normalizeJobNo(rawJob.job_no) : null;
    const quoteNo = rawJob.quote_no ? normalizeJobNo(rawJob.quote_no) : null;
    const quoteId = rawJob.quotation_id ? String(rawJob.quotation_id).trim() : null;
    
    let refQuoteNo = null;
    if (rawJob.customer_ref && typeof rawJob.customer_ref === 'string') {
      const match = rawJob.customer_ref.match(/Quotation\s+([A-Za-z0-9\-\/]+)/i);
      if (match && match[1]) {
        refQuoteNo = normalizeJobNo(match[1]);
      }
    }

    const candidates = [id, jobNo, quoteNo, quoteId, refQuoteNo].filter(Boolean);
    let canonicalKey = null;

    for (const cand of candidates) {
      if (aliasMap.has(cand)) {
        canonicalKey = aliasMap.get(cand);
        break;
      }
    }

    if (!canonicalKey) {
      canonicalKey = id || jobNo || quoteNo || quoteId || `job_${Math.random().toString(36).substring(2, 9)}`;
    }

    candidates.forEach(cand => {
      aliasMap.set(cand, canonicalKey);
    });

    if (!mergedMap.has(canonicalKey)) {
      mergedMap.set(canonicalKey, { ...rawJob });
    } else {
      const existing = mergedMap.get(canonicalKey);
      
      const isExistingAssigned = (existing.status !== 'unassigned' && existing.status !== 'cancelled') || Boolean(existing.lorry_id);
      const isCurrentAssigned = (rawJob.status !== 'unassigned' && rawJob.status !== 'cancelled') || Boolean(rawJob.lorry_id);
      
      const prioritizedStatus = isCurrentAssigned ? rawJob.status : existing.status;
      const prioritizedLorry = rawJob.lorry_id || existing.lorry_id || null;
      const prioritizedDriver = rawJob.driver_id || existing.driver_id || null;
      const prioritizedCrew = (rawJob.job_crew && rawJob.job_crew.length > 0) ? rawJob.job_crew : (existing.job_crew || []);
      
      const bestJobNo = (rawJob.job_no && String(rawJob.job_no).startsWith('RJ-')) ? rawJob.job_no : (existing.job_no || rawJob.job_no || '');
      
      const isCurrentVirtual = String(rawJob.id || '').startsWith('q_job_');
      const isExistingVirtual = String(existing.id || '').startsWith('q_job_');
      const bestId = (!isCurrentVirtual && rawJob.id) ? rawJob.id : (!isExistingVirtual && existing.id ? existing.id : (rawJob.id || existing.id));

      mergedMap.set(canonicalKey, {
        ...existing,
        ...rawJob,
        id: bestId,
        job_no: bestJobNo,
        status: prioritizedStatus,
        lorry_id: prioritizedLorry,
        driver_id: prioritizedDriver,
        job_crew: prioritizedCrew,
        is_approved: (rawJob.is_approved || existing.is_approved || Boolean(rawJob.approved_at) || Boolean(existing.approved_at)) ? 1 : 0,
        approved_at: rawJob.approved_at || existing.approved_at || null,
        is_finalized: (rawJob.is_finalized || existing.is_finalized) ? 1 : 0,
        finalized_at: rawJob.finalized_at || existing.finalized_at || null,
        customer: rawJob.customer || existing.customer,
        customer_id: rawJob.customer_id || existing.customer_id,
        collection_date: rawJob.collection_date || existing.collection_date,
        delivery_date: rawJob.delivery_date || existing.delivery_date,
        pickup_time: rawJob.pickup_time || existing.pickup_time,
        dropoff_time: rawJob.dropoff_time || existing.dropoff_time,
        rate_amount: rawJob.rate_amount ?? existing.rate_amount ?? 0
      });
    }
  });

  return Array.from(mergedMap.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const str = timeStr.trim().toLowerCase();
  const match = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

export function normalizeDateString(d) {
  if (!d) return '';
  if (typeof d !== 'string') return '';
  const trimmed = d.trim();
  const parts = trimmed.split(/[\/\.-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return trimmed;
}

export function checkLorryScheduleConflict(lorry, targetJob, allJobs = []) {
  if (!lorry || !targetJob) return null;

  const lPlate = (lorry.plate_no || '').replace(/\s+/g, '').toUpperCase();
  const lId = String(lorry.id || '');

  const targetJobId = String(targetJob.id || '');
  const targetJobNo = String(targetJob.job_no || '');
  const targetDateNorm = normalizeDateString(targetJob.collection_date || targetJob.order_date);
  const targetPickupMins = parseTimeToMinutes(targetJob.pickup_time);
  const targetDropoffMins = parseTimeToMinutes(targetJob.dropoff_time);

  let jobsList = allJobs;
  if (!Array.isArray(jobsList) || jobsList.length === 0) {
    try {
      const raw = localStorage.getItem('rens_db_jobs');
      if (raw) jobsList = JSON.parse(raw);
    } catch (_) {}
  }

  if (!Array.isArray(jobsList)) return null;

  for (const aj of jobsList) {
    if (!aj || aj.status === 'delivered' || aj.status === 'cancelled' || aj.status === 'unassigned') continue;
    
    if (targetJobId && String(aj.id) === targetJobId) continue;
    if (targetJobNo && String(aj.job_no) === targetJobNo) continue;

    const ajPlate = (aj.plate_no || aj.lorry?.plate_no || '').replace(/\s+/g, '').toUpperCase();
    const ajLorryId = String(aj.lorry_id || '');
    const isThisLorry = (ajLorryId && (ajLorryId === lId || ajLorryId === lPlate)) || (ajPlate && ajPlate === lPlate);
    if (!isThisLorry) continue;

    const ajDateNorm = normalizeDateString(aj.collection_date || aj.order_date);
    const ajPickupMins = parseTimeToMinutes(aj.pickup_time);
    const ajDropoffMins = parseTimeToMinutes(aj.dropoff_time);

    // If both have different specified dates, no conflict
    if (targetDateNorm && ajDateNorm && targetDateNorm !== ajDateNorm) {
      continue;
    }

    // On same date (or date unspecified): check if time is strictly after delivered / dropoff time
    if (targetDateNorm && ajDateNorm && targetDateNorm === ajDateNorm) {
      if (targetPickupMins !== null && ajDropoffMins !== null) {
        // Target trip starts after previous trip drops off
        if (targetPickupMins >= ajDropoffMins) {
          continue;
        }
        // Target trip drops off before next trip starts
        if (targetDropoffMins !== null && ajPickupMins !== null && targetDropoffMins <= ajPickupMins) {
          continue;
        }
      }
    }

    // Otherwise, this lorry is currently assigned / in transit on an overlapping date & timing
    const timingDesc = aj.dropoff_time ? `until ${aj.dropoff_time}` : `(Delivering to ${aj.dropoff_location || 'Destination'})`;
    return {
      conflictingJob: aj,
      reason: `Assigned to Order ${aj.job_no || 'Trip'} ${timingDesc}`
    };
  }

  return null;
}

export function isContractQuotation(q) {
  if (!q) return false;
  if (q.is_contract === true || q.is_contract === 1 || q.is_contract === '1' || q.is_contract === 'true') return true;
  if (q.quote_type === 'contract' || q.kind === 'contract') return true;
  if (q.special_instructions && typeof q.special_instructions === 'string' && q.special_instructions.startsWith('{')) {
    try {
      const parsed = JSON.parse(q.special_instructions);
      if (parsed && Array.isArray(parsed.routes) && parsed.routes.length > 0 && parsed.lorryTypes) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

export function isOrderQuotation(q) {
  if (!q) return false;
  return !isContractQuotation(q);
}

export const nextJobNo = () => nextNo('jobs', 'job_no', 'RJ');
export const nextOrderNo = () => nextNo('quotations', 'quote_no', 'rensorder');
export const nextQuoteNo = () => nextNo('quotations', 'quote_no', 'rensorder');
export const nextInvoiceNo = () => nextNo('sales_invoices', 'invoice_no', 'INV');

// ── Icons ──────────────────────────────────────────────
export const ICONS = {
  board: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`,
  quotations: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  approvals: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  fleet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`,
  dashboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  driver: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  keyboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>`,
  warning: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
  bolt: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  person: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  truck: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`,
  helper: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  box: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  download: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  plus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>`,
  sparkles: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  checkCircle: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  arrowRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" x2="19" y1="12" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  cornerUpLeft: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
};
