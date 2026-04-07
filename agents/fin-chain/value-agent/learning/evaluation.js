/**
 * evaluation.js - 长线策略评估逻辑
 * 
 * 功能：
 * - calculateAccuracy(months) - 计算最近N个月的预测准确率
 * - analyzeIndicatorPerformance() - 分析哪些指标预测准确
 * - getRecentPredictions(months) - 获取最近N个月的预测记录
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(process.cwd(), 'data/fundamental');

const pool = new Pool({
  database: 'trading_bot',
  user: 'zhengzefeng',
  password: 'password',
});

class ValueEvaluator {
  /**
   * 计算预测准确率
   */
  async calculateAccuracy(months = 12) {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE success = true)::int as correct
      FROM value_prediction_outcomes
      WHERE status = 'evaluated'
        AND evaluated_at >= CURRENT_DATE - INTERVAL '365 days'
    `);

    const row = result.rows[0];
    const total = parseInt(row.total) || 0;
    const correct = parseInt(row.correct) || 0;
    const accuracy = total > 0 ? correct / total : 0;

    console.log(`📊 准确率: ${(accuracy * 100).toFixed(1)}% (${correct}/${total})`);

    // 按方向分析
    const byDirectionResult = await pool.query(`
      SELECT predicted_direction,
             COUNT(*)::int as total,
             COUNT(*) FILTER (WHERE success = true)::int as correct
      FROM value_prediction_outcomes
      WHERE status = 'evaluated'
        AND evaluated_at >= CURRENT_DATE - INTERVAL '365 days'
      GROUP BY predicted_direction
    `);

    const byDirection = {};
    for (const d of byDirectionResult.rows) {
      const t = parseInt(d.total) || 0;
      const c = parseInt(d.correct) || 0;
      byDirection[d.predicted_direction] = {
        total: t,
        correct: c,
        accuracy: t > 0 ? c / t : 0,
      };
    }

    return { total, correct, accuracy, byDirection };
  }

  /**
   * 分析指标预测准确性
   */
  async analyzeIndicatorPerformance() {
    const results = {};
    
    // 读取财务数据分析
    const indicators = ['pe', 'roe', 'growth'];
    
    for (const indicator of indicators) {
      // 简化：读取 stock_score_history 中的评分
      const scoreField = indicator + '_score';
      
      // 尝试从数据文件读取
      const symbolFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('_fundamental.json'));
      
      let highScorereturns = 0;
      let lowScorereturns = 0;
      let highScoreCount = 0;
      let lowScoreCount = 0;
      
      for (const file of symbolFiles) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf8'));
          
          if (!data[scoreField]) continue;
          
          // 简化：假设成功是 price > cost
          const returnVal = data.return || 0;
          
          if (data[scoreField] >= 60) {
            highScoreCount++;
            highScorereturns += returnVal;
          } else {
            lowScoreCount++;
            lowScorereturns += returnVal;
          }
        } catch (e) {
          // 忽略
        }
      }
      
      results[indicator] = {
        highScoreCount,
        lowScoreCount,
        highScoreAvgReturn: highScoreCount > 0 ? highScorereturns / highScoreCount : 0,
        lowScoreAvgReturn: lowScoreCount > 0 ? lowScorereturns / lowScoreCount : 0,
      };
      
      console.log(`   ${indicator}: 高分组收益=${results[indicator].highScoreAvgReturn.toFixed(1)}%, 低分组收益=${results[indicator].lowScoreAvgReturn.toFixed(1)}%`);
    }

    return results;
  }

  /**
   * 获取最近预测���录
   */
  async getRecentPredictions(months = 12) {
    const result = await pool.query(`
      SELECT * FROM value_prediction_outcomes
      WHERE prediction_date >= CURRENT_DATE - INTERVAL '365 days'
      ORDER BY prediction_date DESC
      LIMIT 100
    `);

    console.log(`📜 最近预测: ${result.rows.length} 条`);

    return result.rows;
  }

  /**
   * 计算候选股平均收益率
   */
  async calculateAverageReturn() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE actual_return > 0)::int as winners,
        COUNT(*) FILTER (WHERE actual_return <= 0)::int as losers,
        AVG(actual_return)::numeric as average
      FROM value_prediction_outcomes
      WHERE status = 'evaluated'
        AND evaluated_at >= CURRENT_DATE - INTERVAL '365 days'
    `);

    const row = result.rows[0];
    const winners = parseInt(row.winners) || 0;
    const losers = parseInt(row.losers) || 0;
    const averageReturn = parseFloat(row.average) || 0;

    console.log(`📈 平均收益: ${averageReturn.toFixed(1)}% (胜: ${winners}, 负: ${losers})`);

    return { averageReturn, winners, losers };
  }

  /**
   * 生成完整评估报告
   */
  async run() {
    try {
      console.log('\n📋 生成评估报告...\n');

      // 1. 计算准确率
      const accuracyData = await this.calculateAccuracy();

      // 2. 计算平均收益率
      const returnData = await this.calculateAverageReturn();

      // 3. 分析指标
      const indicatorData = await this.analyzeIndicatorPerformance();

      // 返回结果
      return {
        accuracy: accuracyData.accuracy,
        accuracyByDirection: accuracyData.byDirection,
        averageReturn: returnData.averageReturn,
        indicators: indicatorData,
        recommendations: this.generateRecommendations(accuracyData, indicatorData),
      };

    } catch (e) {
      console.error('评估失败:', e.message);
      return null;
    }
  }

  /**
   * 生成建议
   */
  generateRecommendations(accuracyData, indicatorData) {
    const recommendations = [];

    if (accuracyData.accuracy < 0.6) {
      recommendations.push('准确率低于60%，建议调整选股标准');
    }

    if (indicatorData.roe) {
      if (indicatorData.roe.highScoreAvgReturn > indicatorData.roe.lowScoreAvgReturn + 10) {
        recommendations.push('ROE高分股票表现更好，可提高ROE权重');
      }
    }

    if (indicatorData.growth) {
      if (indicatorData.growth.highScoreAvgReturn > indicatorData.growth.lowScoreAvgReturn + 10) {
        recommendations.push('高增长股票表现更好，可提高增长率权重');
      }
    }

    return recommendations;
  }

  /**
   * 清理连接
   */
  async close() {
    await pool.end();
  }
}

// 导出
module.exports = new ValueEvaluator();

// 直接运行
if (require.main === module) {
  console.log('🧊 Value Evaluator Test\n');
  
  new ValueEvaluator().run()
    .then(result => {
      console.log('\n=== 评估完成 ===');
      console.log('准确率:', (result.accuracy * 100).toFixed(1) + '%');
      console.log('平均收益:', result.averageReturn.toFixed(1) + '%');
      console.log('建议:', result.recommendations.join(', ') || '无');
      process.exit(0);
    })
    .catch(e => {
      console.error('Error:', e.message);
      process.exit(1);
    });
}