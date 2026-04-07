/**
 * PostgreSQL 工具 - 统一数据库访问
 */
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 未配置，请检查.env文件');
}

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL
});

async function insert(table, data) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i+1}`).join(', ');
  await pool.query(
    `INSERT INTO ${table} (${keys.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (id) DO NOTHING`,
    values
  );
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function close() {
  await pool.end();
}

module.exports = { insert, query, pool, close };