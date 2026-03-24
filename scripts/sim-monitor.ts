/**
 * 短线策略模拟盘监控
 * 每日收盘后执行信号扫描和持仓检查
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';

// 最终参数
const PARAMS = {
  fast_period: 11,
  slow_period: 30,
  rsi_period: 14,
  rsi_low: 35,
  rsi_high: 65,
  atr_multiplier: 1.5,
  min_score: 65,
  stop_loss_pct: 0.06, // 2.0倍ATR，上限6%
  profit_target_pct: 0.12,
  max_hold_days: 10,
  early_exit_pct: 0.08, // 第5天盈利<8%平仓
};

const STOCKS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META'];
const SIM资金 = 100000;
const 单股上限 = 20000;
const 持仓上限 = 5;

interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface 持仓 {
  symbol: string;
  开仓日: string;
  开仓价: number;
  止损价: number;
  止盈价: number;
  股数: number;
}

interface 信号 {
  symbol: string;
  评分: number;
  触发条件: string[];
  缺少条件: string[];
}

// 加载数据
function loadData(symbol: string): KLine[] {
  const file = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return (data.klines || []).filter((k: KLine) => k.close && k.close > 0);
}

function calcMA(closes: number[], p: number): number {
  if (closes.length < p) return closes[closes.length-1];
  return closes.slice(-p).reduce((a,b) => a+b, 0) / p;
}

function calcRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) g += d; else l -= d;
  }
  return 100 - (100 / (1 + g/(l||1)));
}

function calcATR(klines: KLine[]): number {
  if (klines.length < 2) return 0;
  const trs = klines.slice(-14).map((k, i) => {
    if (i === 0) return k.high - k.low;
    const prev = klines[klines.length - 14 + i - 1];
    return Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
  });
  return trs.reduce((a,b) => a+b, 0) / trs.length;
}

// 计算信号评分
function calcSignal(klines: KLine[], spyKlines: KLine[]): 信号 | null {
  if (klines.length < 60) return null;
  
  const closes = klines.map(k => k.close);
  const vols = klines.map(k => k.volume);
  const highs = klines.map(k => k.high);
  const lows = klines.map(k => k.low);
  const lastIdx = closes.length - 1;
  
  const ma5 = calcMA(closes, 5);
  const ma10 = calcMA(closes, 10);
  const ma20 = calcMA(closes, 20);
  const maF = calcMA(closes, PARAMS.fast_period);
  const maS = calcMA(closes, PARAMS.slow_period);
  const rsi = calcRSI(closes, PARAMS.rsi_period);
  const vMA = calcMA(vols, 20);
  const vR = vols[lastIdx] / (vMA || 1);
  const h20 = Math.max(...highs.slice(-20));
  const l20 = Math.min(...lows.slice(-20));
  const price = closes[lastIdx];
  
  let prevRSI = 50;
  if (closes.length >= PARAMS.rsi_period + 1) {
    prevRSI = calcRSI(closes.slice(0, -1), PARAMS.rsi_period);
  }
  const rsiChange = rsi - prevRSI;
  
  const atr = calcATR(klines);
  
  // SPY检查
  let spyAbove = true;
  if (spyKlines.length >= 20) {
    const spyCloses = spyKlines.map(k => k.close);
    const spyMA20 = calcMA(spyCloses, 20);
    spyAbove = spyCloses[spyCloses.length-1] > spyMA20;
  }
  
  let score = 0;
  const 触发条件: string[] = [];
  const 缺少条件: string[] = [];
  
  // 放量突破20日高点
  if (price > h20 * 0.98 && vR > 1.5) {
    score += 25;
    触发条件.push('放量突破');
  } else if (price > h20 * 0.98) {
    缺少条件.push('放量突破');
  } else {
    缺少条件.push('放量突破');
  }
  
  // 均线多头排列
  if (ma5 > ma10 && ma10 > ma20) {
    score += 15;
    触发条件.push('均线多头');
  } else {
    缺少条件.push('均线多头');
  }
  
  // RSI反弹
  if (rsiChange > 3) {
    score += 15;
    触发条件.push('RSI反弹');
  } else {
    缺少条件.push('RSI反弹');
  }
  
  // MA20支撑
  if (price < ma20 * 1.01 && price > ma20 * 0.99) {
    score += 15;
    触发条件.push('MA20支撑');
  } else {
    缺少条件.push('MA20支撑');
  }
  
  // 连续3日放量
  if (vols.length >= 3 && vols[lastIdx] > vols[lastIdx-1] && vols[lastIdx-1] > vols[lastIdx-2]) {
    score += 10;
    触发条件.push('连续放量');
  } else {
    缺少条件.push('连续放量');
  }
  
  // 大盘过滤
  if (spyAbove) {
    score += 10;
    触发条件.push('大盘强');
  } else {
    缺少条件.push('大盘强');
  }
  
  return {
    symbol: symbol || 'unknown',
    评分: score,
    触发条件,
    缺少条件
  };
}

async function main() {
  console.log('=============================');
  console.log('模拟盘监控启动');
  console.log('=============================\n');
  
  // 加载数据
  const stockData = new Map<string, KLine[]>();
  console.log('加载股票数据:');
  for (const sym of STOCKS) {
    const data = loadData(sym);
    if (data.length > 0) {
      stockData.set(sym, data);
      console.log(`  ${sym}: ${data.length}条 (${data[0].date} ~ ${data[data.length-1].date})`);
    }
  }
  
  const spyData = loadData('SPY');
  console.log(`  SPY: ${spyData.length}条\n`);
  
  // 获取最新交易日
  const latestDate = spyData[spyData.length - 1]?.date || 'N/A';
  console.log(`当前日期: ${latestDate}`);
  console.log(`监控股票: ${STOCKS.join(', ')}`);
  console.log(`持仓上限: ${持仓上限}只`);
  console.log(`单股上限: $${单股上限}\n`);
  
  // 参数确认
  console.log('参数确认:');
  console.log(`  fast_period: ${PARAMS.fast_period}`);
  console.log(`  slow_period: ${PARAMS.slow_period}`);
  console.log(`  rsi_period: ${PARAMS.rsi_period}`);
  console.log(`  min_score: ${PARAMS.min_score}`);
  console.log(`  stop_loss_pct: ${(PARAMS.stop_loss_pct*100).toFixed(0)}% (2.0倍ATR上限)`);
  console.log(`  profit_target_pct: ${(PARAMS.profit_target_pct*100).toFixed(0)}%`);
  console.log(`  max_hold_days: ${PARAMS.max_hold_days}`);
  console.log(`  early_exit: 第5天盈利<${(PARAMS.early_exit_pct*100).toFixed(0)}%平仓\n`);
  
  // 大盘状态检查
  console.log('--- 大盘状态检查 ---');
  const spyCloses = spyData.map(k => k.close);
  const spyMA20 = calcMA(spyCloses, 20);
  const spyPrice = spyCloses[spyCloses.length - 1];
  const spyPrev = spyCloses[spyCloses.length - 2];
  const spyChange = ((spyPrice - spyPrev) / spyPrev * 100);
  
  console.log(`SPY 收盘: $${spyPrice.toFixed(2)}`);
  console.log(`SPY MA20: $${spyMA20.toFixed(2)}`);
  console.log(`SPY 位置: ${spyPrice > spyMA20 ? 'MA20之上 ✅' : 'MA20之下 ⚠️'}`);
  console.log(`SPY 当日涨跌: ${spyChange > 0 ? '+' : ''}${spyChange.toFixed(2)}%`);
  
  const 大盘健康 = spyPrice > spyMA20 && Math.abs(spyChange) < 2;
  console.log(`今日大盘判断: ${大盘健康 ? '正常交易' : '谨慎交易/禁止开仓'}\n`);
  
  // 信号扫描
  console.log('--- 信号扫描 ---');
  const signals: 信号[] = [];
  
  for (const sym of STOCKS) {
    const klines = stockData.get(sym);
    if (!klines || klines.length < 60) continue;
    
    // 添加symbol到klines以便识别
    const klWithSym = klines.map(k => ({...k, symbol: sym}));
    const signal = calcSignal(klWithSym as KLine[], spyData);
    
    if (signal) {
      signal.symbol = sym;
      console.log(`${sym}: 评分${signal.评分}分`);
      if (signal.评分 >= PARAMS.min_score) {
        signals.push(signal);
        console.log(`  → 买入信号! 触发: ${signal.触发条件.join('+')}`);
      } else {
        console.log(`  缺少: ${signal.缺少条件.join(', ')}`);
      }
    }
  }
  
  console.log(`\n共${signals.length}个买入信号`);
  
  // 输出日报
  console.log('\n=============================');
  console.log(`模拟盘日报 ${latestDate}（首个交易日）`);
  console.log('=============================');
  console.log('\n大盘状态：');
  console.log(`  SPY 收盘: $${spyPrice.toFixed(2)}`);
  console.log(`  SPY MA20: $${spyMA20.toFixed(2)}`);
  console.log(`  SPY 位置: ${spyPrice > spyMA20 ? 'MA20之上' : 'MA20之下'}`);
  console.log(`  今日大盘判断: ${大盘健康 ? '正常交易' : '禁止开仓'}`);
  console.log(`  SPY 当日涨跌: ${spyChange > 0 ? '+' : ''}${spyChange.toFixed(2)}%`);
  
  console.log('\n--- 持仓状态 ---');
  console.log('当前持仓: 0只');
  console.log('今日出场: 无');
  
  console.log('\n--- 信号扫描 ---');
  console.log('股票  评分  触发条件');
  for (const sig of signals) {
    console.log(`${sig.symbol}  ${sig.评分}  ${sig.触发条件.join('+')}`);
  }
  if (signals.length === 0) {
    console.log('(无买入信号)');
  }
  
  console.log('\n--- 模拟账户 ---');
  console.log(`初始资金: $${SIM资金.toLocaleString()}`);
  console.log(`当前现金: $${SIM资金.toLocaleString()}`);
  console.log(`持仓市值: $0`);
  console.log(`总资产: $${SIM资金.toLocaleString()}`);
  console.log(`累计收益: +$0 (+0%)`);
  
  console.log('\n--- 今日小结 ---');
  console.log(`市场环境: ${spyPrice > spyMA20 ? '趋势上涨' : '震荡/回调'}`);
  console.log(`策略状态: ${大盘健康 ? '正常运行' : '暂停开仓'}`);
  console.log(`值得关注: 首日启动，监控中`);
  console.log(`明日重点关注: 等待信号`);
  
  console.log('\n✅ 模拟盘监控已启动，每日将自动执行扫描');
}

main().catch(console.error);
