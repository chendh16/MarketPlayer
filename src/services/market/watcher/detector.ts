/**
 * 告警检测引擎
 * 
 * 支持多种告警类型：
 * - 涨跌幅告警
 * - RSI 超买/超卖
 * - MACD 金叉/死叉
 * - 均线金叉/死叉
 * - 成交量异动
 * - 布林带突破
 */

import { Quote } from './market-feed';
import { logger } from '../../../utils/logger';
import { calculateRSISimple, calculateMA, detectMACross } from './indicators';

export type AlertType = 
  | 'price_change' 
  | 'rsi_overbought' 
  | 'rsi_oversold' 
  | 'macd_golden_cross'
  | 'macd_death_cross'
  | 'ma_golden_cross'
  | 'ma_death_cross'
  | 'volume_surge'
  | 'boll_breakout';

export interface AlertCondition {
  type: AlertType;
  threshold: number;
  direction?: 'above' | 'below' | 'both';
}

export interface WatchRule {
  id: number;
  userId: string;
  symbol: string;
  conditions: AlertCondition[];
  enabled: boolean;
}

export interface WatchAlert {
  id: string;
  ruleId: number;
  symbol: string;
  type: AlertType;
  message: string;
  value: number;
  timestamp: Date;
  level: 'urgent' | 'normal' | 'info';
}

// 价格历史缓存
interface PriceHistory {
  prices: Array<{ price: number; timestamp: Date }>;
  volumes: number[];
  rsi?: number;
  ma5?: number;
  ma20?: number;
  maCrossHistory: Array<{ type: 'golden' | 'death'; timestamp: Date }>;
}

class AlertDetector {
  private priceHistory: Map<string, PriceHistory> = new Map();
  private alertCooldown: Map<string, number> = new Map();
  
  // 冷却时间 (毫秒)
  private readonly COOLDOWN = 5 * 60 * 1000;
  
  // RSI 计算周期
  private readonly RSI_PERIOD = 14;
  
  /**
   * 检测告警
   */
  detect(rule: WatchRule, quote: Quote): WatchAlert[] {
    const alerts: WatchAlert[] = [];
    const symbol = quote.symbol;
    
    // 更新价格历史
    this.updatePriceHistory(symbol, quote);
    
    // 检查冷却
    const cooldownKey = `${symbol}:${rule.id}`;
    const lastAlert = this.alertCooldown.get(cooldownKey);
    if (lastAlert && Date.now() - lastAlert < this.COOLDOWN) {
      return [];
    }
    
    for (const condition of rule.conditions) {
      const alert = this.checkCondition(condition, quote, symbol);
      if (alert) {
        alerts.push(alert);
        this.alertCooldown.set(cooldownKey, Date.now());
      }
    }
    
    return alerts;
  }
  
  /**
   * 更新价格历史
   */
  private updatePriceHistory(symbol: string, quote: Quote): void {
    let history = this.priceHistory.get(symbol);
    
    if (!history) {
      history = { 
        prices: [], 
        volumes: [],
        maCrossHistory: [] 
      };
      this.priceHistory.set(symbol, history);
    }
    
    // 添加新价格
    history.prices.push({
      price: quote.lastPrice,
      timestamp: quote.timestamp,
    });
    
    // 添加成交量
    history.volumes.push(quote.volume);
    
    // 只保留最近 100 个价格
    if (history.prices.length > 100) {
      history.prices = history.prices.slice(-100);
    }
    if (history.volumes.length > 100) {
      history.volumes = history.volumes.slice(-100);
    }
    
    // 计算 RSI
    if (history.prices.length >= this.RSI_PERIOD + 1) {
      const prices = history.prices.map(p => p.price);
      history.rsi = calculateRSISimple(prices, this.RSI_PERIOD) ?? undefined;
    }
    
    // 计算均线
    if (history.prices.length >= 20) {
      const prices = history.prices.map(p => p.price);
      history.ma5 = calculateMA(prices, 5) ?? undefined;
      history.ma20 = calculateMA(prices, 20) ?? undefined;
      
      // 检测均线金叉死叉
      if (history.prices.length >= 25) {
        const ma5Arr = prices.slice(-25).map((_, i) => calculateMA(prices.slice(0, i + 5), 5)).filter(v => v !== null) as number[];
        const ma20Arr = prices.slice(-25).map((_, i) => calculateMA(prices.slice(0, i + 20), 20)).filter(v => v !== null) as number[];
        
        if (ma5Arr.length >= 2 && ma20Arr.length >= 2) {
          const cross = detectMACross(ma5Arr, ma20Arr);
          if (cross) {
            const lastCross = history.maCrossHistory[history.maCrossHistory.length - 1];
            // 避免重复告警 (5分钟内)
            if (!lastCross || (Date.now() - lastCross.timestamp.getTime()) > 5 * 60 * 1000) {
              history.maCrossHistory.push({ type: cross, timestamp: new Date() });
              // 只保留最近10条
              if (history.maCrossHistory.length > 10) {
                history.maCrossHistory = history.maCrossHistory.slice(-10);
              }
            }
          }
        }
      }
    }
  }
  
