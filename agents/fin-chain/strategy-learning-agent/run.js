/**
 * strategy-learning-agent - Strategy Learning Agent
 * 支持累积学习，基于历史版本和评估结果做决策
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/strategy-learning-agent/output.json');

// 分析历史评估数据
function analyzeHistory(evaluations) {
  const stats = {
    total: evaluations.length,
    discard: evaluations.filter(e => e.verdict === 'discard').length,
    keep: evaluations.filter(e => e.verdict === 'keep').length,
    candidate_paper: evaluations.filter(e => e.verdict === 'candidate_paper').length,
    candidate_live: evaluations.filter(e => e.verdict === 'candidate_live').length,
    avg_score: 0,
    avg_sharpe: 0,
    avg_win_rate: 0,
    trend: 'stable' // improving / degrading / stable
  };
  
  if (evaluations.length > 0) {
    stats.avg_score = evaluations.map(e => e.score).reduce((a, b) => a + b, 0) / evaluations.length;
    stats.avg_sharpe = evaluations.map(e => e.sharpe).reduce((a, b) => a + b, 0) / evaluations.length;
    stats.avg_win_rate = evaluations.map(e => e.win_rate).reduce((a, b) => a + b, 0) / evaluations.length;
    
    // 计算趋势：比较前后两半的平均分
    if (evaluations.length >= 4) {
      const mid = Math.floor(evaluations.length / 2);
      const firstHalf = evaluations.slice(0, mid).reduce((a, e) => a + e.score, 0) / mid;
      const secondHalf = evaluations.slice(mid).reduce((a, e) => a + e.score, 0) / (evaluations.length - mid);
      if (secondHalf > firstHalf + 5) stats.trend = 'improving';
      else if (secondHalf < firstHalf - 5) stats.trend = 'degrading';
    }
  }
  return stats;
}

// 分析历史学习动作
function analyzePastLearning(learningActions) {
  const history = {
    total_attempts: learningActions.length,
    param_updates: learningActions.filter(a => a.action_type === 'param_update').length,
    explored_directions: {},
    failed_directions: []
  };
  
  for (const action of learningActions) {
    const params = JSON.parse(action.new_params || '{}');
    const key = `${params.rsi_oversold}_${params.ma_short}_${params.ma_long}`;
    if (!history.explored_directions[key]) {
      history.explored_directions[key] = { count: 0, params };
    }
    history.explored_directions[key].count++;
  }
  
  return history;
}

// 分析历史策略版本
function analyzePastVersions(strategyVersions) {
  const versions = {};
  for (const v of strategyVersions) {
    versions[v.version_id] = {
      params: JSON.parse(v.params || '{}'),
      status: v.status,
      created_at: v.created_at
    };
  }
  return versions;
}

// 生成基于历史的 hypothesis
function generateHypothesis(stats, currentParams, history, versions) {
  const hypotheses = [];
  const actionId = 'la_' + Date.now();
  
  // 已尝试过的参数方向
  const triedParams = Object.values(history.explored_directions || {}).map(d => d.params);
  
  // 趋势判断
  let reasoning = '';
  if (stats.trend === 'degrading') {
    reasoning = '趋势恶化，需要大幅调整策略参数';
  } else if (stats.trend === 'improving') {
    reasoning = '趋势改善中，继续沿当前方向微调';
  } else {
    reasoning = '趋势稳定，当前参数已失效，需要新方向';
  }
  
  // All discard - 需要大幅调整
  if (stats.discard === stats.total && stats.total > 0) {
    // 尝试过的方向不再重复
    const newDirections = [
      { rsi_oversold: 25, ma_short: 5, ma_long: 15, name: 'RSI极值+短周期MA' },
      { rsi_oversold: 35, ma_short: 10, ma_long: 30, name: '放宽RSI+标准MA' },
      { rsi_oversold: 40, ma_short: 20, ma_long: 50, name: 'RSI中性+长周期MA' }
    ];
    
    for (const dir of newDirections) {
      // 检查是否已尝试过类似方向
      const alreadyTried = triedParams.some(p => 
        p.rsi_oversold === dir.rsi_oversold && p.ma_long === dir.ma_long
      );
      
      if (!alreadyTried) {
        hypotheses.push({
          action_id: actionId + '_' + dir.name.replace(/\s/g, '_'),
          action_type: 'param_update',
          based_on_versions: Object.keys(versions).slice(-3), // 最近3个版本
          based_on_evaluations: stats.total,
          hypothesis: dir.name,
          new_params: Object.assign({}, currentParams, dir),
          confidence: 0.6,
          reasoning: `${reasoning} - 尝试新方向 ${dir.name}`,
          previous_attempts: Object.keys(history.explored_directions || {}).slice(0, 5)
        });
      }
    }
  }
  
  // 趋势改善中 - 继续微调
  if (stats.trend === 'improving' && stats.keep > 0) {
    const bestParams = Object.assign({}, currentParams, {
      rsi_oversold: Math.max(currentParams.rsi_oversold - 2, 20),
      ma_short: currentParams.ma_short,
      ma_long: currentParams.ma_long
    });
    
    hypotheses.push({
      action_id: actionId + '_fine_tune',
      action_type: 'param_update',
      based_on_versions: Object.keys(versions).slice(-3),
      based_on_evaluations: stats.total,
      hypothesis: '趋势改善中，继续微调参数',
      new_params: bestParams,
      confidence: 0.8,
      reasoning: '当前趋势向好，轻微调整以优化',
      previous_attempts: []
    });
  }
  
  // 数据不足
  if (stats.total < 3) {
    hypotheses.push({
      action_id: actionId + '_need_data',
      action_type: 'new_hypothesis',
      based_on_versions: [],
      based_on_evaluations: stats.total,
      hypothesis: '需要更多评估数据',
      new_params: currentParams,
      confidence: 0.3,
      reasoning: '数据不足，无法做出有效学习',
      previous_attempts: []
    });
  }
  
  // 默认
  if (hypotheses.length === 0) {
    hypotheses.push({
      action_id: actionId + '_default',
      action_type: 'new_hypothesis',
      based_on_versions: Object.keys(versions).slice(-3),
      based_on_evaluations: stats.total,
      hypothesis: '保持当前参数，继续观察',
      new_params: currentParams,
      confidence: 0.5,
      reasoning: '无明显优化方向，维持现状',
      previous_attempts: Object.keys(history.explored_directions || {}).slice(0, 3)
    });
  }
  
  return hypotheses;
}

// 更新 MEMORY.md
function updateMemory(result) {
  const MEMORY_FILE = path.join(process.cwd(), 'MEMORY.md');
  let content = '';
  
  if (fs.existsSync(MEMORY_FILE)) {
    content = fs.readFileSync(MEMORY_FILE, 'utf-8');
  }
  
  const learningSummary = `
## 学习闭环更新 (${new Date().toISOString().split('T')[0]})

### 评估统计
- 评估次数: ${result.stats.total}
- 平均分数: ${result.stats.avg_score.toFixed(1)}
- 平均Sharpe: ${result.stats.avg_sharpe.toFixed(2)}
- 趋势: ${result.stats.trend}

### 新 hypothesis
${result.hypotheses.map(h => `- ${h.hypothesis} (confidence: ${h.confidence})`).join('\n')}

### 探索方向
${Object.keys(result.history.explored_directions || {}).join(', ') || '无'}
`;
  
  // 找到最后一个 ## 标题位置插入
  const lastHeading = content.lastIndexOf('## ');
  if (lastHeading > -1) {
    content = content.slice(0, lastHeading) + learningSummary + '\n\n' + content.slice(lastHeading);
  } else {
    content = learningSummary + '\n\n' + content;
  }
  
  fs.writeFileSync(MEMORY_FILE, content);
  console.log('[strategy-learning] MEMORY.md 已更新');
}

// Main
async function main() {
  const db = require('sqlite3').verbose();
  const database = new db.Database(path.join(process.cwd(), 'memory-store/marketplayer.db'));
  
  // 1. 读取历史评估
  const evaluations = [];
  database.each("SELECT * FROM evaluation_results ORDER BY timestamp ASC", (err, row) => {
    if (err) { console.error('Error:', err.message); return; }
    evaluations.push({
      eval_id: row.eval_id,
      strategy_version_id: row.strategy_version_id,
      symbol: row.symbol,
      sharpe: row.sharpe,
      win_rate: row.win_rate,
      score: row.score,
      verdict: row.verdict,
      timestamp: row.timestamp
    });
  }, () => {
    console.log('[strategy-learning] 读取 ' + evaluations.length + ' 条评估记录');
    
    // 2. 读取历史学习动作
    const learningActions = [];
    database.each("SELECT * FROM learning_actions ORDER BY created_at DESC LIMIT 20", (err, row) => {
      if (err) { console.error('Error:', err.message); return; }
      learningActions.push({
        action_id: row.action_id,
        action_type: row.action_type,
        new_params: row.new_params,
        hypothesis: row.hypothesis,
        created_at: row.created_at
      });
    }, () => {
      console.log('[strategy-learning] 读取 ' + learningActions.length + ' 条历史学习动作');
      
      // 3. 读取历史策略版本
      const strategyVersions = [];
      database.each("SELECT * FROM strategy_versions ORDER BY created_at DESC LIMIT 10", (err, row) => {
        if (err) { console.error('Error:', err.message); return; }
        strategyVersions.push({
          version_id: row.version_id,
          params: row.params,
          status: row.status,
          created_at: row.created_at
        });
      }, () => {
        console.log('[strategy-learning] 读取 ' + strategyVersions.length + ' 个历史策略版本');
        
        // 分析
        const stats = analyzeHistory(evaluations);
        const history = analyzePastLearning(learningActions);
        const versions = analyzePastVersions(strategyVersions);
        
        console.log('[strategy-learning] 统计: discard=' + stats.discard + 
          ', avg_score=' + stats.avg_score.toFixed(1) + 
          ', trend=' + stats.trend);
        
        // 当前参数（从最新版本或默认）
        const currentParams = strategyVersions.length > 0 
          ? JSON.parse(strategyVersions[0].params || '{}')
          : {
              ma_short: 5,
              ma_long: 20,
              rsi_period: 14,
              rsi_oversold: 30,
              rsi_overbought: 70,
              atr_period: 14,
              atr_multiplier: 2.0
            };
        
        // 生成 hypothesis
        const hypotheses = generateHypothesis(stats, currentParams, history, versions);
        console.log('[strategy-learning] 生成 ' + hypotheses.length + ' 个 hypothesis');
        
        // 构建结果
        const result = {
          action_type: 'learning_action',
          stats,
          history,
          versions: Object.keys(versions),
          hypotheses,
          timestamp: new Date().toISOString()
        };
        
        // 写入 output.json
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
        console.log('[strategy-learning] 写入 ' + OUTPUT_FILE);
        
        // 写入数据库
        for (const h of hypotheses) {
          const sql = `INSERT INTO learning_actions 
            (action_id, base_version_id, action_type, new_params, hypothesis, confidence, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`;
          database.run(sql, [
            h.action_id,
            (h.based_on_versions || []).join(','),
            h.action_type,
            JSON.stringify(h.new_params),
            h.hypothesis + ' | ' + (h.reasoning || ''),
            h.confidence,
            result.timestamp
          ], function(err) {
            if (err) console.error('DB写入失败:', err.message);
          });
        }
        
        // 更新 MEMORY.md
        updateMemory(result);
        
        database.close(function() {
          console.log('[strategy-learning] 完成');
          console.log('\n---OUTPUT---');
          console.log(JSON.stringify(result, null, 2));
          
          // 发送飞书通知
          sendLearningNotification(result, stats);
        });
      });
    });
  });
}

// 发送学习更新通知
function sendLearningNotification(result, stats) {
  try {
    const { sendMessageToUser } = require('../../dist/services/feishu/bot');
    const FEISHU_USER_OPEN_ID = 'ou_3d8c36452b5a0ca480873393ad876e12';
    const dateStr = new Date().toISOString().split('T')[0];
    
    // 历史版本信息
    const versionHistory = result.versions?.length > 0 
      ? result.versions.join(', ') 
      : '无历史版本';
    
    // 参数变化
    const currentParams = result.hypotheses[0]?.new_params || {};
    const oldParams = { ma_short: 5, ma_long: 20, rsi_oversold: 30 };
    
    const hypothesisList = result.hypotheses.map(h => {
      const params = h.new_params || {};
      return `方向：${h.hypothesis}
 参数变化：
  ma_short: ${oldParams.ma_short} → ${params.ma_short || oldParams.ma_short}
  ma_long: ${oldParams.ma_long} → ${params.ma_long || oldParams.ma_long}
  rsi_oversold: ${oldParams.rsi_oversold} → ${params.rsi_oversold || oldParams.rsi_oversold}
  置信度：${h.confidence}
  推理：${h.reasoning || '无'}`;
    }).join('\n\n');
    
    const message = `📝 策略学习更新 ${dateStr}

基于 ${stats.total} 次回测，生成 ${result.hypotheses.length} 个新方向：

${hypothesisList}

历史参照：
 当前版本 v1.0.1 胜率 55.6%
 历史版本：${versionHistory}
 这个方向上次尝试过吗：${(result.history?.explored_directions || {}).keys ? '是' : '否'}`;

    sendMessageToUser(FEISHU_USER_OPEN_ID, { text: message });
    console.log('[strategy-learning] 飞书通知已发送');
  } catch (e) {
    console.log('[strategy-learning] 飞书通知失败:', e.message);
  }
}

main().catch(function(err) {
  console.error('[strategy-learning] 错误:', err.message);
  process.exit(1);
});