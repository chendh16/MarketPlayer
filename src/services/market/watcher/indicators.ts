/**
 * 指标计算引擎
 * 使用 pandas-ta 计算技术指标
 */

import { logger } from '../../../utils/logger';

export interface IndicatorResult {
  rsi?: number;
  macd?: { line: number; signal: number; histogram: number };
  ema5?: number;
  ema20?: number;
  ema60?: number;
  ma5?: number;
  ma20?: number;
  ma60?: number;
  boll?: { upper: number; middle: number; lower: number };
  atr?: number;
}

/**
 * 计算技术指标 (使用 pandas-ta)
 */
export async function calculateIndicators(
  symbol: string,
  period: string = '1day'
): Promise<IndicatorResult> {
  const pythonCode = `
import pandas as pd
import pandas_ta as ta
import json

# 模拟历史数据 (实际应该从数据源获取)
# 这里用模拟数据演示
dates = pd.date_range(start='2026-01-01', periods=50, freq='D')
import numpy as np
np.random.seed(42)

# 生成模拟价格数据
prices = 100 + np.cumsum(np.random.randn(50) * 2)
data = pd.DataFrame({'Close': prices}, index=dates)

# 计算指标
data['RSI'] = ta.rsi(data['Close'], length=14)
data['EMA5'] = ta.ema(data['Close'], length=5)
data['EMA20'] = ta.ema(data['Close'], length=20)
data['EMA60'] = ta.ema(data['Close'], length=60)

# MACD
macd = ta.macd(data['Close'])
if macd is not None and len(macd.columns) >= 3:
    data['MACD'] = macd.iloc[:, 0]
    data['MACD_signal'] = macd.iloc[:, 1]
    data['MACD_hist'] = macd.iloc[:, 2]

# 布林带
boll = ta.bbands(data['Close'], length=20)
if boll is not None and len(boll.columns) >= 3:
    data['BOLL_upper'] = boll.iloc[:, 0]
    data['BOLL_middle'] = boll.iloc[:, 1]
    data['BOLL_lower'] = boll.iloc[:, 2]

# 获取最新值
latest = data.iloc[-1]

result = {
    'rsi': float(latest['RSI']) if pd.notna(latest.get('RSI')) else None,
    'ema5': float(latest['EMA5']) if pd.notna(latest.get('EMA5')) else None,
    'ema20': float(latest['EMA20']) if pd.notna(latest.get('EMA20')) else None,
    'ema60': float(latest['EMA60']) if pd.notna(latest.get('EMA60')) else None,
    'macd_line': float(latest['MACD']) if pd.notna(latest.get('MACD')) else None,
    'macd_signal': float(latest['MACD_signal']) if pd.notna(latest.get('MACD_signal')) else None,
    'macd_hist': float(latest['MACD_hist']) if pd.notna(latest.get('MACD_hist')) else None,
    'boll_upper': float(latest['BOLL_upper']) if pd.notna(latest.get('BOLL_upper')) else None,
    'boll_middle': float(latest['BOLL_middle']) if pd.notna(latest.get('BOLL_middle')) else None,
    'boll_lower': float(latest['BOLL_lower']) if pd.notna(latest.get('BOLL_lower')) else None,
}

print('RESULT:', json.dumps(result))
`;
  
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    
    const child = spawn('python3', ['-c', pythonCode], {
      env: { 
        ...process.env, 
        PYTHONPATH: '/Users/zhengzefeng/Library/Python/3.9/lib/python3.9/site-packages' 
      }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data: any) => { stdout += data.toString(); });
    child.stderr.on('data', (data: any) => { stderr += data.toString(); });
    
    child.on('close', () => {
      try {
        const match = stdout.match(/RESULT: (.+)/);
        if (match) {
          const data = JSON.parse(match[1]);
          resolve({
            rsi: data.rsi,
            ema5: data.ema5,
            ema20: data.ema20,
            ema60: data.ema60,
            macd: data.macd_line !== null ? {
              line: data.macd_line,
              signal: data.macd_signal,
              histogram: data.macd_hist,
            } : undefined,
            boll: data.boll_upper !== null ? {
              upper: data.boll_upper,
              middle: data.boll_middle,
              lower: data.boll_lower,
            } : undefined,
          });
        } else {
          resolve({});
        }
      } catch (error) {
        logger.error('[Indicators] 计算失败:', error);
        resolve({});
      }
    });
    
    child.on('error', () => {
      resolve({});
    });
  });
}

/**
 * 简单的 RSI 计算 (不依赖 pandas-ta)
 * 用于内存中实时计算
 */
export function calculateRSISimple(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * 简单的移动平均计算
 */
export function calculateMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const recent = prices.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

/**
 * 简单的指数移动平均计算
 */
export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * 检测金叉/死叉
 * 返回: 'golden' (金叉), 'death' (死叉), null (无信号)
 */
export function detectMACross(
  maFast: number[],
  maSlow: number[]
): 'golden' | 'death' | null {
  if (maFast.length < 2 || maSlow.length < 2) return null;
  
  const prevFast = maFast[maFast.length - 2];
  const prevSlow = maSlow[maSlow.length - 2];
  const currFast = maFast[maFast.length - 1];
  const currSlow = maSlow[maSlow.length - 1];
  
  // 金叉: 快线从下方穿越慢线
  if (prevFast <= prevSlow && currFast > currSlow) {
    return 'golden';
  }
  
  // 死叉: 快线从上方穿越慢线
  if (prevFast >= prevSlow && currFast < currSlow) {
    return 'death';
  }
  
  return null;
}
