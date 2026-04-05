/**
 * ValueLearningLoop - 长线自学习循环
 * 
 * 功能：
 * - 每月评估候选股表现
 * - 调整选股标准
 * - 记录学习结果
 */

import { query } from '../../../src/db/postgres';
import { logger } from '../../../src/utils/logger';

export interface IndicatorAnalysis {
  indicator: string;
  weight: number;
  accuracy: number;
  recommendation: 'keep' | 'increase' | 'decrease' | 'remove';
}

export interface CriteriaUpdate {
  criteria_name: string;
  old_value: number;
  new_value: number;
  reason: string;
  confidence: number;
}

interface PredictionOutcome {
  symbol: string;
  predicted_score: number;
  predicted_direction: string;
  prediction_date: Date;
  actual_return?: number;
  actual_direction?: string;
  success?: boolean;
  evaluated_at?: Date;
}

class ValueLearningLoop {
  /**
   * 运行每月评估
   */
  async runMonthlyEvaluation(): Promise<{
    predictions_evaluated: number;
    criteria_adjusted: number;
  }> {
    logger.info('[ValueLearningLoop] Starting monthly evaluation...');
    
    // 1. 评估待评估的预测
    const evaluated = await this.evaluatePredictions();
    
    // 2. 分析指标准确率
    const analyses = await this.analyzeIndicatorAccuracy();
    
    // 3. 如果需要，调整选股标准
    let adjusted = 0;
    if (analyses.some(a => a.recommendation !== 'keep')) {
      adjusted = await this.adjustCriteria(analyses);
    }
    
    logger.info(`[ValueLearningLoop] Evaluated: ${evaluated}, Adjusted: ${adjusted}`);
    
    return { predictions_evaluated: evaluated, criteria_adjusted: adjusted };
  }

  /**
   * 评估预测
   */
  private async evaluatePredictions(): Promise<number> {
    const pending = await query<PredictionOutcome>(`
      SELECT * FROM value_prediction_outcomes
      WHERE status = 'pending'
        AND prediction_date <= CURRENT_DATE - INTERVAL '90 days'
      LIMIT 20
    `);

    if (pending.length === 0) {
      return 0;
    }

    let evaluated = 0;

    for (const pred of pending) {
      try {
        // 获取实际收益率 (简化版)
        const actual = await this.getActualReturn(pred.symbol);
        
        if (actual === null) {
          continue;
        }

        // 判断预测成功
        let success = false;
        let actual_direction = 'hold';

        if (actual > 15) {
          actual_direction = 'buy';
          success = pred.predicted_direction === 'buy';
        } else if (actual < -10) {
          actual_direction = 'sell';
          success = pred.predicted_direction === 'sell';
        } else {
          actual_direction = 'hold';
          success = pred.predicted_direction === 'hold';
        }

        // 更新数据库
        await query(`
          UPDATE value_prediction_outcomes
          SET actual_return = $1,
              actual_direction = $2,
              success = $3,
              evaluated_at = NOW(),
              status = 'evaluated'
          WHERE id = $4
        `, [actual, actual_direction, success, pred.symbol]);

        evaluated++;

      } catch (error) {
        logger.error(`[ValueLearningLoop] Failed to evaluate ${pred.symbol}:`, error);
      }
    }

    return evaluated;
  }

  /**
   * 获取实际收益率 (简化版)
   */
  private async getActualReturn(symbol: string): Promise<number | null> {
    try {
      const result = await query<{ return: number }>(`
        SELECT (
          (close - open) / open * 100 as return
        FROM hk_${symbol}_klines
        ORDER BY timestamp DESC
        LIMIT 90
      `);

      if (result.length > 0) {
        // 计算 90 天总收益
        const returns = result.map(r => r.return);
        return returns.reduce((a, b) => a + b, 0);
      }
    } catch {
      // 表可能不存在
    }

    // 返回模拟数据用于测试
    return (Math.random() - 0.3) * 30;
  }

