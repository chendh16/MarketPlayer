/**
 * 价格预警服务
 * 定时检查价格，达到预警值时发送通知
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { sendEmail } from '../email/mailer';
import { getStockPrice, StockQuote, DEFAULT_STOCKS, Market } from './quote-service';

// 预警配置
interface AlertConfig {
  symbol: string;
  market: Market;
  targetPrice: number;
  direction: 'above' | 'below';
  enabled: boolean;
}

// 用户预警列表 (内存存储，后续可持久化到数据库)
let userAlerts: AlertConfig[] = [];

// 添加预警
export function addAlert(alert: AlertConfig): void {
  userAlerts.push(alert);
  logger.info(`[PriceAlert] 添加预警: ${alert.market}-${alert.symbol} ${alert.direction} ${alert.targetPrice}`);
}

// 移除预警
export function removeAlert(symbol: string, market: Market): void {
  userAlerts = userAlerts.filter(a => !(a.symbol === symbol && a.market === market));
}

// 获取预警列表
export function getAlerts(): AlertConfig[] {
  return [...userAlerts];
}

// 清除所有预警
export function clearAlerts(): void {
  userAlerts = [];
  logger.info('[PriceAlert] 已清除所有预警');
}

// 发送预警邮件
async function sendAlertEmail(quote: StockQuote, targetPrice: number, direction: 'above' | 'below'): Promise<void> {
  const emoji = direction === 'above' ? '🚀' : '📉';
  const color = direction === 'above' ? 'red' : 'green';
  
  const html = `
    <h2>${emoji} 价格预警触发</h2>
    <table border="1" cellpadding="10" style="border-collapse:collapse;font-size:14px">
      <tr><td><b>市场</b></td><td>${quote.market.toUpperCase()}</td></tr>
      <tr><td><b>股票</b></td><td>${quote.name || quote.code}</td></tr>
      <tr><td><b>代码</b></td><td>${quote.code}</td></tr>
      <tr><td><b>当前价格</b></td><td style="color:${color};font-size:18px"><b>${quote.price.toFixed(2)}</b></td></tr>
      <tr><td><b>预警价格</b></td><td>${targetPrice.toFixed(2)}</td></tr>
      <tr><td><b>涨跌幅</b></td><td style="color:${quote.change >= 0 ? 'red' : 'green'}">${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%</td></tr>
      <tr><td><b>更新时间</b></td><td>${quote.updateTime.toLocaleString('zh-CN')}</td></tr>
    </table>
    <p style="color:#888;font-size:12px">由 MarketPlayer 自动发送</p>
  `;
  
  await sendEmail({
    to: '845567595@qq.com',  // TODO: 从配置获取用户邮箱
    subject: `${emoji} 价格预警 - ${quote.name || quote.code} 达到 ${targetPrice}`,
    html
  });
  
  logger.info(`[PriceAlert] 预警邮件已发送: ${quote.code} ${direction} ${targetPrice}`);
}

// 检查所有预警
export async function checkAlerts(): Promise<void> {
  logger.info('[PriceAlert] 开始检查预警...');
  
  for (const alert of userAlerts) {
    if (!alert.enabled) continue;
    
    try {
      const quote = await getStockPrice(alert.market, alert.symbol);
      if (!quote) continue;
      
      // 补充股票名称
      const defaultStock = DEFAULT_STOCKS[alert.market]?.find(s => s.code === alert.symbol);
      if (defaultStock) quote.name = defaultStock.name;
      
      const triggered = 
        (alert.direction === 'above' && quote.price >= alert.targetPrice) ||
        (alert.direction === 'below' && quote.price <= alert.targetPrice);
      
      if (triggered) {
        logger.info(`[PriceAlert] 触发: ${alert.symbol} 当前 ${quote.price} ${alert.direction} 目标 ${alert.targetPrice}`);
        await sendAlertEmail(quote, alert.targetPrice, alert.direction);
      }
    } catch (e) {
      logger.error(`[PriceAlert] 检查 ${alert.symbol} 失败:`, e);
    }
  }
  
  logger.info('[PriceAlert] 检查完成');
}

// 启动定时检查 (每5分钟)
export function startAlertScheduler(): void {
  // 每30分钟检查一次 (可根据需要调整)
  cron.schedule('*/30 * * * *', async () => {
    if (userAlerts.length === 0) return;
    
    try {
      await checkAlerts();
    } catch (e) {
      logger.error('[PriceAlert] 定时检查失败:', e);
    }
  });
  
  logger.info('[PriceAlert] 预警定时任务已启动 (每5分钟)');
}

// 添加默认预警 (示例)
export function setupDefaultAlerts(): void {
  // 示例: 茅台跌破 1400 时预警
  addAlert({
    symbol: '600519',
    market: 'a',
    targetPrice: 1400,
    direction: 'below',
    enabled: true
  });
  
  // 示例: 腾讯涨到 600 时预警
  addAlert({
    symbol: '00700',
    market: 'hk',
    targetPrice: 600,
    direction: 'above',
    enabled: true
  });
  
  logger.info('[PriceAlert] 已设置默认预警');
}
