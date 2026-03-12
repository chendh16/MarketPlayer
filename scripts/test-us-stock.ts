import axios from 'axios';

async function getUSKlines(code: string, days: number = 750) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const beg = start.toISOString().slice(0,10).replace(/-/g,'');
  const endStr = end.toISOString().slice(0,10).replace(/-/g,'');
  
  const url = `https://stooq.com/q/d/l/?s=${code.toLowerCase()}.us&d1=${beg}&d2=${endStr}`;
  console.log(`URL: ${url}`);
  
  const res = await axios.get(url, { 
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  console.log(`Status: ${res.status}`);
  console.log(`Data length: ${res.data.length}`);
  console.log(`First 200 chars: ${res.data.substring(0, 200)}`);
  
  const lines = res.data.split('\n').slice(1);
  console.log(`Lines: ${lines.length}`);
  
  return lines.filter((l: string) => l).map((l: string) => { 
    const p = l.split(','); 
    return { date: p[0], close: +p[6] }; 
  });
}

async function main() {
  // 测试NDX (纳斯达克100 ETF)
  console.log('=== 测试纳斯达克100 ETF (QQQ) ===');
  const qqq = await getUSKlines('QQQ', 500);
  console.log(`QQQ数据: ${qqq.length}天`);
  if (qqq.length > 0) {
    console.log(`首日: ${qqq[0].date} 收盘价: ${qqq[0].close}`);
    console.log(`末日: ${qqq[qqq.length-1].date} 收盘价: ${qqq[qqq.length-1].close}`);
  }
  
  console.log('\n=== 测试标普500 ETF (SPY) ===');
  const spy = await getUSKlines('SPY', 500);
  console.log(`SPY数据: ${spy.length}天`);
  if (spy.length > 0) {
    console.log(`首日: ${spy[0].date} 收盘价: ${spy[0].close}`);
    console.log(`末日: ${spy[spy.length-1].date} 收盘价: ${spy[spy.length-1].close}`);
  }
}

main().catch(console.error);
