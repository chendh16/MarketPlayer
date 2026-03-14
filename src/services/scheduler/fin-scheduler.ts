/**
 * 金融团队定时任务调度器
 * 
 * 管理强势股筛选、持仓复盘等高频任务
 * 可配置执行间隔和市场开盘时间
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { isMarketOpen } from '../../utils/market-hours';

// 调度配置
interface SchedulerConfig {
  // 强势股筛选间隔（分钟）
  strongStockInterval: number;  // 默认10分钟
  // 持仓复盘间隔（分钟）
  positionReviewInterval: number;  // 默认120分钟（2小时）
  // 新闻抓取间隔（分钟）
  newsFetchInterval: number;  // 默认5分钟
}

const DEFAULT_CONFIG: SchedulerConfig = {
  strongStockInterval: 10,   // 10分钟
  positionReviewInterval: 120, // 2小时
  newsFetchInterval: 5,     // 5分钟
};

let config = DEFAULT_CONFIG;
let isRunning = false;

// 任务执行函数（由外部注入）
let strongStockTask: (() => Promise<void>) | null = null;
let positionReviewTask: (() => Promise<void>) | null = null;
let newsFetchTask: (() => Promise<void>) | null = null;

// ==================== 调度器 ====================

/**
 * 初始化调度器
 */
export function initScheduler(customConfig?: Partial<SchedulerConfig>) {
  config = { ...DEFAULT_CONFIG, ...customConfig };
  logger.info(`[Scheduler] 初始化: 强势股${config.strongStockInterval}min, 持仓复盘${config.positionReviewInterval}min, 新闻${config.newsFetchInterval}min`);
}

/**
 * 注册任务
 */
export function registerTasks(tasks: {
  strongStock?: () => Promise<void>;
  positionReview?: () => Promise<void>;
  newsFetch?: () => Promise<void>;
}) {
  strongStockTask = tasks.strongStock || null;
  positionReviewTask = tasks.positionReview || null;
  newsFetchTask = tasks.newsFetch || null;
}

/**
 * 启动所有调度任务
 */
export function startScheduler() {
  if (isRunning) {
    logger.warn('[Scheduler] 已启动');
    return;
  }
  
  // 1. 强势股筛选 - 每N分钟（默认10分钟）
  const strongStockCron = `*/${config.strongStockInterval} * * * *`;
  cron.schedule(strongStockCron, async () => {
    if (!isAStockMarketHours() && !isHKStockMarketHours() && !isUSStockMarketHours()) {
      logger.debug('[Scheduler] 非开盘时间，跳过强势股筛选');
      return;
    }
    if (strongStockTask) {
      try {
        await strongStockTask();
        logger.info('[Scheduler] 强势股筛选完成');
      } catch (error) {
        logger.error('[Scheduler] 强势股筛选失败:', error);
      }
    }
  });
  logger.info(`[Scheduler] 强势股筛选已启动 (每${config.strongStockInterval}分钟，仅开盘时间)`);
  
  // 2. 持仓复盘 - 每N分钟（默认120分钟 = 2小时）
  const positionReviewCron = `*/${config.positionReviewInterval} * * * *`;
  cron.schedule(positionReviewCron, async () => {
    if (!isAStockMarketHours() && !isHKStockMarketHours() && !isUSStockMarketHours()) {
      logger.debug('[Scheduler] 非开盘时间，跳过持仓复盘');
      return;
    }
    if (positionReviewTask) {
      try {
        await positionReviewTask();
        logger.info('[Scheduler] 持仓复盘完成');
      } catch (error) {
        logger.error('[Scheduler] 持仓复盘失败:', error);
      }
    }
  });
  logger.info(`[Scheduler] 持仓复盘已启动 (每${config.positionReviewInterval}分钟，仅开盘时间)`);
  
  // 3. 新闻抓取 - 每N分钟（默认5分钟，全天运行）
  const newsFetchCron = `*/${config.newsFetchInterval} * * * *`;
  cron.schedule(newsFetchCron, async () => {
    if (newsFetchTask) {
      try {
        await newsFetchTask();
      } catch (error) {
        logger.error('[Scheduler] 新闻抓取失败:', error);
      }
    }
  });
  logger.info(`[Scheduler] 新闻抓取已启动 (每${config.newsFetchInterval}分钟)`);
  
  isRunning = true;
  logger.info('[Scheduler] 所有定时任务已启动');
}

/**
 * 停止调度器
 */
export function stopScheduler() {
  isRunning = false;
  logger.info('[Scheduler] 调度器已停止');
}

// ==================== 市场时间判断 ====================

/**
 * 判断A股是否在开盘时间 (9:30-11:30, 13:00-15:00)
 */
function isAStockMarketHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  
  // 上午: 9:30-11:30 (570-690)
  // 下午: 13:00-15:00 (780-900)
  const isMorning = time >= 570 && time < 690;
  const isAfternoon = time >= 780 && time < 900;
  
  // 周一到周五
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
  
  return isWeekday && (isMorning || isAfternoon);
}

/**
 * 判断港股是否在开盘时间 (9:30-12:00, 13:00-16:00)
 */
function isHKStockMarketHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  
  // 上午: 9:30-12:00 (570-720)
  // 下午: 13:00-16:00 (780-960)
  const isMorning = time >= 570 && time < 720;
  const isAfternoon = time >= 780 && time < 960;
  
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
  
  return isWeekday && (isMorning || isAfternoon);
}

/**
 * 判断美股是否在开盘时间 (9:30-16:00)
 */
function isUSStockMarketHours(): boolean {
  const now = new Date();
  // 美股时间转换为北京时间需要考虑时区，这里简化处理
  // 实际应该用美股时间判断
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;
  
  // 美股开盘: 21:30-次日4:00北京时间（夏令时）
  // 这里简化：假设UTC+8
  const isTradingHours = (time >= 1260 && time < 1440) || (time >= 0 && time < 240);
  
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
  
  return isWeekday && isTradingHours;
}

/**
 * 获取调度状态
 */
export function getSchedulerStatus() {
  return {
    running: isRunning,
    config,
    timestamp: new Date(),
  };
}

/**
 * 手动触发强势股筛选
 */
export async function triggerStrongStock(): Promise<void> {
  if (strongStockTask) {
    await strongStockTask();
  }
}

/**
 * 手动触发持仓复盘
 */
export async function triggerPositionReview(): Promise<void> {
  if (positionReviewTask) {
    await positionReviewTask();
  }
}
