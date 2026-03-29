/**
 * strategy-learning-agent - Strategy Learning Agent
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/strategy-learning-agent/output.json');

// Analyze history
function analyzeHistory(evaluations) {
  const stats = {
    total: evaluations.length,
    discard: evaluations.filter(e => e.verdict === 'discard').length,
    keep: evaluations.filter(e => e.verdict === 'keep').length,
    candidate_paper: evaluations.filter(e => e.verdict === 'candidate_paper').length,
    candidate_live: evaluations.filter(e => e.verdict === 'candidate_live').length,
    avg_score: 0,
    avg_sharpe: 0,
    avg_win_rate: 0
  };
  
  if (evaluations.length > 0) {
    stats.avg_score = evaluations.map(e => e.score).reduce((a, b) => a + b, 0) / evaluations.length;
    stats.avg_sharpe = evaluations.map(e => e.sharpe).reduce((a, b) => a + b, 0) / evaluations.length;
    stats.avg_win_rate = evaluations.map(e => e.win_rate).reduce((a, b) => a + b, 0) / evaluations.length;
  }
  return stats;
}

// Generate hypothesis
function generateHypothesis(stats, currentParams) {
  const hypotheses = [];
  const actionId = 'la_' + Date.now();
  
  // All discard - need major adjustment
  if (stats.discard === stats.total && stats.total > 0) {
    hypotheses.push({
      action_id: actionId,
      action_type: 'param_update',
      base_version_id: 'v1.0.0',
      hypothesis: 'RSI extreme oversold entry, avoid mid-downtrend',
      new_params: Object.assign({}, currentParams, {
        rsi_oversold: 25,
        ma_short: 5,
        ma_long: 15
      }),
      confidence: 0.6,
      reason: 'All discard - RSI threshold too low'
    });
    
    hypotheses.push({
      action_id: actionId + '_2',
      action_type: 'param_update',
      base_version_id: 'v1.0.0',
      hypothesis: 'Wait for price above MA20 before entry',
      new_params: Object.assign({}, currentParams, {
        entry_ma_cross: true,
        rsi_oversold: 30
      }),
      confidence: 0.5,
      reason: 'Add trend confirmation'
    });
  }
  
  // Keep but not good enough
  if (stats.keep > 0 && stats.candidate_live === 0) {
    hypotheses.push({
      action_id: actionId,
      action_type: 'param_update',
      base_version_id: 'v1.0.0',
      hypothesis: 'Relax RSI threshold for more signals',
      new_params: Object.assign({}, currentParams, {
        rsi_oversold: 35,
        rsi_overbought: 70
      }),
      confidence: 0.7,
      reason: 'Too conservative, relax RSI'
    });
  }
  
  // Not enough data
  if (stats.total < 3) {
    hypotheses.push({
      action_id: actionId,
      action_type: 'new_hypothesis',
      base_version_id: 'v1.0.0',
      hypothesis: 'Need more backtest data',
      new_params: currentParams,
      confidence: 0.3,
      reason: 'Insufficient data'
    });
  }
  
  // Default
  if (hypotheses.length === 0) {
    hypotheses.push({
      action_id: actionId,
      action_type: 'new_hypothesis',
      base_version_id: 'v1.0.0',
      hypothesis: 'Keep current params, continue observing',
      new_params: currentParams,
      confidence: 0.5,
      reason: 'No sufficient hypothesis'
    });
  }
  
  return hypotheses;
}

// Main
async function main() {
  const db = require('sqlite3').verbose();
  const database = new db.Database(path.join(process.cwd(), 'memory-store.db'));
  
  const evaluations = [];
  database.each("SELECT * FROM evaluation_results", (err, row) => {
    if (err) { console.error('Error:', err.message); return; }
    evaluations.push({
      eval_id: row.eval_id,
      strategy_version_id: row.strategy_version_id,
      symbol: row.symbol,
      sharpe: row.sharpe,
      win_rate: row.win_rate,
      score: row.score,
      verdict: row.verdict
    });
  }, () => {
    console.log('[strategy-learning] Read ' + evaluations.length + ' evaluations');
    
    const stats = analyzeHistory(evaluations);
    console.log('[strategy-learning] Stats: discard=' + stats.discard + ', avg_score=' + stats.avg_score.toFixed(1));
    
    const currentParams = {
      ma_short: 5,
      ma_long: 20,
      rsi_period: 14,
      rsi_oversold: 30,
      rsi_overbought: 70,
      atr_period: 14,
      atr_multiplier: 2.0
    };
    
    const hypotheses = generateHypothesis(stats, currentParams);
    console.log('[strategy-learning] Generated ' + hypotheses.length + ' hypotheses');
    
    const result = {
      action_type: 'learning_action',
      stats,
      hypotheses,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log('[strategy-learning] Written to ' + OUTPUT_FILE);
    
    // Write to DB
    for (const h of hypotheses) {
      var sql = "INSERT INTO learning_actions (action_id, base_version_id, action_type, new_params, hypothesis, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)";
      database.run(sql, [h.action_id, h.base_version_id, h.action_type, JSON.stringify(h.new_params), h.hypothesis, h.confidence, result.timestamp], function(err) {
        if (err) console.error('DB Error:', err.message);
      });
    }
    
    database.close(function() {
      console.log('[strategy-learning] Done');
      console.log('\n---OUTPUT---');
      console.log(JSON.stringify(result, null, 2));
    });
  });
}

main().catch(function(err) {
  console.error('[strategy-learning] Error:', err.message);
  process.exit(1);
});