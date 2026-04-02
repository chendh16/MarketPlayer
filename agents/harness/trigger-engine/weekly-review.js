/**
 * trigger-engine - weekly-review.js
 * 每周六 02:00 UTC (10:00 CST) 长线复盘
 */

const { execSync } = require('child_process');

console.log('[weekly-review] 周线复盘启动');

try {
    // 长线复盘工作流
    const cmd = `node agents/harness/routing-policy/routing-policy.js '{"workflow":"weekly_value","priority":"normal"}'`;
    const result = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8' });
    console.log(result);
} catch (e) {
    console.error('weekly-review 执行失败:', e.message);
}

console.log('[weekly-review] 复盘完成');