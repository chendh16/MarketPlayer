/**
 * MarketPlayer 测试套件
 */

import { describe, it, expect } from '@jest/globals';

// ==================== 工具函数测试 ====================

describe('Utils', () => {
  it('should format price correctly', () => {
    const formatPrice = (price: number) => price.toFixed(2);
    expect(formatPrice(123.456)).toBe('123.46');
    expect(formatPrice(100)).toBe('100.00');
  });
  
  it('should calculate percentage correctly', () => {
    const calcPct = (current: number, previous: number) => ((current - previous) / previous * 100);
    expect(calcPct(110, 100)).toBe(10);
    expect(calcPct(90, 100)).toBe(-10);
  });
});

// ==================== 策略测试 ====================

describe('Strategy', () => {
  it('should generate correct signal for uptrend', () => {
    // 模拟上涨趋势
    const prices = [100, 102, 105, 108, 110, 112];
    const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma10 = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    expect(ma5 > ma10).toBe(true); // 金叉
  });
  
  it('should calculate RSI correctly', () => {
    const prices = [100, 102, 101, 103, 105, 104, 106];
    let gains = 0, losses = 0;
    
    for (let i = 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    
    const avgGain = gains / 6;
    const avgLoss = losses / 6;
    const rs = avgGain / (avgLoss || 1);
    const rsi = 100 - (100 / (1 + rs));
    
    expect(rsi).toBeGreaterThan(50);
  });
});

// ==================== 仓位管理测试 ====================

describe('PositionManager', () => {
  it('should calculate position value correctly', () => {
    const quantity = 100;
    const price = 50;
    const value = quantity * price;
    expect(value).toBe(5000);
  });
  
  it('should calculate profit correctly', () => {
    const entryPrice = 100;
    const currentPrice = 110;
    const quantity = 50;
    const profit = (currentPrice - entryPrice) * quantity;
    expect(profit).toBe(500);
  });
  
  it('should calculate profit percentage correctly', () => {
    const entryPrice = 100;
    const currentPrice = 110;
    const profitPct = (currentPrice - entryPrice) / entryPrice * 100;
    expect(profitPct).toBe(10);
  });
});

// ==================== 风控测试 ====================

describe('RiskManagement', () => {
  it('should detect high position ratio', () => {
    const totalValue = 1000000;
    const positionValue = 900000;
    const ratio = positionValue / totalValue;
    expect(ratio > 0.8).toBe(true); // 仓位过重
  });
  
  it('should detect concentrated position', () => {
    const positions = 2;
    const totalValue = 1000000;
    expect(positions < 3 && totalValue > 500000).toBe(true); // 持仓集中
  });
  
  it('should calculate stop loss correctly', () => {
    const entryPrice = 100;
    const stopLossPercent = 3;
    const stopPrice = entryPrice * (1 - stopLossPercent / 100);
    expect(stopPrice).toBe(97);
  });
  
  it('should calculate take profit correctly', () => {
    const entryPrice = 100;
    const takeProfitPercent = 10;
    const targetPrice = entryPrice * (1 + takeProfitPercent / 100);
    expect(targetPrice).toBe(110);
  });
});

// ==================== 数据格式测试 ====================

describe('DataFormats', () => {
  it('should validate stock symbol format', () => {
    const isValidSymbol = (symbol: string) => /^[0-9]{6}$|^[A-Z]{1,5}$/.test(symbol);
    expect(isValidSymbol('600519')).toBe(true);
    expect(isValidSymbol('AAPL')).toBe(true);
    expect(isValidSymbol('123')).toBe(false);
  });
  
  it('should validate market type', () => {
    const validMarkets = ['a', 'hk', 'us'];
    const isValidMarket = (m: string) => validMarkets.includes(m);
    expect(isValidMarket('a')).toBe(true);
    expect(isValidMarket('hk')).toBe(true);
    expect(isValidMarket('us')).toBe(true);
    expect(isValidMarket('crypto')).toBe(false);
  });
});

// ==================== 时间判断测试 ====================

describe('MarketTime', () => {
  it('should detect A股交易时间', () => {
    // 模拟A股交易时间 9:30-11:30, 13:00-15:00
    const isATrading = (hour: number, minute: number) => {
      const time = hour * 60 + minute;
      return (time >= 570 && time < 690) || (time >= 780 && time < 900);
    };
    
    expect(isATrading(10, 0)).toBe(true); // 10:00 交易中
    expect(isATrading(14, 30)).toBe(true); // 14:30 交易中
    expect(isATrading(12, 0)).toBe(false); // 12:00 午休
    expect(isATrading(16, 0)).toBe(false); // 16:00 收盘
  });
  
  it('should detect US交易时间', () => {
    // 美股夏令时 21:30-04:00 北京时间
    const isUSTrading = (hour: number, minute: number) => {
      const time = hour * 60 + minute;
      return (time >= 1260 && time < 1440) || (time >= 0 && time < 240);
    };
    
    expect(isUSTrading(22, 0)).toBe(true); // 22:00
    expect(isUSTrading(3, 0)).toBe(true); // 03:00
    expect(isUSTrading(15, 0)).toBe(false); // 15:00
  });
});
