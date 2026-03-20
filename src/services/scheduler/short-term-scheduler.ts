/**
 * 短线实时监控服务 (3-5天持股)
 * 
 * 实时监控买入信号，符合条件立即推送
 * 市场开盘期间持续运行
 */

// 加载环境变量
import 'dotenv/config';

import { logger } from '../../utils/logger';
import { evaluateShortTerm, ShortTermSignal } from '../../strategies/shortTerm';
import { sendShortTermSignals, sendPositionAlert, sendTradeNotification } from './short-term-notifier';
import { checkPositions, syncPositions, getPositions, openPosition, closePosition, getVirtualCash } from '../trading/position-tracker';

// 监控的股票池
const STOCK_POOLS = {
  a: [
    { symbol: '600519', name: '贵州茅台' },
    { symbol: '000001', name: '平安银行' },
    { symbol: '600000', name: '浦发银行' },
    { symbol: '600036', name: '招商银行' },
    { symbol: '601318', name: '中国平安' },
  ],
  hk: [
    { symbol: '00700', name: '腾讯控股' },
    { symbol: '09988', name: '阿里巴巴' },
    { symbol: '09999', name: '网易' },
    { symbol: '09618', name: '京东集团' },
    { symbol: '06690', name: '海尔智家' },
  ],
  us: [
    { symbol: 'AAPL', name: '苹果' },
    { symbol: 'MSFT', name: '微软' },
    { symbol: 'GOOG', name: '谷歌' },
    { symbol: 'AMZN', name: '亚马逊' },
    { symbol: 'NVDA', name: '英伟达' },
    { symbol: 'TSLA', name: '特斯拉' },
    { symbol: 'META', name: 'Meta' },
  ],
};

// 已推送的信号（避免重复推送）
const pushedSignals: Map<string, string> = new Map();
let isRunning = false;
let monitorInterval: NodeJS.Timeout | null = null;
let positionCheckInterval: NodeJS.Timeout | null = null;

// API限速
let lastApiCall = 0;
const API_DELAY = 7500; // 免费版每分钟8次 = 7.5秒间隔

/**
 * 判断市场是否开盘
 */
function isMarketOpen(market: 'a' | 'hk' | 'us'): boolean {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  const weekday = now.getDay();
  
  if (weekday === 0 || weekday === 6) return false; // 周末
  
  if (market === 'a') {
    // A股: 9:30-11:30, 13:00-15:00
    return (time >= 570 && time < 690) || (time >= 780 && time < 900);
  } else if (market === 'hk') {
    // 港股: 9:30-12:00, 13:00-16:00
    return (time >= 570 && time < 720) || (time >= 780 && time < 960);
  } else if (market === 'us') {
    // 美股: 21:30-4:00 北京时间
    return (time >= 1290 && time < 1440) || (time >= 0 && time < 240);
  }
  return false;
}

/**
 * 获取当前开盘的市场
 */
function getOpenMarkets(): ('a' | 'hk' | 'us')[] {
  const markets: ('a' | 'hk' | 'us')[] = [];
  if (isMarketOpen('a')) markets.push('a');
  if (isMarketOpen('hk')) markets.push('hk');
  if (isMarketOpen('us')) markets.push('us');
  return markets;
}

/**
 * 扫描单个市场
 */
