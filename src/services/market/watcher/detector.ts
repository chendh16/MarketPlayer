/**
 * 告警条件检测器
 * 
 * 检测以下条件:
 * - 涨跌幅超过阈值
 * - 涨停/跌停
 * - 放量异常
 * - RSI超买/超卖
 */

import { logger } from '../../../utils/logger';

export interface WatchRule {
  id: number;
  userId: string;
  symbol: string;
  market: string;
  conditions: WatchConditions;
  enabled: boolean;
}

export interface WatchConditions {
  priceChangePercent?: number;  // 涨跌幅阈值，如 5 表示 ±5%
  limitUp?: boolean;            // 涨停
  limitDown?: boolean;          // 跌停
  volumeRatio?: number;         // 放量倍数，如 2 表示 2倍
  rsiOverbought?: number;       // RSI超买阈值，如 80
  rsiOversold?: number;         // RSI超卖阈值，如 20
  maGoldenCross?: boolean;      // 均线金叉
  maDeathCross?: boolean;       // 均线死叉
}

export interface StockQuote {
  symbol: string;
  name: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  prevClose: number;
  limitUp: number;
  limitDown: number;
}

export interface StockIndicators {
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  rsi: number;
  macd: string;
  volume: number;
}

export interface WatchAlert {
  id?: number;
  ruleId: number;
  userId: string;
  symbol: string;
  condition: string;
  triggerValue: number;
  message: string;
  quote: StockQuote;
  timestamp: Date;
}

/**
 * 检测告警条件
 */
export function detectAlerts(
  rule: WatchRule,
  quote: StockQuote,
  indicators?: StockIndicators | null
): WatchAlert[] {
  const alerts: WatchAlert[] = [];
  const conditions = rule.conditions;
  
  // 1. 检测涨跌幅
  if (conditions.priceChangePercent) {
    const threshold = conditions.priceChangePercent;
    const absChange = Math.abs(quote.changePercent);
    
    if (absChange >= threshold) {
      alerts.push({
        ruleId: rule.id,
        userId: rule.userId,
        symbol: rule.symbol,
        condition: 'price_change',
        triggerValue: quote.changePercent,
        message: `【涨跌幅告警】${quote.name}(${rule.symbol}) 涨跌 ${quote.changePercent.toFixed(2)}%，超过阈值 ${threshold}%`,
        quote,
        timestamp: new Date(),
      });
    }
  }
  
  // 2. 检测涨停
  if (conditions.limitUp && quote.lastPrice >= quote.limitUp * 0.999) {
    alerts.push({
      ruleId: rule.id,
      userId: rule.userId,
      symbol: rule.symbol,
      condition: 'limit_up',
      triggerValue: quote.lastPrice,
      message: `【涨停告警】${quote.name}(${rule.symbol}) 触及涨停！`,
      quote,
      timestamp: new Date(),
    });
  }
  
  // 3. 检测跌停
  if (conditions.limitDown && quote.lastPrice <= quote.limitDown * 1.001) {
    alerts.push({
      ruleId: rule.id,
      userId: rule.userId,
      symbol: rule.symbol,
      condition: 'limit_down',
      triggerValue: quote.lastPrice,
      message: `【跌停告警】${quote.name}(${rule.symbol}) 触及跌停！`,
      quote,
      timestamp: new Date(),
    });
  }
  
  // 4. 检测放量 (需要对比历史平均)
  if (conditions.volumeRatio && indicators) {
    // 简化：使用当日成交量/5日均量
    const avgVolume5 = indicators.ma5; // 简化：使用MA5作为参考
    const ratio = quote.volume / Math.max(avgVolume5, 1);
    
    if (ratio >= conditions.volumeRatio) {
      alerts.push({
        ruleId: rule.id,
        userId: rule.userId,
        symbol: rule.symbol,
        condition: 'volume_surge',
        triggerValue: ratio,
        message: `【放量告警】${quote.name}(${rule.symbol}) 成交量放大 ${ratio.toFixed(1)}倍！`,
        quote,
        timestamp: new Date(),
      });
    }
  }
  
  // 5. 检测RSI超买
  if (conditions.rsiOverbought && indicators?.rsi) {
    if (indicators.rsi >= conditions.rsiOverbought) {
      alerts.push({
        ruleId: rule.id,
        userId: rule.userId,
        symbol: rule.symbol,
        condition: 'rsi_overbought',
        triggerValue: indicators.rsi,
        message: `【RSI超买】${quote.name}(${rule.symbol}) RSI=${indicators.rsi.toFixed(1)}，注意回调风险`,
        quote,
        timestamp: new Date(),
      });
    }
  }
  
  // 6. 检测RSI超卖
  if (conditions.rsiOversold && indicators?.rsi) {
    if (indicators.rsi <= conditions.rsiOversold) {
      alerts.push({
        ruleId: rule.id,
        userId: rule.userId,
        symbol: rule.symbol,
        condition: 'rsi_oversold',
        triggerValue: indicators.rsi,
        message: `【RSI超卖】${quote.name}(${rule.symbol}) RSI=${indicators.rsi.toFixed(1)}，可能存在反弹机会`,
        quote,
        timestamp: new Date(),
      });
    }
  }
  
  // 7. 检测均线金叉
  if (conditions.maGoldenCross && indicators) {
    // 简化：MA5 > MA10 视为金叉
    if (indicators.ma5 > indicators.ma10) {
      alerts.push({
        ruleId: rule.id,
        userId: rule.userId,
        symbol: rule.symbol,
        condition: 'ma_golden_cross',
        triggerValue: indicators.ma5 / indicators.ma10,
        message: `【均线金叉】${quote.name}(${rule.symbol}) MA5上穿MA10，形成金叉`,
        quote,
        timestamp: new Date(),
      });
    }
  }
  
  // 8. 检测均线死叉
  if (conditions.maDeathCross && indicators) {
    if (indicators.ma5 < indicators.ma10) {
      alerts.push({
        ruleId: rule.id,
        userId: rule.userId,
        symbol: rule.symbol,
        condition: 'ma_death_cross',
        triggerValue: indicators.ma5 / indicators.ma10,
        message: `【均线死叉】${quote.name}(${rule.symbol}) MA5下穿MA10，形成死叉`,
        quote,
        timestamp: new Date(),
      });
    }
  }
  
  return alerts;
}

/**
 * 获取默认监控条件（价值投资风格）
 */
export function getDefaultConditions(): WatchConditions {
  return {
    priceChangePercent: 5,    // 涨跌幅超过5%
    limitUp: true,             // 涨停
    limitDown: true,           // 跌停
    volumeRatio: 2,           // 放量2倍
    rsiOverbought: 80,         // RSI超买
    rsiOversold: 20,           // RSI超卖
  };
}
