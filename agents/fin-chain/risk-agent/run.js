/**
 * risk-agent - 风控审核 Agent (Blocking Gate)
 * 职责：
 * 1. 读取 evaluator-agent 的评分结果
 * 2. 按规则判断是否放行
 * 3. 输出 risk_result
 * 4. 触发 Level 3 告警 if fail
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/evaluator-agent/output.json');
const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/risk-agent/output.json');

// 风控规则
const RULES = {
  min_sharpe: 0.5,
  max_drawdown: 0.20,
  min_win_rate: 0.40
};

// 风险评估
function evaluateRisk(evalResult) {
  const e = evalResult;
  
  let result = 'pass';
  let riskLevel = 'low';
  let reason = '';
  let overrideRequired = false;
  
  // 检查 Sharpe
  if (e.sharpe < RULES.min_sharpe) {
    result = 'fail';
    riskLevel = 'high';
    reason = `Sharpe=${e.sharpe.toFixed(2)} 低于阈值 ${RULES.min_sharpe}`;
    overrideRequired = true;
  }
  
  // 检查回撤
  else if (e.max_drawdown > RULES.max_drawdown) {
    result = 'fail';
    riskLevel = 'high';
    reason = `回撤=${(e.max_drawdown*100).toFixed(1)}% 超过阈值 ${(RULES.max_drawdown*100)}%`;
    overrideRequired = true;
  }
  
  // 检查胜率
  else if (e.win_rate < RULES.min_win_rate) {
    result = 'fail';
    riskLevel = 'mid';
    reason = `胜率=${(e.win_rate*100).toFixed(1)}% 低于阈值 ${(RULES.min_win_rate*100)}%`;
    overrideRequired = true;
  }
  
  // 检查 verdict
  else if (e.verdict === 'discard') {
    result = 'fail';
    riskLevel = 'mid';
    reason = `评估 verdict=discard，分数=${e.score}`;
    overrideRequired = true;
  }
  
  // 通过
  if (result === 'pass') {
    if (e.sharpe >= 1.5 && e.max_drawdown <= 0.10) {
      riskLevel = 'low';
      reason = '各项指标优秀';
    } else if (e.sharpe >= 1.0 || e.max_drawdown <= 0.15) {
      riskLevel = 'low';
      reason = '指标良好';
    } else {
      riskLevel = 'mid';
      reason = '指标一般但通过审核';
    }
  }
  
  // 计算建议仓位
  let positionHint = null;
  if (result === 'pass') {
    if (riskLevel === 'low') {
      positionHint = 0.3;
    } else if (riskLevel === 'mid') {
      positionHint = 0.15;
    }
  }
  
  // 生成止损规则
  let stopLossRule = null;
  if (result === 'pass') {
    stopLossRule = {
      stop_loss_pct: 0.05,
      profit_target_pct: 0.12,
      trailing_stop: true
    };
  }
  
  return {
    type: 'risk_result',
    result,
    reason,
    risk_level: riskLevel,
    position_hint: positionHint,
    stop_loss_rule: stopLossRule,
    override_required: overrideRequired,
    timestamp: new Date().toISOString()
  };
}

// 主函数
async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('[risk-agent] 错误: 未找到 evaluator-agent 输出文件');
    process.exit(1);
  }
  
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const evaluations = input.evaluations;
  
  console.log(`[risk-agent] 正在审核 ${evaluations.length} 个候选信号...`);
  
  const riskResults = [];
  let passCount = 0;
  let failCount = 0;
  
  for (const evalResult of evaluations) {
    const risk = evaluateRisk(evalResult);
    riskResults.push({
      ...risk,
      symbol: evalResult.symbol,
      eval_id: evalResult.eval_id,
      run_id: evalResult.run_id
    });
    
    if (risk.result === 'pass') {
      passCount++;
      console.log(`[risk-agent] ${evalResult.symbol}: PASS (${risk.risk_level}) - ${risk.reason}`);
    } else {
      failCount++;
      console.log(`[risk-agent] ${evalResult.symbol}: FAIL (${risk.risk_level}) - ${risk.reason}`);
    }
  }
  
  console.log(`[risk-agent] 完成: ${passCount} 通过, ${failCount} 拒绝`);
  
  // 输出到文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    summary: {
      total: evaluations.length,
      passed: passCount,
      failed: failCount
    },
    results: riskResults,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log(`[risk-agent] 结果已写入 ${OUTPUT_FILE}`);
  
  // 触发 Level 3 告警 if fail
  if (failCount > 0) {
    console.log('\n⚠️ [risk-agent] 检测到失败信号，触发 Level 3 告警...');
    // TODO: 飞书/微信告警
  }
  
  // 输出 JSON 到 stdout
  console.log('\n---OUTPUT---');
  console.log(JSON.stringify({
    type: 'risk_result',
    passed: passCount,
    failed: failCount,
    results: riskResults.map(r => ({
      symbol: r.symbol,
      result: r.result,
      risk_level: r.risk_level,
      reason: r.reason
    })),
    timestamp: new Date().toISOString()
  }, null, 2));
}

main().catch(err => {
  console.error('[risk-agent] 错误:', err.message);
  process.exit(1);
});