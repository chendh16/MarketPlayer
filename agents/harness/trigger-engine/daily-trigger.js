/**
 * trigger-engine - daily-trigger.js
 */

const { execSync } = require('child_process');

const market = process.argv[2];

if (!market) {
    console.error('缺少 market 参数。用法: node daily-trigger.js A股|港股|美股');
    process.exit(1);
}

console.log(`[trigger] ${market} 定时触发启动`);

try {
    const cmd = `node agents/harness/routing-policy/routing-policy.js '{"market":"${market}","workflow":"short_line","priority":"normal"}'`;
    const result = execSync(cmd, { cwd: process.cwd(), encoding: 'utf-8' });
    console.log(result);
} catch (e) {
    console.error('routing-policy 执行失败:', e.message);
}

console.log(`[trigger] ${market} 触发完成`);