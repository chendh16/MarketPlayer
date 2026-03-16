/**
 * 产业链因子回测脚本
 * 使用历史新闻 + 历史K线进行回测
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAllStockCodes } from '../src/services/news/analysis/industry-data';
import { identifyIndustry, processIndustryChain } from '../src/services/news/analysis/industry-chain';
import { detectEvent } from '../src/services/news/analysis/event-detector';
import { analyzeWithEvent } from '../src/services/news/analysis/sentiment-analyzer';

interface KLine {
  date: string;
  close: number;
}

interface StockData {
  symbol: string;
  market: 'a' | 'hk' | 'us';
  klines: KLine[];
}

/**
 * 加载K线数据
 */
function loadKLines(symbol: string, market: 'a' | 'hk' | 'us'): KLine[] {
  const filePath = path.join(
    __dirname, 
    `../data/cache/klines/${market}_${symbol}.json`
  );
  
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data.klines || [];
  } catch {
    return [];
  }
}

/**
 * 加载所有K线数据
 */
function loadAllKLines(): Map<string, KLine[]> {
  const klinesMap = new Map<string, KLine[]>();
  
  // A股产业链股票
  const aStocks = ['600519', '000858', '300750', '002594', '002460', '600276', '000002', '600048'];
  
  // 港股产业链股票
  const hkStocks = ['00700', '09988', '03690', '01810'];
  
  // 美股产业链股票
  const usStocks = ['AAPL', 'MSFT', 'GOOG', 'TSLA', 'NVDA'];
  
  for (const s of aStocks) {
    const data = loadKLines(s, 'a');
    if (data.length > 0) klinesMap.set(`a_${s}`, data);
  }
  
  for (const s of hkStocks) {
    const data = loadKLines(s, 'hk');
    if (data.length > 0) klinesMap.set(`hk_${s}`, data);
  }
  
  for (const s of usStocks) {
    const data = loadKLines(s, 'us');
    if (data.length > 0) klinesMap.set(`us_${s}`, data);
  }
  
  return klinesMap;
}

/**
 * 历史新闻数据（模拟）
 */
interface HistoricalNews {
  date: string;
  title: string;
  content: string;
  expectedIndustry: string;
}

// 模拟历史新闻（实际应从数据库读取）
const HISTORICAL_NEWS: HistoricalNews[] = [
  {
    date: '2024-01-15',
    title: '国务院：延续新能源汽车购置税减免政策',
    content: '国务院常务会议确定，将新能源汽车购置税减免政策延续至2027年底',
    expectedIndustry: '新能源汽车'
  },
  {
    date: '2024-02-01',
    title: '宁德时代：预计2024年净利润同比增长30%',
    content: '宁德时代发布业绩预告，预计全年净利润同比增长30%-40%',
    expectedIndustry: '新能源汽车'
  },
  {
    date: '2024-02-15',
    title: '恒瑞医药：创新药获批上市',
    content: '恒瑞医药自主研发的创新药获得国家药监局批准上市',
    expectedIndustry: '医药生物'
  },
  {
    date: '2024-03-01',
    title: '房地产：多地放松限购政策',
    content: '多个城市出台房地产放松政策，取消限购措施',
    expectedIndustry: '房地产'
  },
  {
    date: '2024-03-10',
    title: '茅台：上调出厂价格',
    content: '贵州茅台宣布上调飞天茅台出厂价格，平均涨幅10%',
    expectedIndustry: '食品饮料'
  },
  {
    date: '2024-03-20',
    title: '半导体：国产芯片取得突破',
    content: '国内半导体企业传来好消息，多款芯片实现国产化突破',
    expectedIndustry: '半导体'
  },
  {
    date: '2024-04-01',
    title: '新能源汽车：销量大幅增长',
    content: '中汽协数据显示，新能源汽车销量同比增长40%',
    expectedIndustry: '新能源汽车'
  },
  {
    date: '2024-04-15',
    title: '医药：创新药企获得融资',
    content: '多家创新药企获得大额融资，行业前景看好',
    expectedIndustry: '医药生物'
  },
  {
    date: '2024-05-01',
    title: '房地产：房贷利率下调',
    content: '央行下调房贷利率，首套房利率降至3.5%',
    expectedIndustry: '房地产'
  },
  {
    date: '2024-05-15',
    title: '消费：食品饮料提价潮',
    content: '多家食品饮料企业宣布提价，通胀预期推动',
    expectedIndustry: '食品饮料'
  },
];

