require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'app_user',
  password: String(process.env.DB_PASSWORD || '0209'),
  database: process.env.DB_NAME || 'phishing_simulation',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Immediate sanity test
pool.getConnection()
  .then((conn) => {
    console.log('✅ Database connected successfully!');
    conn.release();
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
  });

module.exports = pool;
