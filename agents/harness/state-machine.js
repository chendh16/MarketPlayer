/**
 * state-machine - 状态机脚本
 * 验证状态流转，记录到 state_transitions 表
 */

const fs = require('fs');
const path = require('path');

// 信号状态机
const SIGNAL_STATES = [
    'intel_collected',
    'research_generated', 
    'backtest_pending',
    'backtest_passed',
    'backtest_failed',
    'risk_review_pending',
    'approved',
    'rejected',
    'notified',
    'archived'
];

// 策略状态机
const STRATEGY_STATES = [
    'draft',
    'candidate',
    'backtested',
    'evaluated',
    'accepted_for_paper',
    'accepted_for_live',
    'deprecated'
];

// 有效状态机映射
const VALID_TRANSITIONS = {
    signal: {
        'intel_collected': ['research_generated'],
        'research_generated': ['backtest_pending'],
        'backtest_pending': ['backtest_passed', 'backtest_failed'],
        'backtest_passed': ['risk_review_pending'],
        'backtest_failed': ['archived'],
        'risk_review_pending': ['approved', 'rejected'],
        'rejected': ['archived'],
        'approved': ['notified'],
        'notified': ['archived']
    },
    strategy_version: {
        'draft': ['candidate'],
        'candidate': ['backtested'],
        'backtested': ['evaluated'],
        'evaluated': ['accepted_for_paper', 'deprecated'],
        'accepted_for_paper': ['accepted_for_live', 'deprecated'],
        'accepted_for_live': ['deprecated']
    }
};

// 记录状态变化
function recordTransition(objectType, objectId, fromStatus, toStatus, triggeredBy, reason) {
    const id = `st_${Date.now()}_${objectId.slice(-5)}`;
    const timestamp = new Date().toISOString();
    
    const transition = {
        id,
        object_type: objectType,
        object_id: objectId,
        from_status: fromStatus,
        to_status: toStatus,
        triggered_by: triggeredBy,
        reason: reason,
        timestamp
    };
    
    console.log(`[状态机] ${objectType} ${objectId}: ${fromStatus} -> ${toStatus}`);
    
    return transition;
}

// 验证状态流转
function validateTransition(objectType, fromStatus, toStatus) {
    const validFrom = VALID_TRANSITIONS[objectType];
    if (!validFrom) {
        return { valid: false, reason: `未知 object_type: ${objectType}` };
    }
    
    const allowed = validFrom[fromStatus];
    if (!allowed) {
        return { valid: false, reason: `${fromStatus} 无有效流转` };
    }
    
    if (!allowed.includes(toStatus)) {
        return { valid: false, reason: `${fromStatus} 不能流转到 ${toStatus}` };
    }
    
    return { valid: true };
}

// 主函数
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.log('用法: node state-machine.js signal/strategy_version <object_id> <from_status> <to_status> <triggered_by> [reason]');
        console.log('示例: node state-machine.js signal sc_xxx intel_collected research_generated data-agent 收集数据');
        process.exit(1);
    }
    
    const [objectType, objectId, fromStatus, toStatus, triggeredBy, reason] = args;
    
    // 验证
    const validation = validateTransition(objectType, fromStatus, toStatus);
    if (!validation.valid) {
        console.error(`[错误] ${validation.reason}`);
        process.exit(1);
    }
    
    // 记录
    const transition = recordTransition(objectType, objectId, fromStatus, toStatus, triggeredBy, reason || '状态机流转');
    
    // 写入数据库
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(path.join(process.cwd(), 'memory-store.db'));
    
    db.run('''INSERT INTO state_transitions VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
        [transition.id, transition.object_type, transition.object_id, transition.from_status, 
         transition.to_status, transition.triggered_by, transition.reason, transition.timestamp],
        function(err) {
            if (err) {
                console.error('写入失败:', err.message);
                process.exit(1);
            }
            console.log('已写入 state_transitions');
            db.close();
        });
}

main();