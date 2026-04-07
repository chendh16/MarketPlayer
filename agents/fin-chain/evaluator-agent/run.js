/**
 * evaluator-agent - 策略评估 Agent (双层评估)
 * 读取 config/system.config.js 获取参数
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 加载配置
const config = require('../../config/system.config');

// 飞书用户 open_id
const FEISHU_USER_OPEN_ID = 'ou_3d8c36452b5a0ca480873393ad876e12';

// 富途Python API下单
async function placeFutuOrderPython(symbol, market, direction, quantity, price, trdEnv) {
  return new Promise((resolve) => {
    const code = symbol.includes('.') ? symbol : `${market}.${symbol}`;
    const side = direction === 'buy' ? 'TrdSide.BUY' : 'TrdSide.SELL';
    
    const pythonCode = `
from futu import *
trd_ctx = OpenSecTradeContext(
    filter_trdmarket=TrdMarket.US,
    host='127.0.0.1',
    port=11111,
    security_firm=SecurityFirm.FUTUSECURITIES
)
ret, data = trd_ctx.place_order(
    price=0,
    qty=${quantity},
    code='${code}',
    trd_side=${side},
    order_type=OrderType.MARKET,
    trd_env=TrdEnv.SIMULATE
)
print('RESULT:', ret, '|', 'SUCCESS' if ret == 0 else str(data))
if ret == 0:
    print('ORDER_ID:', data['order_id'].iloc[0])
trd_ctx.close()
`;
    
    const child = spawn('python3', ['-c', pythonCode], {
      env: { ...process.env, PYTHONPATH: '/Users/zhengzefeng/Library/Python/3.9/lib/python3.9/site-packages' }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    
    child.on('close', (code) => {
      if (code === 0) {
        const match = stdout.match(/RESULT: (.+)/);
        if (match) {
          const parts = match[1].split('|');
          const ret = parseInt(parts[0]);
          const orderIdMatch = stdout.match(/ORDER_ID:\s*(\S+)/);
          const orderId = (ret === 0 && orderIdMatch) ? orderIdMatch[1] : null;
          resolve({ success: ret === 0, orderId: orderId, message: parts[1]?.trim() || 'unknown' });
        } else {
          resolve({ success: false, message: stdout });
        }
      } else {
        resolve({ success: false, message: stderr || stdout });
      }
    });
    
    child.on('error', (err) => resolve({ success: false, message: err.message }));
  });
}

const SIGNAL_BT_OUTPUT = path.join(process.cwd(), 'agents/fin-chain/backtest-agent/output.json');
const STRATEGY_BT_OUTPUT = path.join(process.cwd(), 'agents/strategy-backtester/output.json');
const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/evaluator-agent/output.json');

// 行业黑名单配置（从配置文件读取）
const INDUSTRY_BLACKLIST = {
  '美股': config.blacklist.symbols,
  '港股': [],
  'A股': []
};

// 评估规则（从配置文件读取）
const THRESHOLDS = {
  min_sharpe: config.benchmark.sharpe * 0.5,
  min_win_rate: config.benchmark.win_rate * 0.6,
  max_drawdown: config.benchmark.max_drawdown * 1.1,
  min_annual_return: -0.10
};

// ========== 层1：信号级评估 ==========
function evaluateSignal(btResult) {
  const s = btResult;
  
  // 行业黑名单过滤
  const blacklist = INDUSTRY_BLACKLIST[s.market] || [];
  if (blacklist.includes(s.symbol)) {
    return {
      level: 'signal',
      eval_id: `sig_${Date.now()}_${s.symbol}`,
      symbol: s.symbol,
      market: s.market,
      score: 0,
      verdict: 'rejected',
      reasons: ['行业黑名单: semiconductors'],
      timestamp: new Date().toISOString()
    };
  }
  
  let score = 0;
  const reasons = [];
  
  // Sharpe 评分
  if (s.sharpe >= 1.5) { score += 30; reasons.push('Sharpe优秀'); }
  else if (s.sharpe >= 1.0) { score += 20; reasons.push('Sharpe良好'); }
  else if (s.sharpe >= 0.5) { score += 10; reasons.push('Sharpe达标'); }
  else if (s.sharpe >= 0) { score += 5; reasons.push('Sharpe为正'); }
  else { reasons.push('Sharpe为负'); }
  
  // 胜率评分
  if (s.win_rate >= 0.5) { score += 25; reasons.push('胜率高'); }
  else if (s.win_rate >= 0.4) { score += 15; reasons.push('胜率良好'); }
  else if (s.win_rate >= 0.35) { score += 5; reasons.push('胜率达标'); }
  else { reasons.push('胜率不足'); }
  
  // 回撤评分
  if (s.max_drawdown <= 0.10) { score += 25; reasons.push('回撤小'); }
  else if (s.max_drawdown <= 0.15) { score += 15; reasons.push('回撤可控'); }
  else if (s.max_drawdown <= 0.20) { score += 5; reasons.push('回撤在阈值内'); }
  else { reasons.push('回撤过大'); }
  
  // 年化收益
  if (s.annual_return >= 0.20) { score += 20; reasons.push('收益优秀'); }
  else if (s.annual_return >= 0.10) { score += 15; reasons.push('收益良好'); }
  else if (s.annual_return >= 0) { score += 5; reasons.push('正收益'); }
  else { reasons.push('负收益'); }
  
  // verdict
  let verdict = 'discard';
  if (score >= 80 && s.sharpe >= 1.0 && s.max_drawdown <= 0.15) verdict = 'candidate_live';
  else if (score >= 60 && s.sharpe >= 0.5 && s.max_drawdown <= 0.20) verdict = 'candidate_paper';
  else if (score >= 40 && s.sharpe >= 0) verdict = 'keep';
  
  return {
    level: 'signal',
    eval_id: `sig_${Date.now()}_${s.symbol}`,
    symbol: s.symbol,
    market: s.market || '美股',
    sharpe: s.sharpe,
    win_rate: s.win_rate,
    max_drawdown: s.max_drawdown,
    annual_return: s.annual_return,
    score,
    verdict,
    reasons,
    timestamp: new Date().toISOString()
  };
}

// ========== 层2：策略级评估 ==========
function evaluateStrategy(strategyResult) {
  const s = strategyResult;
  
  let score = 0;
  const reasons = [];
  
  // Sharpe 评分（策略级更重要）
  if (s.sharpe_ratio >= 2.0) { score += 35; reasons.push('Sharpe卓越(>2.0)'); }
  else if (s.sharpe_ratio >= 1.5) { score += 25; reasons.push('Sharpe优秀(>1.5)'); }
  else if (s.sharpe_ratio >= 1.0) { score += 20; reasons.push('Sharpe良好(>1.0)'); }
  else if (s.sharpe_ratio >= 0.5) { score += 10; reasons.push('Sharpe达标(>0.5)'); }
  else if (s.sharpe_ratio >= 0) { score += 5; reasons.push('Sharpe为正'); }
  else { reasons.push('Sharpe为负'); }
  
  // 胜率评分（策略级的核心指标）
  if (s.win_rate >= 0.60) { score += 30; reasons.push('胜率优秀(>60%)'); }
  else if (s.win_rate >= 0.50) { score += 20; reasons.push('胜率高(>50%)'); }
  else if (s.win_rate >= 0.43) { score += 15; reasons.push('胜率良好(>43%)'); }
  else if (s.win_rate >= 0.35) { score += 5; reasons.push('胜率达标'); }
  else { reasons.push('胜率不足'); }
  
  // 回撤评分
  if (s.max_drawdown <= 0.10) { score += 25; reasons.push('回撤极小(<10%)'); }
  else if (s.max_drawdown <= 0.15) { score += 20; reasons.push('回撤小(<15%)'); }
  else if (s.max_drawdown <= 0.20) { score += 10; reasons.push('回撤可控(<20%)'); }
  else { reasons.push('回撤过大'); }
  
  // 交易次数（数据量足够）
  if (s.total_trades >= 50) { score += 10; reasons.push('数据量充足(>50笔)'); }
  else if (s.total_trades >= 20) { score += 5; reasons.push('数据量中等(>20笔)'); }
  else { reasons.push('数据量不足'); }
  
  // verdict
  let verdict = 'discard';
  if (score >= 85 && s.sharpe_ratio >= 1.5 && s.max_drawdown <= 0.15 && s.win_rate >= 0.50) {
    verdict = 'candidate_live';
  } else if (score >= 65 && s.sharpe_ratio >= 0.8 && s.max_drawdown <= 0.20 && s.win_rate >= 0.40) {
    verdict = 'candidate_paper';
  } else if (score >= 45 && s.sharpe_ratio >= 0.3 && s.win_rate >= 0.35) {
    verdict = 'keep';
  }
  
  return {
    level: 'strategy',
    eval_id: `strat_${Date.now()}`,
    strategy_params: s.strategy_params,
    test_period: s.test_period,
    total_trades: s.total_trades,
    symbols_tested: s.symbols_tested,
    sharpe: s.sharpe_ratio,
    win_rate: s.win_rate,
    max_drawdown: s.max_drawdown,
    score,
    verdict,
    reasons,
    timestamp: new Date().toISOString()
  };
}

// 主函数
async function main() {
  const evaluations = [];
  
  // ===== 层1：信号级评估 =====
  if (fs.existsSync(SIGNAL_BT_OUTPUT)) {
    const input = JSON.parse(fs.readFileSync(SIGNAL_BT_OUTPUT, 'utf-8'));
    const results = input.results || [];
    
    console.log(`[evaluator] 层1: 信号级评估 ${results.length} 个结果...`);
    
    for (const result of results) {
      const evalResult = evaluateSignal(result);
      evaluations.push(evalResult);
      console.log(`[evaluator] 信号 ${result.symbol}: score=${evalResult.score} verdict=${evalResult.verdict}`);
    }
  }
  
  // ===== 层2：策略级评估 =====
  if (fs.existsSync(STRATEGY_BT_OUTPUT)) {
    const strategyResult = JSON.parse(fs.readFileSync(STRATEGY_BT_OUTPUT, 'utf-8'));
    
    console.log(`\n[evaluator] 层2: 策略级评估 ${strategyResult.total_trades} 笔交易...`);
    
    const evalResult = evaluateStrategy(strategyResult);
    evaluations.push(evalResult);
    
    console.log(`[evaluator] 策略整体: win_rate=${evalResult.win_rate.toFixed(2)} sharpe=${evalResult.sharpe.toFixed(2)} score=${evalResult.score} verdict=${evalResult.verdict}`);
  } else {
    console.log('[evaluator] 无策略级回测结果，跳过层2评估');
  }
  
  console.log(`\n[evaluator] 完成: ${evaluations.length} 个评估结果`);
  
  // 输出到文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    summary: {
      signal_evaluations: evaluations.filter(e => e.level === 'signal').length,
      strategy_evaluations: evaluations.filter(e => e.level === 'strategy').length,
      candidates_live: evaluations.filter(e => e.verdict === 'candidate_live').length,
      candidates_paper: evaluations.filter(e => e.verdict === 'candidate_paper').length,
      keep: evaluations.filter(e => e.verdict === 'keep').length,
      discard: evaluations.filter(e => e.verdict === 'discard').length
    },
    evaluations,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log(`[evaluator] 结果已写入 ${OUTPUT_FILE}`);
  
  // 写入 memory-store
  const db = require('sqlite3').verbose();
  const database = new db.Database(path.join(process.cwd(), 'memory-store/marketplayer.db'));
  
  for (const evalResult of evaluations) {
    const table = evalResult.level === 'strategy' ? 'strategy_evaluations' : 'evaluation_results';
    const sql = evalResult.level === 'strategy' 
      ? `INSERT OR REPLACE INTO strategy_evaluations (eval_id, strategy_params, test_period, total_trades, symbols_tested, sharpe, win_rate, max_drawdown, score, verdict, reasons, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT OR REPLACE INTO evaluation_results (eval_id, strategy_version_id, symbol, market, sharpe, win_rate, max_drawdown, annual_return, score, verdict, reasons, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = evalResult.level === 'strategy'
      ? [evalResult.eval_id, JSON.stringify(evalResult.strategy_params), evalResult.test_period, evalResult.total_trades, evalResult.symbols_tested, evalResult.sharpe, evalResult.win_rate, evalResult.max_drawdown, evalResult.score, evalResult.verdict, JSON.stringify(evalResult.reasons), evalResult.timestamp]
      : [evalResult.eval_id, 'signal_level', evalResult.symbol, evalResult.market, evalResult.sharpe || 0, evalResult.win_rate || 0, evalResult.max_drawdown || 0, evalResult.annual_return || 0, evalResult.score, evalResult.verdict, JSON.stringify(evalResult.reasons), evalResult.timestamp];
    
    database.run(sql, params, function(err) {
      if (err) console.error(`写入${table}失败:`, err.message);
    });
  }
  
  database.close(() => {
    console.log('[evaluator] 已写入 memory-store');
  });
  
  // 对策略级 candidate 下单
  const strategyCandidates = evaluations.filter(e => e.level === 'strategy' && (e.verdict === 'candidate_paper' || e.verdict === 'candidate_live'));
  if (strategyCandidates.length > 0) {
    console.log(`[evaluator] 策略级 ${strategyCandidates.length} 个候选，准备下单...`);
    // 策略级下单逻辑可以后续添加
  }
  
  console.log('\n---OUTPUT---');
  console.log(JSON.stringify({
    type: 'evaluation_result',
    count: evaluations.length,
    evaluations: evaluations.map(e => ({
      level: e.level,
      symbol: e.symbol || 'strategy',
      score: e.score,
      verdict: e.verdict,
      win_rate: e.win_rate,
      sharpe: e.sharpe
    })),
    timestamp: new Date().toISOString()
  }, null, 2));
}

main().catch(err => {
  console.error('[evaluator] 错误:', err.message);
  process.exit(1);
});