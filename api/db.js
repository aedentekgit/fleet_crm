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
          // Seed staff
          await pool.query(`
            INSERT INTO \`staff\` (\`id\`, \`name\`, \`username\`, \`role\`, \`pin\`, \`active\`) VALUES
            ('staff-owner-1', 'Rens Admin', 'Dynamic', 'owner', '12345', 1),
            ('staff-admin-1', 'Logistics Operations', 'Admin', 'admin', '12345', 1)
            ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`), \`pin\`=VALUES(\`pin\`)
          `);
          // Seed drivers (15 Drivers across 5 Fleet Types)
          await pool.query(`
            INSERT INTO \`drivers\` (\`id\`, \`name\`, \`phone\`, \`pin\`, \`ic_number\`, \`license_class\`, \`license_expiry\`, \`is_helper\`, \`status\`) VALUES
            ('drv-1', 'Ahmad Razak', '012-345 8901', '1001', '880512-10-5521', 'GDL - D', '2027-02-15', 0, 'available'),
            ('drv-2', 'Suresh Kumar', '016-223 4589', '1002', '901103-14-5823', 'GDL - D', '2026-11-20', 0, 'available'),
            ('drv-3', 'Muhammad Hafiz', '017-889 1234', '1003', '920315-08-6147', 'GDL - D', '2026-12-10', 0, 'available'),
            ('drv-4', 'Tan Boon Wah', '012-678 9012', '1004', '850720-10-5349', 'GDL - E', '2027-01-18', 0, 'available'),
            ('drv-5', 'Mohd Khairul', '013-456 7890', '1005', '870914-01-5231', 'GDL - E', '2026-10-30', 0, 'available'),
            ('drv-6', 'Arumugam A/L Ramasamy', '019-334 5678', '1006', '830405-10-5677', 'GDL - E', '2027-03-05', 0, 'available'),
            ('drv-7', 'Lee Chee Keong', '016-789 0123', '1007', '820819-14-5119', 'GDL - E (Bersendi)', '2026-12-28', 0, 'available'),
            ('drv-8', 'Zulkifli bin Daud', '011-2345 6789', '1008', '860211-03-5491', 'GDL - E (Bersendi)', '2027-02-20', 0, 'available'),
            ('drv-9', 'K. Saravanan', '018-901 2345', '1009', '891025-08-5773', 'GDL - E (Bersendi)', '2027-04-15', 0, 'available'),
            ('drv-10', 'Roslan bin Ismail', '012-901 2345', '1010', '810617-10-5023', 'GDL - E (Bersendi / Berat)', '2027-03-12', 0, 'available'),
            ('drv-11', 'Chong Wei Loon', '017-345 6789', '1011', '841208-14-5367', 'GDL - E (Bersendi / Berat)', '2026-11-05', 0, 'available'),
            ('drv-12', 'Devendran A/L Muthu', '016-456 7891', '1012', '880330-02-5819', 'GDL - E (Bersendi / Berat)', '2027-01-25', 0, 'available'),
            ('drv-13', 'Harun bin Osman', '013-890 1234', '1013', '790915-06-5381', 'GDL - E (Articulated)', '2027-05-10', 0, 'available'),
            ('drv-14', 'Wong Kah Fai', '012-234 5679', '1014', '831122-10-5905', 'GDL - E (Articulated)', '2026-12-15', 0, 'available'),
            ('drv-15', 'G. Tharmalingam', '018-765 4321', '1015', '800114-08-5267', 'GDL - E (Articulated)', '2027-02-28', 0, 'available')
            ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`), \`phone\`=VALUES(\`phone\`), \`pin\`=VALUES(\`pin\`), \`license_class\`=VALUES(\`license_class\`), \`license_expiry\`=VALUES(\`license_expiry\`)
          `);
          // Seed lorries (15 Lorries, 3 for each of the 5 fleet types)
          await pool.query(`
            INSERT INTO \`lorries\` (\`id\`, \`plate_no\`, \`capacity_desc\`, \`road_tax_expiry\`, \`insurance_expiry\`, \`permit_expiry\`, \`default_driver_id\`, \`status\`) VALUES
            ('lry-1', 'WVG 1089', '1 ton 9 ft', '2027-02-15', '2027-02-15', '2027-08-20', 'drv-1', 'available'),
            ('lry-2', 'BNE 3491', '1 ton 9 ft', '2026-11-20', '2026-11-20', '2027-05-15', 'drv-2', 'available'),
            ('lry-3', 'VAK 7819', '1 ton 9 ft', '2026-12-10', '2026-12-10', '2027-06-30', 'drv-3', 'available'),
            ('lry-4', 'WQC 5217', '3 & 5 ton 17 ft', '2027-01-18', '2027-01-18', '2027-07-22', 'drv-4', 'available'),
            ('lry-5', 'BPP 8917', '3 & 5 ton 17 ft', '2026-10-30', '2026-10-30', '2027-04-12', 'drv-5', 'available'),
            ('lry-6', 'VCE 4317', '3 & 5 ton 17 ft', '2027-03-05', '2027-03-05', '2027-09-15', 'drv-6', 'available'),
            ('lry-7', 'WRX 1024', '10 ton 24ft', '2026-12-28', '2026-12-28', '2027-06-18', 'drv-7', 'available'),
            ('lry-8', 'BRT 6724', '10 ton 24ft', '2027-02-20', '2027-02-20', '2027-08-10', 'drv-8', 'available'),
            ('lry-9', 'VDG 9224', '10 ton 24ft', '2027-04-15', '2027-04-15', '2027-10-05', 'drv-9', 'available'),
            ('lry-10', 'WSY 1430', '14 ton 30ft', '2027-03-12', '2027-03-12', '2027-09-28', 'drv-10', 'available'),
            ('lry-11', 'BTU 3830', '14 ton 30ft', '2026-11-05', '2026-11-05', '2027-05-20', 'drv-11', 'available'),
            ('lry-12', 'VEH 7530', '14 ton 30ft', '2027-01-25', '2027-01-25', '2027-07-14', 'drv-12', 'available'),
            ('lry-13', 'WTB 2040', '20 ton 40ft', '2027-05-10', '2027-05-10', '2027-11-20', 'drv-13', 'available'),
            ('lry-14', 'BWD 8240', '20 ton 40ft', '2026-12-15', '2026-12-15', '2027-06-25', 'drv-14', 'available'),
            ('lry-15', 'VFK 9940', '20 ton 40ft', '2027-02-28', '2027-02-28', '2027-08-30', 'drv-15', 'available')
            ON DUPLICATE KEY UPDATE \`plate_no\`=VALUES(\`plate_no\`), \`capacity_desc\`=VALUES(\`capacity_desc\`), \`default_driver_id\`=VALUES(\`default_driver_id\`), \`status\`=VALUES(\`status\`)
          `);

          await pool.query('SET FOREIGN_KEY_CHECKS = 1');
          return res.status(200).json({ success: true, message: 'Fleet seed data initialized successfully into MySQL.' });
        } catch (err) {
          return res.status(500).json({ error: err.message });
        }
      }

      if (['clear_all_data', 'wipe_database', 'clear', 'clear_demo'].includes(req.query.action)) {
        try {
          await pool.query('SET FOREIGN_KEY_CHECKS = 0');
          // Clear all transactional and non-fleet tables, preserving lorries and drivers
          const tablesToDelete = [
            'job_crew', 'inventory_issuances', 'inventory_receipts', 'maintenance_records',
            'jobs', 'quotations', 'approvals', 'customers', 'inventory_items',
            'customer_rates', 'customer_price_lists', 'sales_invoices',
            'customer_contacts'
          ];
          for (const t of tablesToDelete) {
            try { await pool.query(`DELETE FROM \`${t}\``); } catch (_) {}
          }
          try {
            await pool.query('DELETE FROM `staff`');
            await pool.query("INSERT INTO `staff` (`id`, `name`, `role`, `pin`, `active`) VALUES ('staff-owner-1', 'Rens Admin', 'owner', '12345', 1), ('staff-admin-1', 'Logistics Operations', 'admin', '12345', 1)");
          } catch (_) {}
          await pool.query('SET FOREIGN_KEY_CHECKS = 1');
          return res.status(200).json({ success: true, message: 'Non-fleet database tables successfully cleared. Fleet records preserved.' });
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
              await pool.query(`ALTER TABLE \`${targetTable}\` ADD COLUMN \`${safeK}\` TEXT DEFAULT NULL`);
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

