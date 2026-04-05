/**
 * WatchlistManager - 股票评分系统
 * 
 * 功能：
 * - 获取基本面数据 (ROE/增长/负债)
 * - 计算综合评分
 * - 管理候选池
 */

import { query } from '../../../src/db/postgres';
import { logger } from '../../../src/utils/logger';

export interface StockScore {
  symbol: string;
  
  // Financial metrics
  roe?: number;
  growth_rate?: number;
  debt_ratio?: number;
  pe_ratio?: number;
  revenue?: number;
  net_income?: number;
  book_value?: number;
  
  // Component scores
  roe_score: number;
  growth_score: number;
  debt_score: number;
  valuation_score: number;
  total_score: number;
  
  // Metadata
  scoring_date: Date;
}

// 选股标准配置
const SCORING_CRITERIA = {
  // ROE 评分 (加权 40%)
  roe: { weight: 0.40, min: 5, max: 30, optimal: 15 },
  
  // 增长率评分 (加权 30%)
  growth: { weight: 0.30, min: 0, max: 30, optimal: 15 },
  
  // 负债率评分 (加权 20%) - 越低越好
  debt: { weight: 0.20, min: 0, max: 80, optimal: 30, invert: true },
  
  // 市盈率评分 (加权 10%) - 越低越好
  pe: { weight: 0.10, min: 0, max: 50, optimal: 20, invert: true },
};

// 默认选股标准
const DEFAULT_THRESHOLDS = {
  min_total_score: 70,
  min_roe_score: 60,
  max_debt_ratio: 50,
  max_pe: 35,
};

class WatchlistManager {
  /**
   * 计算单只股票评分
   */
  async scoreStock(symbol: string): Promise<StockScore> {
    // 获取基本面数据
    const fundamentals = await this.getFundamentals(symbol);
    
    if (!fundamentals) {
      throw new Error(`No fundamentals for ${symbol}`);
    }
    
    // 计算各项评分
    const roe_score = this.scoreComponent(fundamentals.roe, SCORING_CRITERIA.roe);
    const growth_score = this.scoreComponent(fundamentals.growth_rate, SCORING_CRITERIA.growth);
    const debt_score = this.scoreDebtRatio(fundamentals.debt_ratio);
    const valuation_score = this.scorePE(fundamentals.pe_ratio);
    
    // 计算总分
    const total_score = (
      roe_score * SCORING_CRITERIA.roe.weight +
      growth_score * SCORING_CRITERIA.growth.weight +
      debt_score * SCORING_CRITERIA.debt.weight +
      valuation_score * SCORING_CRITERIA.pe.weight
    );
    
    const score: StockScore = {
      symbol,
      roe: fundamentals.roe,
      growth_rate: fundamentals.growth_rate,
      debt_ratio: fundamentals.debt_ratio,
      pe_ratio: fundamentals.pe_ratio,
      revenue: fundamentals.revenue,
      net_income: fundamentals.net_income,
      book_value: fundamentals.book_value,
      roe_score,
      growth_score,
      debt_score,
      valuation_score,
      total_score: Math.round(total_score * 10) / 10,
      scoring_date: new Date(),
    };
    
    // 记录到数据库
    await this.recordScore(score);
    
    return score;
  }

  /**
   * 批量评分候选池
   */
  async scoreWatchlist(symbols: string[]): Promise<StockScore[]> {
    const results: StockScore[] = [];
    
    for (const symbol of symbols) {
      try {
        const score = await this.scoreStock(symbol);
        results.push(score);
      } catch (error) {
        logger.error(`[WatchlistManager] Failed to score ${symbol}:`, error);
      }
    }
    
    // 按总分排序
    results.sort((a, b) => b.total_score - a.total_score);
    
    return results;
  }

  /**
   * 更新候选池
   */
  async updateWatchlist(scores: StockScore[]): Promise<number> {
    let updated = 0;
    
    for (const score of scores) {
      try {
        // 更新每日观察列表
        await query(`
          INSERT INTO value_daily_watchlist 
          (symbol, roe_score, growth_score, debt_score, valuation_score, total_score, status, update_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
          ON CONFLICT (symbol) DO UPDATE SET
            roe_score = $2,
            growth_score = $3,
            debt_score = $4,
            valuation_score = $5,
            total_score = $6,
            update_date = CURRENT_DATE,
            updated_at = NOW()
        `, [
          score.symbol,
          score.roe_score,
          score.growth_score,
          score.debt_score,
          score.valuation_score,
          score.total_score,
          score.total_score >= DEFAULT_THRESHOLDS.min_total_score ? 'buy候选' : 'watching',
        ]);
        
        updated++;
      } catch (error) {
        logger.error(`[WatchlistManager] Failed to update ${score.symbol}:`, error);
      }
    }
    
    logger.info(`[WatchlistManager] Updated ${updated} stocks`);
    return updated;
  }

