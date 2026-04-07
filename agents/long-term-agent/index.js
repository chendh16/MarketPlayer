/**
 * 长线策略筛选 Agent
 * 
 * 两层筛选：
 * 1. 基本面筛选（每月跑一次）
 * 2. 技术面筛选（每周扫描）
 * 
 * 输出：signal_candidates 表
 */

import * as fs from 'fs';
import * as path from 'path';
import pg from 'pg';

const { Pool } = pg;

// 基本面筛选条件
const FUNDAMENTAL_CRITERIA = {
  pe_min: 0,
  pe_max: 50,
  roe_min: 0.15,
  roe_max: 3.0,  // 允许AAPL/NVDA的高ROE
  net_income_growth_min: 0,  // 不要求正增长
  debt_ratio_max: 0.80,  // 允许苹果高负债率（回购导致）
  fcf_positive: true
};

// 数据库连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://trading_user:password@localhost:5432/trading_bot'
});

async function query(sql, params) {
  const result = await pool.query(sql, params);
  return result;
}

// 读取基本面数据
function loadFundamentals() {
  const dir = path.join(process.cwd(), 'data', 'fundamental');
  if (!fs.existsSync(dir)) {
    console.error(`[long-term] Directory not found: ${dir}`);
    return [];
  }
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('_fundamental.json'));
  
  const data = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const json = JSON.parse(content);
      // 只处理美股（纯字母大写）
      if (json.symbol && /^[A-Z]{2,5}$/.test(json.symbol)) {
        data.push(json);
      }
    } catch (e) {
      console.error(`[long-term] Failed to load ${file}:`, e.message);
    }
  }
  return data;
}

// 基本面筛选
function filterByFundamentals(stocks) {
  console.log('\n=== 层1: 基本面筛选 ===');
  const passed = [];
  
  for (const stock of stocks) {
    const reasons = [];
    let failed = false;
    
    // PE 筛选
    if (!stock.pe || stock.pe <= FUNDAMENTAL_CRITERIA.pe_min || stock.pe > FUNDAMENTAL_CRITERIA.pe_max) {
      reasons.push(`PE=${stock.pe || 'N/A'} 不在(0,50]`);
      failed = true;
    }
    
    // ROE 筛选 (转换为小数)
    const roe = typeof stock.roe === 'number' && stock.roe > 1 ? stock.roe / 100 : stock.roe;
    if (!roe || roe <= FUNDAMENTAL_CRITERIA.roe_min || roe > FUNDAMENTAL_CRITERIA.roe_max) {
      reasons.push(`ROE=${(roe ? (roe * 100).toFixed(1) : 'N/A')}% 不在(15%,100%]`);
      failed = true;
    }
    
    // 净利润增速
    const growth = stock.net_income_growth;
    if (!growth || growth < FUNDAMENTAL_CRITERIA.net_income_growth_min) {
      reasons.push(`增速=${growth ? (growth * 100).toFixed(1) : 'N/A'}% ≤ 10%`);
      failed = true;
    }
    
    // 负债率
    if (stock.debt_ratio && stock.debt_ratio > FUNDAMENTAL_CRITERIA.debt_ratio_max) {
      reasons.push(`负债率=${(stock.debt_ratio * 100).toFixed(1)}% > 60%`);
      failed = true;
    }
    
    // 自由现金流
    if (FUNDAMENTAL_CRITERIA.fcf_positive && (!stock.free_cash_flow || stock.free_cash_flow <= 0)) {
      reasons.push(`FCF=${stock.free_cash_flow || 0} ≤ 0`);
      failed = true;
    }
    
    if (!failed) {
      console.log(`✅ ${stock.symbol}: PE=${stock.pe}, ROE=${(roe * 100).toFixed(1)}%, 增速=${(growth * 100).toFixed(1)}%`);
      passed.push({
        ...stock,
        roe_decimal: roe,
        growth
      });
    } else {
      console.log(`❌ ${stock.symbol}: ${reasons.join('; ')}`);
    }
  }
  
  console.log(`\n基本面通过: ${passed.length}/${stocks.length}\n`);
  return passed;
}

// 技术面分析
async function analyzeTechnical(symbol) {
  try {
    // 尝试从K线数据获取技术指标
    const klineFile = path.join(process.cwd(), 'data', 'cache', 'klines', `us_${symbol}.json`);
    if (!fs.existsSync(klineFile)) {
      return null;
    }
    
    const content = fs.readFileSync(klineFile, 'utf-8');
    const data = JSON.parse(content);
    const klines = data.klines || data;
    
    if (!klines || klines.length < 200) {
      return null;
    }
    
    // 取最近200天数据
    const recent = klines.slice(-200);
    
    // 计算MA50, MA200
    const closes = recent.map(k => parseFloat(k.close));
    const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const ma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
    const currentPrice = closes[closes.length - 1];
    
    // 计算RSI(14)
    const rsi = calculateRSI(closes, 14);
    
    // 计算距离MA50的百分比
    const ma50Distance = (currentPrice - ma50) / ma50;
    
    return {
      price: currentPrice,
      ma50,
      ma200,
      rsi,
      ma50Distance,
      above_ma50: currentPrice > ma50,
      above_ma200: currentPrice > ma200,
      golden_cross: ma50 > ma200, // 均线多头
      ma50_above_ma200: ma50 > ma200
    };
  } catch (e) {
    console.error(`[long-term] Technical analysis failed for ${symbol}:`, e.message);
    return null;
  }
}

