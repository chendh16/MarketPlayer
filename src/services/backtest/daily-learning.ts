/**
 * 金融团队长期自我学习系统
 * 每日回测 + 实盘迭代 + 投资推荐
 */

import axios from 'axios';
import { StrategyPool, calculateStrategyScore, StrategyPerformance } from './strategy-scorer';
import { optimizePortfolio, riskParityAllocation } from './portfolio-optimizer';
import { MarketRegimeDetector, StrategyEffectivenessEvaluator } from './learning';
import { getKlinesSmart, saveKlinesToCache, getCacheStats } from '../data/cache';
import { logger } from '../../utils/logger';

// ============ 数据获取 ============

interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ============ 数据获取 (带缓存) ============

async function fetchKlinesFromAPI(symbol: string, days: number = 500): Promise<KLine[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const url = 'https://stooq.com/q/d/l/?s=' + symbol.toUpperCase() + '.US&d1=' + 
    start.toISOString().slice(0,10).replace(/-/g,'') + '&d2=' + 
    end.toISOString().slice(0,10).replace(/-/g,'') + '&i=d';
  try {
    const res = await axios.get(url, { timeout: 20000 });
    return res.data.trim().split('\n').slice(1)
      .filter((l: string) => l.trim())
      .map((l: string) => { 
        const p = l.split(','); 
        return { date: p[0], open: parseFloat(p[1]), high: parseFloat(p[2]), low: parseFloat(p[3]), close: parseFloat(p[4]), volume: parseInt(p[5]) };
      })
      .filter((k: KLine) => !isNaN(k.close));
  } catch(e) { 
    logger.error('获取K线失败:', symbol, e);
    return []; 
  }
}

async function getKlines(symbol: string, days: number = 500): Promise<KLine[]> {
  // 使用智能缓存
  const result = await getKlinesSmart(symbol, 'us', days, () => fetchKlinesFromAPI(symbol, days));
  return result.klines;
}

// ============ 策略执行 ============

