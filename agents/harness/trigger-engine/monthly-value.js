/**
 * trigger-engine - monthly-value.js
 * 每月1日 01:00 UTC (09:00 CST) 估值更新
 */

const { execSync } = require('child_process');

console.log('[monthly-value] 月度估值启动');

try {
    // 月度估值工作流
    const cmd = `node agents/harness/routing-policy/routing-policy.js '{"workflow":"monthly_valuation","priority":"low"}'`;
    const result = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8' });
    console.log(result);
} catch (e) {
    console.error('monthly-value 执行失败:', e.message);
}

console.log('[monthly-value] 估值完成');