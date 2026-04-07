const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://trading_user:password@localhost:5432/trading_bot' });

async function main() {
  const queries = [
    { name: 'signal_candidates', sql: "SELECT symbol, signal_type, status, score, created_at FROM signal_candidates WHERE signal_type = 'long_term' ORDER BY created_at DESC" },
    { name: 'all_signals_7d', sql: "SELECT symbol, direction, confidence, status, created_at FROM signals WHERE created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 20" },
    { name: 'all_signals', sql: "SELECT COUNT(*), status FROM signals GROUP BY status" },
    { name: 'orders', sql: "SELECT symbol, direction, quantity, price, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10" }
  ];

  for (const q of queries) {
    try {
      const result = await pool.query(q.sql);
      console.log(`\n=== ${q.name} ===`);
      console.log(JSON.stringify(result.rows, null, 2));
    } catch (e) {
      console.log(`\n=== ${q.name} ERROR ===`);
      console.log(e.message);
    }
  }
  await pool.end();
}

main();
