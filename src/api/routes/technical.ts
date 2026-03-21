import express, { Request, Response } from 'express';
import { getHistoryKLine, KLine } from '../../services/market/quote-service';
import { 
  calculateBollingerBands, 
  calculateRSI, 
  calculateMACD,
  determineTrend,
  detectAllPatterns,
  BollingerSignal
} from '../../utils/technical-analysis';
import { logger } from '../../utils/logger';

const router = express.Router();

// 类型转换辅助函数 - 直接使用字符串
type Market = 'a' | 'hk' | 'us';
type TimeFrame = '1d' | '1w' | '1M';

const toMarket = (m: string): Market => m as Market;
const toTimeFrame = (t: string): TimeFrame => t as TimeFrame;

// ====== 技术指标API ======

// 获取单股票技术指标
router.get('/indicators/:market/:symbol', async (req: Request, res: Response): Promise<void> => {
  try {
    const market = toMarket(req.params.market);
    const symbol = req.params.symbol;
    const timeframe = toTimeFrame(String(req.query.timeframe || '1d'));
    const range = String(req.query.range || '3mo');
    
    const klines = await getHistoryKLine(symbol, market, timeframe, range);
    
    if (klines.length < 20) {
      res.status(400).json({ error: '数据不足，需要至少20根K线' });
      return;
    }
    
    const bb = calculateBollingerBands(klines);
    const rsi = calculateRSI(klines, 14);
    const macd = calculateMACD(klines);
    const trend = determineTrend(klines);
    const patterns = detectAllPatterns(klines);
    
    res.json({
      symbol,
      market,
      timeframe,
      bollinger: bb?.bands || null,
      rsi,
      macd,
      trend,
      patterns,
      rating: bb?.bands.rating || 0,
      isSqueeze: bb?.isSqueeze || false,
      isBreakout: bb?.isBreakout || false,
    });
  } catch (error) {
    logger.error('[API] 获取技术指标失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取多时间框指标
router.get('/indicators/:market/:symbol/multitf', async (req: Request, res: Response): Promise<void> => {
  try {
    const market = toMarket(req.params.market);
    const symbol = req.params.symbol;
    const timeframes = (String(req.query.timeframes || '5m,15m,1h,4h,1d')).split(',').map(toTimeFrame);
    
    const result: any = {
      symbol,
      market,
      timeframes: {},
    };
    
    for (const tf of timeframes) {
      try {
        const klines = await getHistoryKLine(symbol, market, tf, '1mo');
        if (klines.length < 20) continue;
        
        const bb = calculateBollingerBands(klines);
        const rsi = calculateRSI(klines, 14);
        const macd = calculateMACD(klines);
        const trend = determineTrend(klines);
        
        result.timeframes[tf] = {
          bollinger: bb?.bands || null,
          rsi,
          macd,
          trend,
          rating: bb?.bands.rating || 0,
        };
      } catch (e) {
        logger.error(`[API] ${symbol} ${tf} 失败:`, e);
      }
    }
    
    res.json(result);
  } catch (error) {
    logger.error('[API] 多时间框指标失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 批量扫描Bollinger挤压
router.post('/indicators/scan-bb', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbols, timeframe = '1d', range = '3mo' } = req.body as {
      symbols: Array<{symbol: string; market: Market; name: string}>;
      timeframe?: string;
      range?: string;
    };
    
    if (!symbols || symbols.length === 0) {
      res.status(400).json({ error: '需要提供股票列表' });
      return;
    }
    
    const tf = toTimeFrame(timeframe);
    const results: BollingerSignal[] = [];
    
    for (const stock of symbols) {
      try {
        const klines = await getHistoryKLine(stock.symbol, stock.market, tf, range);
        if (klines.length < 20) continue;
        
        const bb = calculateBollingerBands(klines);
        if (!bb || !bb.isSqueeze) continue;
        
        results.push({
          symbol: stock.symbol,
          name: stock.name,
          market: stock.market,
          bands: bb.bands,
          breakout: bb.isBreakout ? 'BREAKUP' : 'SQUEEZE',
          reasons: [
            `Bollinger带宽=${(bb.bands.width * 100).toFixed(2)}%`,
            bb.bands.rating > 0 ? '偏多' : '偏空'
          ],
          timestamp: Date.now(),
        });
      } catch (e) {
        logger.error(`[API] 扫描${stock.symbol}失败:`, e);
      }
      
      // 避免请求过快
      await new Promise(r => setTimeout(r, 200));
    }
    
    // 按带宽排序（最挤压的在前）
    results.sort((a, b) => a.bands.width - b.bands.width);
    
    res.json({
      count: results.length,
      results,
    });
  } catch (error) {
    logger.error('[API] Bollinger扫描失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 批量扫描涨跌幅
router.post('/indicators/scan-movers', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbols, timeframe = '1d', range = '1mo', limit = 20, direction = 'all' } = req.body as {
      symbols: Array<{symbol: string; market: Market; name: string}>;
      timeframe?: string;
      range?: string;
      limit?: number;
      direction?: 'gainers' | 'losers' | 'all';
    };
    
    const tf = toTimeFrame(timeframe);
    
    const stockData: Array<{
      symbol: string;
      name: string;
      market: Market;
      changePct: number;
      volume: number;
      price: number;
    }> = [];
    
    for (const stock of symbols) {
      try {
        const klines = await getHistoryKLine(stock.symbol, stock.market, tf, range);
        if (klines.length < 2) continue;
        
        const latest = klines[klines.length - 1];
        const prev = klines[klines.length - 2];
        const changePct = ((latest.close - prev.close) / prev.close) * 100;
        
        stockData.push({
          symbol: stock.symbol,
          name: stock.name,
          market: stock.market,
          changePct,
          volume: latest.volume,
          price: latest.close,
        });
      } catch (e) {
        logger.error(`[API] ${stock.symbol} 失败:`, e);
      }
      
      await new Promise(r => setTimeout(r, 200));
    }
    
    // 排序
    if (direction === 'gainers') {
      stockData.sort((a, b) => b.changePct - a.changePct);
    } else if (direction === 'losers') {
      stockData.sort((a, b) => a.changePct - b.changePct);
    } else {
      stockData.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    }
    
    res.json({
      count: stockData.length,
      results: stockData.slice(0, limit),
    });
  } catch (error) {
    logger.error('[API] 涨跌幅扫描失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ====== 短线信号API ======

// 获取短线信号
router.get('/shortterm/:market/:symbol', async (req: Request, res: Response): Promise<void> => {
  try {
    const market = toMarket(req.params.market);
    const symbol = req.params.symbol;
    const name = String(req.query.name || symbol);
    
    // 复用现有短线策略
    const { evaluateShortTerm } = await import('../../strategies/shortTerm');
    const signal = await evaluateShortTerm(symbol, market, name);
    
    res.json(signal);
  } catch (error) {
    logger.error('[API] 短线信号失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 批量扫描短线机会
router.post('/shortterm/scan', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbols, minScore = 70 } = req.body as {
      symbols: Array<{symbol: string; market: Market; name: string}>;
      minScore?: number;
    };
    
    const { scanShortTermOpportunities } = await import('../../strategies/shortTerm');
    const signals = await scanShortTermOpportunities(symbols);
    
    // 过滤最低分
    const filtered = signals.filter(s => s.strength >= minScore);
    
    res.json({
      count: filtered.length,
      results: filtered,
    });
  } catch (error) {
    logger.error('[API] 短线扫描失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
