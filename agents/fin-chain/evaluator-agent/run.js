/**
 * evaluator-agent - 策略评估 Agent
 * 职责：
 * 1. 读取 backtest_runs 表里的回测结果
 * 2. 计算夏普比率、胜率、最大回撤、profit_factor
 * 3. 输出 verdict：discard / keep / candidate_paper / candidate_live
 * 4. 写入 memory-store
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/backtest-agent/output.json');
const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/evaluator-agent/output.json');

// 评估规则
const THRESHOLDS = {
  min_sharpe: 0.5,
  min_win_rate: 0.35,
  max_drawdown: 0.20,
  min_profit_factor: 1.2,
  min_annual_return: -0.10  // 允许小幅亏损
};

// 评估单个回测结果
function evaluateResult(btResult) {
  const s = btResult;
  
  let score = 0;
  const reasons = [];
  
  // Sharpe 评分
  if (s.sharpe >= 1.5) {
    score += 30;
    reasons.push('Sharpe优秀(>1.5)');
  } else if (s.sharpe >= 1.0) {
    score += 20;
    reasons.push('Sharpe良好(>1.0)');
  } else if (s.sharpe >= 0.5) {
    score += 10;
    reasons.push('Sharpe达标(>0.5)');
  } else if (s.sharpe >= 0) {
    score += 5;
    reasons.push('Sharpe为正');
  } else {
    reasons.push('Sharpe为负');
  }
  
  // 胜率评分
  if (s.win_rate >= 0.5) {
    score += 25;
    reasons.push('胜率高(>50%)');
  } else if (s.win_rate >= 0.4) {
    score += 15;
    reasons.push('胜率良好(>40%)');
  } else if (s.win_rate >= 0.35) {
    score += 5;
    reasons.push('胜率达标');
  } else {
    reasons.push('胜率不足');
  }
  
  // 回撤评分
  if (s.max_drawdown <= 0.10) {
    score += 25;
    reasons.push('回撤小(<10%)');
  } else if (s.max_drawdown <= 0.15) {
    score += 15;
    reasons.push('回撤可控(<15%)');
  } else if (s.max_drawdown <= 0.20) {
    score += 5;
    reasons.push('回撤在阈值内');
  } else {
    reasons.push('回撤过大');
  }
  
  // 年化收益评分
  if (s.annual_return >= 0.20) {
    score += 20;
    reasons.push('收益优秀(>20%)');
  } else if (s.annual_return >= 0.10) {
    score += 15;
    reasons.push('收益良好(>10%)');
  } else if (s.annual_return >= 0) {
    score += 5;
    reasons.push('正收益');
  } else {
    reasons.push('负收益');
  }
  
  // 盈亏比
  if (s.profit_factor >= 2.0) {
    score += 10;
    reasons.push('盈亏比优秀');
  } else if (s.profit_factor >= 1.5) {
    score += 5;
    reasons.push('盈亏比良好');
  }
  
  // 决定 verdict
  let verdict = 'discard';
  if (score >= 80 && s.sharpe >= 1.0 && s.max_drawdown <= 0.15) {
    verdict = 'candidate_live';
  } else if (score >= 60 && s.sharpe >= 0.5 && s.max_drawdown <= 0.20) {
    verdict = 'candidate_paper';
  } else if (score >= 40 && s.sharpe >= 0) {
    verdict = 'keep';
  }
  
  return {
    eval_id: `eval_${Date.now()}_${s.symbol}`,
    strategy_version_id: s.strategy_version,
    run_id: s.run_id,
    symbol: s.symbol,
    sharpe: s.sharpe,
    win_rate: s.win_rate,
    max_drawdown: s.max_drawdown,
    annual_return: s.annual_return,
    profit_factor: s.profit_factor,
    score,
    verdict,
    reasons,
    timestamp: new Date().toISOString()
  };
}

// 主函数
async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('[evaluator-agent] 错误: 未找到 backtest-agent 输出文件');
    process.exit(1);
  }
  
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const results = input.results;
  
  console.log(`[evaluator-agent] 正在评估 ${results.length} 个回测结果...`);
  
  const evaluations = [];
  
  for (const result of results) {
    const evalResult = evaluateResult(result);
    evaluations.push(evalResult);
    console.log(`[evaluator-agent] 评估 ${result.symbol}: score=${evalResult.score} verdict=${evalResult.verdict}`);
  }
  
  console.log(`[evaluator-agent] 完成: ${evaluations.length} 个评估结果`);
  
  // 输出到文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    summary: {
      backtests_evaluated: results.length,
      candidates_live: evaluations.filter(e => e.verdict === 'candidate_live').length,
      candidates_paper: evaluations.filter(e => e.verdict === 'candidate_paper').length,
      keep: evaluations.filter(e => e.verdict === 'keep').length,
      discard: evaluations.filter(e => e.verdict === 'discard').length
    },
    evaluations,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log(`[evaluator-agent] 结果已写入 ${OUTPUT_FILE}`);
  
  // 输出 JSON 到 stdout
  console.log('\n---OUTPUT---');
  console.log(JSON.stringify({
    type: 'evaluation_result',
    count: evaluations.length,
    evaluations: evaluations.map(e => ({
      symbol: e.symbol,
      score: e.score,
      verdict: e.verdict,
      sharpe: e.sharpe,
      win_rate: e.win_rate,
      max_drawdown: e.max_drawdown
    })),
    timestamp: new Date().toISOString()
  }, null, 2));
}

main().catch(err => {
  console.error('[evaluator-agent] 错误:', err.message);
  process.exit(1);
});