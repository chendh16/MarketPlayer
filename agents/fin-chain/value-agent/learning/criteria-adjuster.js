/**
 * criteria-adjuster.js - 选股标准调整器
 * 
 * 功能：
 * - adjustCriteria(accuracyAnalysis) - 根据准确率分析调整标准
 * - 调整规则：
 *   * ROE 指标准确率 < 60% → 降低 ROE 权重
 *   * 增长率指标准确率 > 70% → 提高增长率权重
 *   * PE 指标准确率 < 60% → 降低 PE 权重
 * - logCriteriaChange() - 记录调整到 value_criteria_history 表
 */

const { Pool } = require('pg');

const pool = new Pool({
  database: 'trading_bot',
  user: 'zhengzefeng',
  password: 'password',
});

// 默认选股标准
const DEFAULT_CRITERIA = {
  roe_weight: 0.40,
  growth_weight: 0.30,
  pe_weight: 0.10,
  debt_weight: 20,
  pe_max: 35,
  roe_min: 15,
  revenue_growth_min: 10,
  debt_ratio_max: 50,
};

class CriteriaAdjuster {
  /**
   * 根据准确率分析调整标准
   */
  async adjustCriteria(accuracyAnalysis) {
    console.log('\n🔧 开始调整选股标准...\n');

    const changes = [];
    const accuracy = accuracyAnalysis.accuracy;
    const indicators = accuracyAnalysis.indicators;

    // 获取当前标准
    const currentCriteria = await this.getCurrentCriteria();

    // 新标准初始化为当前标准
    const newCriteria = { ...currentCriteria };

    // 1. 根据整体准确率调整
    if (accuracy < 0.5) {
      // 准确率很低，减少权重
      newCriteria.roe_weight = Math.max(0.2, currentCriteria.roe_weight - 0.1);
      newCriteria.growth_weight = Math.max(0.2, currentCriteria.growth_weight - 0.1);
      changes.push(`准确率低(${accuracy.toFixed(1)}), 降低权重阈值`);
    }

    // 2. 根据指标分析调整
    if (indicators.roe) {
      const roeHigh = indicators.roe.highScoreAvgReturn || 0;
      const roeLow = indicators.roe.lowScoreAvgReturn || 0;
      const roeDiff = roeHigh - roeLow;

      if (roeDiff > 10) {
        // 高ROE股票表现更好
        newCriteria.roe_weight = Math.min(0.6, currentCriteria.roe_weight + 0.1);
        changes.push(`ROE高分收益更高(+${roeDiff.toFixed(1)}%), ROE权重->${newCriteria.roe_weight}`);
      } else if (roeDiff < -10) {
        newCriteria.roe_weight = Math.max(0.2, currentCriteria.roe_weight - 0.1);
        changes.push(`ROE低分收益更高(${roeDiff.toFixed(1)}%), ROE权重->${newCriteria.roe_weight}`);
      }
    }

    if (indicators.growth) {
      const growthHigh = indicators.growth.highScoreAvgReturn || 0;
      const growthLow = indicators.growth.lowScoreAvgReturn || 0;
      const growthDiff = growthHigh - growthLow;

      if (growthDiff > 10) {
        newCriteria.growth_weight = Math.min(0.5, currentCriteria.growth_weight + 0.1);
        changes.push(`增长率高分更好(+${growthDiff.toFixed(1)}%), 增长率权重->${newCriteria.growth_weight}`);
      }
    }

    // 3. 应用调整
    let adjusted = false;
    if (changes.length > 0) {
      await this.applyCriteria(currentCriteria, newCriteria, changes);
      adjusted = true;
    }

    console.log('\n=== 调整结果 ===');
    console.log('调整:', changes.length > 0 ? changes.join(', ') : '无调整');
    console.log('新标准:', JSON.stringify(newCriteria, null, 2));

    return {
      adjusted,
      changes,
      newCriteria,
    };
  }

  /**
   * 获取当前选股标准
   */
  async getCurrentCriteria() {
    const result = await pool.query(`
      SELECT criteria_name, new_value
      FROM value_criteria_history
      WHERE status = 'applied'
      ORDER BY applied_at DESC
      LIMIT 10
    `);

    const criteria = { ...DEFAULT_CRITERIA };

    for (const row of result.rows) {
      const name = row.criteria_name;
      const value = parseFloat(row.new_value);

      if (name === 'roe_weight') criteria.roe_weight = value;
      if (name === 'growth_weight') criteria.growth_weight = value;
      if (name === 'pe_weight') criteria.pe_weight = value;
      if (name === 'pe_threshold' || name === 'pe_max') criteria.pe_max = value;
      if (name === 'roe_threshold') criteria.roe_min = value;
    }

    return criteria;
  }

  /**
   * 应用新标准
   */
  async applyCriteria(oldCriteria, newCriteria, changes) {
    const id = 'adj_' + Date.now();

    await pool.query(`
      INSERT INTO value_criteria_history 
      (id, criteria_name, old_value, new_value, reason, confidence, status)
      VALUES (gen_random_uuid(), 'criteria_batch', $2, $3, $4, $5, 'applied')
    `, [
      id,
      JSON.stringify(oldCriteria),
      JSON.stringify(newCriteria),
      changes.join('; '),
      0.5,
    ]);

    console.log('✅ 已记录选股标准调整');
  }

  /**
   * 运行自动调整流程
   */
  async run(accuracyAnalysis) {
    try {
      const result = await this.adjustCriteria(accuracyAnalysis);

      console.log('\n✅ 调整完成!');
      console.log('调整项:', result.changes.length);
      
      return result;

    } catch (e) {
      console.error('❌ 调整失败:', e.message);
      return null;
    } finally {
      await pool.end();
    }
  }
}

// 导出
module.exports = new CriteriaAdjuster();

// 直接运行测试
if (require.main === module) {
  // 模拟准确率分析
  const mockAnalysis = {
    accuracy: 0.55,
    averageReturn: 8.5,
    indicators: {
      roe: { highScoreAvgReturn: 15, lowScoreAvgReturn: 3 },
      growth: { highScoreAvgReturn: 12, lowScoreAvgReturn: 2 },
      pe: { highScoreAvgReturn: 5, lowScoreAvgReturn: 10 },
    },
    recommendations: ['ROE高分股票表现更好'],
  };

  console.log('🧊 Criteria Adjuster Test\n');
  console.log('Input:', JSON.stringify(mockAnalysis.indicators, null, 2));

  new CriteriaAdjuster().run(mockAnalysis)
    .then(result => {
      console.log('\n=== 调整结果 ===');
      console.log('调整:', result.adjusted ? '是' : '否');
      console.log('新标准:', JSON.stringify(result.newCriteria, null, 2));
      process.exit(0);
    })
    .catch(e => {
      console.error('Error:', e.message);
      process.exit(1);
    });
}