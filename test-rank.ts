/**
 * 排行榜工具测试脚本
 */

import { fetch_top_gainers, fetch_top_losers, fetch_top_volume, fetch_top_turnover } from './src/mcp/tools/rank';

async function test() {
  console.log('=== 测试涨跌幅排行 ===');
  try {
    const gainers = await fetch_top_gainers({ limit: 10 });
    console.log('涨幅榜:', gainers.data.map(s => `${s.rank}. ${s.name} ${s.changePercent.toFixed(2)}%`));
  } catch(e: any) {
    console.log('Error:', e.message);
  }

  console.log('\n=== 测试跌幅榜 ===');
  try {
    const losers = await fetch_top_losers({ limit: 10 });
    console.log('跌幅榜:', losers.data.map(s => `${s.rank}. ${s.name} ${s.changePercent.toFixed(2)}%`));
  } catch(e: any) {
    console.log('Error:', e.message);
  }
}

test();
