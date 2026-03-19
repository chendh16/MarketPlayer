/**
 * 看盘服务 API 路由
 */

import { Router } from 'express';
import { getWatcher, getAlertDetector, WatchRule, WatchAlert } from './index';
import { logger } from '../../../utils/logger';

const router = Router();

/**
 * GET /api/watcher/status
 * 获取看盘服务状态
 */
router.get('/status', (req, res) => {
  const watcher = getWatcher();
  const status = watcher.getStatus();
  
  // 获取监控的股票列表
  const symbols = watcher.getStatus().symbols;
  
  // 获取各股票的指标
  const detector = getAlertDetector();
  const indicators: Record<string, any> = {};
  
  for (const symbol of symbols) {
    const history = detector.getIndicators(symbol);
    if (history) {
      indicators[symbol] = {
        rsi: history.rsi?.toFixed(2),
        ma5: history.ma5?.toFixed(2),
        ma20: history.ma20?.toFixed(2),
        lastPrice: history.prices[history.prices.length - 1]?.price,
      };
    }
  }
  
  res.json({
    success: true,
    data: {
      ...status,
      indicators,
    },
  });
});

/**
 * POST /api/watcher/start
 * 启动看盘服务
 */
router.post('/start', async (req, res) => {
  try {
    const { symbols, rules } = req.body;
    
    if (!symbols || !Array.isArray(symbols)) {
      return res.json({ success: false, error: 'symbols is required' });
    }
    
    const watcher = getWatcher();
    await watcher.start(symbols, rules);
    
    return res.json({ success: true, message: 'Watcher started' });
  } catch (error: any) {
    logger.error('[Watcher API] Start error:', error);
    return res.json({ success: false, error: error.message });
  }
});

/**
 * POST /api/watcher/stop
 * 停止看盘服务
 */
router.post('/stop', async (req, res) => {
  try {
    const watcher = getWatcher();
    await watcher.stop();
    
    return res.json({ success: true, message: 'Watcher stopped' });
  } catch (error: any) {
    logger.error('[Watcher API] Stop error:', error);
    return res.json({ success: false, error: error.message });
  }
});

/**
 * POST /api/watcher/symbols/add
 * 添加监控股票
 */
router.post('/symbols/add', async (req, res) => {
  try {
    const { symbol } = req.body;
    
    if (!symbol) {
      return res.json({ success: false, error: 'symbol is required' });
    }
    
    const watcher = getWatcher();
    await watcher.addSymbol(symbol);
    
    return res.json({ success: true, message: `Added ${symbol}` });
  } catch (error: any) {
    logger.error('[Watcher API] Add symbol error:', error);
    return res.json({ success: false, error: error.message });
  }
});

/**
 * POST /api/watcher/symbols/remove
 * 移除监控股票
 */
router.post('/symbols/remove', async (req, res) => {
  try {
    const { symbol } = req.body;
    
    if (!symbol) {
      return res.json({ success: false, error: 'symbol is required' });
    }
    
    const watcher = getWatcher();
    await watcher.removeSymbol(symbol);
    
    return res.json({ success: true, message: `Removed ${symbol}` });
  } catch (error: any) {
    logger.error('[Watcher API] Remove symbol error:', error);
    return res.json({ success: false, error: error.message });
  }
});

/**
 * GET /api/watcher/alerts
 * 获取告警历史
 */
router.get('/alerts', (req, res) => {
  // 从内存中获取最近的告警
  // 实际应该存储到数据库
  const detector = getAlertDetector();
  
  res.json({
    success: true,
    data: {
      message: 'Alert history not persisted yet',
    },
  });
});

/**
 * POST /api/watcher/rules
 * 添加告警规则
 */
router.post('/rules', (req, res) => {
  try {
    const rule: WatchRule = req.body;
    
    if (!rule.symbol || !rule.conditions) {
      return res.json({ success: false, error: 'symbol and conditions are required' });
    }
    
    // 规则会在启动时生效
    // 实际应该存储到数据库
    
    return res.json({ success: true, message: 'Rule added', rule });
  } catch (error: any) {
    logger.error('[Watcher API] Add rule error:', error);
    return res.json({ success: false, error: error.message });
  }
});

/**
 * GET /api/watcher/indicators/:symbol
 * 获取股票技术指标
 */
router.get('/indicators/:symbol', (req, res) => {
  const { symbol } = req.params;
  const detector = getAlertDetector();
  const history = detector.getIndicators(symbol);
  
  if (!history) {
    return res.json({ success: false, error: 'No data for symbol' });
  }
  
  return res.json({
    success: true,
    data: {
      symbol,
      rsi: history.rsi?.toFixed(2),
      ma5: history.ma5?.toFixed(2),
      ma20: history.ma20?.toFixed(2),
      priceHistory: history.prices.slice(-20).map(p => ({
        price: p.price,
        timestamp: p.timestamp,
      })),
    },
  });
});

export default router;
