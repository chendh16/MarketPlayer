// schema-change-hook.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'memory-store.db'));
const now = new Date().toISOString();

const tables = ['signal_candidates', 'backtest_runs', 'strategy_versions'];
let schemaStatus = {};

for (const table of tables) {
    try {
        const cnt = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get();
        schemaStatus[table] = { exists: true, count: cnt.cnt };
    } catch (e) {
        schemaStatus[table] = { exists: false, error: e.message };
    }
}

console.log('[schema-change-hook] schema 检查:', JSON.stringify(schemaStatus));

db.prepare(`
    INSERT INTO audit_log 
    (log_id, event_type, agent_id, input_summary, output_summary, version, operator, timestamp) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(`schema_${Date.now()}`, 'deploy', 'ops-agent', 'schema version check', JSON.stringify(schemaStatus), 'v1', 'schema-change-hook', now);

db.close();
console.log('[schema-change-hook] 完成');