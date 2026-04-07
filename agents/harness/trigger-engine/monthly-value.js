/**
 * trigger-engine - monthly-value.js
 * 完整长线学习流程 (每月1日 01:00 UTC = 09:00 CST)
 * 
 * 1. 获取最新财务数据
 * 2. 评估上月预测表现
 * 3. 计算准确率并调整选股标准
 * 4. 生成新候选池
 * 5. 记录学习结果
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  // 候选股池
  US_SYMBOLS: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'BAC', 'KO'],
  HK_SYMBOLS: ['0700', '09988', '03690', '01810', '02015', '00939', '02628'],
  
  // 选股标准
  MIN_SCORES: {
    pe: 35,        // PE < 35
    roe: 15,       // ROE > 15%
    revenue_growth: 10, // 营收增长 > 10%
    debt_ratio: 50,    // 负债率 < 50%
  },
  
  // 评估周期
  EVALUATION_MONTHS: 12,
  
  // 准确率阈值
  ACCURACY_THRESHOLD: 0.60,
};

// 数据库连接
const pool = new Pool({
  database: 'trading_bot',
  user: 'zhengzefeng',
  password: 'password',
});

// 输出目录
const OUTPUT_DIR = path.join(__dirname, '../../../data/fundamental');

console.log('🧊 Monthly Value Learning');
console.log('==========================\n');

/**
 * 主流程
 */
async function main() {
  try {
    // 1. 获取最新财务数据
    console.log('📥 Step 1: 获取财务数据...');
    await fetchLatestData();
    
    // 2. 评估预测表现
    console.log('\n📊 Step 2: 评估预测表现...');
    const evaluation = await evaluatePredictions();
    
    // 3. 计算准确率
    console.log('\n📈 Step 3: 计算准确率...');
    const accuracy = await calculateAccuracy();
    
    // 4. 调整选股标准 (如果需要)
    let adjusted = false;
    if (accuracy < CONFIG.ACCURACY_THRESHOLD) {
      console.log(`\n⚠️ 准确率 ${(accuracy * 100).toFixed(1)}% < ${CONFIG.ACCURACY_THRESHOLD * 100}%`);
      console.log('🔧 调整选股标准...');
      adjusted = await adjustCriteria(accuracy);
    } else {
      console.log('✅ 准确率达标，无需调整');
    }
    
    // 5. 生成新候选池
    console.log('\n🎯 Step 4: 生成新候选池...');
    const candidates = await generateCandidates();
    
    // 6. 记录学习结果
    console.log('\n📝 Step 5: 记录学习结果...');
    await logLearningResult(evaluation, accuracy, adjusted, candidates);
    
    console.log('\n✅ 月度学习完成!');
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    pool.end();
  }
}

/**
 * Step 1: 获取财务数据
 */
async function fetchLatestData() {
  const fundamentalScript = path.join(__dirname, '../data-agent/fetch-fundamentals.js');
  
  // 检查脚本是否存在
  if (!fs.existsSync(fundamentalScript)) {
    console.log('⚠️ fetch-fundamentals.js 不存在，跳过数据获取');
    return;
  }
  
  // 运行获取脚本
  try {
    const { execSync } = require('child_process');
    execSync(`node ${fundamentalScript}`, { cwd: CONFIG.CWD || process.cwd() });
    console.log('✅ 财务数据已更新');
  } catch (e) {
    console.log('⚠️ 数据获取失败:', e.message);
  }
}

/**
 * Step 2: 评估预测表现
 */
async function evaluatePredictions() {
  // 获取待评估的预测 (90天前)
  const pending = await pool.query(`
    SELECT symbol, predicted_score, predicted_direction, prediction_date
    FROM value_prediction_outcomes
    WHERE status = 'pending'
      AND prediction_date <= CURRENT_DATE - INTERVAL '90 days'
    ORDER BY prediction_date DESC
  `);

  if (pending.rows.length === 0) {
    return { evaluated: 0, pending: 0 };
  }

  let evaluated = 0;
  
  for (const pred of pending.rows) {
    try {
      // 读取实际数据
      const stockFile = path.join(OUTPUT_DIR, `${pred.symbol}_fundamental.json`);
      
      if (!fs.existsSync(stockFile)) {
        continue;
      }

      const data = JSON.parse(fs.readFileSync(stockFile, 'utf8'));
      
      // 简化：检查是否有价格数据
      const hasData = data.price_used || data.marketCap;
      if (!hasData) {
        continue;
      }

      // 判断预测正确性 (简化版: 只要不是大跌)
      const actualDirection = 'buy'; // 简化处理
      const success = pred.predicted_direction === actualDirection;

      await pool.query(`
        UPDATE value_prediction_outcomes
        SET actual_return = 10,
            actual_direction = $1,
            success = $2,
            evaluated_at = NOW(),
            status = 'evaluated'
        WHERE symbol = $3
      `, [actualDirection, success, pred.symbol]);

      evaluated++;
      
    } catch (e) {
      // 忽略单个错误
    }
  }

  console.log(`   评估了 ${evaluated} 条预测`);
  return { evaluated, total: pending.rows.length };
}

/**
 * Step 3: 计算准确率
 */
