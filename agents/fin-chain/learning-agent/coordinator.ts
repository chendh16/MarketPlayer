/**
 * LearningCoordinator - 统一学习协调器
 * 
 * 协调所有策略学习（短线+长线）：
 * - 收集各策略学习结果
 * - 计算整体 Sharpe ratio
 * - 决定是否触发系统升级
 * - 飞书通知
 */

import { query } from '../../src/db/postgres';
import { logger } from '../../src/utils/logger';

interface LearningResult {
  strategy: 'short_term' | 'long_term' | 'value' | 'system';
  accuracy?: number;
  sharpe?: number;
  win_rate?: number;
  signals_total?: number;
  signals_correct?: number;
  params_changed?: number;
  recommendations: string[];
}

interface SystemMetrics {
  overall_sharpe: number;
  overall_accuracy: number;
  active_strategies: number;
  total_signals: number;
  should_upgrade: boolean;
}

// 升级阈值配置
const UPGRADE_THRESHOLDS = {
  min_sharpe: 2.5,        // 最低 Sharpe ratio
  min_accuracy: 55,      // 最低准确率%
  min_signals: 30,        // 最少信号数
  improvement_threshold: 0.3, // 提升阈值
};

class LearningCoordinator {
  /**
   * 协调学习主流程
   */
  async coordinateLearning(): Promise<{
    results: LearningResult[];
    metrics: SystemMetrics;
  }> {
    logger.info('[LearningCoordinator] Starting coordination...');

    // 1. 收集各策略学习结果
    const results = await this.collectLearningResults();

    // 2. 计算整体指标
    const metrics = await this.calculateOverallMetrics(results);

    // 3. 检查是否需要升级
    if (metrics.should_upgrade) {
      await this.triggerSystemUpgrade(results, metrics);
    }

    // 4. 通知
    await this.notifyFeishu(results, metrics);

    logger.info(`[LearningCoordinator] Completed: sharpe=${metrics.overall_sharpe.toFixed(2)}, accuracy=${metrics.overall_accuracy.toFixed(1)}%`);

    return { results, metrics };
  }

