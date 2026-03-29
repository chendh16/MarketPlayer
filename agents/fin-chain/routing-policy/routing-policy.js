/**
 * routing-policy - 路由策略脚本
 * 区分四条链路，独立调度互不阻塞
 * 
 * 触发格式:
 * {
 *   "trigger_type": "scheduled|event",
 *   "market": "A股|港股|美股|全局",
 *   "workflow": "short_line|long_value|learning|dev",
 *   "priority": "high|normal|low"
 * }
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(process.cwd(), 'agents/fin-chain/routing-policy');
const STATE_FILE = path.join(OUTPUT_DIR, 'state.json');
const LOG_FILE = path.join(OUTPUT_DIR, 'routing.log');

// 熔断配置
const FUSEBREAK = {
  max_failures: 3,
  cooldown_hours: 24
};

// 读取状态
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

// 记录日志
function log(msg) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  console.log(msg);
}

// 路由决策
function route(trigger) {
  const { workflow, market, trigger_type } = trigger;
  
  // 加载状态
  const state = loadState();
  
  // 生成唯一触发key
  const triggerKey = `${workflow}_${market}_${new Date().toISOString().split('T')[0]}`;
  
  // 重复触发检查
  if (workflow && state.triggers[triggerKey]) {
    log(`[去重] ${triggerKey} 已触发，跳过`);
    return { decision: 'skip', reason: 'duplicate_trigger', triggerKey };
  }
  
  // 熔断检查
  const fuseKey = `${workflow}_${market}`;
  if (state.fusebreaks[fuseKey] && state.fusebreaks[fuseKey].failures >= FUSEBREAK.max_failures) {
    const fb = state.fusebreaks[fuseKey];
    const hoursSince = (Date.now() - fb.last_failure) / (1000 * 60 * 60);
    if (hoursSince < FUSEBREAK.cooldown_hours) {
      log(`[熔断] ${fuseKey} 已熔断，还需 ${(FUSEBREAK.cooldown_hours - hoursSince).toFixed(1)}h`);
      return { decision: 'fusebreak', reason: 'fusebreak_active', fuseKey };
    } else {
      // 熔断过期，重置
      delete state.fusebreaks[fuseKey];
      log(`[熔断] ${fuseKey} 熔断已过期`);
    }
  }
  
  // 标记触发
  state.triggers[triggerKey] = {
    triggered_at: new Date().toISOString(),
    workflow,
    market
  };
  saveState(state);
  
  // 路由决策
  let execution = 'sync';
  let blocking = false;
  
  switch (workflow) {
    case 'short_line':
      execution = 'sync';
      blocking = true;  // 必须 backtest + risk
      log(`[路由] ${market} -> 短线执行链 (同步, blocking)`);
      break;
      
    case 'long_value':
      execution = 'sync';
      blocking = false; // risk 可选
      log(`[路由] ${market} -> 长线价值链 (同步)`);
      break;
      
    case 'learning':
      execution = 'async';  // 异步，不阻塞
      blocking = false;
      log(`[路由] ${market} -> 学习迭代链 (异步)`);
      break;
      
    case 'dev':
      execution = 'sync';
      blocking = true; // 必须 test
      log(`[路由] ${market} -> 开发变更链 (同步)`);
      break;
      
    default:
      log(`[路由] 未知 workflow: ${workflow}`);
      return { decision: 'reject', reason: 'unknown_workflow' };
  }
  
  return {
    decision: 'approve',
    workflow,
    market,
    execution,
    blocking,
    triggerKey
  };
}

// 记录熔断
function recordFailure(workflow, market) {
  const state = loadState();
  const fuseKey = `${workflow}_${market}`;
  
  if (!state.fusebreaks[fuseKey]) {
    state.fusebreaks[fuseKey] = { failures: 0, last_failure: 0 };
  }
  
  state.fusebreaks[fuseKey].failures++;
  state.fusebreaks[fuseKey].last_failure = Date.now();
  
  saveState(state);
  log(`[熔断] ${fuseKey} 失败次数: ${state.fusebreaks[fuseKey].failures}`);
}

// 主函数
async function main() {
  const triggerInput = process.argv[2];
  
  if (!triggerInput) {
    console.log('用法: node routing-policy.js <trigger_json>');
    console.log('示例: node routing-policy.js \'{"workflow":"short_line","market":"美股"}\'');
    process.exit(1);
  }
  
  let trigger;
  try {
    trigger = JSON.parse(triggerInput);
  } catch (e) {
    console.error('JSON 解析错误:', e.message);
    process.exit(1);
  }
  
  // 默认值
  trigger.trigger_type = trigger.trigger_type || 'manual';
  trigger.market = trigger.market || '全局';
  trigger.workflow = trigger.workflow || 'short_line';
  trigger.priority = trigger.priority || 'normal';
  
  console.log('[routing-policy] 收到触发:', JSON.stringify(trigger));
  
  const result = route(trigger);
  
  console.log('\n---OUTPUT---');
  console.log(JSON.stringify(result, null, 2));
  
  // 如果是学习链，异步执行提示
  if (result.execution === 'async') {
    console.log('\n[提示] 学习链异步执行中，不阻塞主链路...');
  }
}

main();