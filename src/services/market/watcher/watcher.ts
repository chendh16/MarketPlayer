/**
 * 实时看盘服务主入口
 * 
 * 整合: 行情订阅 + 告警检测 + 飞书通知
 */

import { FutuMarketFeed, Quote, getMarketFeed } from './market-feed';
import { getAlertDetector, WatchRule, WatchAlert } from './detector';
import { sendFeishuAlert } from './feishu-notify';
import { logger } from '../../../utils/logger';

export interface WatcherConfig {
  symbols: string[];
  rules: WatchRule[];
  enabled: boolean;
}

const DEFAULT_CONFIG: WatcherConfig = {
  symbols: [],
  rules: [],
  enabled: true,
};

class RealtimeWatcher {
  private config: WatcherConfig = DEFAULT_CONFIG;
  private marketFeed: FutuMarketFeed;
  private isRunning: boolean = false;
  
  constructor() {
    this.marketFeed = getMarketFeed();
    
    // 监听行情更新
    this.marketFeed.on('quote', (quote: Quote) => {
      this.onQuote(quote);
    });
    
    // 监听错误
    this.marketFeed.on('error', (error: Error) => {
      logger.error('[Watcher] 行情错误:', error);
    });
    
    // 监听连接状态
    this.marketFeed.on('connect', () => {
      logger.info('[Watcher] 行情服务已连接');
    });
    
    this.marketFeed.on('disconnect', () => {
      logger.info('[Watcher] 行情服务已断开');
    });
  }
  
  /**
   * 启动看盘服务
   */
  async start(symbols: string[], rules?: WatchRule[]): Promise<void> {
    if (this.isRunning) {
      logger.warn('[Watcher] 服务已在运行');
      return;
    }
    
    logger.info(`[Watcher] 启动看盘服务，监控: ${symbols.join(', ')}`);
    
    this.config.symbols = symbols;
    this.config.rules = rules || this.getDefaultRules();
    this.config.enabled = true;
    
    // 启动行情订阅
    await this.marketFeed.start(symbols);
    
    this.isRunning = true;
    logger.info('[Watcher] 看盘服务已启动');
  }
  
  /**
   * 停止看盘服务
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    await this.marketFeed.stop();
    this.isRunning = false;
    
    logger.info('[Watcher] 看盘服务已停止');
  }
  
  /**
   * 添加监控股票
   */
  async addSymbol(symbol: string): Promise<void> {
    this.marketFeed.addSymbol(symbol);
    this.config.symbols.push(symbol);
  }
  
  /**
   * 移除监控股票
   */
  async removeSymbol(symbol: string): Promise<void> {
    this.marketFeed.removeSymbol(symbol);
    this.config.symbols = this.config.symbols.filter(s => s !== symbol);
  }
  
  /**
   * 获取运行状态
   */
  getStatus(): { running: boolean; symbols: string[]; connection: boolean } {
    return {
      running: this.isRunning,
      symbols: this.config.symbols,
      connection: this.marketFeed.getConnectionStatus(),
    };
  }
  
  /**
   * 行情回调处理
   */
  private onQuote(quote: Quote): void {
    // 检查告警
    for (const rule of this.config.rules) {
      if (!rule.enabled) continue;
      
      // 只检查匹配该股票的规则
      if (rule.symbol !== quote.symbol && rule.symbol !== '*') continue;
      
      const detector = getAlertDetector();
      const alerts = detector.detect(rule, quote);
      
      for (const alert of alerts) {
        this.handleAlert(alert);
      }
    }
  }
  
  /**
   * 处理告警
   */
  private async handleAlert(alert: WatchAlert): Promise<void> {
    logger.info(`[Watcher] 触发告警: ${alert.message}`);
    
    // 发送飞书通知
    await sendFeishuAlert(alert);
  }
  
  /**
   * 获取默认规则
   */
  private getDefaultRules(): WatchRule[] {
    return [
      {
        id: 1,
        userId: 'default',
        symbol: '*',  // 适用于所有股票
        enabled: true,
        conditions: [
          { type: 'price_change', threshold: 5, direction: 'both' },
        ],
      },
    ];
  }
}

// 单例
let watcherInstance: RealtimeWatcher | null = null;

export function getWatcher(): RealtimeWatcher {
  if (!watcherInstance) {
    watcherInstance = new RealtimeWatcher();
  }
  return watcherInstance;
}

export { RealtimeWatcher };
