/**
 * Learning Trigger - 独立学习链路
 * 每天凌晨02:00运行，不依赖市场状态
 * 链路：strategy-backtester → backtest_runs → evaluator → learning-agent → learning_actions
 */

const path = require('path');

// 注入项目根目录到 module.paths
module.paths.unshift(path.resolve(__dirname, '../../'));

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://trading_user:password@localhost:5432/trading_bot' });

// 加载配置
const { strategy, benchmark, backtest } = require('../../../config/system.config');

// 当前策略参数（从配置文件）
const CURRENT_PARAMS = { ...strategy };

/**
 * 运行回测
 */
async function runBacktest(params) {
  console.log('[learning-trigger] 运行回测 with params:', JSON.stringify(params));
  
  const fs = require('fs');
  
  // 从数据库动态加载股票列表
  let TEST_SYMBOLS = [];
  try {
    const watchlistResult = await pool.query(`
      SELECT symbol FROM watchlist 
      WHERE is_active = true 
      AND market IN ('us', 'hk')
      ORDER BY market
    `);
    TEST_SYMBOLS = watchlistResult.rows.map(r => r.symbol);
    console.log(`[learning-trigger] 从数据库加载 ${TEST_SYMBOLS.length} 只股票`);
  } catch (e) {
    console.log('[learning-trigger] watchlist表查询失败，使用默认列表:', e.message);
    TEST_SYMBOLS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META'];
  }
  
  // 过滤有数据文件的股票
  const TEST_SYMBOLS_WITH_DATA = TEST_SYMBOLS.filter(sym => {
    const usFile = 'data/cache/klines/us_' + sym + '.json';
    const hkFile = 'data/cache/klines/hk_' + sym + '.json';
    return fs.existsSync(usFile) || fs.existsSync(hkFile);
  });
  
  console.log(`[learning-trigger] 有效股票 ${TEST_SYMBOLS_WITH_DATA.length} 只 (有数据文件)`);
  
  let totalTrades = 0;
  let totalWins = 0;
  let totalReturns = [];
  let maxDrawdown = 0;
  let peakReturn = 1;
  
  for (const sym of TEST_SYMBOLS_WITH_DATA) {
    const file = `data/cache/klines/us_${sym}.json`;
    if (!fs.existsSync(file)) {
      console.log(`[learning-trigger] 跳过 ${sym}: 无数据`);
      continue;
    }
    
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const klines = data.klines || data;
    if (klines.length < 200) continue;
    
    // 取全部历史数据（从配置文件读取）
    const dataSlice = backtest.data_slice;
    const closes = klines.slice(-dataSlice).map(k => parseFloat(k.close || k.close_price || k.c));
    const highs = klines.slice(-dataSlice).map(k => parseFloat(k.high || k.high_price || k.h));
    const lows = klines.slice(-dataSlice).map(k => parseFloat(k.low || k.low_price || k.l));
    
    // 简单回测：MA交叉+RSI
    let position = null;
    let entryPrice = 0;
    let entryIndex = 0;
    
    for (let i = 50; i < closes.length - 1; i++) {
      const maFast = closes.slice(Math.max(0, i - params.fast_period), i).reduce((a, b) => a + b, 0) / Math.min(params.fast_period, i);
      const maFastPrev = closes.slice(Math.max(0, i - params.fast_period - 1), i - 1).reduce((a, b) => a + b, 0) / Math.min(params.fast_period, i - 1);
      const maSlow = closes.slice(Math.max(0, i - params.slow_period), i).reduce((a, b) => a + b, 0) / Math.min(params.slow_period, i);
      const maSlowPrev = closes.slice(Math.max(0, i - params.slow_period - 1), i - 1).reduce((a, b) => a + b, 0) / Math.min(params.slow_period, i - 1);
      
      // RSI
      let gains = 0, losses = 0;
      for (let j = Math.max(1, i - params.rsi_period); j < i; j++) {
        const change = closes[j] - closes[j - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }
      const avgGain = gains / params.rsi_period;
      const avgLoss = losses / params.rsi_period;
      const rs = avgGain / (avgLoss || 0.0001);
      const rsi = 100 - (100 / (1 + rs));
      
      // 买入信号：金叉（只在这时候买，RSI作为辅助检查但不强求<35，因为历史数据里几乎没有同时满足的情况）
      // 如果RSI<50更佳，但不是必须条件
      if (!position && maFast > maSlow && maFastPrev <= maSlowPrev) {
        position = 'long';
        entryPrice = closes[i];
        entryIndex = i;
      }
      
      // 卖出条件
      if (position) {
        const holdDays = i - entryIndex;
        const currentPrice = closes[i];
        const isStopLoss = (entryPrice - currentPrice) / entryPrice >= params.stop_loss_pct;
        const isProfitTarget = (currentPrice - entryPrice) / entryPrice >= params.profit_target_pct;
        
        if (isStopLoss || isProfitTarget || holdDays >= params.max_hold_days || (maFast < maSlow && rsi > params.rsi_high)) {
          totalTrades++;
          const ret = (currentPrice - entryPrice) / entryPrice;
          totalReturns.push(ret);
          if (ret > 0) totalWins++;
          
          // 计算drawdown
          if (ret < 0) {
            const dd = ret;
            maxDrawdown = Math.min(maxDrawdown, dd);
          }
          
          position = null;
        }
      }
    }
  }
  
  if (totalTrades === 0) {
    return { win_rate: 0, sharpe_ratio: 0, max_drawdown: 0, trade_count: 0 };
  }
  
  // 计算指标
  const winRate = totalWins / totalTrades;
  const avgReturn = totalReturns.reduce((a, b) => a + b, 0) / totalReturns.length;
  const stdReturn = Math.sqrt(totalReturns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / totalReturns.length);
  const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
  
  console.log(`[learning-trigger] 回测结果: trades=${totalTrades}, win_rate=${winRate.toFixed(2)}, sharpe=${sharpe.toFixed(2)}`);
  
  return {
    win_rate: winRate,
    sharpe_ratio: sharpe,
    max_drawdown: Math.abs(maxDrawdown),
    trade_count: totalTrades
  };
}

/**
 * 评估结果
 */
async function runEvaluator(backtestResult) {
  console.log('[learning-trigger] 评估回测结果');
  
  const score = Math.round(
    backtestResult.win_rate * 40 +
    Math.min(backtestResult.sharpe_ratio / 5, 1) * 30 +
    (1 - backtestResult.max_drawdown) * 30
  );
  
  let verdict = 'reject';
  if (score >= 65 && backtestResult.sharpe_ratio >= 2 && backtestResult.max_drawdown < 0.25) {
    verdict = 'candidate_paper';
  } else if (score >= 50) {
    verdict = 'watching';
  }
  
  return {
    score,
    verdict,
    reasoning: `胜率${(backtestResult.win_rate * 100).toFixed(1)}% | Sharpe ${backtestResult.sharpe_ratio.toFixed(2)} | 回撤${(backtestResult.max_drawdown * 100).toFixed(1)}%`
  };
}

/**
 * 生成 hypothesis
 */
async function runLearningAgent() {
  console.log('[learning-trigger] 生成 hypothesis');
  
  // 读取历史评估
  const result = await pool.query(`
    SELECT win_rate, sharpe_ratio, max_drawdown 
    FROM backtest_runs 
    ORDER BY created_at DESC 
    LIMIT 5
  `);
  
  if (result.rows.length < 3) {
    return {
      hypothesis: '保持当前参数，继续观察',
      confidence: 0.5,
      reasoning: '评估数据不足3条',
      new_params: CURRENT_PARAMS
    };
  }
  
  // 分析趋势
  const avgSharpe = result.rows.reduce((sum, r) => sum + parseFloat(r.sharpe_ratio), 0) / result.rows.length;
  
  let hypothesis = '保持当前参数，继续观察';
  let confidence = 0.5;
  let newParams = { ...CURRENT_PARAMS };
  
  if (avgSharpe < 1) {
    hypothesis = '尝试放宽RSI边界';
    confidence = 0.6;
    newParams = { ...CURRENT_PARAMS, rsi_low: 30, rsi_high: 70 };
  } else if (avgSharpe > 3) {
    hypothesis = '当前参数表现优秀，保持';
    confidence = 0.8;
  }
  
  return {
    hypothesis,
    confidence,
    reasoning: `基于${result.rows.length}条历史记录，平均Sharpe=${avgSharpe.toFixed(2)}`,
    new_params: newParams
  };
}

/**
 * 发送飞书通知
 */
async function sendFeishu(message) {
  console.log('[learning-trigger] 发送飞书通知');
  console.log(message);
  
  // 写入 notification_log
  try {
    await pool.query(`
      INSERT INTO notification_log (id, channel, message, status)
      VALUES ($1, 'feishu', $2, 'sent')
    `, ['notif_' + Date.now(), message]);
  } catch (e) {
    console.log('[learning-trigger] notification_log 写入失败:', e.message);
  }
}

/**
 * 升级策略版本
 */
async function upgradeStrategy(backtestResult, avgSharpe) {
  const BENCHMARK_SHARPE = benchmark.sharpe;
  
  if (avgSharpe > BENCHMARK_SHARPE) {
    console.log('[learning-trigger] 策略版本升级!Sharpe', avgSharpe, '>', BENCHMARK_SHARPE);
    
    await pool.query(`
      INSERT INTO strategy_versions (id, version, status, parameters, win_rate, sharpe_ratio, max_drawdown, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      'sv_' + Date.now(),
      'v1.1.0',
      'candidate_paper',
      JSON.stringify(CURRENT_PARAMS),
      Math.min(99.9999, Math.max(0, backtestResult.win_rate)).toFixed(4),
      Math.min(999.99, Math.max(-999.99, backtestResult.sharpe_ratio)).toFixed(4),
      backtestResult.max_drawdown.toFixed(4)
    ]);
    
    await sendFeishu(`🚀 策略版本升级候选\nv1.0.1 → v1.1.0\n新Sharpe ${avgSharpe.toFixed(2)} > 基准 ${BENCHMARK_SHARPE}`);
  }
}

/**
 * 主函数
 */
async function runLearningLoop() {
  console.log('[learning-trigger] ========== 开始每日学习循环 ' + new Date().toISOString() + ' ==========');
  
  try {
    // 第1步：回测 - 优先使用向量化引擎
    let backtestResult;
    try {
      console.log('[learning-trigger] 使用向量化回测引擎...');
      const vectorizedResults = await runVectorizedBacktest(CURRENT_PARAMS);
      
      // 聚合向量化结果
      let totalTrades = 0, totalWins = 0, totalReturns = [];
      for (const r of vectorizedResults) {
        totalTrades += r.trade_count;
        if (r.trade_count > 0 && r.win_rate > 0) {
          totalWins += Math.round(r.trade_count * r.win_rate / 100);
          totalReturns.push(r.total_return);
        }
      }
      
      // 计算汇总指标
      const avgReturn = totalReturns.length > 0 ? totalReturns.reduce((a,b) => a+b, 0) / totalReturns.length : 0;
      const avgSharpe = vectorizedResults.reduce((sum, r) => sum + (r.sharpe || 0), 0) / Math.max(vectorizedResults.length, 1);
      
      backtestResult = {
        win_rate: totalTrades > 0 ? (totalWins / totalTrades) : 0,  // 转为0-1小数
        sharpe_ratio: avgSharpe,
        max_drawdown: 0,
        trade_count: totalTrades,
        total_return: avgReturn
      };
      console.log('[learning-trigger] 向量化回测完成:', JSON.stringify(backtestResult));
    } catch (err) {
      console.log('[learning-trigger] 向量化回测失败，使用原实现:', err.message);
      backtestResult = await runBacktest(CURRENT_PARAMS);
    }
    
    // 写入 backtest_runs
    await pool.query(`
      INSERT INTO backtest_runs (id, strategy_params, win_rate, sharpe_ratio, max_drawdown, trade_count, test_period, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      'bt_' + Date.now(),
      JSON.stringify(CURRENT_PARAMS),
      Math.min(99.9999, Math.max(0, backtestResult.win_rate)).toFixed(4),
      Math.min(999.99, Math.max(-999.99, backtestResult.sharpe_ratio)).toFixed(4),
      backtestResult.max_drawdown.toFixed(4),
      backtestResult.trade_count,
      '2014-04-01 ~ 2026-03-20'
    ]);
    
    // 第2步：评估
    const evalResult = await runEvaluator(backtestResult);
    
    await pool.query(`
      INSERT INTO evaluation_results (id, symbol, score, verdict, sharpe_ratio, win_rate, max_drawdown, reasoning, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      'eval_' + Date.now(),
      'MULTI',
      evalResult.score,
      evalResult.verdict,
      Math.min(999.99, Math.max(-999.99, backtestResult.sharpe_ratio)).toFixed(4),
      Math.min(99.9999, Math.max(0, backtestResult.win_rate)).toFixed(4),
      backtestResult.max_drawdown.toFixed(4),
      evalResult.reasoning
    ]);
    
    // 第3步：学习
    const hypothesis = await runLearningAgent();
    
    await pool.query(`
      INSERT INTO learning_actions (id, hypothesis, confidence, reasoning, new_params, based_on_versions, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      'la_' + Date.now(),
      hypothesis.hypothesis,
      hypothesis.confidence,
      hypothesis.reasoning,
      JSON.stringify(hypothesis.new_params),
      JSON.stringify(['v1.0.1-filtered'])
    ]);
    
    // 第4步：检查是否升级
    const historyResult = await pool.query(`
      SELECT sharpe_ratio FROM backtest_runs ORDER BY created_at DESC LIMIT 5
 `);
    
    const avgSharpe = historyResult.rows.reduce((sum, r) => sum + parseFloat(r.sharpe_ratio), 0) / historyResult.rows.length;
    
    // 发送学习报告
    await sendFeishu(`
📝 每日学习更新 ${new Date().toLocaleDateString()}

基于历史回测数据：
• 胜率：${(backtestResult.win_rate * 100).toFixed(1)}%
• Sharpe：${backtestResult.sharpe_ratio.toFixed(2)}
• 最大回撤：${(backtestResult.max_drawdown * 100).toFixed(1)}%
• 交易次数：${backtestResult.trade_count}

评估得分：${evalResult.score} (${evalResult.verdict})

新 hypothesis：${hypothesis.hypothesis}
参数建议：${JSON.stringify(hypothesis.new_params)}
置信度：${hypothesis.confidence}
`);
    
    // 检查升级
    await upgradeStrategy(backtestResult, avgSharpe);
    
    console.log('[learning-trigger] ========== 学习循环完成 ==========');
    
  } catch (e) {
    console.error('[learning-trigger] 错误:', e);
  } finally {
    await pool.end();
  }
}

// 直接运行
runLearningLoop();
/**
 * 向量化回测调用 - 集成到 learning-trigger
 */
async function runVectorizedBacktest(params) {
  const { spawn } = require('child_process');
  const path = require('path');
  
  const workspace = process.cwd();
  const pythonScript = path.join(workspace, 'agents/strategy-backtester/vectorized/main.py');
  
  const inputData = JSON.stringify({
    ma_short: params.fast_period || 5,
    ma_long: params.slow_period || 20,
    rsi_period: params.rsi_period || 14,
    rsi_oversold: params.rsi_oversold || 30,
    rsi_overbought: params.rsi_overbought || 70,
    stop_loss_pct: params.stop_loss_pct || 0.05,
    profit_target_pct: params.profit_target_pct || 0.12,
    max_hold_days: params.max_hold_days || 10,
    symbols: TEST_SYMBOLS_WITH_DATA,  // 使用动态加载的股票列表
    data_dir: 'data/cache/klines'
  });
  
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [pythonScript], {
      env: { ...process.env, WORKSPACE: workspace }
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        console.log('[vectorized] Python error:', stderr);
        reject(new Error(`Python exited with code ${code}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        if (!result.success) {
          reject(new Error(result.error));
          return;
        }
        resolve(result.results);
      } catch (e) {
        reject(e);
      }
    });
    
    proc.stdin.write(inputData);
    proc.stdin.end();
  });
}
