// agents/harness/utils/db.js
// 统一的 audit_log 写入函数

function writeAuditLog(conn, params) {
    const { log_id, event_type, agent_id, input_summary, output_summary, version, operator } = params;
    const timestamp = new Date().toISOString();
    
    conn.execute(`
        INSERT INTO audit_log 
        (log_id, event_type, agent_id, input_summary, output_summary, version, operator, timestamp) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [log_id, event_type, agent_id, input_summary, output_summary, version, operator, timestamp]);
}

module.exports = { writeAuditLog };