/**
 * 实时看盘服务
 * 
 * 每分钟轮询自选股，检测告警条件，推送通知
 */

import cron from 'node-cron';
import { logger } from '../../../utils/logger';
import { fetch_realtime_quote, fetch_batch_quote } from '../../../mcp/tools/stock';
import { fetch_technical_indicators } from '../../../mcp/tools/indicator';
import { detectAlerts, WatchAlert, WatchRule } from './detector';
import { sendNotifications } from './notifier';
import { getWatchRules, saveAlertLog, getUserWatchList } from './database';

export interface WatchConfig {
  intervalSeconds: number;  // 轮询间隔，默认60秒
  enabled: boolean;
}

const DEFAULT_CONFIG: WatchConfig = {
  intervalSeconds: 60,
  enabled: true,
};

let config: WatchConfig = DEFAULT_CONFIG;
let isRunning = false;

/**
 * 启动看盘服务
 */
export function startWatcherService(customConfig?: Partial<WatchConfig>) {
  config = { ...DEFAULT_CONFIG, ...customConfig };
  
  if (isRunning) {
    logger.warn('[Watcher] 服务已在运行中');
    return;
  }
  
  // 每分钟执行一次
  cron.schedule('* * * * *', async () => {
    if (!config.enabled) return;
    
    try {
      await runWatchCycle();
    } catch (error) {
      logger.error('[Watcher] 看盘轮询异常:', error);
    }
  });
  
  isRunning = true;
  logger.info(`[Watcher] 看盘服务已启动 (每${config.intervalSeconds}秒)`);
}

/**
 * 执行一轮看盘
 */
async function runWatchCycle() {
  const startTime = Date.now();
  
  try {
    // 1. 获取所有用户的自选股列表
    const watchList = await getUserWatchList();
    
    if (watchList.length === 0) {
      logger.debug('[Watcher] 无监控标的');
      return;
    }
    
    // 2. 批量获取实时行情
    const symbols = watchList.map(w => w.symbol);
    const quotesResult = await fetch_batch_quote({ symbols, market: 'a' });
    
    // 3. 获取技术指标
    const indicatorsResult = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const result = await fetch_technical_indicators({ symbol, period: '1day' });
          return { symbol, indicators: result };
        } catch (error) {
          logger.warn(`[Watcher] 获取${symbol}指标失败:`, error);
          return { symbol, indicators: null };
        }
      })
    );
    
    // 4. 构建股票数据映射
    const quoteMap = new Map();
    for (const q of quotesResult.quotes) {
      quoteMap.set(q.symbol, q);
    }
    
    const indicatorMap = new Map();
    for (const ind of indicatorsResult) {
      if (ind.indicators) {
        indicatorMap.set(ind.symbol, ind.indicators);
      }
    }
    
    // 5. 检测告警
    const alerts: WatchAlert[] = [];
    
    for (const watch of watchList) {
      const quote = quoteMap.get(watch.symbol);
      const indicators = indicatorMap.get(watch.symbol);
      
      if (!quote) continue;
      
      const rule: WatchRule = {
        id: 0,
        userId: watch.userId,
        symbol: watch.symbol,
        market: watch.market,
        conditions: watch.conditions,
        enabled: true,
      };
      
      const detected = detectAlerts(rule, quote, indicators);
      alerts.push(...detected);
    }
    
    // 6. 发送通知
    if (alerts.length > 0) {
      logger.info(`[Watcher] 检测到 ${alerts.length} 个告警`);
      
      for (const alert of alerts) {
        // 保存到数据库
        await saveAlertLog(alert);
        
        // 发送通知
        await sendNotifications(alert);
      }
    }
    
    const duration = Date.now() - startTime;
    logger.debug(`[Watcher] 轮询完成，耗时 ${duration}ms`);
    
  } catch (error) {
    logger.error('[Watcher] 轮询异常:', error);
  }
}

/**
 * 手动触发一轮看盘（用于测试）
 */
export async function triggerWatchCycle(): Promise<{
  success: boolean;
  alerts: number;
  duration: number;
}> {
  const startTime = Date.now();
  
  try {
    await runWatchCycle();
    return {
      success: true,
      alerts: 0, // TODO: 从runWatchCycle获取
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      alerts: 0,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 停止看盘服务
 */
export function stopWatcherService() {
  config.enabled = false;
  isRunning = false;
  logger.info('[Watcher] 看盘服务已停止');
}

/**
 * 获取服务状态
 */
export function getWatcherStatus() {
  return {
    running: isRunning,
    config,
  };
}