async function scanMarket(market: 'a' | 'hk' | 'us'): Promise<ShortTermSignal[]> {
  const pool = STOCK_POOLS[market];
  const signals: ShortTermSignal[] = [];
  
  for (const stock of pool) {
    try {
      const signal = await evaluateShortTerm(stock.symbol, market, stock.name);
      
      // 只关注买入信号
      if (signal.signal === 'BUY') {
        const signalKey = `${market}_${stock.symbol}`;
        
        // 检查是否已推送（避免重复）
        const lastPushed = pushedSignals.get(signalKey);
        const today = new Date().toDateString();
        
        if (lastPushed !== today) {
          signals.push(signal);
          pushedSignals.set(signalKey, today);
          logger.info(`[RealTime] 🚨 ${market.toUpperCase()} 买入信号: ${stock.name} - ${signal.pattern}`);
          
          // 虚拟盘自动开仓
          const qty = Math.floor(getVirtualCash() * 0.2 / signal.entryPrice); // 用20%资金开仓
          if (qty > 0) {
            const code = market === 'us' ? `US.${stock.symbol}` : stock.symbol;
            await openPosition(code, stock.name, signal.entryPrice, qty, signal.pattern);
            
            // 发送买入通知
            await sendTradeNotification(
              'buy',
              stock.name,
              stock.symbol,
              signal.entryPrice,
              qty,
              signal.entryPrice * qty,
              getVirtualCash()
            );
          }
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
      
      // API限速
      const now = Date.now();
      if (now - lastApiCall < API_DELAY) {
        await new Promise(r => setTimeout(r, API_DELAY - (now - lastApiCall)));
      }
      lastApiCall = Date.now();
    } catch (e) {
      logger.error(`[RealTime] 扫描${stock.symbol}失败:`, e);
    }
  }
  
  return signals;
}

/**
 * 实时监控循环
 */
async function monitorLoop() {
  if (!isRunning) return;
  
  const openMarkets = getOpenMarkets();
  
  if (openMarkets.length === 0) {
    logger.debug('[RealTime] 当前无市场开盘');
    await new Promise(r => setTimeout(r, 60000)); // 未开盘时1分钟检查一次
    return;
  }
  
  logger.info(`[RealTime] 监控中: ${openMarkets.join(', ')}`);
  
  for (const market of openMarkets) {
    const signals = await scanMarket(market);
    
    if (signals.length > 0) {
      // 立即推送
      await sendShortTermSignals(market, signals);
    }
  }
}

/**
 * 检查持仓状态（止盈/止损/到期）
 */
async function checkPositionLoop() {
  if (!isRunning) return;
  
  const positions = getPositions();
  if (positions.length === 0) return;
  
  const { toClose, toAlert } = await checkPositions();
  
  // 发送提醒
  for (const pos of toAlert) {
    await sendPositionAlert(pos.code, pos.name, '⚠️ 接近止损线', pos.stopLoss);
  }
  
  // 需要平仓的 - 自动执行
  for (const pos of toClose) {
    const closePrice = pos.pnlPct > 0 ? pos.targetPrice : pos.stopLoss;
    const reason = pos.pnlPct > 0 ? '止盈' : '止损';
    
    // 虚拟盘自动平仓
    await closePosition(pos.code, closePrice, reason);
    
    await sendPositionAlert(
      pos.code, 
      pos.name, 
      pos.pnlPct > 0 ? '🎯 触发止盈' : '🛡️ 触发止损',
      closePrice
    );
  }
}

/**
 * 启动实时监控
 */
export function startRealTimeMonitor() {
  if (isRunning) {
    logger.warn('[RealTime] 监控已在运行');
    return;
  }
  
  isRunning = true;
  
  // 立即同步持仓
  syncPositions();
  
  // 信号扫描：每5分钟一次
  monitorInterval = setInterval(async () => {
    try {
      await monitorLoop();
    } catch (e) {
      logger.error('[RealTime] 监控异常:', e);
    }
  }, 5 * 60 * 1000); // 5分钟
  
  // 持仓检查：每10分钟一次
  positionCheckInterval = setInterval(async () => {
    try {
      await syncPositions();
      await checkPositionLoop();
    } catch (e) {
      logger.error('[RealTime] 持仓检查异常:', e);
    }
  }, 10 * 60 * 1000); // 10分钟
  
  // 立即执行一次
  monitorLoop();
  
  logger.info('[RealTime] ✅ 短线实时监控已启动');
  logger.info('[RealTime] 📊 信号扫描: 每5分钟');
  logger.info('[RealTime] 📊 持仓检查: 每10分钟');
}

/**
 * 停止实时监控
 */
export function stopRealTimeMonitor() {
  isRunning = false;
  
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  
  if (positionCheckInterval) {
    clearInterval(positionCheckInterval);
    positionCheckInterval = null;
  }
  
  logger.info('[RealTime] ⏹️ 实时监控已停止');
}

/**
 * 手动触发扫描
 */
export async function triggerScan(market?: 'a' | 'hk' | 'us') {
  const markets: Array<'a' | 'hk' | 'us'> = market ? [market] : ['a', 'hk', 'us'];
  
  for (const m of markets) {
    const signals = await scanMarket(m);
    if (signals.length > 0) {
      await sendShortTermSignals(m, signals);
    }
  }
}

/**
 * 获取监控状态
 */
export function getMonitorStatus() {
  return {
    running: isRunning,
    openMarkets: getOpenMarkets(),
    pushedSignalsToday: pushedSignals.size,
    positions: getPositions().length,
  };
}

export { STOCK_POOLS };