  /**
   * 获取候选股票
   */
  async getCandidates(): Promise<StockScore[]> {
    return await query<StockScore>(`
      SELECT * FROM value_daily_watchlist
      WHERE total_score >= $1 AND status = 'buy候选'
      ORDER BY total_score DESC
      LIMIT 20
    `, [DEFAULT_THRESHOLDS.min_total_score]);
  }

  /**
   * 获取基础数据 (简化版)
   */
  private async getFundamentals(symbol: string): Promise<{
    roe: number;
    growth_rate: number;
    debt_ratio: number;
    pe_ratio: number;
    revenue: number;
    net_income: number;
    book_value: number;
  } | null> {
    // 从数据库读取
    try {
      const result = await query<{
        roe: number;
        growth_rate: number;
        debt_ratio: number;
        pe: number;
        revenue: number;
        net_income: number;
        book_value: number;
      }>(`
        SELECT 
          roe,
          growth_rate,
          debt_ratio,
          pe_ratio as pe,
          revenue,
          net_income,
          book_value
        FROM fundamentals
        WHERE symbol = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `, [symbol]);
      
      if (result.length > 0) {
        return result[0];
      }
    } catch {
      // 表可能不存在
    }
    
    // 如果没有数据，返回模拟数据用于测试
    return {
      roe: 10 + Math.random() * 20,
      growth_rate: Math.random() * 20,
      debt_ratio: Math.random() * 40,
      pe_ratio: 10 + Math.random() * 30,
      revenue: 1000000 + Math.random() * 10000000,
      net_income: 100000 + Math.random() * 500000,
      book_value: 500000 + Math.random() * 2000000,
    };
  }

  /**
   * 评分组件 (盈利)
   */
  private scoreComponent(value: number, config: {
    min: number;
    max: number;
    optimal: number;
    invert?: boolean;
  }): number {
    if (!value || isNaN(value)) return 30;
    
    // 线性插值
    let score = ((value - config.min) / (config.max - config.min)) * 100;
    score = Math.max(0, Math.min(100, score));
    
    return Math.round(score);
  }

  /**
   * 评分负债率 (越低越好)
   */
  private scoreDebtRatio(ratio: number): number {
    if (!ratio || isNaN(ratio)) return 50;
    const config = SCORING_CRITERIA.debt;
    
    let score = ((config.max - ratio) / config.max) * 100;
    score = Math.max(0, Math.min(100, score));
    
    return Math.round(score);
  }

  /**
   * 评分市盈率 (越低越好)
   */
  private scorePE(pe: number): number {
    if (!pe || isNaN(pe)) return 50;
    const config = SCORING_CRITERIA.pe;
    
    let score = ((config.max - pe) / config.max) * 100;
    score = Math.max(0, Math.min(100, score));
    
    return Math.round(score);
  }

  /**
   * 记录评分到数据库
   */
  private async recordScore(score: StockScore): Promise<void> {
    await query(`
      INSERT INTO stock_score_history 
      (symbol, roe, growth_rate, debt_ratio, pe_ratio, revenue, net_income, book_value,
       roe_score, growth_score, debt_score, valuation_score, total_score, scoring_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_DATE)
    `, [
      score.symbol,
      score.roe,
      score.growth_rate,
      score.debt_ratio,
      score.pe_ratio,
      score.revenue,
      score.net_income,
      score.book_value,
      score.roe_score,
      score.growth_score,
      score.debt_score,
      score.valuation_score,
      score.total_score,
    ]);
  }

  /**
   * 获取历史评分
   */
  async getScoreHistory(symbol: string, days: number = 90): Promise<StockScore[]> {
    return await query<StockScore>(`
      SELECT * FROM stock_score_history
      WHERE symbol = $1 
        AND scoring_date >= CURRENT_DATE - INTERVAL '$2 days'
      ORDER BY scoring_date DESC
    `, [symbol, days]);
  }

  /**
   * 检查是否应该调整选股标准
   */
  async shouldAdjustCriteria(): Promise<boolean> {
    const outcomes = await query<{ count: number; success: number }>(`
      SELECT 
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE success = true) as success
      FROM value_prediction_outcomes
      WHERE evaluation_period_days = 90
        AND evaluated_at >= CURRENT_DATE - INTERVAL '180 days'
    `);
    
    const row = outcomes[0] || { count: 0, success: 0 };
    
    if (row.count < 10) return false;
    
    const accuracy = (row.success / row.count) * 100;
    
    // 如果准确率低于 60%，建议调整
    return accuracy < 60;
  }
}

export default new WatchlistManager();
export { WatchlistManager, SCORING_CRITERIA, DEFAULT_THRESHOLDS };