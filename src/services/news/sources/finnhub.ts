/**
 * Finnhub 数据源
 *
 * Finnhub 提供免费的股票新闻 API（每分钟60次）。
 * 需要 FINNHUB_API_KEY 环境变量（https://finnhub.io/）。
 *
 * 主要接口：
 * - 通用市场新闻：GET https://finnhub.io/api/v1/news?category=general&token={key}
 * - 公司新闻：GET https://finnhub.io/api/v1/company-news?symbol={symbol}&from=...&to=...&token={key}
 */

import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';
import { Market } from '../../../types/market';

interface FinnhubNewsItem {
  id?: number;
  headline?: string;
  summary?: string;
  url?: string;
  source?: string;
  datetime?: number;  // Unix timestamp (秒)
  category?: string;
  related?: string;
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function mapFinnhubItem(item: FinnhubNewsItem, market: Market = 'us'): Partial<NewsItem> {
  return {
    source: 'finnhub',
    externalId: item.id != null ? String(item.id) : (item.url ?? item.headline),
    title: item.headline ?? '',
    content: item.summary || undefined,
    url: item.url || undefined,
    market,
    symbols: item.related ? item.related.split(',').map(s => s.trim()).filter(Boolean) : [],
    triggerType: 'news',
    aiProcessed: false,
    publishedAt: item.datetime ? new Date(item.datetime * 1000) : new Date(),
  };
}

async function fetchFinnhubMarketNews(apiKey: string): Promise<Partial<NewsItem>[]> {
  const url = `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as FinnhubNewsItem[];
    return data.slice(0, 20).map(item => mapFinnhubItem(item));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`fetchFinnhubMarketNews failed: ${msg}`);
    return [];
  }
}

async function fetchFinnhubCompanyNews(apiKey: string): Promise<Partial<NewsItem>[]> {
  const symbols = config.NEWS_SYMBOLS_US.slice(0, 5); // 最多5个 symbol，避免超频
  const to = dateStr(new Date());
  const from = dateStr(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));

  const batches = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${apiKey}`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as FinnhubNewsItem[];
      return data.slice(0, 5).map(item => mapFinnhubItem(item));
    }),
  );

  const results: Partial<NewsItem>[] = [];
  for (const batch of batches) {
    if (batch.status === 'fulfilled') results.push(...batch.value);
  }
  return results;
}

export async function fetchFinnhubNews(): Promise<Partial<NewsItem>[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    logger.debug('FINNHUB_API_KEY not set, skipping Finnhub fetch');
    return [];
  }

  logger.info('Fetching news from Finnhub...');

  const [marketNews, companyNews] = await Promise.all([
    fetchFinnhubMarketNews(apiKey),
    fetchFinnhubCompanyNews(apiKey),
  ]);

  const seen = new Set<string>();
  const combined: Partial<NewsItem>[] = [];

  for (const item of [...marketNews, ...companyNews]) {
    const key = item.externalId ?? item.url ?? item.title ?? '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    combined.push(item);
    if (combined.length >= 30) break;
  }

  logger.info(`fetchFinnhubNews: returning ${combined.length} items`);
  return combined;
}