/**
 * 计算 Forward Return
 */
function calculateForwardReturn(klines: KLine[], startIdx: number, days: number): number {
  if (startIdx < 0 || startIdx + days >= klines.length) return 0;
  
  const startPrice = klines[startIdx].close;
  const endPrice = klines[startIdx + days].close;
  
  return (endPrice - startPrice) / startPrice * 100;
}

/**
 * 找到最近的K线索引
 */
function findKLineIndex(klines: KLine[], targetDate: string): number {
  const target = new Date(targetDate);
  
  for (let i = 0; i < klines.length; i++) {
    const date = new Date(klines[i].date);
    if (date >= target) {
      return Math.min(i, klines.length - 1);
    }
  }
  
  return klines.length - 1;
}

/**
 * 运行回测
 */
function runBacktest() {
  console.log('='.repeat(70));
  console.log('          🧪 产业链因子历史回测');
  console.log('='.repeat(70));
  
  // 加载K线数据
  const klinesMap = loadAllKLines();
  
  console.log(`\n📊 加载K线数据: ${klinesMap.size} 只股票`);
  
  if (klinesMap.size === 0) {
    console.log('⚠️ 无K线数据，请先运行数据获取脚本');
    return;
  }
  
  // 显示数据范围
  for (const [key, klines] of klinesMap) {
    if (klines.length > 0) {
      console.log(`   ${key}: ${klines[0].date} ~ ${klines[klines.length-1].date} (${klines.length}天)`);
      break;
    }
  }
  
  // 回测结果
  const results: Array<{
    newsDate: string;
    title: string;
    industry: string;
    symbol: string;
    factor: number;
    forwardReturn: number;
    correct: boolean;
  }> = [];
  
  console.log('\n' + '-'.repeat(70));
  console.log('                    📈 回测详情');
  console.log('-'.repeat(70));
  
  // 遍历历史新闻
  for (const news of HISTORICAL_NEWS) {
    // 模拟新闻对象
    const newsObj = {
      id: `hist-${news.date}`,
      title: news.title,
      content: news.content,
      source: '模拟数据',
      market: 'a' as const,
      publishedAt: new Date(news.date),
      createdAt: new Date(news.date),
      aiProcessed: false,
    };
    
    // 行业识别
    const industries = identifyIndustry(newsObj);
    
    if (industries.length === 0) {
      console.log(`\n⚠️ ${news.date} ${news.title.substring(0,20)}... - 无法识别行业`);
      continue;
    }
    
    const matchedIndustry = industries[0];
    
    // 情感分析
    const sentiment = analyzeWithEvent(newsObj);
    
    // 获取产业链股票
    const chainResult = processIndustryChain(newsObj);
    
    console.log(`\n📰 ${news.date} | ${news.title.substring(0,30)}...`);
    console.log(`   行业: ${matchedIndustry.industry.name} | 情感: ${sentiment.score.toFixed(2)}`);
    
    // 对每只产业链股票计算收益
    for (const stock of chainResult.chainStocks.slice(0, 5)) {
      const key = `a_${stock.code}`;
      const klines = klinesMap.get(key);
      
      if (!klines || klines.length === 0) continue;
      
      // 找到新闻发布日期的K线索引
      const startIdx = findKLineIndex(klines, news.date);
      
      // 计算5天后的收益
      const forwardReturn = calculateForwardReturn(klines, startIdx, 5);
      
      // 判断因子方向是否正确
      const correct = (sentiment.score > 0 && forwardReturn > 0) || 
                      (sentiment.score < 0 && forwardReturn < 0);
      
      results.push({
        newsDate: news.date,
        title: news.title,
        industry: matchedIndustry.industry.name,
        symbol: stock.code,
        factor: sentiment.score * stock.coefficient,
        forwardReturn,
        correct,
      });
      
      const emoji = correct ? '✅' : '❌';
      console.log(`   ${emoji} ${stock.code} | 因子:${(sentiment.score * stock.coefficient).toFixed(2)} | 5日收益:${forwardReturn.toFixed(2)}%`);
    }
  }
  
  // 汇总统计
  console.log('\n' + '='.repeat(70));
  console.log('                    📊 回测汇总');
  console.log('='.repeat(70));
  
  if (results.length === 0) {
    console.log('⚠️ 无有效回测结果');
    return;
  }
  
  // 计算IC
  const avgFactor = results.reduce((sum, r) => sum + r.factor, 0) / results.length;
  const avgReturn = results.reduce((sum, r) => sum + r.forwardReturn, 0) / results.length;
  
  // 简化的IC计算
  let correlationSum = 0;
  for (const r of results) {
    correlationSum += (r.factor - avgFactor) * (r.forwardReturn - avgReturn);
  }
  const factorVar = results.reduce((sum, r) => sum + Math.pow(r.factor - avgFactor, 2), 0);
  const returnVar = results.reduce((sum, r) => sum + Math.pow(r.forwardReturn - avgFactor, 2), 0);
  
  const ic = factorVar > 0 && returnVar > 0 
    ? correlationSum / Math.sqrt(factorVar * returnVar) 
    : 0;
  
  const correctCount = results.filter(r => r.correct).length;
  const winRate = correctCount / results.length * 100;
  
  console.log(`\n📈 样本数量: ${results.length}`);
  console.log(`📈 平均因子: ${avgFactor.toFixed(3)}`);
  console.log(`📈 平均收益: ${avgReturn.toFixed(2)}%`);
  console.log(`📈 IC (因子-收益相关性): ${ic.toFixed(3)}`);
  console.log(`📈 胜率: ${winRate.toFixed(1)}% (${correctCount}/${results.length})`);
  
  // 按行业统计
  console.log('\n📊 分行业统计:');
  const industryStats = new Map<string, { count: number; correct: number; avgReturn: number }>();
  
  for (const r of results) {
    if (!industryStats.has(r.industry)) {
      industryStats.set(r.industry, { count: 0, correct: 0, avgReturn: 0 });
    }
    const stat = industryStats.get(r.industry)!;
    stat.count++;
    if (r.correct) stat.correct++;
    stat.avgReturn += r.forwardReturn;
  }
  
  for (const [ind, stat] of industryStats) {
    const rate = stat.count > 0 ? stat.correct / stat.count * 100 : 0;
    const avg = stat.count > 0 ? stat.avgReturn / stat.count : 0;
    console.log(`   ${ind}: ${stat.count}样本 | 胜率:${rate.toFixed(0)}% | 平均收益:${avg.toFixed(1)}%`);
  }
  
  // 结论
  console.log('\n' + '='.repeat(70));
  console.log('                    📋 结论');
  console.log('='.repeat(70));
  
  if (ic > 0.02) {
    console.log('✅ IC > 0.02, 因子有效');
  } else if (ic > 0) {
    console.log('⚠️ IC > 0 但 < 0.02, 因子有一定预测能力，但较弱');
  } else {
    console.log('❌ IC <= 0, 因子无效或需要调优');
  }
  
  if (winRate > 55) {
    console.log('✅ 胜率 > 55%, 策略有效');
  } else if (winRate > 50) {
    console.log('⚠️ 胜率 50-55%, 接近随机，需优化');
  } else {
    console.log('❌ 胜率 < 50%, 策略偏向亏损');
  }
  
  console.log('\n⚠️ 注意: 此为简化回测，样本量较小，需更多数据验证');
}

// 运行
runBacktest();
