import pool from '../db/mysql.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const allowedTables = [
    'jobs', 'customers', 'lorries', 'drivers', 'quotations', 
    'approvals', 'inventory_items', 'inventory_issuances', 
    'inventory_receipts', 'maintenance_records', 'staff', 
    'lorry_crew', 'job_crew', 'customer_rates', 'customer_price_lists', 'sales_invoices',
    'customer_contacts'
  ];

  try {
    if (req.method === 'GET') {
      const table = req.query.table;
      
      if (table === 'status' || req.query.action === 'status') {
        try {
          await pool.query('SELECT 1');
          return res.status(200).json({
            connected: true,
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            database: process.env.DB_NAME || 'u745362362_renserp'
          });
        } catch (dbErr) {
          return res.status(200).json({
            connected: false,
            error: dbErr.message,
            code: dbErr.code,
            details: `Failed to connect to MySQL server at ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`
          });
        }
      }

      if (['seed_demo', 'seed', 'seed_data'].includes(req.query.action) || ['seed_demo', 'seed', 'seed_data'].includes(req.body?.action)) {
        try {
          await pool.query('SET FOREIGN_KEY_CHECKS = 0');
          await pool.query(`
            INSERT INTO \`staff\` (\`id\`, \`name\`, \`username\`, \`role\`, \`pin\`, \`active\`) VALUES
            ('staff-owner-1', 'Rens Admin', 'Dynamic', 'owner', '12345', 1),
            ('staff-admin-1', 'Logistics Operations', 'Admin', 'admin', '12345', 1)
            ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`), \`pin\`=VALUES(\`pin\`)
          `);
          await pool.query('SET FOREIGN_KEY_CHECKS = 1');
          return res.status(200).json({ success: true, message: 'Database initialized in clean state with admin staff accounts.' });
        } catch (err) {
          return res.status(500).json({ error: err.message });
        }
      }

      if (['clear_all_data', 'wipe_database', 'clear', 'clear_demo'].includes(req.query.action) || ['clear_all_data', 'wipe_database', 'clear', 'clear_demo'].includes(req.body?.action)) {
        try {
          await pool.query('SET FOREIGN_KEY_CHECKS = 0');
          // Clear all transactional, fleet, and master tables
          const tablesToDelete = [
            'job_crew', 'lorry_crew', 'inventory_issuances', 'inventory_receipts', 'maintenance_records',
            'jobs', 'quotations', 'approvals', 'customers', 'inventory_items',
            'customer_rates', 'customer_price_lists', 'sales_invoices',
            'customer_contacts', 'lorries', 'drivers'
          ];
          for (const t of tablesToDelete) {
            try { await pool.query(`DELETE FROM \`${t}\``); } catch (_) {}
          }
          try {
            await pool.query('DELETE FROM `staff`');
            await pool.query("INSERT INTO `staff` (`id`, `name`, `username`, `role`, `pin`, `active`) VALUES ('staff-owner-1', 'Rens Admin', 'Dynamic', 'owner', '12345', 1), ('staff-admin-1', 'Logistics Operations', 'Admin', 'admin', '12345', 1)");
          } catch (_) {}
          await pool.query('SET FOREIGN_KEY_CHECKS = 1');
          return res.status(200).json({ success: true, message: 'All database tables completely cleared. System reset to clean state.' });
        } catch (err) {
          return res.status(500).json({ error: err.message });
        }
      }

      if (!table || !allowedTables.includes(table)) {
        return res.status(400).json({ error: 'Invalid or missing table parameter' });
      }

      let sql = `SELECT * FROM \`${table}\``;
      const params = [];
      const whereClauses = [];

      // Parse custom where parameter if provided as JSON string
      let parsedWhere = [];
      if (req.query.where) {
        try {
          parsedWhere = typeof req.query.where === 'string' ? JSON.parse(req.query.where) : req.query.where;
        } catch (e) {}
      }

      if (Array.isArray(parsedWhere) && parsedWhere.length > 0) {
        parsedWhere.forEach(cond => {
          if (cond.col && cond.val !== undefined) {
            const op = (cond.op && ['=', '!=', '<', '>', '<=', '>=', 'LIKE'].includes(cond.op.toUpperCase())) ? cond.op.toUpperCase() : '=';
            const safeCol = cond.col.replace(/[^a-zA-Z0-9_]/g, '');
            if (op === 'LIKE') {
              whereClauses.push(`\`${safeCol}\` LIKE ?`);
              params.push(`%${cond.val}%`);
            } else {
              whereClauses.push(`\`${safeCol}\` ${op} ?`);
              params.push(cond.val);
            }
          }
        });
      } else {
        // Fallback to plain query parameters excluding reserved keys
        const reserved = ['table', 'where', 'order_by', 'order_dir', 'limit', 'action'];
        Object.keys(req.query).forEach(key => {
          if (!reserved.includes(key) && req.query[key] !== undefined) {
            const safeCol = key.replace(/[^a-zA-Z0-9_]/g, '');
            whereClauses.push(`\`${safeCol}\` = ?`);
            params.push(req.query[key]);
          }
        });
      }

      if (whereClauses.length > 0) {
        sql += ' WHERE ' + whereClauses.join(' AND ');
      }

      const orderBy = req.query.order_by;
      if (orderBy) {
        const safeOrderCol = orderBy.replace(/[^a-zA-Z0-9_]/g, '');
        const orderDir = (req.query.order_dir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        sql += ` ORDER BY \`${safeOrderCol}\` ${orderDir}`;
      }

      const limit = parseInt(req.query.limit, 10);
      if (!isNaN(limit) && limit > 0) {
        sql += ` LIMIT ${limit}`;
      }

      const [rows] = await pool.query(sql, params);
      return res.status(200).json({ data: rows });
    }

    if (req.method === 'POST') {
      const { table: bodyTable, data } = req.body || {};
      const targetTable = req.query.table || bodyTable;

      if (!targetTable || !allowedTables.includes(targetTable) || !data) {
        return res.status(400).json({ error: 'Valid table and data required' });
      }

      const records = Array.isArray(data) ? data : [data];
      const insertedResults = [];

      // Ensure columns exist in MySQL table
      try {
        const [existingColsRows] = await pool.query(`SHOW COLUMNS FROM \`${targetTable}\``);
        const existingCols = new Set(existingColsRows.map(r => r.Field.toLowerCase()));

        for (let item of records) {
          for (let k of Object.keys(item)) {
            const safeK = k.replace(/[^a-zA-Z0-9_]/g, '');
            if (safeK && !existingCols.has(safeK.toLowerCase())) {
              await pool.query(`ALTER TABLE \`${targetTable}\` ADD COLUMN \`${safeK}\` LONGTEXT DEFAULT NULL`);
              existingCols.add(safeK.toLowerCase());
            }
          }
        }
      } catch (err) {}

      for (let item of records) {
        const rowData = {};
        for (let [k, v] of Object.entries(item)) {
          const safeCol = k.replace(/[^a-zA-Z0-9_]/g, '');
          if (!safeCol) continue;
          if (typeof v === 'boolean') rowData[safeCol] = v ? 1 : 0;
          else if (v === '' || v === undefined) rowData[safeCol] = null;
          else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
            const d = new Date(v);
            rowData[safeCol] = !isNaN(d) ? d.toISOString().slice(0, 19).replace('T', ' ') : v;
          } else if (typeof v === 'object' && v !== null) rowData[safeCol] = JSON.stringify(v);
          else rowData[safeCol] = v;
        }

        if (!rowData.id) {
          rowData.id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        }

        const keys = Object.keys(rowData).map(k => `\`${k.replace(/[^a-zA-Z0-9_]/g, '')}\``).join(', ');
        const values = Object.values(rowData);
        const placeholders = values.map(() => '?').join(', ');

        const [result] = await pool.query(
          `INSERT INTO \`${targetTable}\` (${keys}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ` +
          Object.keys(rowData).map(k => `\`${k.replace(/[^a-zA-Z0-9_]/g, '')}\` = VALUES(\`${k.replace(/[^a-zA-Z0-9_]/g, '')}\`)`).join(', '),
          values
        );
        insertedResults.push({ id: rowData.id, insertId: result.insertId });
      }

      return res.status(200).json({ success: true, data: insertedResults });
    }

    if (req.method === 'PUT') {
      const { table: bodyTable, data, where, id } = req.body || {};
      const targetTable = req.query.table || bodyTable;

      if (!targetTable || !allowedTables.includes(targetTable) || !data) {
        return res.status(400).json({ error: 'Valid table and update data required' });
      }

      const updateKeys = Object.keys(data);
      if (updateKeys.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const setClause = updateKeys.map(k => `\`${k.replace(/[^a-zA-Z0-9_]/g, '')}\` = ?`).join(', ');
      const setValues = Object.values(data);

      const whereClauses = [];
      const whereValues = [];

      const targetId = id || req.query.id || (data && data.id);
      if (targetId) {
        whereClauses.push('`id` = ?');
        whereValues.push(targetId);
      } else if (Array.isArray(where) && where.length > 0) {
        where.forEach(cond => {
          if (cond.col && cond.val !== undefined) {
            const safeCol = cond.col.replace(/[^a-zA-Z0-9_]/g, '');
            whereClauses.push(`\`${safeCol}\` = ?`);
            whereValues.push(cond.val);
          }
        });
      }

      if (whereClauses.length === 0) {
        return res.status(400).json({ error: 'Where condition or id required for update' });
      }

      const sql = `UPDATE \`${targetTable}\` SET ${setClause} WHERE ${whereClauses.join(' AND ')}`;
      const [result] = await pool.query(sql, [...setValues, ...whereValues]);

      return res.status(200).json({ success: true, affectedRows: result.affectedRows });
    }

    if (req.method === 'DELETE') {
      const { table: bodyTable, where, id } = req.body || {};
      const targetTable = req.query.table || bodyTable;

      if (!targetTable || !allowedTables.includes(targetTable)) {
        return res.status(400).json({ error: 'Valid table required' });
      }

      const whereClauses = [];
      const whereValues = [];

      const targetId = id || req.query.id;
      if (targetId) {
        whereClauses.push('`id` = ?');
        whereValues.push(targetId);
      } else if (Array.isArray(where) && where.length > 0) {
        where.forEach(cond => {
          if (cond.col && cond.val !== undefined) {
            const op = (cond.op && ['=', '!=', '<', '>', '<=', '>=', 'LIKE'].includes(cond.op.toUpperCase())) ? cond.op.toUpperCase() : '=';
            const safeCol = cond.col.replace(/[^a-zA-Z0-9_]/g, '');
            whereClauses.push(`\`${safeCol}\` ${op} ?`);
            whereValues.push(cond.val);
          }
        });
      }

      let sql = `DELETE FROM \`${targetTable}\``;
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      const [result] = await pool.query(sql, whereValues);
      return res.status(200).json({ success: true, affectedRows: result.affectedRows });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const isConnErr = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(error.code) || 
                      (error.errors && Array.isArray(error.errors) && error.errors.some(e => e.code === 'ECONNREFUSED'));
    if (!isConnErr) {
      console.error('Database API Error:', error.message || error);
    }
    return res.status(200).json({
      data: [],
      error: isConnErr ? 'MySQL Server offline' : (error.message || 'Database error'),
      code: error.code || 'DB_OFFLINE',
      isConnError: isConnErr
    });
  }
}

