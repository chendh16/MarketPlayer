/**
 * AI策略引擎
 * 
 * 基于机器学习的策略：逻辑回归/随机森林/简单神经网络
 * 参考Qlib风格的特征工程
 */

import { logger } from '../utils/logger';
import { getHistoryKLine, KLine } from '../services/market/quote-service';

/**
 * 特征数据
 */
export interface Features {
  returns: number;      // 日收益率
  volumeRatio: number;  // 量比
  volatility: number;   // 波动率
  rsi: number;         // RSI
  ma5: number;         // MA5/MA20
  ma20: number;
  priceMomentum: number; // 价格动量
  volumeMomentum: number; // 量能动量
}

/**
 * 预测结果
 */
export interface Prediction {
  symbol: string;
  market: string;
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;   // 置信度 0-100
  features: Features;
  timestamp: number;
}

// ==================== 特征工程 ====================

/**
 * 提取特征
 */
function extractFeatures(klines: KLine[]): Features {
  if (klines.length < 20) {
    return { returns: 0, volumeRatio: 1, volatility: 0, rsi: 50, ma5: 0, ma20: 0, priceMomentum: 0, volumeMomentum: 0 };
  }
  
  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  
  // 日收益率
  const returns = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2];
  
  // 量比 (近5日平均量 / 前20日平均量)
  const v5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const v20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = v5 / (v20 || 1);
  
  // 波动率 (20日标准差)
  const mean = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
  const volatility = Math.sqrt(variance) / mean;
  
  // RSI
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  const rsi = 100 - (100 / (1 + rs));
  
  // MA
  const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  
  // 动量
  const priceMomentum = (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10];
  const volumeMomentum = (volumes[volumes.length - 1] - volumes[volumes.length - 10]) / (volumes[volumes.length - 10] || 1);
  
  return { returns, volumeRatio, volatility, rsi, ma5, ma20, priceMomentum, volumeMomentum };
}

// ==================== 简单ML模型 ====================

/**
 * 逻辑回归预测 (简化版)
 */
function logisticRegression(features: Features): { signal: 'buy' | 'sell' | 'hold'; confidence: number } {
  // 简化权重
  const w = {
    returns: 0.3,
    volumeRatio: 0.2,
    volatility: -0.1,
    rsi: 0.15,
    ma5: 0.1,
    priceMomentum: 0.25,
  };
  
  // 线性组合
  let score = 0;
  score += features.returns * w.returns * 10;
  score += (features.volumeRatio - 1) * w.volumeRatio * 5;
  score += features.volatility * w.volatility * 10;
  score += (features.rsi - 50) / 50 * w.rsi;
  score += (features.ma5 / features.ma20 - 1) * w.ma5 * 5;
  score += features.priceMomentum * w.priceMomentum * 3;
  
  // Sigmoid
  const prob = 1 / (1 + Math.exp(-score));
  
  if (prob > 0.6) return { signal: 'buy', confidence: Math.round(prob * 100) };
  if (prob < 0.4) return { signal: 'sell', confidence: Math.round((1 - prob) * 100) };
  return { signal: 'hold', confidence: 50 };
}

/**
 * 随机森林预测 (简化版)
 */
function randomForest(features: Features): { signal: 'buy' | 'sell' | 'hold'; confidence: number } {
  let buyVotes = 0, sellVotes = 0;
  
  // 10棵决策树
  const trees = [
    () => features.rsi < 30 ? 'buy' : features.rsi > 70 ? 'sell' : 'hold',
    () => features.priceMomentum > 0.1 ? 'buy' : features.priceMomentum < -0.1 ? 'sell' : 'hold',
    () => features.ma5 > features.ma20 ? 'buy' : features.ma5 < features.ma20 ? 'sell' : 'hold',
    () => features.volumeRatio > 1.5 ? 'buy' : features.volumeRatio < 0.5 ? 'sell' : 'hold',
    () => features.returns > 0.03 ? 'buy' : features.returns < -0.03 ? 'sell' : 'hold',
    () => features.volatility > 0.03 ? 'sell' : 'hold',
    () => features.volumeMomentum > 0.5 ? 'buy' : features.volumeMomentum < -0.5 ? 'sell' : 'hold',
    () => (features.rsi < 40 && features.priceMomentum > 0) ? 'buy' : (features.rsi > 60 && features.priceMomentum < 0) ? 'sell' : 'hold',
    () => (features.ma5 > features.ma20 && features.volumeRatio > 1) ? 'buy' : (features.ma5 < features.ma20 && features.volumeRatio < 1) ? 'sell' : 'hold',
    () => features.returns > 0 && features.rsi < 60 ? 'buy' : features.returns < 0 && features.rsi > 40 ? 'sell' : 'hold',
  ];
  
  for (const tree of trees) {
    const vote = tree();
    if (vote === 'buy') buyVotes++;
    else if (vote === 'sell') sellVotes++;
  }
  
  const total = buyVotes + sellVotes;
  if (buyVotes > sellVotes && buyVotes > 3) return { signal: 'buy', confidence: Math.round(buyVotes / 10 * 100) };
  if (sellVotes > buyVotes && sellVotes > 3) return { signal: 'sell', confidence: Math.round(sellVotes / 10 * 100) };
  return { signal: 'hold', confidence: 50 };
}

/**
 * 集成预测
 */
function ensemblePrediction(features: Features): { signal: 'buy' | 'sell' | 'hold'; confidence: number } {
  const lr = logisticRegression(features);
  const rf = randomForest(features);
  
  // 投票
  let buyVotes = 0, sellVotes = 0;
  if (lr.signal === 'buy') buyVotes++; else if (lr.signal === 'sell') sellVotes++;
  if (rf.signal === 'buy') buyVotes++; else if (rf.signal === 'sell') sellVotes++;
  
  const avgConfidence = (lr.confidence + rf.confidence) / 2;
  
  if (buyVotes > sellVotes) return { signal: 'buy', confidence: avgConfidence };
  if (sellVotes > buyVotes) return { signal: 'sell', confidence: avgConfidence };
  return { signal: 'hold', confidence: avgConfidence };
}

// ==================== 主预测 ====================

/**
 * AI预测
 */
export async function predict(symbol: string, market: 'a' | 'hk' | 'us'): Promise<Prediction | null> {
  try {
    const klines = await getHistoryKLine(symbol, market, '1d', '3mo');
    
    if (klines.length < 30) {
      logger.warn(`[ML] 数据不足: ${symbol}`);
      return null;
    }
    
    const features = extractFeatures(klines);
    const { signal, confidence } = ensemblePrediction(features);
    
    return {
      symbol,
      market,
      signal,
      confidence,
      features,
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`[ML] 预测失败: ${symbol}`, error);
    return null;
  }
}

/**
 * 批量预测
 */
export async function batchPredict(symbols: string[], market: 'a' | 'hk' | 'us'): Promise<Prediction[]> {
  const results: Prediction[] = [];
  
  for (const symbol of symbols) {
    const pred = await predict(symbol, market);
    if (pred && pred.signal !== 'hold') {
      results.push(pred);
    }
  }
  
  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * 获取特征重要性 (模拟)
 */
export function getFeatureImportance(): Array<{ feature: string; importance: number }> {
  return [
    { feature: 'priceMomentum', importance: 0.25 },
    { feature: 'returns', importance: 0.20 },
    { feature: 'volumeRatio', importance: 0.18 },
    { feature: 'rsi', importance: 0.15 },
    { feature: 'ma5', importance: 0.12 },
    { feature: 'volatility', importance: 0.10 },
  ];
}
