/**
 * strategy-backtester - 策略级回测 Agent
 * 读取 config/system.config.js 获取参数
 */
const fs = require('fs');
const path = require('path');

// 加载配置
const { backtest } = require('../../config/system.config');

const OUTPUT_FILE = path.join(process.cwd(), 'agents/strategy-backtester/output.json');
const DATA_DIR = path.join(process.cwd(), 'data/cache/klines');

// 默认策略参数（从配置文件或 learning-actions 获取）
const DEFAULT_PARAMS = {
  ma_short: 5,
  ma_long: 20,
  rsi_period: 14,
  rsi_oversold: 30,
  rsi_overbought: 70,
  atr_period: 14,
  atr_multiplier: 2.0,
  stop_loss_pct: 0.05,
  profit_target_pct: 0.12,
  max_hold_days: 10
};

// 回测时间范围（从配置文件读取）
const BACKTEST_START = backtest.start_date;
const BACKTEST_END = backtest.end_date;

// 要测试的股票列表
const TEST_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA'];

// 计算 RSI
function calculateRSI(klines, period = 14) {
  if (klines.length < period + 1) return null;
  
  let gains = 0, losses = 0;
  for (let i = klines.length - period; i < klines.length; i++) {
    const change = parseFloat(klines[i].close) - parseFloat(klines[i-1].close);
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// 计算移动平均
function calculateMA(klines, period) {
  if (klines.length < period) return null;
  const prices = klines.slice(-period).map(k => parseFloat(k.close));
  return prices.reduce((a, b) => a + b, 0) / period;
}

// 检查是否符合入场条件
function checkEntrySignal(klines, params) {
  if (klines.length < params.ma_long + 10) return null;
  
  const rsi = calculateRSI(klines, params.rsi_period);
  const maFast = calculateMA(klines, params.ma_short);
  const maSlow = calculateMA(klines, params.ma_long);
  
  if (!rsi || !maFast || !maSlow) return null;
  
  // 入场条件：RSI 超卖 + 均线金叉或站上 MA
  if (rsi < params.rsi_oversold && maFast > maSlow) {
    return {
      rsi,
      ma_fast: maFast,
      ma_slow: maSlow,
      close: parseFloat(klines[klines.length - 1].close)
    };
  }
  
  return null;
}

// 策略级回测：遍历历史上所有符合条件的信号
function runStrategyBacktest(symbol, klines, params) {
  if (klines.length < 100) return null;
  
  // 找到回测时间范围的起始索引
  let startIdx = 0;
  for (let i = 0; i < klines.length; i++) {
    const date = klines[i].date || klines[i].time;
    if (date >= BACKTEST_START) {
      startIdx = i;
      break;
    }
  }
  
  const trades = [];
  let position = null;
  let entryPrice = 0;
  let entryDate = '';
  let initialCapital = 100000;
  let maxDrawdown = 0;
  let peakCapital = initialCapital;
  
  // 遍历每一天
  for (let i = startIdx + params.ma_long; i < klines.length; i++) {
    const date = klines[i].date || klines[i].time;
    if (date > BACKTEST_END) break;
    
    const klineSlice = klines.slice(0, i + 1);
    const signal = checkEntrySignal(klineSlice, params);
    
    // 入场
    if (!position && signal) {
      position = {
        date,
        price: signal.close,
        idx: i
      };
      entryPrice = signal.close;
      entryDate = date;
    }
    
    // 持仓中
    if (position) {
      const currentPrice = parseFloat(klines[i].close);
      const holdDays = i - position.idx;
      const pnlPct = (currentPrice - entryPrice) / entryPrice;
      const currentValue = initialCapital * (1 + pnlPct);
      
      // 更新峰值和回撤
      if (currentValue > peakCapital) peakCapital = currentValue;
      const drawdown = (peakCapital - currentValue) / peakCapital;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      
      // 检查退出条件
      let exitReason = null;
      
      // 止损
      if (pnlPct < -params.stop_loss_pct) {
        exitReason = 'stop_loss';
      }
      // 止盈
      else if (pnlPct > params.profit_target_pct) {
        exitReason = 'profit_target';
      }
      // 强制平仓
      else if (holdDays >= params.max_hold_days) {
        exitReason = 'max_hold_days';
      }
      
      // 平仓
      if (exitReason) {
        trades.push({
          symbol,
          entry_date: entryDate,
          entry_price: entryPrice,
          exit_date: date,
          exit_price: currentPrice,
          pnl_pct: pnlPct,
          hold_days: holdDays,
          reason: exitReason
        });
        position = null;
      }
    }
  }
  
  // 如果还有持仓，平仓在最后一天
  if (position) {
    const lastKline = klines[klines.length - 1];
    const lastPrice = parseFloat(lastKline.close);
    const pnlPct = (lastPrice - entryPrice) / entryPrice;
    trades.push({
      symbol,
      entry_date: entryDate,
      entry_price: entryPrice,
      exit_date: lastKline.date || lastKline.time,
      exit_price: lastPrice,
      pnl_pct: pnlPct,
      hold_days: klines.length - 1 - position.idx,
      reason: 'end_of_period'
    });
  }
  
  return {
    symbol,
    trade_count: trades.length,
    trades,
    max_drawdown: maxDrawdown
  };
}

// 主函数
async function main() {
  // 从命令行或默认参数获取策略参数
  const params = process.argv[2] ? JSON.parse(process.argv[2]) : DEFAULT_PARAMS;
  
  console.log('[strategy-backtester] 策略参数:', JSON.stringify(params));
  console.log('[strategy-backtester] 回测范围:', BACKTEST_START, '~', BACKTEST_END);
  console.log('[strategy-backtester] 测试股票:', TEST_SYMBOLS.join(', '));
  
  const allTrades = [];
  const results = [];
  
  for (const symbol of TEST_SYMBOLS) {
    const filePath = path.join(DATA_DIR, `us_${symbol}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`[strategy-backtester] 跳过 ${symbol}: 文件不存在`);
      continue;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const klines = data.klines || [];
    
    if (klines.length < 100) {
      console.log(`[strategy-backtester] 跳过 ${symbol}: 数据不足`);
      continue;
    }
    
    const result = runStrategyBacktest(symbol, klines, params);
    
    if (result && result.trade_count > 0) {
      results.push(result);
      allTrades.push(...result.trades);
      
      console.log(`[strategy-backtester] ${symbol}: ${result.trade_count} 笔交易, max_dd=${(result.max_drawdown*100).toFixed(1)}%`);
    } else {
      console.log(`[strategy-backtester] ${symbol}: 无信号`);
    }
  }
  
  console.log(`\n[strategy-backtester] 总计: ${allTrades.length} 笔交易, ${results.length} 只股票`);
  
  // 计算整体统计
  if (allTrades.length === 0) {
    console.error('[strategy-backtester] 无有效交易，无法评估策略');
    process.exit(1);
  }
  
  const returns = allTrades.map(t => t.pnl_pct);
  const wins = returns.filter(r => r > 0).length;
  const winRate = wins / returns.length;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length);
  const annualReturn = avgReturn * (252 / 30);  // 平均持有30天
  const sharpe = stdReturn > 0 ? (annualReturn - 0.02) / stdReturn : 0;
  
  const avgWin = returns.filter(r => r > 0).reduce((a, b) => a + b, 0) / wins;
  const avgLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0) / (returns.length - wins));
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  const maxDrawdown = Math.max(...results.map(r => r.max_drawdown));
  
  const output = {
    strategy_params: params,
    test_period: `${BACKTEST_START} ~ ${BACKTEST_END}`,
    symbols_tested: results.length,
    total_trades: allTrades.length,
    win_rate: winRate,
    avg_return: avgReturn,
    sharpe_ratio: sharpe,
    max_drawdown: maxDrawdown,
    profit_factor: profitFactor,
    trades_sample: allTrades.slice(0, 20),  // 保留前20笔交易作为样本
    timestamp: new Date().toISOString()
  };
  
  // 写入输出文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`[strategy-backtester] 结果已写入 ${OUTPUT_FILE}`);
  
  // 写入数据库
  const db = require('sqlite3').verbose();
  const database = new db.Database(path.join(process.cwd(), 'memory-store/marketplayer.db'));
  
  const runId = `st_${Date.now()}`;
  database.run(`
    INSERT INTO backtest_runs 
    (run_id, strategy_version_id, symbol, market, start_date, end_date, initial_capital, final_capital, annual_return, sharpe, max_drawdown, win_rate, profit_factor, trade_count, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    runId,
    'strategy_level',
    'MULTI',  // 多股票策略
    '美股',
    BACKTEST_START,
    BACKTEST_END,
    100000,
    100000 * (1 + avgReturn),
    annualReturn,
    sharpe,
    maxDrawdown,
    winRate,
    profitFactor,
    allTrades.length,
    'strategy-backtester',
    new Date().toISOString()
  ], function(err) {
    if (err) console.error('写入失败:', err.message);
    else console.log('[strategy-backtester] 已写入 memory-store');
  });
  
  database.close(() => {
    console.log('\n---OUTPUT---');
    console.log(JSON.stringify({
      type: 'strategy_backtest',
      total_trades: allTrades.length,
      win_rate: winRate.toFixed(3),
      sharpe: sharpe.toFixed(2),
      max_drawdown: maxDrawdown.toFixed(3),
      timestamp: new Date().toISOString()
    }, null, 2));
    
    // 发送飞书通知
    sendHypothesisNotification(params, {
      win_rate: winRate,
      sharpe: sharpe,
      max_drawdown: maxDrawdown,
      trade_count: allTrades.length
    });
  });
}

// 发送 hypothesis 验证结果通知
function sendHypothesisNotification(params, result) {
  try {
    // 路径: agents/strategy-backtester -> ../../dist/services/feishu/bot
    const { sendMessageToUser } = require('../../dist/services/feishu/bot');
    const FEISHU_USER_OPEN_ID = 'ou_3d8c36452b5a0ca480873393ad876e12';
    
    // 基准值
    const BENCHMARK_WIN = 0.556;
    const BENCHMARK_SHARPE = 2.57;
    
    // 结论
    let conclusion = '';
    if (result.win_rate > BENCHMARK_WIN && result.sharpe > BENCHMARK_SHARPE) {
      conclusion = '✅ 优于当前版本，建议升级';
    } else if (result.win_rate > 0.45 && result.sharpe > 1.5) {
      conclusion = '⚠️ 略有改善，继续观察';
    } else {
      conclusion = '❌ 未通过，放弃此方向';
    }
    
    const message = `📊 Hypothesis 验证结果 ${new Date().toISOString().split('T')[0]}

测试方向：参数优化
参数：ma_short=${params.ma_short} ma_long=${params.ma_long} rsi_oversold=${params.rsi_oversold}

结果：
 胜率：${(result.win_rate * 100).toFixed(1)}% （基准：${(BENCHMARK_WIN * 100).toFixed(1)}%）
 Sharpe：${result.sharpe.toFixed(2)} （基准：${BENCHMARK_SHARPE.toFixed(2)}）
 最大回撤：${(result.max_drawdown * 100).toFixed(1)}%
 交易笔数：${result.trade_count}

结论：
 ${conclusion}`;
    
    sendMessageToUser(FEISHU_USER_OPEN_ID, { text: message });
    console.log('[strategy-backtester] 飞书通知已发送');
  } catch (e) {
    console.log('[strategy-backtester] 飞书通知失败:', e.message);
  }
}

main().catch(err => {
  console.error('[strategy-backtester] 错误:', err.message);
  process.exit(1);
});