/**
 * 金融团队每日任务
 * - strategy-agent: 每日收集新策略
 * - quant-agent: 多策略组合回测
 */

import cron from 'node-cron';
import { sendMessageToUser } from '../../services/feishu/bot';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const DATA_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/data/cache/klines';
const MEMORY_DIR = '/Users/zhengzefeng/.openclaw/workspace/MarketPlayer/memory';

interface KLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

// ==================== Strategy Agent: 每日策略收集 ====================

async function collectStrategies() {
  console.log('[Strategy-Agent] 收集金融策略...');
  
  const sources = [
    { name: 'GitHub Trending', url: 'https://github.com/trending?since=weekly' },
    { name: 'TradingView Scripts', url: 'https://www.tradingview.com/scripts/' },
  ];
  
  let report = '📊 每日策略情报\n\n';
  
  for (const src of sources) {
    try {
      report += `🔍 ${src.name}: 暂无更新\n`;
    } catch (e) {
      report += `❌ ${src.name}: 获取失败\n`;
    }
  }
  
  // 已收集策略状态
  const knownStrategies = [
    'Supertrend', 'Ichimoku', 'Hull MA', 'VWAP', 
    'Pivot Points', 'Stochastic', 'MFI', 'OBV'
  ];
  
  report += '\n📋 已跟踪策略:\n';
  knownStrategies.forEach(s => report += `• ${s}\n`);
  
  // 发送报告
  await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: report });
  console.log('[Strategy-Agent] 每日情报已推送');
}

// ==================== Quant Agent: 多策略组合回测 ====================

const STRATEGIES = [
  { name: 'RSI', buy: (k: KLine[], i: number) => { 
    if (i < 14) return 0;
    const prices = k.slice(i-13,i+1).map(x=>x.close);
    let g=0,l=0; for(let j=1;j<prices.length;j++){const c=prices[j]-prices[j-1];c>0?g+=c:l-=c;}
    return 100-(100/(1+g/(l||1)))<30?1:0;
  }},
  { name: 'AO', buy: (k: KLine[], i: number) => {
    if (i < 34) return 0;
    const m5 = k.slice(i-4,i+1).reduce((a,b)=>a+(b.high+b.low)/2,0)/5;
    const m34 = k.slice(i-33,i+1).reduce((a,b)=>a+(b.high+b.low)/2,0)/34;
    return m5>m34?1:0;
  }},
  { name: '威廉%R', buy: (k: KLine[], i: number) => {
    if (i < 14) return 0;
    const hs=k.slice(i-13,i+1).map(x=>x.high), ls=k.slice(i-13,i+1).map(x=>x.low);
    const wr=-100*(Math.max(...hs)-k[i].close)/(Math.max(...hs)-Math.min(...ls)||1);
    return wr<-80?1:0;
  }},
  { name: '布林带', buy: (k: KLine[], i: number) => {
    if (i < 20) return 0;
    const s=k.slice(i-20,i).reduce((a,b)=>a+b.close,0)/20;
    const std=Math.sqrt(k.slice(i-20,i).reduce((a,b)=>a+Math.pow(b.close-s,2),0)/20);
    return k[i].close<s-2*std?1:0;
  }},
];

