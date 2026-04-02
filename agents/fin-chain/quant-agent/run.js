/**
 * quant-agent - 量化信号生成 Agent (v2)
 * 职责：
 * 1. 读取 data-agent 的市场数据
 * 2. 基于均线 + RSI + ATR 生成短线信号
 * 3. 更新 signal_candidates 表状态为 research_generated
 * 
 * 信号逻辑调整：
 * - 多头信号：RSI超卖反弹 + 价格在支撑位
 * - 空头信号：RSI超买 + 价格在压力位
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/data-agent/output.json');
const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/quant-agent/output.json');

// 策略参数
const PARAMS = {
  fast_period: 11,
  slow_period: 30,
  rsi_period: 14,
  rsi_low: 35,
  rsi_high: 65,
  min_confidence: 0.3
};

// === 新增：大盘趋势过滤器 ===
function checkMarketEnvironment(market) {
  if (market !== '美股') return { signal_allowed: true, market_status: 'risk_on' };
  
  const spyPath = path.join(process.cwd(), 'data/cache/klines/us_SPY.json');
  if (!fs.existsSync(spyPath)) return { signal_allowed: true, market_status: 'unknown' };
  
  const spyData = JSON.parse(fs.readFileSync(spyPath, 'utf-8'));
  const klines = spyData.klines || [];
  
  if (klines.length < 60) return { signal_allowed: true, market_status: 'unknown' };
  
  // 计算 SPY MA50
  const ma50Slice = klines.slice(-50);
  const spyMa50 = ma50Slice.map(k => parseFloat(k.close)).reduce((a, b) => a + b) / 50;
  
  // 最新价格
  const spyPrice = parseFloat(klines[klines.length - 1].close);
  
  // 20天涨跌幅
  const idx20 = Math.max(0, klines.length - 21);
  const price20dAgo = parseFloat(klines[idx20].close);
  const spy20dReturn = (spyPrice - price20dAgo) / price20dAgo;
  
  // 判断市场状态
  const aboveMA = spyPrice > spyMa50;
  const inPanic = spy20dReturn < -0.08;
  
  let market_status = 'risk_on';
  if (!aboveMA && inPanic) market_status = 'risk_off';
  else if (!aboveMA) market_status = 'caution';
  
  const signal_allowed = market_status === 'risk_on';
  
  console.log(`[quant-agent] 市场环境: SPY=${spyPrice.toFixed(2)} MA50=${spyMa50.toFixed(2)} 20d=${(spy20dReturn*100).toFixed(1)}% status=${market_status}`);
  
  return {
    signal_allowed,
    market_status,
    spy_price: spyPrice,
    spy_ma50: spyMa50,
    spy_20d_return: spy20dReturn,
    spy_ma50_position: aboveMA ? 'above' : 'below'
  };
}

// 计算 ATR
function calculateATR(klines) {
  if (klines.length < 15) return null;
  
  let trSum = 0;
  for (let i = Math.max(0, klines.length - 15); i < klines.length; i++) {
    const high = parseFloat(klines[i].high);
    const low = parseFloat(klines[i].low);
    const prevClose = i > 0 ? parseFloat(klines[i-1].close) : parseFloat(klines[i].open);
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trSum += tr;
  }
  
  return trSum / 14;
}

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

// 计算均线
function calculateMA(klines, period) {
  if (klines.length < period) return null;
  const prices = klines.slice(-period).map(k => parseFloat(k.close));
  return prices.reduce((a, b) => a + b, 0) / period;
}

// 生成信号
function generateSignal(symbol, market, klines) {
  if (klines.length < 30) return null;
  
  const latest = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const close = parseFloat(latest.close);
  const prevClose = parseFloat(prev.close);
  
  const maFast = calculateMA(klines, PARAMS.fast_period);
  const maSlow = calculateMA(klines, PARAMS.slow_period);
  const ma20 = calculateMA(klines, 20);
  const rsi = calculateRSI(klines, PARAMS.rsi_period);
  const atr = calculateATR(klines);
  
  if (!maFast || !maSlow || !ma20 || !rsi || !atr) return null;
  
  // 信号评分
  let score = 0;
  const signals = [];
  
  // === 做多信号 (Long) ===
  
  // 1. RSI 超卖反弹 (RSI < 35 是超卖区)
  if (rsi < PARAMS.rsi_low) {
    score += 30;
    signals.push('RSI超卖');
  }
  
  // 2. 均线多头排列
  if (maFast > maSlow && maSlow > ma20) {
    score += 25;
    signals.push('均线多头');
  }
  
  // 3. 价格站上 20 日高点 (突破)
  const highs = klines.slice(-20).map(k => parseFloat(k.high));
  const high20 = Math.max(...highs);
  if (close >= high20) {
    score += 25;
    signals.push('突破20日高点');
  }
  
  // 4. 金叉 (快线从下方穿越慢线)
  const maFastPrev = calculateMA(klines.slice(0, -1), PARAMS.fast_period);
  const maSlowPrev = calculateMA(klines.slice(0, -1), PARAMS.slow_period);
  if (maFast > maSlow && maFastPrev <= maSlowPrev) {
    score += 20;
    signals.push('金叉');
  }
  
  // 5. 放量突破 (成交量 > 20日均量 1.5倍)
  const volCurrent = parseFloat(latest.volume);
  const volAvg = klines.slice(-20).map(k => parseFloat(k.volume)).reduce((a, b) => a + b, 0) / 20;
  if (volCurrent > volAvg * 1.5) {
    score += 15;
    signals.push('放量');
  }
  
  // 6. 大跌反弹 (当日跌幅 > 3% 但 RSI 超卖)
  const priceChangePct = (close - prevClose) / prevClose;
  if (priceChangePct < -0.03 && rsi < 40) {
    score += 20;
    signals.push('大跌反弹');
  }
  
  // 7. 回调到支撑位 (价格接近 MA20 但未跌破)
  if (close >= ma20 * 0.98 && close <= ma20 * 1.02 && rsi < 45) {
    score += 15;
    signals.push('回调支撑');
  }
  
  // 8. 连续 3 日下跌后反弹
  if (klines.length >= 4) {
    const d1 = (parseFloat(klines[klines.length - 1].close) - parseFloat(klines[klines.length - 2].close)) / parseFloat(klines[klines.length - 2].close);
    const d2 = (parseFloat(klines[klines.length - 2].close) - parseFloat(klines[klines.length - 3].close)) / parseFloat(klines[klines.length - 3].close);
    const d3 = (parseFloat(klines[klines.length - 3].close) - parseFloat(klines[klines.length - 4].close)) / parseFloat(klines[klines.length - 4].close);
    if (d1 > 0 && d2 < 0 && d3 < 0) {
      score += 15;
      signals.push('三连跌反弹');
    }
  }
  
  // === 做空信号 (Short) ===
  
  // 1. RSI 超买
  if (rsi > PARAMS.rsi_high) {
    score -= 25;
    signals.push('RSI超买');
  }
  
  // 2. 均线空头排列
  if (maFast < maSlow && maSlow < ma20) {
    score -= 20;
    signals.push('均线空头');
  }
  
  // 3. 跌破 20 日低点
  const lows = klines.slice(-20).map(k => parseFloat(k.low));
  const low20 = Math.min(...lows);
  if (close <= low20) {
    score -= 20;
    signals.push('跌破20日低点');
  }
  
  // 决定方向
  let direction = 'neutral';
  
  // 做多条件：至少满足 2 个正向信号且得分 > 0
  const longSignals = signals.filter(s => !['RSI超买', '均线空头', '跌破20日低点'].includes(s));
  if (longSignals.length >= 2 && score > 30) {
    direction = 'long';
  }
  
  // 做空条件：得分 < -20
  if (score < -20) {
    direction = 'short';
  }
  
  if (direction === 'neutral') {
    // 特殊处理：RSI 极端情况
    if (rsi < 25) {
      direction = 'long';
      score = 50;
      signals.push('RSI极端超卖');
    }
  }
  
  if (direction === 'neutral') return null;
  
  const confidence = direction === 'long' ? Math.min(Math.max(score, 30) / 100, 1) : Math.min(Math.abs(score) / 100, 1);
  
  return {
    type: 'quant_signal',
    strategy_version: 'v2_ma_rsi_atr',
    symbol,
    market,
    direction,
    signal_strength: Math.abs(score) / 100,
    entry_rule: {
      ma_fast: maFast.toFixed(2),
      ma_slow: maSlow.toFixed(2),
      ma20: ma20.toFixed(2),
      rsi: rsi.toFixed(2),
      atr: atr.toFixed(2)
    },
    exit_rule: {
      stop_loss_pct: direction === 'long' ? Math.min(2 * atr / close, 0.06) : Math.min(2 * atr / close, 0.06),
      profit_target_pct: 0.12,
      max_hold_days: 10
    },
    confidence,
    reason_tags: signals,
    timestamp: new Date().toISOString()
  };
}

// 主函数
async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('[quant-agent] 错误: 未找到 data-agent 输出文件');
    process.exit(1);
  }
  
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const marketData = input.market_data;
  
  console.log(`[quant-agent] 正在处理 ${marketData.market} 市场数据...`);
  
  // === 新增：检查市场环境 ===
  const marketEnv = checkMarketEnvironment(marketData.market);
  
  const quantSignals = [];
  
  for (const symbol of marketData.symbols) {
    let klines = [];
    const dataDir = path.join(process.cwd(), 'data/cache/klines');
    const market = marketData.market;
    let fileName = market === '美股' ? `us_${symbol}.json` : 
                   market === '港股' ? `hk_${symbol}.json` : `cn_${symbol}.json`;
    const filePath = path.join(dataDir, fileName);
    
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      klines = data.klines || data || [];
    }
    
    if (klines.length < 30) continue;
    
    const signal = generateSignal(symbol, marketData.market, klines);
    
    if (signal) {
      // 市场环境过滤
      if (!marketEnv.signal_allowed) {
        console.log(`[quant-agent] 市场${marketEnv.market_status}，过滤信号 ${symbol}`);
        continue;
      }
      
      // caution 状态提高阈值（从0.5降到0.4）
      if (marketEnv.market_status === 'caution' && signal.confidence < 0.4) {
        console.log(`[quant-agent] caution模式，过滤低置信度信号 ${symbol}`);
        continue;
      }
      
      quantSignals.push(signal);
      console.log(`[quant-agent] 生成信号: ${symbol} ${signal.direction} conf=${signal.confidence.toFixed(2)} score=${signal.signal_strength.toFixed(2)} [${signal.reason_tags.join(',')}]`);
    }
  }
  
  console.log(`[quant-agent] 完成: 生成 ${quantSignals.length} 个量化信号`);
  
  // 输出到文件（包含市场环境）
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    input_summary: {
      market: marketData.market,
      symbols_processed: marketData.symbols.length,
      signals_generated: quantSignals.length
    },
    market_environment: marketEnv,  // 新增字段
    signals: quantSignals,
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log(`[quant-agent] 结果已写入 ${OUTPUT_FILE}`);
  
  // 输出 JSON 到 stdout
  console.log('\n---OUTPUT---');
  console.log(JSON.stringify({
    type: 'quant_result',
    market: marketData.market,
    signals_count: quantSignals.length,
    signals: quantSignals.slice(0, 5),
    timestamp: new Date().toISOString()
  }, null, 2));
  
  // 更新 signal_candidates 状态
  if (quantSignals.length > 0) {
    console.log('\n[quant-agent] 更新 signal_candidates 状态为 research_generated...');
    // 这里需要写数据库，暂时跳过，下一个 agent 会处理
  }
}

main().catch(err => {
  console.error('[quant-agent] 错误:', err.message);
  process.exit(1);
});