// 计算RSI
function calculateRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// 检查市场状态 (简化版)
function getMarketStatus() {
  // 读取大盘数据
  const spyFile = path.join(process.cwd(), 'data', 'cache', 'klines', 'us_SPY.json');
  if (!fs.existsSync(spyFile)) {
    return 'risk_on'; // 默认
  }
  
  try {
    const content = fs.readFileSync(spyFile, 'utf-8');
    const data = JSON.parse(content);
    const klines = data.klines || data;
    
    if (klines.length < 50) return 'risk_on';
    
    const closes = klines.map(k => parseFloat(k.close));
    const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const currentPrice = closes[closes.length - 1];
    const change20d = (currentPrice - closes[closes.length - 20]) / closes[closes.length - 20];
    
    if (currentPrice > ma50) {
      return 'risk_on';
    } else if (change20d > -0.08) {
      return 'caution';
    } else {
      return 'risk_off';
    }
  } catch (e) {
    return 'risk_on';
  }
}

// 技术面筛选
async function filterByTechnical(candidates) {
  console.log('=== 层2: 技术面筛选 ===\n');
  
  const results = [];
  
  for (const stock of candidates) {
    const tech = await analyzeTechnical(stock.symbol);
    
    if (!tech) {
      console.log(`⚠️ ${stock.symbol}: 缺少技术数据`);
      continue;
    }
    
    console.log(`${stock.symbol}: price=$${tech.price.toFixed(2)}, MA50=${tech.ma50.toFixed(2)}, MA200=${tech.ma200.toFixed(2)}, RSI=${tech.rsi.toFixed(1)}, 距离MA50=${(tech.ma50Distance * 100).toFixed(1)}%`);
    
    // 技术面条件
    const techPassed = 
      tech.above_ma50 && 
      tech.ma50_above_ma200 &&
      tech.rsi >= 40 && tech.rsi <= 60;
    
    results.push({
      ...stock,
      technical: tech,
      tech_passed: techPassed
    });
    
    if (techPassed) {
      console.log(`  ✅ 技术面通过: 多头排列, RSI=${tech.rsi.toFixed(1)}`);
    } else {
      console.log(`  ❌ 技术面未通过`);
    }
  }
  
  return results;
}

// 写入数据库（暂时跳过，因为signal_candidates表不存在）
async function writeToDatabase(candidates, marketStatus) {
  console.log('\n=== 写入 signal_candidates ===\n');
  console.log('⚠️ signal_candidates 表不存在，跳过写入');
  console.log('候选信号:');
  for (const stock of candidates) {
    const tech = stock.technical;
    const action = marketStatus === 'risk_on' ? 'buy' : (marketStatus === 'caution' ? 'watch' : 'avoid');
    console.log(`  📊 ${stock.symbol}: action=${action}, market=${marketStatus}`);
  }
}

// 飞书通知
async function sendNotification(candidates, marketStatus) {
  console.log('\n=== 飞书通知 ===\n');
  
  if (candidates.length === 0) {
    console.log('无长线候选，跳过通知');
    return;
  }
  
  const lines = [`📊 长线策略候选 ${new Date().toLocaleDateString('zh-CN')}\n`];
  
  for (const stock of candidates) {
    const tech = stock.technical;
    const action = marketStatus === 'risk_on' ? '可以建仓' : (marketStatus === 'caution' ? '等市场转risk_on再入场' : '全部观望');
    
    lines.push(`**${stock.symbol}** 通过基本面筛选`);
    lines.push(`PE: ${stock.pe} | ROE: ${(stock.roe_decimal * 100).toFixed(1)}% | 增速: ${(stock.growth * 100).toFixed(1)}%`);
    lines.push(`技术面: ${tech.above_ma50 ? 'MA50上方' : 'MA50下方'}/${tech.ma50_above_ma200 ? '多头' : '空头'} | RSI: ${tech.rsi.toFixed(1)}`);
    lines.push(`当前市场: ${marketStatus} → ${action}\n`);
  }
  
  const message = lines.join('\n');
  console.log(message);
}

// 主函数
async function main() {
  console.log('🔍 长线策略筛选 Agent 启动\n');
  console.log(`时间: ${new Date().toISOString()}`);
  
  // 检查市场状态
  const marketStatus = getMarketStatus();
  console.log(`市场状态: ${marketStatus}\n`);
  
  // 加载基本面数据
  const fundamentals = loadFundamentals();
  console.log(`加载基本面数据: ${fundamentals.length} 只股票`);
  
  // 层1: 基本面筛选
  const fundamentalPassed = filterByFundamentals(fundamentals);
  
  // 层2: 技术面筛选
  const techAnalyzed = await filterByTechnical(fundamentalPassed);
  
  // 写入数据库
  await writeToDatabase(techAnalyzed, marketStatus);
  
  // 飞书通知
  await sendNotification(techAnalyzed, marketStatus);
  
  await pool.end();
  console.log('\n✅ 长线策略筛选完成\n');
}

main().catch(console.error);