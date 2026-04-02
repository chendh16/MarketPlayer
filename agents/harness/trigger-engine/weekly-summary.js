/**
 * weekly-summary.js - 每周学习总结
 * 每周日 20:00 执行，汇总本周学习成果
 * 
 * crontab: 0 20 * * 0 node weekly-summary.js
 */

const fs = require('fs');
const path = require('path');
const db = require('sqlite3').verbose();

const DATABASE = path.join(process.cwd(), 'memory-store/marketplayer.db');

// 发送飞书通知
async function sendFeishuMessage(message) {
  try {
    // 路径: agents/harness/trigger-engine -> ../../dist/services/feishu/bot
    const { sendMessageToUser } = require('../../../dist/services/feishu/bot');
    const FEISHU_USER_OPEN_ID = 'ou_3d8c36452b5a0ca480873393ad876e12';
    await sendMessageToUser(FEISHU_USER_OPEN_ID, { text: message });
    console.log('[weekly-summary] 飞书通知已发送');
  } catch (e) {
    console.log('[weekly-summary] 飞书通知失败:', e.message);
  }
}

async function main() {
  console.log('[weekly-summary] 生成周报...');
  
  const database = new db.Database(DATABASE);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dateStr = new Date().toISOString().split('T')[0];
  
  // 1. 本周学习动作
  const learningActions = [];
  await new Promise((resolve) => {
    database.all("SELECT * FROM learning_actions WHERE created_at > ? ORDER BY created_at DESC", [weekAgo], (err, rows) => {
      if (!err) learningActions.push(...rows);
      resolve();
    });
  });
  
  // 2. 本周回测结果
  const backtestRuns = [];
  await new Promise((resolve) => {
    database.all("SELECT * FROM backtest_runs WHERE created_at > ? ORDER BY created_at DESC", [weekAgo], (err, rows) => {
      if (!err) backtestRuns.push(...rows);
      resolve();
    });
  });
  
  // 3. 本周策略版本
  const strategyVersions = [];
  await new Promise((resolve) => {
    database.all("SELECT * FROM strategy_versions WHERE created_at > ? ORDER BY created_at DESC", [weekAgo], (err, rows) => {
      if (!err) strategyVersions.push(...rows);
      resolve();
    });
  });
  
  // 4. 当前最优版本
  let bestVersion = { version_id: 'v1.0.1-filtered', win_rate: 0.556, sharpe: 2.57 };
  await new Promise((resolve) => {
    database.get("SELECT * FROM backtest_runs WHERE strategy_version_id = 'strategy_level' ORDER BY win_rate DESC, sharpe DESC LIMIT 1", [], (err, row) => {
      if (!err && row) bestVersion = row;
      resolve();
    });
  });
  
  database.close();
  
  // 整理 hypothesis 列表
  const hypothesesList = learningActions.map(h => {
    const params = JSON.parse(h.new_params || '{}');
    return ` - ${h.hypothesis} (置信度: ${h.confidence})`;
  }).join('\n') || ' 无';
  
  // 有效/无效方向（简化判断）
  const passedHypotheses = learningActions.filter(h => h.confidence >= 0.6).map(h => h.hypothesis).join('\n') || '无';
  const failedHypotheses = learningActions.filter(h => h.confidence < 0.4).map(h => h.hypothesis).join('\n') || '无';
  
  // 是否有版本升级
  const versionUpgrade = strategyVersions.length > 0 
    ? `✅ 有升级：${strategyVersions.map(v => v.version_id).join(', ')}`
    : '❌ 无升级';
  
  // 下周方向（基于最新的 hypothesis）
  const nextDirection = learningActions.length > 0 
    ? learningActions[0].hypothesis 
    : '保持当前参数';
  
  // 组装消息
  const message = `📋 本周策略学习总结 ${dateStr}

本周尝试：
 hypothesis 数量：${learningActions.length} 个
${hypothesesList}

有效方向：
${passedHypotheses}

无效方向：
${failedHypotheses}

策略演进：
 ${versionUpgrade}
 当前最优版本：${bestVersion.strategy_version_id || 'v1.0.1'}
 当前最优胜率：${bestVersion.win_rate ? (bestVersion.win_rate * 100).toFixed(1) : 'N/A'}%
 当前最优Sharpe：${bestVersion.sharpe ? bestVersion.sharpe.toFixed(2) : 'N/A'}

下周方向：
 ${nextDirection}

---
数据来源：本周 ${backtestRuns.length} 次回测`;
  
  console.log(message);
  
  await sendFeishuMessage(message);
  
  // 执行日志
  const LOG_DIR = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
  fs.appendFileSync(
    path.join(LOG_DIR, 'cron.log'),
    `${new Date().toISOString()} weekly-summary executed\n`
  );
}

main().catch(err => {
  console.error('[weekly-summary] 错误:', err.message);
  process.exit(1);
});