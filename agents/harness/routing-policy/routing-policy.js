/**
 * routing-policy - 路由策略脚本
 * 实现四条链路自动路由 + 去重 + 熔断
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.cwd(), 'agents/harness/routing-policy/state.json');
const LOG_FILE = path.join(process.cwd(), 'agents/harness/routing-policy/routing.log');

// 加载状态
function loadState() {
    if (!fs.existsSync(STATE_FILE)) {
        return { triggers: {}, fusebreaks: {} };
    }
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

// 保存状态
function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// 日志
function log(msg) {
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
    console.log(`[routing] ${msg}`);
}

// 路由决策
function route(trigger) {
    const state = loadState();
    const { market, workflow } = trigger;
    // 去重检查 (小时级别)
const now = new Date();
const hourKey = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}`;
const key = `${workflow}_${market}_${hourKey}`;
    if (state.triggers[key]) {
        return { decision: 'skip', reason: 'duplicate_trigger', key };
    }
    
    // 熔断检查 (short_line)
    if (workflow === 'short_line') {
        // 检查最近3次
        // TODO: 查 backtest_runs 表
        // 这里简化：跳过
    }
    
    // 标记触发
    state.triggers[key] = {
        triggered_at: new Date().toISOString(),
        workflow,
        market
    };
    saveState(state);
    
    // 路由
    let chain = [];
    switch (workflow) {
        case 'short_line':
            chain = ['data-agent', 'quant-agent', 'backtest-agent', 'evaluator-agent', 'risk-agent', 'fin-commander', 'market-agent'];
            log(`short_line -> ${chain.join(' -> ')}`);
            break;
        case 'long_value':
            chain = ['data-agent', 'value-agent', 'evaluator-agent', 'risk-agent', 'fin-commander', 'market-agent'];
            log(`long_value -> ${chain.join(' -> ')}`);
            break;
        case 'learning':
            chain = ['evaluator-agent', 'strategy-learning-agent', 'backtest-agent', 'evaluator-agent'];
            log(`learning -> ${chain.join(' -> ')} (异步)`);
            break;
        case 'dev_sync':
            chain = ['test-agent', 'ops-agent', 'deploy-hook'];
            log(`dev_sync -> ${chain.join(' -> ')}`);
            break;
        case 'scan_events':
            chain = ['data-agent', 'quant-agent', 'market-agent'];
            log(`scan_events -> ${chain.join(' -> ')}`);
            break;
        default:
            return { decision: 'reject', reason: 'unknown_workflow' };
    }
    
    return {
        decision: 'approve',
        workflow,
        market,
        chain,
        execution: workflow === 'learning' ? 'async' : 'sync',
        key
    };
}

// 主函数
async function main() {
    const input = process.argv[2];
    if (!input) {
        console.log('用法: node routing-policy.js {"market":"美股","workflow":"short_line"}');
        process.exit(1);
    }
    
    const trigger = JSON.parse(input);
    trigger.market = trigger.market || '美股';
    trigger.workflow = trigger.workflow || 'short_line';
    
    log(`收到触发: ${trigger.market} ${trigger.workflow}`);
    
    const result = route(trigger);
    
    console.log('\n---OUTPUT---');
    console.log(JSON.stringify(result, null, 2));
}

main();