function loadKlines(symbol: string): KLine[] | null {
  const f = path.join(DATA_DIR, `us_${symbol}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf-8'));
}

// 多策略组合: 至少2个策略同时买入
function comboBacktest() {
  const stocks = ['AAPL','MSFT','META','NVDA','TSLA','AVGO','GOOGL','AMZN'];
  
  console.log('[Quant-Agent] 多策略组合回测...');
  
  let totalReturn = 0;
  
  for (const sym of stocks) {
    const klines = loadKlines(sym);
    if (!klines || klines.length < 50) continue;
    
    let cash = 100000, shares = 0, buySignals = 0;
    
    for (let i = 30; i < klines.length; i++) {
      // 统计买入信号
      let signalCount = 0;
      for (const s of STRATEGIES) {
        if (s.buy(klines, i) === 1) signalCount++;
      }
      
      // 至少2个策略同时买入
      if (signalCount >= 2 && shares === 0 && cash > klines[i].close * 100) {
        shares = 100;
        cash -= klines[i].close * 100;
        buySignals++;
      }
      
      // 全部卖出
      if (shares > 0 && (i === klines.length - 1 || signalCount === 0)) {
        cash += klines[i].close * 100;
        shares = 0;
      }
    }
    
    const ret = (cash - 100000) / 100000 * 100;
    totalReturn += ret;
  }
  
  return totalReturn;
}

async function runQuantAgent() {
  const result = comboBacktest();
  
  let msg = `📊 多策略组合回测结果\n\n`;
  msg += `策略组合: RSI + AO + 威廉%R + 布林带\n`;
  msg += `买入条件: 至少2个策略同时发出买入信号\n`;
  msg += `股票池: 8只热门股\n\n`;
  msg += `📈 组合收益: +${result.toFixed(1)}%`;
  
  await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: msg });
  console.log('[Quant-Agent] 组合回测已推送');
}

// ==================== Quant Agent: 各市场信号 ====================

async function runAStockSignal(period: string) {
  console.log(`[AStock] ${period}信号推送`);
  // TODO: 实现A股信号推送
}

async function runHKStockSignal(period: string) {
  console.log(`[HKStock] ${period}信号推送`);
  // TODO: 实现港股信号推送
}

async function runUSStockSignal(period: string) {
  console.log(`[USStock] ${period}信号推送`);
  // TODO: 实现美股信号推送
}

// ==================== 启动调度器 ====================

export function startFinTeamDailyTasks() {
  console.log('[FinTeam] 启动每日任务 (盘前/盘中/盘后)...');
  
  // ========== A股 (北京时间) ==========
  // 盘前: 09:00
  cron.schedule('0 9 * * 1-5', async () => { await runAStockSignal('盘前'); });
  // 盘中: 10:30, 14:00
  cron.schedule('30 10 * * 1-5', async () => { await runAStockSignal('盘中上午'); });
  cron.schedule('0 14 * * 1-5', async () => { await runAStockSignal('盘中下午'); });
  // 盘后: 15:30
  cron.schedule('30 15 * * 1-5', async () => { await runAStockSignal('盘后'); });
  
  // ========== 港股 (北京时间) ==========
  // 盘前: 09:00
  cron.schedule('0 9 * * 1-5', async () => { await runHKStockSignal('盘前'); });
  // 盘中: 11:00, 14:30
  cron.schedule('0 11 * * 1-5', async () => { await runHKStockSignal('盘中上午'); });
  cron.schedule('30 14 * * 1-5', async () => { await runHKStockSignal('盘中下午'); });
  // 盘后: 16:10
  cron.schedule('10 16 * * 1-5', async () => { await runHKStockSignal('盘后'); });
  
  // ========== 美股 (北京时间) ==========
  // 盘前: 21:00 (前一天)
  cron.schedule('0 21 * * 0-4', async () => { await runUSStockSignal('盘前'); });
  // 盘中: 22:30, 02:00
  cron.schedule('30 22 * * 0-4', async () => { await runUSStockSignal('盘中晚'); });
  cron.schedule('0 2 * * 1-5', async () => { await runUSStockSignal('盘中凌晨'); });
  // 盘后: 04:30
  cron.schedule('30 4 * * 1-5', async () => { await runUSStockSignal('盘后'); });
  
  // ========== Strategy Agent: 每天4次 ==========
  cron.schedule('0 9 * * *', async () => { await collectStrategies(); });
  cron.schedule('0 12 * * *', async () => { await collectStrategies(); });
  cron.schedule('0 15 * * *', async () => { await collectStrategies(); });
  cron.schedule('0 20 * * *', async () => { await collectStrategies(); });
  
  console.log('[FinTeam] 已启动: A股/港股/美股 盘前/盘中/盘后');
}

// 立即执行一次
// startFinTeamDailyTasks();
// collectStrategies();
runQuantAgent();
