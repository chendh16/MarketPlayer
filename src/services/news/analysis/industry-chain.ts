/**
 * 产业链映射模块
 * 新闻 → 行业识别 → 产业链股票 → 传导影响
 */

import { NewsItem } from '../../../models/signal';
import { INDUSTRY_CHAINS, IndustryChain, StockInfo, getAllIndustries, getAllStockCodes } from './industry-data';
import { detectEvent, DetectedEvent } from './event-detector';
import { analyzeWithEvent, SentimentResult } from './sentiment-analyzer';

export type ChainLevel = 'downstream' | 'midstream' | 'upstream';

export interface IndustryMatch {
  industry: IndustryChain;
  matchedKeywords: string[];
  confidence: number;
}

export interface ChainStock {
  code: string;
  name: string;
  level: ChainLevel;
  coefficient: number;
  impactScore: number;
}

export interface IndustryChainResult {
  newsId: string;
  detectedIndustries: IndustryMatch[];
  chainStocks: ChainStock[];
  timestamp: Date;
}

/**
 * 识别新闻关联的行业
 */
export function identifyIndustry(news: NewsItem | Partial<NewsItem> | string): IndustryMatch[] {
  const text = typeof news === 'string' 
    ? news 
    : `${news.title || ''} ${news.content || ''}`.toLowerCase();

  const matches: IndustryMatch[] = [];
  
  // 遍历所有行业
  for (const industry of getAllIndustries()) {
    const matchedKeywords: string[] = [];
    
    for (const keyword of industry.keywords) {
      const regex = new RegExp(keyword, 'i');
      if (regex.test(text)) {
        matchedKeywords.push(keyword);
      }
    }
    
    if (matchedKeywords.length > 0) {
      // 置信度：匹配的关键词越多，置信度越高
      const confidence = Math.min(1, 0.3 + matchedKeywords.length * 0.15);
      
      matches.push({
        industry,
        matchedKeywords,
        confidence,
      });
    }
  }
  
  // 按置信度排序
  matches.sort((a, b) => b.confidence - a.confidence);
  
  return matches;
}

/**
 * 获取产业链关联的股票
 */
export function getChainStocks(
  industry: IndustryChain,
  sentimentScore: number
): ChainStock[] {
  const stocks: ChainStock[] = [];
  
  // 遍历上中下游
  const levels: ChainLevel[] = ['downstream', 'midstream', 'upstream'];
  
  for (const level of levels) {
    const levelData = industry.chain[level];
    
    for (const stock of levelData.stocks) {
      // 影响得分 = 情感得分 × 传导系数
      const impactScore = sentimentScore * levelData.coefficient;
      
      stocks.push({
        code: stock.code,
        name: stock.name,
        level,
        coefficient: levelData.coefficient,
        impactScore,
      });
    }
  }
  
  return stocks;
}

/**
 * 处理新闻，输出产业链影响
 */
export function processIndustryChain(news: NewsItem): IndustryChainResult {
  // 1. 识别行业
  const industryMatches = identifyIndustry(news);
  
  // 2. 情感分析
  const sentiment = analyzeWithEvent(news);
  
  // 3. 获取产业链股票
  const chainStocks: ChainStock[] = [];
  
  for (const match of industryMatches) {
    const stocks = getChainStocks(match.industry, sentiment.score);
    chainStocks.push(...stocks);
  }
  
  // 4. 按影响得分排序
  chainStocks.sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore));
  
  return {
    newsId: news.id,
    detectedIndustries: industryMatches,
    chainStocks,
    timestamp: new Date(),
  };
}

/**
 * 获取某只股票关联的行业
 */
export function getIndustriesForStock(
  stockCode: string
): IndustryChain[] {
  const results: IndustryChain[] = [];
  
  for (const industry of getAllIndustries()) {
    for (const level of Object.values(industry.chain)) {
      for (const stock of level.stocks) {
        if (stock.code === stockCode) {
          results.push(industry);
          break;
        }
      }
    }
  }
  
  return results;
}

/**
 * 获取某只股票在产业链中的位置和系数
 */
export function getStockPosition(
  stockCode: string,
  industryName: string
): { level: ChainLevel; coefficient: number } | null {
  const industries = getAllIndustries();
  
  for (const industry of industries) {
    if (industry.name !== industryName) continue;
    
    for (const [level, levelData] of Object.entries(industry.chain)) {
      for (const stock of levelData.stocks) {
        if (stock.code === stockCode) {
          return {
            level: level as ChainLevel,
            coefficient: levelData.coefficient,
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * 批量处理新闻，获取产业链影响
 */
export function processNewsBatch(
  newsList: NewsItem[]
): IndustryChainResult[] {
  return newsList.map(news => processIndustryChain(news));
}

/**
 * 聚合多日产业链影响
 */
export function aggregateIndustryImpact(
  results: IndustryChainResult[]
): Map<string, { totalImpact: number; count: number; industries: string[] }> {
  const aggregated = new Map<string, { totalImpact: number; count: number; industries: string[] }>();
  
  for (const result of results) {
    for (const stock of result.chainStocks) {
      const existing = aggregated.get(stock.code);
      
      if (existing) {
        existing.totalImpact += stock.impactScore;
        existing.count += 1;
        for (const ind of result.detectedIndustries) {
          if (!existing.industries.includes(ind.industry.name)) {
            existing.industries.push(ind.industry.name);
          }
        }
      } else {
        aggregated.set(stock.code, {
          totalImpact: stock.impactScore,
          count: 1,
          industries: result.detectedIndustries.map(ind => ind.industry.name),
        });
      }
    }
  }
  
  return aggregated;
}

/**
 * 导出产业链数据供调试
 */
export function exportIndustryData() {
  const industries = getAllIndustries();
  
  console.log('=== 产业链数据 ===');
  console.log(`行业数量: ${industries.length}`);
  console.log(`股票数量: ${getAllStockCodes().length}`);
  
  for (const ind of industries) {
    console.log(`\n【${ind.name}】(${ind.market})`);
    console.log(`  关键词: ${ind.keywords.join(', ')}`);
    
    let stockCount = 0;
    for (const level of Object.values(ind.chain)) {
      stockCount += level.stocks.length;
    }
    console.log(`  股票数: ${stockCount}`);
  }
}
