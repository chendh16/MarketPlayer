/**
 * 富途 WebSocket 实时行情订阅
 * 
 * 使用 futu-api Python 接口实现实时行情推送
 */

import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';

export interface Quote {
  symbol: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: Date;
  change: number;
  changePct: number;
}

export interface MarketFeedEvents {
  'quote': (quote: Quote) => void;
  'error': (error: Error) => void;
  'connect': () => void;
  'disconnect': () => void;
}

export class FutuMarketFeed extends EventEmitter {
  private symbols: Set<string> = new Set();
  private isConnected: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastPrices: Map<string, number> = new Map();
  
  // 轮询间隔 (毫秒)
  private readonly POLL_INTERVAL = 3000;
  
  constructor() {
    super();
  }
  
  /**
   * 启动行情订阅
   */
  async start(symbols: string[]): Promise<void> {
    logger.info(`[MarketFeed] 启动行情订阅: ${symbols.join(', ')}`);
    
    symbols.forEach(s => this.symbols.add(s));
    
    // 先获取一次初始价格
    await this.fetchQuotes();
    
    // 启动轮询
    this.pollInterval = setInterval(() => {
      this.fetchQuotes();
    }, this.POLL_INTERVAL);
    
    this.isConnected = true;
    this.emit('connect');
  }
  
  /**
   * 停止订阅
   */
  async stop(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    this.isConnected = false;
    this.emit('disconnect');
    logger.info('[MarketFeed] 行情订阅已停止');
  }
  
  /**
   * 添加订阅股票
   */
  addSymbol(symbol: string): void {
    this.symbols.add(symbol);
    logger.info(`[MarketFeed] 添加订阅: ${symbol}`);
  }
  
  /**
   * 移除订阅股票
   */
  removeSymbol(symbol: string): void {
    this.symbols.delete(symbol);
    logger.info(`[MarketFeed] 移除订阅: ${symbol}`);
  }
  
  /**
   * 获取订阅列表
   */
  getSymbols(): string[] {
    return Array.from(this.symbols);
  }
  
  /**
   * 获取连接状态
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
  
  /**
   * 获取实时行情 (使用富途模拟账户持仓作为数据源)
   * 因为富途行情API需要付费，我们用持仓价格模拟
   */
  private async fetchQuotes(): Promise<void> {
    const symbols = Array.from(this.symbols);
    if (symbols.length === 0) return;
    
    try {
      // 使用富途模拟账户持仓数据作为实时价格
      const pythonCode = `
from futu import *
import json

trd_ctx = OpenSecTradeContext(
    filter_trdmarket=TrdMarket.US, 
    host='127.0.0.1', 
    port=11111, 
    security_firm=SecurityFirm.FUTUSECURITIES
)

trd_ctx.unlock_trade('602602')

# 获取持仓作为实时价格
ret, data = trd_ctx.position_list_query(trd_env=TrdEnv.SIMULATE, acc_index=0)
if ret == 0 and len(data) > 0:
    result = []
    for i in range(len(data)):
        row = data.iloc[i]
        # 使用现价和成本价模拟
        result.append({
            'code': str(row['code']),
            'last_price': float(row['nominal_price']) if row.get('nominal_price') else 0,
            'open': float(row['cost_price']) if row.get('cost_price') else 0,
            'high': float(row['nominal_price']) if row.get('nominal_price') else 0,
            'low': float(row['nominal_price']) if row.get('nominal_price') else 0,
            'volume': 0,
        })
    print('RESULT:', json.dumps(result))
else:
    print('RESULT: []')
trd_ctx.close()
`;
      
      const result = await this.runPython(pythonCode);
      
      if (result.success && result.data) {
        const match = result.data.match(/RESULT: (.+)/);
        if (match) {
          const quotes = JSON.parse(match[1]);
          for (const quote of quotes) {
            const lastPrice = quote.last_price;
            const openPrice = quote.open;
            
            // 计算涨跌幅
            const change = openPrice > 0 ? lastPrice - openPrice : 0;
            const changePct = openPrice > 0 ? (change / openPrice) * 100 : 0;
            
            const quoteData: Quote = {
              symbol: quote.code,
              lastPrice,
              open: openPrice,
              high: quote.high,
              low: quote.low,
              volume: quote.volume,
              timestamp: new Date(),
              change,
              changePct,
            };
            
            // 触发价格更新事件
            this.emit('quote', quoteData);
          }
        }
      }
    } catch (error) {
      logger.error('[MarketFeed] 获取行情失败:', error);
      this.emit('error', error as Error);
    }
  }
  
  /**
   * 执行 Python 代码
   */
  private runPython(code: string): Promise<{ success: boolean; data?: string; error?: string }> {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      
      const child = spawn('python3', ['-c', code], {
        env: { 
          ...process.env, 
          PYTHONPATH: '/Users/zhengzefeng/Library/Python/3.9/lib/python3.9/site-packages' 
        }
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data: any) => { stdout += data.toString(); });
      child.stderr.on('data', (data: any) => { stderr += data.toString(); });
      
      child.on('close', (code: any) => {
        if (code === 0) {
          resolve({ success: true, data: stdout });
        } else {
          resolve({ success: false, error: stderr || stdout });
        }
      });
      
      child.on('error', (err: any) => {
        resolve({ success: false, error: err.message });
      });
    });
  }
}

// 单例
let marketFeedInstance: FutuMarketFeed | null = null;

export function getMarketFeed(): FutuMarketFeed {
  if (!marketFeedInstance) {
    marketFeedInstance = new FutuMarketFeed();
  }
  return marketFeedInstance;
}
