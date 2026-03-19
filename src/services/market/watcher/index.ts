/**
 * 看盘服务导出入口
 */

export { RealtimeWatcher, getWatcher } from './watcher';
export { FutuMarketFeed, getMarketFeed, Quote } from './market-feed';
export { getAlertDetector, AlertDetector, WatchRule, WatchAlert, AlertType, AlertCondition } from './detector';
export { sendFeishuAlert, sendFeishuText } from './feishu-notify';
export { calculateIndicators, calculateRSISimple, calculateMA, calculateEMA, detectMACross, IndicatorResult } from './indicators';