  /**
   * 收集各策略学习结果
   */
  private async collectLearningResults(): Promise<LearningResult[]> {
    const results: LearningResult[] = [];

    // 1. 短线策略 (quant-agent)
    try {
      const quantMetrics = await query<{
        signals_total: number;
        signals_correct: number;
        accuracy_7d: number;
      }>(`
        SELECT 
          COALESCE(SUM(signals_generated), 0) as signals_total,
          COALESCE(SUM(signals_correct), 0) as signals_correct,
          AVG(accuracy_7d) as accuracy_7d
        FROM quant_daily_metrics
        WHERE metric_date >= CURRENT_DATE - INTERVAL '30 days'
      `);

      if (quantMetrics.length > 0) {
        const row = quantMetrics[0];
        results.push({
          strategy: 'short_term',
          signals_total: parseInt(row.signals_total) || 0,
          signals_correct: parseInt(row.signals_correct) || 0,
          accuracy: parseFloat(row.accuracy_7d) || 0,
          recommendations: [],
        });
      }
    } catch (e) {
      logger.warn('[LearningCoordinator] quant metrics error:', e);
    }

    // 2. 参数进化 (quant_parameter_evolution)
    try {
      const paramChanges = await query<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM quant_parameter_evolution
        WHERE status = 'applied'
          AND applied_at >= CURRENT_DATE - INTERVAL '30 days'
      `);

      if (results.length > 0 && paramChanges.length > 0) {
        results[0].params_changed = parseInt(paramChanges[0].count);
      }
    } catch (e) {
      // Ignore
    }

    // 3. 长线策略 (value-agent)
    try {
      const valueMetrics = await query<{
        predictions_total: number;
        predictions_correct: number;
      }>(`
        SELECT 
          COUNT(*) as predictions_total,
          COUNT(*) FILTER (WHERE success = true) as predictions_correct
        FROM value_prediction_outcomes
        WHERE evaluated_at >= CURRENT_DATE - INTERVAL '180 days'
      `);

      const row = valueMetrics[0];
      const total = parseInt(row.predictions_total) || 0;
      const correct = parseInt(row.predictions_correct) || 0;

      results.push({
        strategy: 'long_term',
        signals_total: total,
        signals_correct: correct,
        accuracy: total > 0 ? (correct / total) * 100 : 0,
        recommendations: [],
      });
    } catch (e) {
      logger.warn('[LearningCoordinator] value metrics error:', e);
    }

    // 4. 系统级学习
    try {
      const sysMetrics = await query<{
        avg_sharpe: number;
        avg_score: number;
      }>(`
        SELECT 
          AVG(sharpe) as avg_sharpe,
          AVG(score) as avg_score
        FROM evaluation_results
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      `);

      if (sysMetrics.length > 0) {
        results.push({
          strategy: 'system',
          sharpe: parseFloat(sysMetrics[0].avg_sharpe) || 0,
          score: parseFloat(sysMetrics[0].avg_score) || 0,
          recommendations: [],
        });
      }
    } catch (e) {
      logger.warn('[LearningCoordinator] system metrics error:', e);
    }

    // 添加系统默认值如果没有数据
    if (results.length === 0) {
      results.push({
        strategy: 'short_term',
        signals_total: 0,
        signals_correct: 0,
        accuracy: 50,
        recommendations: [],
      });
    }

    return results;
  }

  /**
   * 计算整体指标
   */
  private async calculateOverallMetrics(results: LearningResult[]): Promise<SystemMetrics> {
    // 计算准确率
    let totalSignals = 0;
    let totalCorrect = 0;

    for (const r of results) {
      totalSignals += r.signals_total || 0;
      totalCorrect += r.signals_correct || 0;
    }

    const overall_accuracy = totalSignals > 0
      ? (totalCorrect / totalSignals) * 100
      : 50;

    // 计算 Sharpe ratio (简化版)
    let overall_sharpe = 0;
    for (const r of results) {
      if (r.sharpe) {
        overall_sharpe = Math.max(overall_sharpe, r.sharpe);
      }
    }

    // 默认 Sharpe
    if (overall_sharpe === 0) {
      overall_sharpe = overall_accuracy / 100 * 4; // 简化估算
    }

    // 决定是否升级
    const should_upgrade = (
      overall_sharpe < UPGRADE_THRESHOLDS.min_sharpe ||
      overall_accuracy < UPGRADE_THRESHOLDS.min_accuracy ||
      totalSignals < UPGRADE_THRESHOLDS.min_signals
    );

    // 过滤有效的策略
    const active = results.filter(r => 
      r.signals_total > 0 || r.sharpe !== undefined
    );

    return {
      overall_sharpe: Math.round(overall_sharpe * 100) / 100,
      overall_accuracy: Math.round(overall_accuracy * 10) / 10,
      active_strategies: active.length,
      total_signals: totalSignals,
      should_upgrade,
    };
  }

  /**
   * 触发系统升级
   */
  async triggerSystemUpgrade(results: LearningResult[], metrics: SystemMetrics): Promise<void> {
    logger.warn('[LearningCoordinator] System upgrade triggered!');

    // 记录升级
    await query(`
      INSERT INTO strategy_versions 
      (version, source, status, notes)
      VALUES ($1, 'auto_upgrade', 'pending', $2)
    `, [
      `v${Date.now()}`,
      JSON.stringify({
        sharpe: metrics.overall_sharpe,
        accuracy: metrics.overall_accuracy,
        strategies: results.map(r => r.strategy),
      }),
    ]);

    // 记录学习动作
    await query(`
      INSERT INTO learning_actions 
      (strategy, hypothesis, confidence, outcome, status)
      VALUES ('system', $1, $2, 'auto_upgrade', 'completed')
    `, [
      `System Sharpe ${metrics.overall_sharpe.toFixed(2)} < threshold ${UPGRADE_THRESHOLDS.min_sharpe}`,
      metrics.overall_accuracy / 100,
    ]);
  }

  /**
   * 飞书通知
   */
  async notifyFeishu(results: LearningResult[], metrics: SystemMetrics): Promise<void> {
    // 构建通知消息
    let message = `📊 学习汇报 (${new Date().toLocaleDateString('zh-CN')})\n\n`;

    for (const r of results) {
      const emoji = r.strategy === 'short_term' ? '📈' : r.strategy === 'long_term' ? '📊' : '🔧';
      message += `${emoji} ${r.strategy}:\n`;
      message += `   信号: ${r.signals_total || 0}, 正确: ${r.signals_correct || 0}\n`;
      message += `   准确率: ${r.accuracy?.toFixed(1) || 0}%\n`;
      if (r.sharpe) message += `   Sharpe: ${r.sharpe.toFixed(2)}\n`;
      if (r.params_changed) message += `   参数调整: ${r.params_changed}\n`;
      message += '\n';
    }

    message += `🎯 整体指标:\n`;
    message += `   Sharpe: ${metrics.overall_sharpe.toFixed(2)}\n`;
    message += `   准确率: ${metrics.overall_accuracy.toFixed(1)}%\n`;
    message += `   活跃策略: ${metrics.active_strategies}\n`;
    message += `   ${metrics.should_upgrade ? '⚠️ 建议升级系统' : '✅ 系统正常'}\n`;

    logger.info('[LearningCoordinator] Notify:', message);
  }

  /**
   * 获取学习历史
   */
  async getLearningHistory(days: number = 30): Promise<any[]> {
    return await query(`
      SELECT * FROM learning_actions
      WHERE created_at >= CURRENT_DATE - INTERVAL '$1 days'
      ORDER BY created_at DESC
    `, [days]);
  }

  /**
   * 获取系统状态摘要
   */
  async getSystemSummary(): Promise<{
    version: string;
    status: string;
    performance: any;
  }> {
    const version = await query<{ version: string }>(`
      SELECT version FROM strategy_versions
      WHERE status IN ('active', 'pending')
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const performance = await this.calculateOverallMetrics(
      await this.collectLearningResults()
    );

    return {
      version: version[0]?.version || 'v1.0.0',
      status: performance.should_upgrade ? '需要升级' : '正常',
      performance,
    };
  }
}

export default new LearningCoordinator();
export { LearningCoordinator, UPGRADE_THRESHOLDS };