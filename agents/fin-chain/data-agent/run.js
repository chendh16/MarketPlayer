/**
 * data-agent - 市场数据收集 Agent (简化版，不依赖外部数据库模块)
 * 职责：
 * 1. 从 data/cache/klines/ 读取股票历史数据
 * 2. 格式化成标准 JSON 输出
 * 3. 写入本地 JSON 文件作为信号候选
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data/cache/klines');
const OUTPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/data-agent/output.json');

// 股票池配置
const STOCK_POOL = {
  '美股': ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META'],
  'A股': ['600519', '000858', '300750', '601318', '000333'],
  '港股': ['0700', '9988', '9999', 'JD', '6690']
};

// 读取 K线数据
function loadKlines(symbol, market) {
  let fileName;
  if (market === '美股') {
    fileName = `us_${symbol}.json`;
  } else if (market === '港股') {
    fileName = `hk_${symbol}.json`;
  } else {
    fileName = `cn_${symbol}.json`;
  }
  
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return data.klines || data || [];
}

// 获取最新的技术指标
function getLatestIndicators(klines) {
  if (klines.length === 0) return null;
  
  const latest = klines[klines.length - 1];
  const prev = klines.length >= 2 ? klines[klines.length - 2] : latest;
  
  const prices = klines.slice(-30).map(k => parseFloat(k.close));
  const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const ma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
  
  const volNow = parseFloat(latest.volume);
  const volPrev = parseFloat(prev.volume);
  const volChange = volPrev > 0 ? (volNow - volPrev) / volPrev : 0;
  
  const priceChange = parseFloat(latest.close) - parseFloat(prev.close);
  const priceChangePct = prev.close > 0 ? priceChange / parseFloat(prev.close) : 0;
  
  let gains = 0, losses = 0;
  for (let i = Math.max(0, klines.length - 15); i < klines.length - 1; i++) {
    const change = parseFloat(klines[i + 1].close) - parseFloat(klines[i].close);
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
  const rsi = 100 - (100 / (1 + rs));
  
  return {
    timestamp: latest.time || latest.date,
    close: parseFloat(latest.close),
    open: parseFloat(latest.open),
    high: parseFloat(latest.high),
    low: parseFloat(latest.low),
    volume: volNow,
    ma5, ma10, ma20,
    rsi,
    priceChange,
    priceChangePct,
    volumeChange: volChange
  };
}

// 主函数
async function main() {
  const market = process.argv[2] || '美股';
  const symbols = STOCK_POOL[market] || STOCK_POOL['美股'];
  
  console.log(`[data-agent] 正在收集 ${market} 市场数据...`);
  
  const result = {
    type: 'market_data',
    market,
    data_type: 'price',
    symbols: [],
    data: {},
    quality_flag: 'ok',
    timestamp: new Date().toISOString()
  };
  
  const candidates = [];  // 信号候选
  let dataCount = 0;
  let errorCount = 0;
  
  for (const symbol of symbols) {
    const klines = loadKlines(symbol, market);
    
    if (klines.length === 0) {
      console.log(`[data-agent] 警告: 无法加载 ${symbol} 数据`);
      errorCount++;
      continue;
    }
    
    const indicators = getLatestIndicators(klines);
    
    result.symbols.push(symbol);
    result.data[symbol] = {
      kline_count: klines.length,
      latest: indicators
    };
    
    dataCount++;
    
    // 自动生成 intel_collected 信号候选
    if (indicators) {
      const reasonTags = [];
      let confidence = 0;
      const direction = indicators.priceChangePct >= 0 ? 'call' : 'put';
      
      // 检测放量
      if (indicators.volumeChange > 0.5) {
        reasonTags.push('放量');
        confidence += 0.15;
      }
      
      // 检测突破20日高点
      const highs = klines.slice(-20).map(k => parseFloat(k.high));
      const high20 = Math.max(...highs);
      if (indicators.close >= high20) {
        reasonTags.push('突破20日高点');
        confidence += 0.3;
      }
      
      // 检测多头排列
      if (indicators.ma5 > indicators.ma10 && indicators.ma10 > indicators.ma20) {
        reasonTags.push('均线多头');
        confidence += 0.15;
      }
      
      // 检测 RSI 超卖
      if (indicators.rsi < 35) {
        reasonTags.push('RSI超卖');
        confidence += 0.15;
      }
      
      // 检测 RSI 超买
      if (indicators.rsi > 65) {
        reasonTags.push('RSI超买');
        confidence += 0.15;
      }
      
      // 检测大跌反弹
      if (indicators.priceChangePct < -0.03) {
        reasonTags.push('大跌反弹');
        confidence += 0.2;
      }
      
      if (reasonTags.length > 0) {
        const candidate = {
          signal_id: `sc_${Date.now()}_${symbol}_${Math.random().toString(36).substr(2, 5)}`,
          symbol,
          market,
          direction,
          confidence: Math.min(confidence, 1),
          reason_tags: reasonTags,
          current_status: 'intel_collected',
          created_by: 'data-agent',
          created_at: new Date().toISOString()
        };
        candidates.push(candidate);
        console.log(`[data-agent] 生成信号: ${symbol} ${direction} conf=${confidence.toFixed(2)} [${reasonTags.join(',')}]`);
      }
    }
  }
  
  result.quality_flag = errorCount > symbols.length / 2 ? 'error' : 
                     errorCount > 0 ? 'warning' : 'ok';
  
  console.log(`[data-agent] 完成: ${dataCount}/${symbols.length} 只股票, ${candidates.length} 个信号候选`);
  
  // 输出到文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    market_data: result,
    candidates: candidates,
    summary: {
      total_symbols: symbols.length,
      loaded: dataCount,
      errors: errorCount,
      candidates_generated: candidates.length
    }
  }, null, 2));
  
  console.log(`[data-agent] 结果已写入 ${OUTPUT_FILE}`);
  
  // 输出 JSON 到 stdout
  console.log('\n---OUTPUT---');
  console.log(JSON.stringify(result, null, 2));
  
  // 打印信号候选摘要
  if (candidates.length > 0) {
    console.log('\n---SIGNAL CANDIDATES---');
    console.log(JSON.stringify(candidates.slice(0, 5), null, 2));
  }
}

main().catch(err => {
  console.error('[data-agent] 错误:', err.message);
  process.exit(1);
});