  /**
   * 检查单个条件
   */
  private checkCondition(condition: AlertCondition, quote: Quote, symbol: string): WatchAlert | null {
    const history = this.priceHistory.get(symbol);
    
    switch (condition.type) {
      case 'price_change':
        return this.checkPriceChange(condition, quote, symbol);
        
      case 'rsi_overbought':
        if (history?.rsi && history.rsi > condition.threshold) {
          return this.createAlert(
            { id: 0, userId: '', symbol, conditions: [], enabled: true },
            symbol,
            'rsi_overbought',
            `⚠️ ${symbol} RSI 超买: ${history.rsi.toFixed(2)} > ${condition.threshold}`,
            history.rsi,
            'normal'
          );
        }
        break;
        
      case 'rsi_oversold':
        if (history?.rsi && history.rsi < condition.threshold) {
          return this.createAlert(
            { id: 0, userId: '', symbol, conditions: [], enabled: true },
            symbol,
            'rsi_oversold',
            `🟢 ${symbol} RSI 超卖: ${history.rsi.toFixed(2)} < ${condition.threshold}`,
            history.rsi,
            'normal'
          );
        }
        break;
        
      case 'ma_golden_cross':
        // 检测最近的金叉
        if (history?.maCrossHistory) {
          const lastCross = history.maCrossHistory[history.maCrossHistory.length - 1];
          if (lastCross && lastCross.type === 'golden' && 
              (Date.now() - lastCross.timestamp.getTime()) < 60000) { // 1分钟内
            return this.createAlert(
              { id: 0, userId: '', symbol, conditions: [], enabled: true },
              symbol,
              'ma_golden_cross',
              `🔔 ${symbol} 均线金叉 (MA5 上穿 MA20)`,
              history.ma5 || 0,
              'info'
            );
          }
        }
        break;
        
      case 'ma_death_cross':
        // 检测最近的死叉
        if (history?.maCrossHistory) {
          const lastCross = history.maCrossHistory[history.maCrossHistory.length - 1];
          if (lastCross && lastCross.type === 'death' && 
              (Date.now() - lastCross.timestamp.getTime()) < 60000) {
            return this.createAlert(
              { id: 0, userId: '', symbol, conditions: [], enabled: true },
              symbol,
              'ma_death_cross',
              `🔔 ${symbol} 均线死叉 (MA5 下穿 MA20)`,
              history.ma5 || 0,
              'info'
            );
          }
        }
        break;
        
      case 'volume_surge':
        return this.checkVolumeSurge(condition, quote, symbol, history);
    }
    
    return null;
  }
  
  /**
   * 检查涨跌幅
   */
  private checkPriceChange(condition: AlertCondition, quote: Quote, symbol: string): WatchAlert | null {
    const changePct = quote.changePct;
    const threshold = condition.threshold;
    
    let triggered = false;
    let message = '';
    
    if (condition.direction === 'above' || condition.direction === 'both') {
      if (changePct > threshold) {
        triggered = true;
        message = `🚀 ${symbol} 涨幅告警: +${changePct.toFixed(2)}% > +${threshold}%`;
      }
    }
    
    if (condition.direction === 'below' || condition.direction === 'both') {
      if (changePct < -threshold) {
        triggered = true;
        message = `🔻 ${symbol} 跌幅告警: ${changePct.toFixed(2)}% < -${threshold}%`;
      }
    }
    
    if (triggered) {
      return this.createAlert(
        { id: 0, userId: '', symbol, conditions: [], enabled: true },
        symbol,
        'price_change',
        message,
        changePct,
        'urgent'
      );
    }
    
    return null;
  }
  
  /**
   * 检查成交量异动
   */
  private checkVolumeSurge(
    condition: AlertCondition, 
    quote: Quote, 
    symbol: string,
    history?: PriceHistory
  ): WatchAlert | null {
    if (!history || history.volumes.length < 10) return null;
    
    const recentVolumes = history.volumes.slice(-10);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const surgeRatio = quote.volume / avgVolume;
    
    if (surgeRatio > condition.threshold) {
      return this.createAlert(
        { id: 0, userId: '', symbol, conditions: [], enabled: true },
        symbol,
        'volume_surge',
        `📊 ${symbol} 成交量异动: ${surgeRatio.toFixed(1)}x 放量`,
        surgeRatio,
        'normal'
      );
    }
    
    return null;
  }
  
  /**
   * 创建告警对象
   */
  private createAlert(
    rule: WatchRule,
    symbol: string,
    type: AlertType,
    message: string,
    value: number,
    level: 'urgent' | 'normal' | 'info'
  ): WatchAlert {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      symbol,
      type,
      message,
      value,
      timestamp: new Date(),
      level,
    };
  }
  
  /**
   * 清除历史
   */
  clearHistory(symbol?: string): void {
    if (symbol) {
      this.priceHistory.delete(symbol);
    } else {
      this.priceHistory.clear();
    }
  }
  
  /**
   * 获取当前指标值
   */
  getIndicators(symbol: string): PriceHistory | undefined {
    return this.priceHistory.get(symbol);
  }
}

// 单例
let detectorInstance: AlertDetector | null = null;

export function getAlertDetector(): AlertDetector {
  if (!detectorInstance) {
    detectorInstance = new AlertDetector();
  }
  return detectorInstance;
}

export { AlertDetector };
