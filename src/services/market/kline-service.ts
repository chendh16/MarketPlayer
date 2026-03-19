/**
 * 富途K线数据获取服务
 * 获取真实历史K线用于技术分析
 */

import { logger } from '../../utils/logger';

interface KLine {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface KLineResult {
  symbol: string;
  klines: KLine[];
  period: string;
}

/**
 * 获取股票K线数据
 */
export async function getKlines(
  symbol: string,
  period: '1K' | '5K' | '15K' | '30K' | '1H' | '1D' = '1D',
  count: number = 100
): Promise<KLineResult> {
  const pythonCode = `
from futu import *
import json
import time

# 连接行情API
qot_ctx = OpenQuoteContext(host='127.0.0.1', port=11111)

symbol = '${symbol}'
period = '${period}'
count = ${count}

# 订阅行情
ret, data = qot_ctx.subscribe([symbol], ['kl_${period}'])
if ret != 0:
    print('ERROR:', data)
    qot_ctx.close()
    exit(1)

time.sleep(2)  # 等待数据

# 获取K线
ret, data = qot_ctx.request_history_kline(symbol, start='2025-01-01', end='2026-03-19', max_count=${count}, kltype=${period === '1D' ? '102' : period === '1H' ? '101' : '1'})

if ret == 0 and len(data) > 0:
    result = []
    for i in range(len(data)):
        row = data.iloc[i]
        result.append({
            'time': int(row['time']) if 'time' in row else 0,
            'open': float(row['open']) if 'open' in row else 0,
            'high': float(row['high']) if 'high' in row else 0,
            'low': float(row['low']) if 'low' in row else 0,
            'close': float(row['close']) if 'close' in row else 0,
            'volume': int(row['volume']) if 'volume' in row else 0,
        })
    print('RESULT:', json.dumps(result))
else:
    print('RESULT:', json.dumps([]))

qot_ctx.close()
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
          const klines = JSON.parse(match[1]);
          resolve({ symbol, klines, period });
        } else {
          resolve({ symbol, klines: [], period });
        }
      } catch (error) {
        logger.error(`[Klines] 获取${symbol}失败:`, error);
        resolve({ symbol, klines: [], period });
      }
    });
  });
}

/**
 * 批量获取多只股票K线
 */
export async function batchGetKlines(
  symbols: string[],
  period: '1K' | '5K' | '15K' | '30K' | '1H' | '1D' = '1D',
  count: number = 100
): Promise<KLineResult[]> {
  const results: KLineResult[] = [];
  
  for (const symbol of symbols) {
    const result = await getKlines(symbol, period, count);
    results.push(result);
    // 避免请求过快
    await new Promise(r => setTimeout(r, 500));
  }
  
  return results;
}

/**
 * 获取真实K线数据并计算技术指标
 */
export async function getStockAnalysis(symbol: string): Promise<{
  klines: KLine[];
  rsi?: number;
  ma5?: number;
  ma20?: number;
  macd?: { line: number; signal: number; histogram: number };
  signal?: string;
}> {
  // 获取日K线
  const { klines } = await getKlines(symbol, '1D', 50);
  
  if (klines.length < 30) {
    return { klines };
  }
  
  // 计算技术指标
  const closes = klines.map(k => k.close);
  
  // RSI
  const rsi = calculateRSI(closes, 14);
  
  // 均线
  const ma5 = calculateMA(closes, 5);
  const ma20 = calculateMA(closes, 20);
  
  // MACD
  const macd = calculateMACD(closes);
  
  // 生成信号
  let signal = 'HOLD';
  
  // RSI超买超卖
  if (rsi && rsi > 70) signal = 'SELL';
  else if (rsi && rsi < 30) signal = 'BUY';
  
  // 均线金叉死叉
  if (ma5 && ma20) {
    const prevMA5 = calculateMA(closes.slice(0, -1), 5);
    const prevMA20 = calculateMA(closes.slice(0, -1), 20);
    if (prevMA5 && prevMA20) {
      if (prevMA5 <= prevMA20 && ma5 > ma20) signal = 'BUY';
      else if (prevMA5 >= prevMA20 && ma5 < ma20) signal = 'SELL';
    }
  }
  
  return {
    klines,
    rsi: rsi ?? undefined,
    ma5: ma5 ?? undefined,
    ma20: ma20 ?? undefined,
    macd: macd ?? undefined,
    signal,
  };
}

// ============= 内置指标计算 =============

function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateMACD(prices: number[]): { line: number; signal: number; histogram: number } | null {
  if (prices.length < 34) return null;
  
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const ema9 = calculateEMA(prices.slice(-34), 9);
  
  if (!ema12 || !ema26 || !ema9) return null;
  
  const line = ema12 - ema26;
  const histogram = line - ema9;
  
  return { line, signal: ema9, histogram };
}

function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}
