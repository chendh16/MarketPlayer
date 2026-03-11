/**
 * 回测 Web API
 * 提供 RESTful 接口供外部调用
 */

import express, { Request, Response } from 'express';
import { 
  runBacktest, 
  runEnhancedBacktest, 
  MovingAverageCrossover,
  RSIStrategy,
  BollingerStrategy 
} from './index';
import { Strategy } from './engine';

const app = express();
app.use(express.json());

// 接口响应格式
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * POST /api/backtest
 * 运行基础回测
 */
app.post('/api/backtest', async (req: Request, res: Response) => {
  try {
    const { 
      symbol, 
      market = 'us', 
      years = 1, 
      strategy = 'ma_crossover',
      params = {} 
    } = req.body;
    
    // 创建策略
    let strategyInstance: Strategy;
    switch (strategy) {
      case 'rsi':
        strategyInstance = new RSIStrategy(
          params.period || 14,
          params.oversold || 30,
          params.overbought || 70
        );
        break;
      case 'bollinger':
        strategyInstance = new BollingerStrategy(
          params.period || 20,
          params.stdDev || 2
        );
        break;
      case 'ma_crossover':
      default:
        strategyInstance = new MovingAverageCrossover(
          params.shortPeriod || 5,
          params.longPeriod || 20
        );
    }
    
    // 运行回测
    const result = await runBacktest(symbol, market, years, strategyInstance);
    
    res.json({
      success: true,
      data: {
        symbol,
        market,
        strategy,
        metrics: result.metrics,
        tradeCount: result.trades.length,
        trades: result.trades.slice(0, 10), // 返回前10笔交易
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/backtest/enhanced
 * 运行增强回测（支持止盈止损）
 */
app.post('/api/backtest/enhanced', async (req: Request, res: Response) => {
  try {
    const { 
      symbol, 
      market = 'us', 
      years = 1, 
      strategy = 'ma_crossover',
      params = {},
      // 增强参数
      takeProfitPct,
      stopLossPct,
      maxPositionPct,
      maxDrawdownPct,
    } = req.body;
    
    // 创建策略
    let strategyInstance: Strategy;
    switch (strategy) {
      case 'rsi':
        strategyInstance = new RSIStrategy(
          params.period || 14,
          params.oversold || 30,
          params.overbought || 70
        );
        break;
      case 'bollinger':
        strategyInstance = new BollingerStrategy(
          params.period || 20,
          params.stdDev || 2
        );
        break;
      case 'ma_crossover':
      default:
        strategyInstance = new MovingAverageCrossover(
          params.shortPeriod || 5,
          params.longPeriod || 20
        );
    }
    
    // 运行增强回测
    const result = await runEnhancedBacktest(
      symbol, 
      market, 
      years, 
      strategyInstance,
      {
        takeProfitPct,
        stopLossPct,
        maxPositionPct,
        maxDrawdownPct,
      }
    );
    
    res.json({
      success: true,
      data: {
        symbol,
        market,
        strategy,
        config: { takeProfitPct, stopLossPct, maxPositionPct, maxDrawdownPct },
        metrics: result.metrics,
        tradeCount: result.trades.length,
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/strategies
 * 获取可用策略列表
 */
app.get('/api/strategies', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: [
      {
        id: 'ma_crossover',
        name: '均线交叉策略',
        description: 'MA5 上穿 MA20 买入，下穿卖出',
        params: [
          { name: 'shortPeriod', type: 'number', default: 5, description: '短期均线周期' },
          { name: 'longPeriod', type: 'number', default: 20, description: '长期均线周期' },
        ]
      },
      {
        id: 'rsi',
        name: 'RSI 策略',
        description: 'RSI 超卖买入，超买卖出',
        params: [
          { name: 'period', type: 'number', default: 14, description: 'RSI 周期' },
          { name: 'oversold', type: 'number', default: 30, description: '超卖阈值' },
          { name: 'overbought', type: 'number', default: 70, description: '超买阈值' },
        ]
      },
      {
        id: 'bollinger',
        name: '布林带策略',
        description: '价格触及布林带下轨买入，上轨卖出',
        params: [
          { name: 'period', type: 'number', default: 20, description: '布林带周期' },
          { name: 'stdDev', type: 'number', default: 2, description: '标准差倍数' },
        ]
      },
    ]
  });
});

/**
 * GET /health
 * 健康检查
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
const PORT = parseInt(process.env.PORT || '3000', 10);

export function startServer(port: number = PORT) {
  return app.listen(port, () => {
    console.log(`🚀 Backtest API running on port ${port}`);
  });
}

// 导出 app 用于测试
export { app };