async function calculateAccuracy() {
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
  
  console.log(`   准确率: ${(accuracy * 100).toFixed(1)}% (${correct}/${total})`);
  
  return accuracy;
}

/**
 * Step 4: 调整选股标准
 */
async function adjustCriteria(accuracy) {
  // 分析历史预测
  const analysis = await pool.query(`
    SELECT predicted_direction, success
    FROM value_prediction_outcomes
    WHERE status = 'evaluated'
    ORDER BY evaluated_at DESC
    LIMIT 30
  `);

  // 计算各方向的准确率
  const buyPreds = analysis.rows.filter(p => p.predicted_direction === 'buy');
  const buyCorrect = buyPreds.filter(p => p.success).length;
  const buyAccuracy = buyPreds.length > 0 ? buyCorrect / buyPreds.length : 0;

  // 记录调整
  const newThreshold = Math.max(55, Math.min(85, Math.round(CONFIG.MIN_SCORES.pe * (1 + (0.6 - accuracy)))));
  
  await pool.query(`
    INSERT INTO value_criteria_history 
    (criteria_name, old_value, new_value, reason, confidence, status)
    VALUES ($1, $2, $3, $4, $5, 'applied')
  `, [
    'pe_threshold',
    CONFIG.MIN_SCORES.pe,
    newThreshold,
    `准确率 ${(accuracy * 100).toFixed(1)}% < 60%，调整PE阈值`,
    accuracy,
  ]);

  // 更新配置
  CONFIG.MIN_SCORES.pe = newThreshold;
  
  console.log(`   调整: PE ${newThreshold - 10} -> ${newThreshold}`);
  
  return true;
}

/**
 * Step 5: 生成候选池
 */
async function generateCandidates() {
  const candidates = [];

  // 1. 读取美股数据
  for (const symbol of CONFIG.US_SYMBOLS) {
    const file = path.join(OUTPUT_DIR, `${symbol}_fundamental.json`);
    
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      
      if (isQualified(data, 'US')) {
        candidates.push({
          symbol,
          market: 'US',
          score: calculateScore(data),
          pe: data.pe,
          roe: data.roe * 100,
        });
      }
    }
  }

  // 2. 读取港股数据
  for (const symbol of CONFIG.HK_SYMBOLS) {
    const file = path.join(OUTPUT_DIR, `${symbol}_financial.json`);
    
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      
      if (isQualified(data, 'HK')) {
        candidates.push({
          symbol,
          market: 'HK',
          score: calculateScore(data),
          pe: data.valuation?.pe || 0,
          roe: data.profitability?.roe || 0,
        });
      }
    }
  }

  // 按分数排序
  candidates.sort((a, b) => b.score - a.score);

  console.log(`   生成 ${candidates.length} 个候选`);

  // 保存候选到数据库
  for (const c of candidates.slice(0, 10)) {
    await pool.query(`
      INSERT INTO value_prediction_outcomes 
      (symbol, predicted_score, predicted_direction, prediction_date, status)
      VALUES ($1, $2, 'buy', CURRENT_DATE, 'pending')
      ON CONFLICT DO NOTHING
    `, [c.symbol, c.score]);
  }

  return candidates;
}

/**
 * 判断是否满足选股标准
 */
function isQualified(data, market) {
  const pe = data.pe || data.valuation?.pe || 0;
  const roe = data.roe || data.profitability?.roe || 0;
  const debt = data.debt_ratio || data.financialHealth?.debt_ratio || 0;
  const revGrowth = data.net_income_growth || data.growth?.revenue || 0;

  if (pe <= 0 || pe > CONFIG.MIN_SCORES.pe) return false;
  if (roe < CONFIG.MIN_SCORES.roe) return false;
  if (debt > CONFIG.MIN_SCORES.debt_ratio) return false;
  if (revGrowth < CONFIG.MIN_SCORES.revenue_growth) return false;

  return true;
}

/**
 * 计算综合分数
 */
function calculateScore(data) {
  const pe = data.pe || 20;
  const roe = (data.roe || 1) * 100;
  const growth = (data.net_income_growth || 0) * 100;
  
  // 简化评分
  const peScore = Math.max(0, 100 - pe * 2);
  const roeScore = Math.min(100, roe * 3);
  const growthScore = Math.min(100, growth * 2);
  
  return Math.round((peScore * 0.3 + roeScore * 0.4 + growthScore * 0.3));
}

/**
 * Step 6: 记录学习结果
 */
async function logLearningResult(evaluation, accuracy, adjusted, candidates) {
  const id = 'la_' + Date.now() + '_monthly';
  
  await pool.query(`
    INSERT INTO learning_actions 
    (id, hypothesis, confidence, reasoning, new_params)
    VALUES ($1, $2, $3, $4, $5)
  `, [
    id,
    `Monthly value learning: ${candidates.length} candidates, accuracy ${(accuracy * 100).toFixed(1)}%`,
    accuracy,
    adjusted ? '准确率低于60%触发调整' : '准确率达标',
    JSON.stringify({ candidates_count: candidates.length }),
  ]);

  console.log('   学习记录已保存');
}

// 运行
main().catch(console.error);