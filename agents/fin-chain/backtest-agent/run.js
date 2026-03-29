/**
 * backtest-agent - 回测验证 Agent
 * 职责：
 * 1. 读取 quant-agent 的信号输出
 * 2. 用历史数据跑回测
 * 3. 输出回测结果写入 backtest_runs 表
 * 4. 把结果传给 evaluator-agent
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/quant-agent/output.json');
const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/backtest-agent/output.json');

// 策略参数
const PARAMS = {
  initial_capital: 100000,
  stop_loss_pct: 0.05,
  profit_target_pct: 0.12,
  max_hold_days: 10
};

// 简单回测逻辑
function runBacktest(symbol, klines, signal) {
  if (klines.length < 100) return null;
  
  const entryPrice = parseFloat(klines[klines.length - 1].close);
  const entryDate = klines[klines.length - 1].date || klines[klines.length - 1].time;
  
  // 模拟交易
  let capital = PARAMS.initial_capital;
  let position = 0;
  let trades = [];
  let maxDrawdown = 0;
  let peakCapital = capital;
  
  // 从信号产生点向后回测 N 天
  const backtestDays = Math.min(60, klines.length - 1);
  const startIdx = klines.length - backtestDays - 1;
  
  for (let i = startIdx; i < klines.length - 1; i++) {
    const date = klines[i].date || klines[i].time;
    const close = parseFloat(klines[i].close);
    const high = parseFloat(klines[i].high);
    const low = parseFloat(klines[i].low);
    
    // 入场
    if (position === 0 && i === startIdx) {
      position = capital / close;
      capital = 0;
      trades.push({ type: 'BUY', date, price: close, idx: i });
    }
    
    if (position > 0) {
      const currentValue = position * close;
      const pnlPct = (currentValue - PARAMS.initial_capital) / PARAMS.initial_capital;
      
      // 更新峰值
      if (currentValue > peakCapital) {
        peakCapital = currentValue;
      }
      
      // 计算回撤
      const drawdown = (peakCapital - currentValue) / peakCapital;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
      
      const holdDays = i - startIdx;
      
      // 止损
      if (pnlPct < -PARAMS.stop_loss_pct) {
        capital = position * close;
        trades.push({ type: 'SELL', date, price: close, pnl: pnlPct, reason: 'stop_loss', idx: i });
        break;
      }
      
      // 止盈
      if (pnlPct > PARAMS.profit_target_pct) {
        capital = position * close;
        trades.push({ type: 'SELL', date, price: close, pnl: pnlPct, reason: 'profit_target', idx: i });
        break;
      }
      
      // 强制平仓
      if (holdDays >= PARAMS.max_hold_days) {
        capital = position * close;
        trades.push({ type: 'SELL', date, price: close, pnl: pnlPct, reason: 'max_hold_days', idx: i });
        break;
      }
    }
  }
  
  // 如果还在持仓
  if (position > 0) {
    const lastClose = parseFloat(klines[klines.length - 1].close);
    capital = position * lastClose;
    trades.push({ 
      type: 'SELL', 
      date: klines[klines.length - 1].date || klines[klines.length - 1].time,
      price: lastClose,
      pnl: (capital - PARAMS.initial_capital) / PARAMS.initial_capital,
      reason: 'end_of_backtest',
      idx: klines.length - 1
    });
  }
  
  // 计算统计
  const finalCapital = capital;
  const totalReturn = (finalCapital - PARAMS.initial_capital) / PARAMS.initial_capital;
  const annualReturn = totalReturn * (252 / backtestDays);
  
  // 计算 Sharpe (简化版)
  const returns = trades.filter(t => t.pnl !== undefined).map(t => t.pnl);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdReturn = returns.length > 1 ? Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / (returns.length - 1)) : 0;
  const sharpe = stdReturn > 0 ? (annualReturn - 0.02) / stdReturn : 0;
  
  // 胜率
  const wins = returns.filter(r => r > 0).length;
  const winRate = returns.length > 0 ? wins / returns.length : 0;
  
  // 盈亏比
  const avgWin = returns.filter(r => r > 0).reduce((a, b) => a + b, 0) / (wins || 1);
  const avgLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0) / (returns.length - wins || 1));
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  return {
    run_id: `bt_${Date.now()}_${symbol}`,
    strategy_version: signal.strategy_version,
    symbol,
    market: signal.market,
    start_date: klines[startIdx]?.date || klines[startIdx]?.time,
    end_date: klines[klines.length - 1].date || klines[klines.length - 1].time,
    initial_capital: PARAMS.initial_capital,
    final_capital: finalCapital,
    annual_return: annualReturn,
    sharpe,
    max_drawdown: maxDrawdown,
    win_rate: winRate,
    profit_factor: profitFactor,
    trade_count: trades.length,
    trades,
    timestamp: new Date().toISOString()
  };
}

// 主函数
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
    // 读取 K线数据
    let klines = [];
    const dataDir = path.join(process.cwd(), 'data/cache/klines');
    const market = signal.market;
    let fileName = market === '美股' ? `us_${signal.symbol}.json` : 
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
      console.log(`[backtest-agent] 回测 ${signal.symbol}: return=${(result.annual_return*100).toFixed(1)}% sharpe=${result.sharpe.toFixed(2)} dd=${(result.max_drawdown*100).toFixed(1)}% win=${(result.win_rate*100).toFixed(0)}%`);
    }
  }
  
  console.log(`[backtest-agent] 完成: ${backtestResults.length} 个回测结果`);
  
  // 输出到文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    summary: {
      signals_tested: signals.length,
      backtests_completed: backtestResults.length
    },
    results: backtestResults,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log(`[backtest-agent] 结果已写入 ${OUTPUT_FILE}`);
  
  // 写入 memory-store
  const db = require('sqlite3').verbose();
  const database = new db.Database(path.join(process.cwd(), 'memory-store.db'));
  
  for (const result of backtestResults) {
    database.run(`
      INSERT INTO backtest_runs 
      (run_id, strategy_version_id, symbol, market, start_date, end_date, initial_capital, final_capital, annual_return, sharpe, max_drawdown, win_rate, profit_factor, trade_count, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      result.run_id,
      result.strategy_version,
      result.symbol,
      result.market,
      result.start_date,
      result.end_date,
      result.initial_capital,
      result.final_capital,
      result.annual_return,
      result.sharpe,
      result.max_drawdown,
      result.win_rate,
      result.profit_factor,
      result.trade_count,
      'backtest-agent',
      result.timestamp
    ], function(err) {
      if (err) console.error('写入失败:', err.message);
    });
  }
  
  database.close(() => {
    console.log('[backtest-agent] 已写入 memory-store');
  });
  
  // 输出 JSON 到 stdout
  console.log('\n---OUTPUT---');
  console.log(JSON.stringify({
    type: 'backtest_result',
    count: backtestResults.length,
    results: backtestResults.map(r => ({
      symbol: r.symbol,
      annual_return: r.annual_return,
      sharpe: r.sharpe,
      max_drawdown: r.max_drawdown,
      win_rate: r.win_rate
    })),
    timestamp: new Date().toISOString()
  }, null, 2));
}

main().catch(err => {
  console.error('[backtest-agent] 错误:', err.message);
  process.exit(1);
});