import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'u745362362_renserp',
  user: process.env.DB_USER || 'u745362362_renserp',
  password: process.env.DB_PASSWORD || 'Aedentek@123#',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;
