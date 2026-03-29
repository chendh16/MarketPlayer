// deploy-hook.js - 使用 better-sqlite3
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'memory-store.db'));

const targets = ['quant-agent', 'backtest-agent', 'risk-agent', 'fin-commander'];
const now = new Date().toISOString();

for (const target of targets) {
    console.log(`[deploy-hook] 通知 ${target} 重载`);
    db.prepare(`
        INSERT INTO audit_log 
        (log_id, event_type, agent_id, input_summary, output_summary, version, operator, timestamp) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`deploy_${target}_${Date.now()}`, 'deploy', 'ops-agent', `${target} reload`, '{}', 'v1', 'deploy-hook', now);
}

db.close();
console.log('[deploy-hook] 完成');