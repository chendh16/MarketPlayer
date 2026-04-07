const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: 'postgresql://trading_user:password@localhost:5432/trading_bot'
});

async function syncWatchlist() {
  // 1. 扫描 klines 目录
  const klinesDir = path.join(process.cwd(), 'data/cache/klines');
  const files = fs.readdirSync(klinesDir);

  const stocks = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const match = f.match(/^(us|hk|a)_(.+)\.json$/);
      if (match) {
        return { market: match[1], symbol: match[2] };
      }
      return null;
    })
    .filter(Boolean);

  console.log(`扫描到 ${stocks.length} 只股票`);

  // 2. 查询现有 watchlist
  const existing = await pool.query('SELECT symbol FROM watchlist');
  const existingSymbols = new Set(existing.rows.map(r => r.symbol));

  // 3. 找出缺失的
  const missing = stocks.filter(s => !existingSymbols.has(s.symbol));
  console.log(`缺失 ${missing.length} 只股票`);

  // 4. 批量插入
  if (missing.length > 0) {
    for (const stock of missing) {
      try {
        await pool.query(
          'INSERT INTO watchlist (symbol, market, is_active) VALUES ($1, $2, true)',
          [stock.symbol, stock.market]
        );
      } catch (err) {
        // 忽略重复插入错误
        if (!err.message.includes('duplicate')) {
          console.error(`插入 ${stock.symbol} 失败:`, err.message);
        }
      }
    }
    console.log(`✅ 已添加 ${missing.length} 只股票到 watchlist`);
  }

  // 5. 统计
  const total = await pool.query('SELECT COUNT(*) as count FROM watchlist WHERE is_active = true');
  console.log(`\n当前 watchlist 总计: ${total.rows[0].count} 只`);

  pool.end();
}

syncWatchlist().catch(err => {
  console.error('错误:', err.message);
  pool.end();
});
