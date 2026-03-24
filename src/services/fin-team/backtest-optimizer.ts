/**
 * 短线Agent回测与优化系统
 * 美股量化策略回测
 */

import { getHistoryKLine, KLine } from '../../services/market/quote-service';
import { calculateATR } from './technical-indicators';

/**
 * 回测参数
 */
export interface BacktestParams {
  fast_period: number;
  slow_period: number;
  rsi_period: number;
  rsi_low: number;
  rsi_high: number;
  atr_multiplier: number;
  adx_threshold: number;
  min_score: number;
  stop_loss_pct: number;
  profit_target_pct: number;
  max_hold_days: number;
}

/**
 * 交易记录
 */
export interface Trade {
  date: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  holdDays: number;
  pnl: number;
  pnlPct: number;
  reasons: string[];
  score: number;
}

/**
 * 回测结果
 */
export interface BacktestResult {
  params: BacktestParams;
  trades: Trade[];
  totalReturn: number;
  sharpe: number;
  maxDrawdownPct: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
}

/**
 * 默认参数
 */
export const DEFAULT_PARAMS: BacktestParams = {
  fast_period: 5,
  slow_period: 20,
  rsi_period: 14,
  rsi_low: 35,
  rsi_high: 70,
  atr_multiplier: 1.5,
  adx_threshold: 25,
  min_score: 65,
  stop_loss_pct: 0.05,
  profit_target_pct: 0.10,
  max_hold_days: 10,
};

/**
 * 计算RSI
 */
function calcRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) g += d; else l -= d;
  }
  return 100 - (100 / (1 + g/(l||1)));
}

/**
 * 计算MA
 */
function calcMA(closes: number[], p: number): number {
  return closes.slice(-p).reduce((a,b) => a+b, 0) / p;
}

/**
 * 单股回测
 */
async function backtestStock(symbol: string, params: BacktestParams, spyKlines: KLine[]): Promise<Trade[]> {
  const kl = await getHistoryKLine(symbol, 'us', '1d', '3mo');
  if (kl.length < 60) return [];
  
  const closes = kl.map(k => k.close);
  const vols = kl.map(k => k.volume);
  const highs = kl.map(k => k.high);
  const lows = kl.map(k => k.low);
  const times = kl.map(k => k.timestamp);
  
  const trades: Trade[] = [];
  let pos: { p: number; d: string; i: number; reasons: string[]; s: number; atr: number } | null = null;
  
  for (let i = 30; i < kl.length - params.max_hold_days; i++) {
    const date = new Date(times[i]).toISOString().split('T')[0];
    const price = closes[i];
    const vol = vols[i];
    
    const maF = calcMA(closes.slice(0,i+1), params.fast_period);
    const maS = calcMA(closes.slice(0,i+1), params.slow_period);
    const rsi = calcRSI(closes.slice(0,i+1), params.rsi_period);
    const vMA = calcMA(vols.slice(0,i+1), 20);
    const vR = vol / (vMA||1);
    const h20 = Math.max(...highs.slice(i-20,i));
    const l20 = Math.min(...lows.slice(i-20,i));
    const atr = calculateATR(kl.slice(0,i+1));
    
    const spyC = spyKlines.map(k => k.close);
    const spyM20 = calcMA(spyC.slice(0,i+1), 20);
    const spyAbove = spyC[i] > spyM20;
    const spy3d = i>=3 && spyC[i]<spyC[i-1] && spyC[i-1]<spyC[i-2] && spyC[i-2]<spyC[i-3];
    const spy1d = i>=1 && (spyC[i]-spyC[i-1])/spyC[i-1] < -0.02;
    
    let score = 0;
    const reasons: string[] = [];
    
    if (price > h20*0.98 && vR > 1.5) { score += 25; reasons.push('突破'); }
    if (maF > maS) { score += 15; reasons.push('多头'); }
    if (rsi < params.rsi_low + 10) { score += 15; reasons.push('RSI'+rsi.toFixed(0)); }
    if (price < l20*1.02 && price > l20*0.98) { score += 15; reasons.push('支撑'); }
    if (i>=3 && vols[i]>vols[i-1] && vols[i-1]>vols[i-2]) { score += 10; reasons.push('放量'); }
    if (spyAbove) { score += 10; reasons.push('大盘强'); }
    
    const minScore = spy3d ? 75 : params.min_score;
    
    if (!pos && score >= minScore && !spy1d && reasons.length >= 2) {
      pos = { p: price, d: date, i: i, reasons, s: score, atr };
      continue;
    }
    
    if (pos) {
      const days = i - pos.i;
      const pnlPct = (price - pos.p) / pos.p * 100;
      const stopP = Math.max(pos.p*(1-params.atr_multiplier*pos.atr/pos.p), pos.p*(1-params.stop_loss_pct));
      const targetP = pos.p * (1 + params.profit_target_pct);
      
      if (price >= targetP || price <= stopP || days >= params.max_hold_days) {
        trades.push({
          date: pos.d, symbol, entryPrice: pos.p, exitPrice: price, holdDays: days,
          pnl: (price-pos.p)*100, pnlPct, reasons: pos.reasons, score: pos.s
        });
        pos = null;
      }
    }
  }
  return trades;
}

/**
 * 批量回测
 */
export async function runBacktest(symbols: string[], params: BacktestParams = DEFAULT_PARAMS): Promise<BacktestResult> {
  const spy = await getHistoryKLine('SPY', 'us', '1d', '3mo');
  
  let all: Trade[] = [];
  for (const sym of symbols) {
    all = all.concat(await backtestStock(sym, params, spy));
  }
  all.sort((a,b) => a.date.localeCompare(b.date));
  
  const n = all.length;
  const wins = all.filter(t => t.pnl > 0).length;
  const winRate = n > 0 ? wins/n*100 : 0;
  
  const rets = all.map(t => t.pnlPct);
  const totRet = rets.reduce((a,b) => a+b, 0);
  const avg = n>0 ? totRet/n : 0;
  const std = n>1 ? Math.sqrt(rets.map(r => Math.pow(r-avg,2)).reduce((a,b)=>a+b,0)/n) : 1;
  const sharpe = std>0.1 ? avg/std*Math.sqrt(252) : 0;
  
  let peak = 10000, dd = 0, eq = 10000;
  for (const t of all) { eq = eq*(1+t.pnlPct/100); if(eq>peak) peak=eq; const d=(peak-eq)/peak*100; if(d>dd) dd=d; }
  
  return {
    params, trades: all, totalReturn: totRet, sharpe: Math.abs(sharpe)>20?0:sharpe,
    maxDrawdownPct: Math.min(dd,50), winRate,
    totalTrades: n, winningTrades: wins, losingTrades: n-wins,
    avgWin: wins>0 ? all.filter(t=>t.pnl>0).reduce((a,b)=>a+b.pnlPct,0)/wins : 0,
    avgLoss: n-wins>0 ? all.filter(t=>t.pnl<=0).reduce((a,b)=>a+b.pnlPct,0)/(n-wins) : 0
  };
}