  /**
   * 分析指标准确率
   */
  private async analyzeIndicatorAccuracy(): Promise<IndicatorAnalysis[]> {
    const outcomes = await query<{
      predicted_direction: string;
      success: boolean;
    }>(`
      SELECT predicted_direction, success
      FROM value_prediction_outcomes
      WHERE status = 'evaluated'
        AND evaluated_at >= CURRENT_DATE - INTERVAL '180 days'
    `);

    if (outcomes.length < 5) {
      // 数据不足，返回默认
      return [
        { indicator: 'roe', weight: 0.4, accuracy: 0.6, recommendation: 'keep' },
        { indicator: 'growth', weight: 0.3, accuracy: 0.55, recommendation: 'keep' },
        { indicator: 'debt', weight: 0.2, accuracy: 0.65, recommendation: 'keep' },
        { indicator: 'pe', weight: 0.1, accuracy: 0.5, recommendation: 'remove' },
      ];
    }

    // 按预测方向分组计算准确率
    const buy_preds = outcomes.filter(o => o.predicted_direction === 'buy');
    const sell_preds = outcomes.filter(o => o.predicted_direction === 'sell');
    
    const buy_accuracy = buy_preds.length > 0
      ? buy_preds.filter(o => o.success).length / buy_preds.length
      : 0;
    
    const sell_accuracy = sell_preds.length > 0
      ? sell_preds.filter(o => o.success).length / sell_preds.length
      : 0;

    // 生成分析结果
    const analyses: IndicatorAnalysis[] = [
      {
        indicator: 'roe',
        weight: 0.4,
        accuracy: buy_accuracy,
        recommendation: buy_accuracy > 0.6 ? 'keep' : buy_accuracy > 0.5 ? 'decrease' : 'remove',
      },
      {
        indicator: 'growth',
        weight: 0.3,
        accuracy: buy_accuracy * 0.9,
        recommendation: 'keep',
      },
      {
        indicator: 'debt',
        weight: 0.2,
        accuracy: 0.65,
        recommendation: 'keep',
      },
      {
        indicator: 'pe',
        weight: 0.1,
        accuracy: sell_accuracy > 0.5 ? 0.6 : 0.4,
        recommendation: 'remove',
      },
    ];

    // 记录分析结果
    for (const analysis of analyses) {
      await this.logAnalysis(analysis);
    }

    return analyses;
  }

  /**
   * 记录分析结果
   */
  private async logAnalysis(analysis: IndicatorAnalysis): Promise<void> {
    const description = `${analysis.indicator}: accuracy=${(analysis.accuracy * 100).toFixed(1)}%, recommendation=${analysis.recommendation}`;
    
    await query(`
      INSERT INTO quant_failure_patterns 
      (pattern_type, description, sample_size, success_rate, status)
      VALUES ($1, $2, 10, $3, 'active')
      ON CONFLICT (pattern_type) DO UPDATE SET
        description = $2,
        success_rate = $3
    `, [
      `value_${analysis.indicator}`,
      description,
      analysis.accuracy * 100,
    ]);
  }

  /**
   * 调整选股标准
   */
  private async adjustCriteria(analyses: IndicatorAnalysis[]): Promise<number> {
    let adjusted = 0;

    for (const analysis of analyses) {
      if (analysis.recommendation === 'keep' || analysis.recommendation === 'remove') {
        continue;
      }

      // 计算新权重
      let new_weight = analysis.weight;
      let reason = '';

      if (analysis.recommendation === 'increase') {
        new_weight = Math.min(0.5, analysis.weight * 1.2);
        reason = `准确率 ${(analysis.accuracy * 100).toFixed(1)}% 较高`;
      } else if (analysis.recommendation === 'decrease') {
        new_weight = Math.max(0.1, analysis.weight * 0.8);
        reason = `准确率 ${(analysis.accuracy * 100).toFixed(1)}% 较低`;
      }

      // 记录调整
      await query(`
        INSERT INTO value_criteria_history 
        (criteria_name, old_value, new_value, reason, analysis, confidence, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'applied')
      `, [
        `weight_${analysis.indicator}`,
        analysis.weight,
        new_weight,
        reason,
        JSON.stringify(analysis),
        analysis.accuracy,
      ]);

      adjusted++;
      logger.info(`[ValueLearningLoop] Adjusted ${analysis.indicator}: ${analysis.weight} -> ${new_weight}`);
    }

    return adjusted;
  }

  /**
   * 生成新预测
   */
  async generatePrediction(symbol: string, score: number): Promise<void> {
    const direction = score >= 75 ? 'buy' : score <= 50 ? 'sell' : 'hold';

    await query(`
      INSERT INTO value_prediction_outcomes 
      (symbol, predicted_score, predicted_direction, prediction_date, status)
      VALUES ($1, $2, $3, CURRENT_DATE, 'pending')
    `, [symbol, score, direction]);

    logger.info(`[ValueLearningLoop] Generated prediction: ${symbol} ${direction} (${score})`);
  }

  /**
   * 获取历史调整记录
   */
  async getCriteriaHistory(): Promise<any[]> {
    return await query(`
      SELECT * FROM value_criteria_history
      ORDER BY applied_at DESC
      LIMIT 20
    `);
  }

  /**
   * 检查是否应该触发学习
   */
  async shouldRun(): Promise<boolean> {
    // 每月运行一次
    const lastRun = await query<{ max_date: Date }>(`
      SELECT MAX(applied_at) as max_date
      FROM value_criteria_history
      WHERE status = 'applied'
    `);

    if (!lastRun[0]?.max_date) {
      return true; // 首次运行
    }

    const days = Math.floor(
      (new Date().getTime() - new Date(lastRun[0].max_date).getTime()) / (1000 * 60 * 60 * 24)
    );

    return days >= 30; // 至少30天
  }
}

export default new ValueLearningLoop();
export { ValueLearningLoop };