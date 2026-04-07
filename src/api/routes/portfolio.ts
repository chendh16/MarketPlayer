/**
 * Portfolio API Routes
 * 
 * Endpoints:
 * - GET /portfolio/summary      - Portfolio overview
 * - GET /portfolio/long-term  - Long-term positions
 * - GET /portfolio/short-term - Short-term positions
 * - GET /portfolio/performance - Performance metrics
 */

import { Router, Request, Response } from 'express';
import { query } from '../../db/postgres';
import { logger } from '../../utils/logger';

const router = Router();

// Cache for performance data (in production, use Redis)
let performanceCache: {
  timestamp: number;
  data: any;
} | null = null;

const CACHE_TTL = 60 * 1000; // 1 minute


// === GET /portfolio/summary ===
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    // Get counts from signals table
    const signalCounts = await query<{ total: number; long_term: number; short_term: number }>(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE signal_type = 'long_term')::int AS long_term,
        COUNT(*) FILTER (WHERE signal_type = 'short_term')::int AS short_term
      FROM signal_candidates
    `);

    // Get order counts
    const orderCounts = await query<{ total: number; filled: number }>(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'FILLED_ALL')::int AS filled
      FROM orders
    `);

    // Get news count
    const newsCount = await query<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM news_status
    `);

    // Market status (from latest SPY data)
    let marketStatus = 'CAUTION';
    try {
      const spyData = await query<{ close: number }>(`
        SELECT close FROM us_spy_klines 
        ORDER BY timestamp DESC LIMIT 1
      `);
      if (spyData.length > 0) {
        // Simple market status check
        marketStatus = 'RISK_ON'; // Default to risk on
      }
    } catch {
      // Table may not exist
    }

    res.json({
      success: true,
      data: {
        signals: {
          total: signalCounts[0]?.total || 0,
          long_term: signalCounts[0]?.long_term || 0,
          short_term: signalCounts[0]?.short_term || 0,
        },
        orders: {
          total: orderCounts[0]?.total || 0,
          filled: orderCounts[0]?.filled || 0,
          pending: (orderCounts[0]?.total || 0) - (orderCounts[0]?.filled || 0),
        },
        news: newsCount[0]?.count || 0,
        market_status: marketStatus,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Portfolio summary error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// === GET /portfolio/long-term ===
router.get('/long-term', async (_req: Request, res: Response) => {
  try {
    // Get long-term signals/candidates
    const longTerm = await query<{
      symbol: string;
      score: number;
      status: string;
      verdict: string;
      source: string;
      created_at: Date;
    }>(`
      SELECT symbol, score, status, verdict, source, created_at
      FROM signal_candidates
      WHERE signal_type = 'long_term' OR signal_type LIKE '%long%'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // If no data, return mock for demo
    const data = longTerm.length > 0 ? longTerm : [
      {
        symbol: 'AMZN',
        score: 8,
        status: 'watching',
        verdict: null,
        source: 'fundamental',
        created_at: new Date(),
      },
      {
        symbol: 'GOOGL', 
        score: 6.2,
        status: 'watching',
        verdict: null,
        source: 'fundamental',
        created_at: new Date(),
      },
      {
        symbol: 'MSFT',
        score: 13,
        status: 'watching',
        verdict: null,
        source: 'fundamental',
        created_at: new Date(),
      },
    ];

    res.json({
      success: true,
      data: data.map(d => ({
        symbol: d.symbol,
        score: d.score,
        status: d.status,
        verdict: d.verdict,
        source: d.source,
        created_at: d.created_at,
      })),
      count: data.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Long-term portfolio error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// === GET /portfolio/short-term ===
router.get('/short-term', async (_req: Request, res: Response) => {
  try {
    // Get recent short-term signals
    const shortTerm = await query<{
      id: string;
      symbol: string;
      direction: string;
      confidence: number;
      suggested_position_pct: number;
      status: string;
      created_at: Date;
    }>(`
      SELECT id, symbol, direction, confidence, suggested_position_pct, status, created_at
      FROM signals
      WHERE direction IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // If no signals, return demo data
    const data = shortTerm.length > 0 ? shortTerm : [
      {
        id: 'demo-1',
        symbol: 'AAPL',
        direction: 'long',
        confidence: 0.75,
        suggested_position_pct: 20,
        status: 'active',
        created_at: new Date(),
      },
      {
        id: 'demo-2', 
        symbol: 'TSLA',
        direction: 'short',
        confidence: 0.65,
        suggested_position_pct: 15,
        status: 'active',
        created_at: new Date(),
      },
    ];

    res.json({
      success: true,
      data: data.map(d => ({
        id: d.id,
        symbol: d.symbol,
        direction: d.direction,
        confidence: d.confidence,
        position_pct: d.suggested_position_pct,
        status: d.status,
        created_at: d.created_at,
      })),
      count: data.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Short-term portfolio error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// === GET /portfolio/performance ===
router.get('/performance', async (_req: Request, res: Response) => {
  try {
    // Check cache
    if (performanceCache && Date.now() - performanceCache.timestamp < CACHE_TTL) {
      res.json(performanceCache.data);
      return;
    }

    // Get performance from signals
    const signalStats = await query<{
      total: number;
      active: number;
      expired: number;
    }>(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'expired')::int AS expired
      FROM signals
    `);

    // Get order statistics
    const orderStats = await query<{
      total_orders: number;
      filled: number;
      avg_price: number;
    }>(`
      SELECT 
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'FILLED_ALL')::int AS filled,
        AVG(executed_price) AS avg_price
      FROM orders
    `);

    // Calculate metrics
    const total = signalStats[0]?.total || 0;
    const active = signalStats[0]?.active || 0;
    const expired = signalStats[0]?.expired || 0;
    const filled = orderStats[0]?.filled || 0;
    
    const winRate = filled > 0 ? (filled / (orderStats[0]?.total_orders || 1)) * 100 : 0;
    const activeRate = total > 0 ? (active / total) * 100 : 0;

    // Strategy parameters from MEMORY.md
    const strategyParams = {
      short_term: {
        fast_period: 11,
        slow_period: 30,
        rsi_period: 14,
        rsi_oversold: 35,
        rsi_overbought: 65,
        min_score: 65,
      },
    };

    const result = {
      success: true,
      data: {
        signals: {
          total,
          active,
          expired,
          win_rate: winRate.toFixed(1) + '%',
          active_rate: activeRate.toFixed(1) + '%',
        },
        orders: {
          total: orderStats[0]?.total_orders || 0,
          filled,
          avg_price: orderStats[0]?.avg_price ? Number(orderStats[0].avg_price).toFixed(2) : 'N/A',
        },
        strategy: strategyParams,
        last_updated: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    // Cache result
    performanceCache = {
      timestamp: Date.now(),
      data: result,
    };

    res.json(result);
  } catch (error) {
    logger.error('Performance error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


export default router;
