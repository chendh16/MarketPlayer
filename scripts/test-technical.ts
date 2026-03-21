/**
 * 技术指标测试脚本
 */

import { getHistoryKLine } from '../src/services/market/quote-service';
import { 
  calculateBollingerBands, 
  calculateRSI, 
  calculateMACD,
  determineTrend,
  detectAllPatterns
} from '../src/utils/technical-analysis';

async function testTechnicalIndicators() {
  console.log('🧪 开始测试技术指标...\n');

  // 测试AAPL
  const symbol = 'AAPL';
  const market = 'us';
  
  console.log(`📊 获取 ${symbol} K线数据...`);
  const klines = await getHistoryKLine(symbol, market, '1d', '1mo');
  
  if (klines.length < 20) {
    console.error('❌ 数据不足');
    process.exit(1);
  }
  
  console.log(`✅ 获取 ${klines.length} 根K线\n`);
  
  // 测试 Bollinger Bands
  console.log('=== Bollinger Bands 测试 ===');
  const bb = calculateBollingerBands(klines);
  if (bb) {
    console.log(`上轨: ${bb.bands.upper.toFixed(2)}`);
    console.log(`中轨: ${bb.bands.middle.toFixed(2)}`);
    console.log(`下轨: ${bb.bands.lower.toFixed(2)}`);
    console.log(`带宽: ${(bb.bands.width * 100).toFixed(2)}%`);
    console.log(`评级: ${bb.bands.rating} (${getRatingText(bb.bands.rating)})`);
    console.log(`挤压: ${bb.isSqueeze ? '✅ 是' : '❌ 否'}`);
    console.log(`突破: ${bb.isBreakout ? '✅ 是' : '❌ 否'}\n`);
  }
  
  // 测试 RSI
  console.log('=== RSI 测试 ===');
  const rsi = calculateRSI(klines, 14);
  console.log(`RSI(14): ${rsi.toFixed(2)} (${getRSIText(rsi)})\n`);
  
  // 测试 MACD
  console.log('=== MACD 测试 ===');
  const macd = calculateMACD(klines);
  if (macd) {
    console.log(`MACD: ${macd.macd.toFixed(4)}`);
    console.log(`Signal: ${macd.signal.toFixed(4)}`);
    console.log(`Histogram: ${macd.histogram.toFixed(4)}`);
    console.log(`趋势: ${macd.trend}\n`);
  }
  
  // 测试趋势
  console.log('=== 趋势判断 ===');
  const trend = determineTrend(klines);
  console.log(`趋势: ${trend}\n`);
  
  // 测试形态识别
  console.log('=== K线形态识别 ===');
  const patterns = detectAllPatterns(klines);
  if (patterns.length > 0) {
    patterns.forEach(p => {
      console.log(`- ${p.name}: ${p.description} (强度: ${p.strength})`);
    });
  } else {
    console.log('未识别到形态\n');
  }
  
  console.log('✅ 所有测试通过!');
}

function getRatingText(rating: number): string {
  const texts: Record<number, string> = {
    3: '🔥 Strong Buy - 突破上轨',
    2: '✅ Buy - 上半区',
    1: '⬆️ Weak Buy - 中轨上方',
    0: '➡️ Neutral',
    '-1': '⬇️ Weak Sell',
    '-2': '❌ Sell',
    '-3': '🔥 Strong Sell',
  };
  return texts[rating] || 'Unknown';
}

function getRSIText(rsi: number): string {
  if (rsi >= 70) return '超买';
  if (rsi <= 30) return '超卖';
  return '中性';
}

testTechnicalIndicators().catch(console.error);
