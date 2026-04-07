/**
 * trigger-engine - daily-trigger.js
 * 多市场定时触发器，支持开盘前/收盘后通知
 * 读取 config/system.config.js 获取参数
 */

// 加载配置
const systemConfig = require('../../../config/system.config');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// 解析命令行参数
let market = 'cn';
let triggerType = 'open';
const args = process.argv.slice(2);
for (const arg of args) {
    if (arg.startsWith('--market=')) market = arg.split('=')[1];
    if (arg.startsWith('--type=')) triggerType = arg.split('=')[1];
}

// 市场配置
const MARKET_CONFIG = {
    'cn': { name: 'A股', market: '美股', stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA'] }, // 简化：用美股数据演示
    'cn_a': { name: 'A股', market: 'A股', stocks: ['600519', '000858', '300750'] },
    'cn_hk': { name: '港股', market: '港股', stocks: ['00700', '09988', '03690'] },
    'us': { name: '美股', market: '美股', stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA'] }
};

const config = MARKET_CONFIG[market] || MARKET_CONFIG['cn'];
const dateStr = new Date().toISOString().split('T')[0];

console.log(`[trigger] ${config.name} ${triggerType === 'open' ? '开盘前' : '收盘后'} 触发启动`);

// 执行 Agent 的辅助函数
function runAgent(agentPath, description) {
    try {
        const result = execSync(`node ${agentPath}`, { 
            cwd: process.cwd(), 
            encoding: 'utf-8',
            timeout: 300000 
        });
        console.log(result);
        return true;
    } catch (e) {
        console.error(`[trigger] ${description} 失败:`, e.message);
        return false;
    }
}

// 读取大盘状态
function getMarketStatus(marketKey) {
    if (marketKey !== '美股') return { status: 'normal', signal: true };
    
    const spyPath = path.join(process.cwd(), 'data/cache/klines/us_SPY.json');
    if (!fs.existsSync(spyPath)) return { status: 'unknown', signal: true };
    
    const spyData = JSON.parse(fs.readFileSync(spyPath, 'utf-8'));
    const klines = spyData.klines || [];
    
    if (klines.length < 50) return { status: 'unknown', signal: true };
    
    const ma50Slice = klines.slice(-50);
    const spyMa50 = ma50Slice.map(k => parseFloat(k.close)).reduce((a, b) => a + b) / 50;
    const spyPrice = parseFloat(klines[klines.length - 1].close);
    const price20dAgo = parseFloat(klines[Math.max(0, klines.length - 21)].close);
    const spy20dReturn = (spyPrice - price20dAgo) / price20dAgo;
    
    const aboveMA = spyPrice > spyMa50;
    const inPanic = spy20dReturn < -0.08;
    
    let market_status = 'risk_on';
    if (!aboveMA && inPanic) market_status = 'risk_off';
    else if (!aboveMA) market_status = 'caution';
    
    return {
        status: market_status,
        spy_price: spyPrice.toFixed(2),
        spy_ma50: spyMa50.toFixed(2),
        spy_20d_return: (spy20dReturn * 100).toFixed(1) + '%',
        signal: market_status === 'risk_on'
    };
}

// 发送飞书通知
async function sendFeishuNotification(template, data) {
    try {
        // 路径: agents/harness/trigger-engine -> dist/services/feishu/bot
        const { sendMessageToUser } = require('../../../dist/services/feishu/bot');
        const FEISHU_USER_OPEN_ID = 'ou_3d8c36452b5a0ca480873393ad876e12';
        
        let message = '';
        if (template === 'open') {
            message = `📊 ${data.market} 开盘前分析 ${data.date}

🌍 大盘状态：${data.market_status}
 ${data.spy_price ? `SPY: ${data.spy_price} | MA50: ${data.spy_ma50}` : 'N/A'}
 20日涨跌：${data.spy_20d_return || 'N/A'}%
 → 今日模式：${data.status_text}

📋 今日信号：
${data.signals.length > 0 ? data.signals.map(s => 
` ${s.symbol} ${s.direction} | RSI=${s.rsi} | 置信度=${s.confidence} | ${s.verdict}`
).join('\n') + '\n ⚠️ 需要确认是否下单' : ` ⚠️ 当前${data.status_text}模式，今日暂无信号`}`;
        } else if (template === 'close') {
            message = `📈 ${data.market} 收盘日报 ${data.date}

💼 模拟盘持仓：
${data.positions.length > 0 ? data.positions.map(p => 
` ${p.symbol} ${p.qty}股 | 成本${p.cost} | 现价${p.price} | ${p.pnl}`
).join('\n') : ' 无持仓'}

⚙️ 今日系统运行：
 回测执行：${data.backtest_count}次
 信号评估：${data.eval_count}个
 学习更新：${data.learning_count}条

📊 策略状态：
 版本：${data.strategy_version}
 胜率：${data.win_rate}% | Sharpe：${data.sharpe}`;
        } else if (template === 'signal') {
            message = `🔔 发现交易信号
 ${data.symbol} ${data.direction}
 置信度=${data.confidence} | 建议入场价=${data.price}
 → 请确认是否下单（回复"确认"或"跳过"）`;
        } else if (template === 'risk') {
            message = `🚨 风险预警
 ${data.symbol} 当前亏损${data.pnl_pct}%，已触及止损线
 → 建议：立即平仓`;
        } else if (template === 'learning') {
            message = `📝 策略学习更新
 新 hypothesis：${data.hypothesis}
 参数建议：${data.new_params}
 置信度：${data.confidence}`;
        }
        
        await sendMessageToUser(FEISHU_USER_OPEN_ID, { text: message });
        console.log('[trigger] 飞书通知已发送');
    } catch (e) {
        console.log('[trigger] 飞书通知失败:', e.message);
    }
}

// 主逻辑
async function main() {
    const marketStatus = getMarketStatus(config.market);
    const statusText = { 
        'risk_on': '正常交易', 
        'caution': '谨慎操作', 
        'risk_off': '暂停交易' 
    }[marketStatus.status] || '未知';
    
    if (triggerType === 'open') {
        // 开盘前：运行 quant-agent 获取信号
        console.log(`[trigger] 运行开盘前扫描，market_status=${marketStatus.status}`);
        
        if (!marketStatus.signal) {
            console.log('[trigger] 市场状态不允许信号，跳过');
            await sendFeishuNotification('open', {
                market: config.name,
                date: dateStr,
                market_status: marketStatus.status,
                status_text: statusText,
                spy_price: marketStatus.spy_price,
                spy_ma50: marketStatus.spy_ma50,
                spy_20d_return: marketStatus.spy_20d_return,
                signals: []
            });
            return;
        }
        
        // 运行 quant-agent
        runAgent('agents/fin-chain/quant-agent/run.js', 'quant-agent');
        
        // 读取信号
        const quantOutput = path.join(process.cwd(), 'agents/fin-chain/quant-agent/output.json');
        if (fs.existsSync(quantOutput)) {
            const quantData = JSON.parse(fs.readFileSync(quantOutput, 'utf-8'));
            const signals = quantData.signals || [];
            
            console.log(`[trigger] 生成 ${signals.length} 个信号`);
            
            // 发送飞书通知
            await sendFeishuNotification('open', {
                market: config.name,
                date: dateStr,
                market_status: marketStatus.status,
                status_text: statusText,
                spy_price: marketStatus.spy_price,
                spy_ma50: marketStatus.spy_ma50,
                spy_20d_return: marketStatus.spy_20d_return,
                signals: signals.map(s => ({
                    symbol: s.symbol,
                    direction: s.direction,
                    rsi: s.entry_rule?.rsi || 'N/A',
                    confidence: s.confidence?.toFixed(2) || 'N/A',
                    verdict: s.confidence >= 0.4 ? '可执行' : '低置信'
                }))
            });
            
            // 如果有 candidate_paper 信号，发送即时通知
            for (const s of signals) {
                if (s.confidence >= 0.4) {
                    await sendFeishuNotification('signal', {
                        symbol: s.symbol,
                        direction: s.direction,
                        confidence: s.confidence?.toFixed(2),
                        price: s.entry_rule?.ma_fast || 'N/A'
                    });
                }
            }
        }
        
    } else if (triggerType === 'close') {
        // 收盘后：汇总报告
        console.log(`[trigger] 运行收盘后汇总`);
        
        // 读取持仓
        let positions = [];
        try {
            const futuPositions = execSync('curl -s http://localhost:3000/api/futu/positions', { encoding: 'utf-8' });
            const posData = JSON.parse(futuPositions);
            positions = (posData.data || []).map(p => ({
                symbol: p.code.split('.')[1],
                qty: p.qty,
                cost: p.cost_price?.toFixed(2),
                price: (p.market_val / p.qty)?.toFixed(2),
                pnl: p.pl_ratio > 0 ? `+${p.pl_ratio.toFixed(1)}%` : `${p.pl_ratio.toFixed(1)}%`
            }));
        } catch (e) {
            console.log('[trigger] 读取持仓失败:', e.message);
        }
        
        // 读取统计
        let backtestCount = 0, evalCount = 0, learningCount = 0;
        let winRate = 'N/A', sharpe = 'N/A', strategyVersion = 'v1.0.1';
        
        try {
            const db = require('sqlite3').verbose();
            const database = new db.Database(path.join(process.cwd(), 'memory-store/marketplayer.db'));
            
            database.get("SELECT COUNT(*) as cnt FROM backtest_runs", [], (err, row) => {
                if (!err) backtestCount = row.cnt;
            });
            database.get("SELECT COUNT(*) as cnt FROM evaluation_results", [], (err, row) => {
                if (!err) evalCount = row.cnt;
            });
            database.get("SELECT COUNT(*) as cnt FROM learning_actions", [], (err, row) => {
                if (!err) learningCount = row.cnt;
            });
            database.get("SELECT win_rate, sharpe FROM backtest_runs ORDER BY created_at DESC LIMIT 1", [], (err, row) => {
                if (!err && row) {
                    winRate = row.win_rate ? (row.win_rate * 100).toFixed(1) : 'N/A';
                    sharpe = row.sharpe ? row.sharpe.toFixed(2) : 'N/A';
                }
            });
            
            database.close();
        } catch (e) {
            console.log('[trigger] 读取统计失败:', e.message);
        }
        
        // 发送飞书通知
        await sendFeishuNotification('close', {
            market: config.name,
            date: dateStr,
            positions,
            backtest_count: backtestCount,
            eval_count: evalCount,
            learning_count: learningCount,
            strategy_version: strategyVersion,
            win_rate: winRate,
            sharpe: sharpe
        });
    }
    
    console.log(`[trigger] ${config.name} ${triggerType} 触发完成`);
}

// 执行日志
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
fs.appendFileSync(
  path.join(LOG_DIR, 'cron.log'),
  `${new Date().toISOString()} daily-trigger --market=${market} --type=${triggerType}\n`
);

main().catch(err => {
    console.error('[trigger] 错误:', err.message);
    process.exit(1);
});