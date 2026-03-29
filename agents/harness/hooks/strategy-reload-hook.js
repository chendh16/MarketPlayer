// strategy-reload-hook.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'memory-store.db'));
const now = new Date().toISOString();

const stmt = db.prepare("SELECT version_id, params FROM strategy_versions WHERE status='candidate' ORDER BY created_at DESC LIMIT 1");
const row = stmt.get();

if (row) {
    console.log(`[strategy-reload] 读取策略版本: ${row.version_id}`);
    db.prepare(`
        INSERT INTO audit_log 
        (log_id, event_type, agent_id, input_summary, output_summary, version, operator, timestamp) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`reload_strat_${Date.now()}`, 'deploy', 'ops-agent', `strategy reload ${row.version_id}`, row.params, 'v1', 'strategy-reload-hook', now);
} else {
    console.log('[strategy-reload] 无 candidate 版本');
}

db.close();
console.log('[strategy-reload-hook] 完成');