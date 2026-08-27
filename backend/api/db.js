import crypto from 'crypto';
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

import { getDb, connectDb } from '../db/mongodb.js';

const ALLOWED_COLLECTIONS = [
  'jobs', 'customers', 'lorries', 'drivers', 'quotations', 
  'approvals', 'inventory_items', 'inventory_issuances', 
  'inventory_receipts', 'maintenance_records', 'staff', 
  'lorry_crew', 'job_crew', 'customer_rates', 'customer_price_lists', 'sales_invoices',
  'customer_contacts'
];

function buildMongoFilter(whereClauses, queryParams = {}) {
  const filter = {};

  if (Array.isArray(whereClauses) && whereClauses.length > 0) {
    whereClauses.forEach(cond => {
      if (cond.col && cond.val !== undefined) {
        const field = cond.col;
        const op = cond.op || '=';
        const val = cond.val;

        if (op === '=') {
          filter[field] = val;
        } else if (op === '!=') {
          filter[field] = { $ne: val };
        } else if (op === '>') {
          filter[field] = { $gt: val };
        } else if (op === '>=') {
          filter[field] = { $gte: val };
        } else if (op === '<') {
          filter[field] = { $lt: val };
        } else if (op === '<=') {
          filter[field] = { $lte: val };
        } else if (op === 'LIKE') {
          filter[field] = { $regex: String(val).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), $options: 'i' };
        }
      }
    });
  } else {
    const reserved = ['table', 'where', 'order_by', 'order_dir', 'limit', 'action', 'enrich'];
    Object.keys(queryParams).forEach(key => {
      if (!reserved.includes(key) && queryParams[key] !== undefined) {
        filter[key] = queryParams[key];
      }
    });
  }

  return filter;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = await getDb();

    // ── GET: Query Collection Data or Status / Actions ──
    if (req.method === 'GET') {
      const table = req.query.table;
      
      // Health / Status Check
      if (table === 'status' || req.query.action === 'status') {
        try {
          await db.command({ ping: 1 });
          return res.status(200).json({
            connected: true,
            type: 'MongoDB',
            database: db.databaseName,
            uri: (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017').replace(/:([^:@]+)@/, ':****@')
          });
        } catch (dbErr) {
          return res.status(200).json({
            connected: false,
            type: 'MongoDB',
            error: dbErr.message,
            code: dbErr.code,
            details: `Failed to connect to MongoDB server`
          });
        }
      }

      // Seed Demo Action
      if (['seed_demo', 'seed', 'seed_data'].includes(req.query.action) || ['seed_demo', 'seed', 'seed_data'].includes(req.body?.action)) {
        try {
          const staffCol = db.collection('staff');
          const defaultStaff = [
            { id: 'staff-owner-1', name: 'Rens Admin', username: 'Dynamic', role: 'owner', pin: '12345', active: 1 },
            { id: 'staff-admin-1', name: 'Logistics Operations', username: 'Admin', role: 'admin', pin: '12345', active: 1 }
          ];
          for (const s of defaultStaff) {
            await staffCol.updateOne({ id: s.id }, { $set: s }, { upsert: true });
          }
          return res.status(200).json({ success: true, message: 'Database initialized with admin staff accounts.' });
        } catch (err) {
          return res.status(500).json({ error: err.message });
        }
      }

      // Clear Quotes and Jobs Action
      if (['clear_quotes_and_jobs'].includes(req.query.action) || ['clear_quotes_and_jobs'].includes(req.body?.action)) {
        try {
          const collectionsToDelete = ['job_crew', 'jobs', 'quotations', 'approvals', 'sales_invoices'];
          for (const colName of collectionsToDelete) {
            try { await db.collection(colName).deleteMany({}); } catch (_) {}
          }
          return res.status(200).json({ success: true, message: 'Quotations and jobs data cleared.' });
        } catch (err) {
          return res.status(500).json({ error: err.message });
        }
      }

      // Clear Data Action
      if (['clear_all_data', 'wipe_database', 'clear', 'clear_demo'].includes(req.query.action) || ['clear_all_data', 'wipe_database', 'clear', 'clear_demo'].includes(req.body?.action)) {
        try {
          for (const colName of ALLOWED_COLLECTIONS) {
            try { await db.collection(colName).deleteMany({}); } catch (_) {}
          }
          const staffCol = db.collection('staff');
          await staffCol.insertMany([
            { id: 'staff-owner-1', name: 'Rens Admin', username: 'Dynamic', role: 'owner', pin: '12345', active: 1 },
            { id: 'staff-admin-1', name: 'Logistics Operations', username: 'Admin', role: 'admin', pin: '12345', active: 1 }
          ]);
          return res.status(200).json({ success: true, message: 'All database collections completely cleared. System reset to clean state.' });
        } catch (err) {
          return res.status(500).json({ error: err.message });
        }
      }

      if (!table || !ALLOWED_COLLECTIONS.includes(table)) {
        return res.status(400).json({ error: 'Invalid or missing table parameter' });
      }

      // Parse custom where parameter if provided as JSON string
      let parsedWhere = [];
      if (req.query.where) {
        try {
          parsedWhere = typeof req.query.where === 'string' ? JSON.parse(req.query.where) : req.query.where;
        } catch (e) {}
      }

      const filter = buildMongoFilter(parsedWhere, req.query);
      const collection = db.collection(table);

      let cursor = collection.find(filter, { projection: { _id: 0 } });

      const orderBy = req.query.order_by;
      if (orderBy) {
        const orderDir = (req.query.order_dir || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
        cursor = cursor.sort({ [orderBy]: orderDir });
      }

      const limit = parseInt(req.query.limit, 10);
      if (!isNaN(limit) && limit > 0) {
        cursor = cursor.limit(limit);
      }

      const rows = await cursor.toArray();
      return res.status(200).json({ data: rows });
    }

    // ── POST: Insert or Upsert Records ──
    if (req.method === 'POST') {
      const { table: bodyTable, data } = req.body || {};
      const targetTable = req.query.table || bodyTable;

      if (!targetTable || !ALLOWED_COLLECTIONS.includes(targetTable) || !data) {
        return res.status(400).json({ error: 'Valid table and data required' });
      }

      const records = Array.isArray(data) ? data : [data];
      const collection = db.collection(targetTable);
      const insertedResults = [];

      for (let item of records) {
        const doc = { ...item };
        if (!doc.id) {
          doc.id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        }
        delete doc._id; // Ensure clean custom id is used

        await collection.updateOne(
          { id: doc.id },
          { $set: doc },
          { upsert: true }
        );
        insertedResults.push({ id: doc.id });
      }

      return res.status(200).json({ success: true, data: insertedResults });
    }

    // ── PUT: Update Records ──
    if (req.method === 'PUT') {
      const { table: bodyTable, data, where, id } = req.body || {};
      const targetTable = req.query.table || bodyTable;

      if (!targetTable || !ALLOWED_COLLECTIONS.includes(targetTable) || !data) {
        return res.status(400).json({ error: 'Valid table and update data required' });
      }

      const updateData = { ...data };
      delete updateData._id;

      let filter = {};
      const targetId = id || req.query.id || (data && data.id);
      if (targetId) {
        filter = { id: targetId };
      } else if (Array.isArray(where) && where.length > 0) {
        filter = buildMongoFilter(where);
      }

      if (Object.keys(filter).length === 0) {
        return res.status(400).json({ error: 'Where condition or id required for update' });
      }

      const collection = db.collection(targetTable);
      const result = await collection.updateMany(filter, { $set: updateData });

      return res.status(200).json({ success: true, affectedRows: result.modifiedCount });
    }

    // ── DELETE: Delete Records ──
    if (req.method === 'DELETE') {
      const { table: bodyTable, where, id, clear_all } = req.body || {};
      const targetTable = req.query.table || bodyTable;

      if (!targetTable || !ALLOWED_COLLECTIONS.includes(targetTable)) {
        return res.status(400).json({ error: 'Valid table required' });
      }

      let filter = {};
      const targetId = id || req.query.id;
      if (targetId) {
        filter = { id: targetId };
      } else if (Array.isArray(where) && where.length > 0) {
        filter = buildMongoFilter(where);
      } else if (!clear_all) {
        return res.status(400).json({ error: 'Where condition or id required for delete' });
      }

      const collection = db.collection(targetTable);
      const result = await collection.deleteMany(filter);

      return res.status(200).json({ success: true, affectedRows: result.deletedCount });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const isConnErr = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'MongoServerSelectionError', 'MongoNetworkError'].includes(error.name) ||
                      ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code);
    if (!isConnErr) {
      console.error('[Database API Error]:', error.message || error);
    }
    return res.status(200).json({
      data: [],
      error: isConnErr ? 'MongoDB Server offline' : (error.message || 'Database error'),
      code: error.code || 'DB_OFFLINE',
      isConnError: isConnErr
    });
  }
}