function runRSI(klines: KLine[], period: number = 10, oversold: number = 35, overbought: number = 65) {
  const trades: { date: string; type: 'buy' | 'sell'; price: number }[] = [];
  let hasPos = false;
  
  for (let i = period + 1; i < klines.length; i++) {
    let gains = 0, losses = 0;
    for (let j = 1; j <= period; j++) {
      const change = klines[i-j].close - klines[i-j-1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
    
    if (!hasPos && rsi < oversold) {
      trades.push({ date: klines[i].date, type: 'buy', price: klines[i].close });
      hasPos = true;
    } else if (hasPos && rsi > overbought) {
      trades.push({ date: klines[i].date, type: 'sell', price: klines[i].close });
      hasPos = false;
    }
  }
  
  if (hasPos) trades.push({ date: klines[klines.length-1].date, type: 'sell', price: klines[klines.length-1].close });
  return trades;
}

function runMA(klines: KLine[], short: number = 10, long: number = 30) {
  const trades: { date: string; type: 'buy' | 'sell'; price: number }[] = [];
  let hasPos = false;
  
  for (let i = long; i < klines.length; i++) {
    const smaShort = klines.slice(i - short + 1, i + 1).reduce((s, k) => s + k.close, 0) / short;
    const smaLong = klines.slice(i - long + 1, i + 1).reduce((s, k) => s + k.close, 0) / long;
    const prevShort = klines.slice(i - short, i).reduce((s, k) => s + k.close, 0) / short;
    const prevLong = klines.slice(i - long, i).reduce((s, k) => s + k.close, 0) / long;
    
    if (!hasPos && prevShort <= prevLong && smaShort > smaLong) {
      trades.push({ date: klines[i].date, type: 'buy', price: klines[i].close });
      hasPos = true;
    } else if (hasPos && prevShort >= prevLong && smaShort < smaLong) {
      trades.push({ date: klines[i].date, type: 'sell', price: klines[i].close });
      hasPos = false;
    }
  }
  
  if (hasPos) trades.push({ date: klines[klines.length-1].date, type: 'sell', price: klines[klines.length-1].close });
  return trades;
}

// ============ 回测计算 ============

function calculateMetrics(klines: KLine[], trades: { price: number; type: 'buy' | 'sell' }[]) {
  if (trades.length < 2) return null;
  
  let cash = 100000;
  let shares = 0;
  
  for (const t of trades) {
    if (t.type === 'buy') {
      cash -= t.price * 100;
      shares += 100;
    } else {
      cash += t.price * 100;
      shares = 0;
    }
  }
  
  const finalValue = cash + shares * klines[klines.length - 1].close;
  const totalReturn = (finalValue - 100000) / 1000; // 百分比
  
  // 胜率
  let wins = 0, losses = 0;
  for (let i = 1; i < trades.length; i++) {
    if (trades[i].type === 'sell') {
      if (trades[i].price > trades[i-1].price) wins++;
      else losses++;
    }
  }
  
  return {
    totalReturn,
    winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
    totalTrades: trades.length,
    finalValue
  };
}

// ============ 技术分析 ============

function analyzeTechnical(klines: KLine[]) {
  const latest = klines[klines.length - 1];
  const prev10 = klines.slice(-10);
  const prev20 = klines.slice(-20);
  const prev50 = klines.slice(-50);
  
  // 均线
  const ma5 = klines.slice(-5).reduce((s, k) => s + k.close, 0) / 5;
  const ma10 = klines.slice(-10).reduce((s, k) => s + k.close, 0) / 10;
  const ma20 = klines.slice(-20).reduce((s, k) => s + k.close, 0) / 20;
  const ma50 = klines.slice(-50).reduce((s, k) => s + k.close, 0) / 50;
  
  // RSI
  let gains = 0, losses = 0;
  for (let i = klines.length - 14; i < klines.length; i++) {
    const change = klines[i].close - klines[i-1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
  
  // 趋势
  const trend = latest.close > ma20 ? '上涨' : latest.close < ma20 ? '下跌' : '震荡';
  
  // 波动率
  const returns = klines.slice(-20).map((k, i) => i > 0 ? (k.close - klines[i-1].close) / klines[i-1].close : 0);
  const volatility = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * 100;
  
  return {
    price: latest.close,
    change: ((latest.close - klines[klines.length - 2].close) / klines[klines.length - 2].close * 100).toFixed(2),
    ma5: ma5.toFixed(2),
    ma10: ma10.toFixed(2),
    ma20: ma20.toFixed(2),
    ma50: ma50.toFixed(2),
    rsi: rsi.toFixed(1),
    trend,
    volatility: volatility.toFixed(2),
    volume: latest.volume,
    volumeRatio: (latest.volume / (prev20.reduce((s, k) => s + k.volume, 0) / 20)).toFixed(2)
  };
}

// ============ 推荐生成 ============

export interface InvestmentRecommendation {
  symbol: string;
  name: string;
  type: 'long' | 'short' | 'hold';
  confidence: number;  // 0-100
  timeframe: '短期' | '中期' | '长期';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  risk: '低' | '中' | '高';
  evidence: {
    technical: string[];
    fundamental: string[];
    sentiment: string[];
    kline: string[];
  };
  updatedAt: Date;
}

/**
 * 生成投资推荐
 */
export async function generateRecommendation(symbol: string, name: string): Promise<InvestmentRecommendation | null> {
  const klines = await getKlines(symbol, 250);
  if (klines.length < 50) return null;
  
  const tech = analyzeTechnical(klines);
  const regime = new MarketRegimeDetector();
  const marketRegime = regime.detect(klines.map(k => ({ close: k.close })) as any);
  
  // 运行策略
  const rsiTrades = runRSI(klines);
  const rsiMetrics = calculateMetrics(klines, rsiTrades);
  
  const maTrades = runMA(klines);
  const maMetrics = calculateMetrics(klines, maTrades);
  
  // 综合评分
  let score = 0;
  const evidence: InvestmentRecommendation['evidence'] = {
    technical: [],
    fundamental: [],
    sentiment: [],
    kline: []
  };
  
  // 技术面分析
  if (parseFloat(tech.rsi) < 35) {
    score += 20;
    evidence.technical.push(`RSI超卖(${tech.rsi})，存在反弹机会`);
  } else if (parseFloat(String(tech.rsi)) > 65) {
    score -= 10;
    evidence.technical.push(`RSI超买(${tech.rsi})，注意回调风险`);
  }
  
  if (parseFloat(String(tech.price)) > parseFloat(String(tech.ma20))) {
    score += 15;
    evidence.technical.push(`价格站稳20日均线(${tech.ma20})，趋势向好`);
  }
  
  if (tech.ma5 > tech.ma10 && tech.ma10 > tech.ma20) {
    score += 15;
    evidence.technical.push('均线多头排列，短期看涨');
  }
  
  // K线形态
  const last3 = klines.slice(-3);
  if (last3[2].close > last3[1].close && last3[1].close > last3[0].close) {
    score += 10;
    evidence.kline.push('连续3天收阳，强势信号');
  }
  if (last3[2].close > last3[2].open && last3[1].close < last3[1].open) {
    score += 10;
    evidence.kline.push('出现吞没形态，看涨');
  }
  
  // 成交量
  if (parseFloat(tech.volumeRatio) > 1.5) {
    score += 10;
    evidence.sentiment.push(`成交量放大(${tech.volumeRatio}倍)，资金入场`);
  }
  
  // 市场环境
  if (marketRegime === 'bull') {
    score += 10;
    evidence.fundamental.push('市场处于上涨趋势，顺势而为');
  }
  
  // 确定方向
  let type: 'long' | 'short' | 'hold' = 'hold';
  if (score >= 50) type = 'long';
  else if (score <= 20) type = 'short';
  
  // 确定时间框架
  let timeframe: '短期' | '中期' | '长期' = '中期';
  if (score >= 60) timeframe = '短期';
  else if (score >= 40 && klines.length >= 100) timeframe = '长期';
  
  // 计算目标价和止损价
  const entry = tech.price;
  const target = type === 'long' ? entry * 1.15 : entry * 0.85;
  const stop = type === 'long' ? entry * 0.95 : entry * 1.05;
  
  return {
    symbol,
    name,
    type,
    confidence: Math.min(100, Math.max(0, score)),
    timeframe,
    entryPrice: entry,
    targetPrice: target,
    stopLoss: stop,
    risk: score >= 50 ? '低' : score >= 30 ? '中' : '高',
    evidence,
    updatedAt: new Date()
  };
}

/**
 * 批量生成推荐
 */
export async function generateBatchRecommendations(symbols: { symbol: string; name: string }[]): Promise<InvestmentRecommendation[]> {
  const recommendations: InvestmentRecommendation[] = [];
  
  for (const s of symbols) {
    try {
      const rec = await generateRecommendation(s.symbol, s.name);
      if (rec && rec.confidence >= 30) {
        recommendations.push(rec);
      }
    } catch(e) {
      logger.error('生成推荐失败:', s.symbol, e);
    }
  }
  
  // 按置信度排序
  return recommendations.sort((a, b) => b.confidence - a.confidence);
}

/**
 * 生成推荐报告
 */
export function formatRecommendationReport(recommendations: InvestmentRecommendation[]): string {
  let report = '# 投资推荐报告\n\n';
  report += `生成时间: ${new Date().toLocaleString()}\n`;
  report += `推荐标的数: ${recommendations.length}\n\n`;
  
  for (const rec of recommendations) {
    const emoji = rec.type === 'long' ? '🟢' : rec.type === 'short' ? '🔴' : '⚪';
    report += `## ${emoji} ${rec.name} (${rec.symbol})\n\n`;
    report += `- **置信度**: ${rec.confidence}%\n`;
    report += `- **操作**: ${rec.type === 'long' ? '买入' : rec.type === 'short' ? '卖出' : '持有'}\n`;
    report += `- **时间框架**: ${rec.timeframe}\n`;
    report += `- **风险等级**: ${rec.risk}\n`;
    report += `- **建议价位**: ¥${rec.entryPrice.toFixed(2)}\n`;
    report += `- **目标价位**: ¥${rec.targetPrice.toFixed(2)} (${rec.type === 'long' ? '+' : '-'}${Math.abs((rec.targetPrice/rec.entryPrice-1)*100).toFixed(1)}%)\n`;
    report += `- **止损价位**: ¥${rec.stopLoss.toFixed(2)}\n\n`;
    
    if (rec.evidence.technical.length > 0) {
      report += `### 技术面\n${rec.evidence.technical.map(e => `- ${e}`).join('\n')}\n\n`;
    }
    if (rec.evidence.kline.length > 0) {
      report += `### K线形态\n${rec.evidence.kline.map(e => `- ${e}`).join('\n')}\n\n`;
    }
    if (rec.evidence.sentiment.length > 0) {
      report += `### 情绪面\n${rec.evidence.sentiment.map(e => `- ${e}`).join('\n')}\n\n`;
    }
    if (rec.evidence.fundamental.length > 0) {
      report += `### 资金面/基本面\n${rec.evidence.fundamental.map(e => `- ${e}`).join('\n')}\n\n`;
    }
    report += '---\n\n';
  }
  
  return report;
}
