/**
 * backtest-agent - 回测验证 Agent
 * 职责：
 * 1. 读取 quant-agent 的信号输出
 * 2. 用历史数据跑回测（从信号产生时间点开始）
 * 3. 输出回测结果写入 backtest_runs 表 (PostgreSQL)
 * 4. 把结果传给 evaluator-agent
 */

const fs = require('fs');
const path = require('path');
const { insert, query } = require('../../harness/utils/pg');

const INPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/quant-agent/output.json');
const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/backtest-agent/output.json');

const PARAMS = {
  initial_capital: 100000,
  stop_loss_pct: 0.05,
  profit_target_pct: 0.12,
  max_hold_days: 10
};

function runBacktest(symbol, klines, signal) {
  if (klines.length < 100) return null;
  
  let signalDateStr = new Date().toISOString().split('T')[0];
  if (signal.timestamp) {
    signalDateStr = new Date(signal.timestamp).toISOString().split('T')[0];
  }
  
  let signalIdx = klines.length - 1;
  for (let i = 0; i < klines.length; i++) {
    const klineDate = klines[i].date || klines[i].time;
    if (klineDate && klineDate >= signalDateStr) {
      signalIdx = i;
      break;
    }
  }
  
  if (signalIdx < 0) signalIdx = 0;
  
  const entryPrice = parseFloat(klines[signalIdx].close);
  const entryDate = klines[signalIdx].date || klines[signalIdx].time;
  
  let capital = PARAMS.initial_capital;
  let position = capital / entryPrice;
  let trades = [];
  let maxDrawdown = 0;
  let peakCapital = position * entryPrice;
  
  const endIdx = Math.min(signalIdx + PARAMS.max_hold_days, klines.length - 1);
  let holdDaysTotal = 0;
  
  for (let i = signalIdx; i <= endIdx; i++) {
    const date = klines[i].date || klines[i].time;
    const close = parseFloat(klines[i].close);
    const currentValue = position * close;
    
    if (currentValue > peakCapital) peakCapital = currentValue;
    const drawdown = (peakCapital - currentValue) / peakCapital;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    const hDays = i - signalIdx;
    const pnlPct = (currentValue - PARAMS.initial_capital) / PARAMS.initial_capital;
    
    if (pnlPct < -PARAMS.stop_loss_pct) {
      capital = position * close;
      trades.push({ type: 'SELL', date, price: close, pnl: pnlPct, reason: 'stop_loss', hold_days: hDays });
      position = 0;
      holdDaysTotal = hDays;
      break;
    }
    
    if (pnlPct > PARAMS.profit_target_pct) {
      capital = position * close;
      trades.push({ type: 'SELL', date, price: close, pnl: pnlPct, reason: 'profit_target', hold_days: hDays });
      position = 0;
      holdDaysTotal = hDays;
      break;
    }
    
    if (i === endIdx && position > 0) {
      capital = position * close;
      trades.push({ type: 'SELL', date, price: close, pnl: pnlPct, reason: 'max_hold_days', hold_days: hDays });
      position = 0;
      holdDaysTotal = hDays;
    }
  }
  
  const finalCapital = capital;
  const totalReturn = (finalCapital - PARAMS.initial_capital) / PARAMS.initial_capital;
  const totalHoldDays = holdDaysTotal || (endIdx - signalIdx);
  const annualReturn = totalReturn * (252 / Math.max(totalHoldDays, 1));
  
  const returns = trades.filter(t => t.pnl !== undefined).map(t => t.pnl);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdReturn = returns.length > 1 ? Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / (returns.length - 1)) : 0;
  const sharpe = stdReturn > 0 ? (annualReturn - 0.02) / stdReturn : 0;
  
  const wins = returns.filter(r => r > 0).length;
  const winRate = returns.length > 0 ? wins / returns.length : 0;
  
  const avgWin = returns.filter(r => r > 0).reduce((a, b) => a + b, 0) / (wins || 1);
  const avgLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0) / (Math.max(returns.length - wins, 1)));
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  return {
    id: `bt_${Date.now()}_${symbol}`,
    strategy_params: JSON.stringify({ version: signal.strategy_version }),
    symbols_tested: [signal.symbol],
    win_rate: winRate,
    sharpe_ratio: sharpe,
    max_drawdown: maxDrawdown,
    trade_count: trades.length,
    test_period: `${entryDate} - ${klines[endIdx].date || klines[endIdx].time}`,
    created_at: new Date()
  };
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('[backtest-agent] 错误: 未找到 quant-agent 输出文件');
    process.exit(1);
  }
  
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const signals = input.signals;
  
  console.log(`[backtest-agent] 正在对 ${signals.length} 个信号进行回测...`);
  
  const backtestResults = [];
  
  for (const signal of signals) {
    let klines = [];
    const dataDir = path.join(process.cwd(), 'data/cache/klines');
    const market = signal.market;
    const fileName = market === '美股' ? `us_${signal.symbol}.json` : 
                   market === '港股' ? `hk_${signal.symbol}.json` : `cn_${signal.symbol}.json`;
    const filePath = path.join(dataDir, fileName);
    
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      klines = data.klines || data || [];
    }
    
    if (klines.length < 100) {
      console.log(`[backtest-agent] 跳过 ${signal.symbol}: 数据不足`);
      continue;
    }
    
    const result = runBacktest(signal.symbol, klines, signal);
    
    if (result) {
      backtestResults.push(result);
      console.log(`[backtest-agent] 回测 ${signal.symbol}: win=${(result.win_rate*100).toFixed(0)}% sharpe=${result.sharpe_ratio.toFixed(2)}`);
    }
  }
  
  console.log(`[backtest-agent] 完成: ${backtestResults.length} 个回测结果`);
  
  // 写入 PostgreSQL
  for (const result of backtestResults) {
    try {
      await insert('backtest_runs', result);
      console.log(`[backtest-agent] 已写入 PostgreSQL: ${result.id}`);
    } catch (err) {
      console.error(`[backtest-agent] 写入失败: ${err.message}`);
    }
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    summary: {
      signals_tested: signals.length,
      backtests_completed: backtestResults.length
    },
    results: backtestResults,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log(`[backtest-agent] 结果已写入 ${OUTPUT_FILE}`);
  console.log('\n---OUTPUT---');
  console.log(JSON.stringify({
    type: 'backtest_result',
    count: backtestResults.length,
    results: backtestResults.map(r => ({
      symbol: r.symbols_tested?.[0], win_rate: r.win_rate, sharpe: r.sharpe_ratio
    })),
    timestamp: new Date().toISOString()
  }, null, 2));
}

main().catch(err => {
  console.error('[backtest-agent] 错误:', err.message);
  process.exit(1);
});