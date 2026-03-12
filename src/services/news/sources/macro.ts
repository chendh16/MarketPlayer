/**
 * 宏观经济数据源（新市场分类：'macro'）
 *
 * 来源：
 * - 美联储新闻稿 RSS
 * - ECB（欧央行）新闻稿 RSS
 * - IMF 博客 RSS
 * - Google News 宏观主题聚合
 */

import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';

function extractTextRSS(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

async function fetchMacroRSS(
  feedUrl: string,
  sourceName: string,
  symbols: string[],
  limit: number = 15,
): Promise<Partial<NewsItem>[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xml = await res.text();
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const results: Partial<NewsItem>[] = [];
    let match: RegExpExecArray | null;

    while ((match = itemRe.exec(xml)) !== null && results.length < limit) {
      const block = match[1];
      const title = extractTextRSS(block, 'title');
      const link = extractTextRSS(block, 'link') || extractTextRSS(block, 'guid');
      const pubDate = extractTextRSS(block, 'pubDate');
      const description = extractTextRSS(block, 'description');
      if (!title || !link) continue;

      results.push({
        source: sourceName,
        externalId: link,
        title,
        content: description || undefined,
        url: link,
        market: 'macro',
        symbols,
        triggerType: 'news',
        aiProcessed: false,
        publishedAt: pubDate ? new Date(pubDate) : new Date(),
      });
    }

    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`fetchMacroRSS(${sourceName}) failed: ${msg}`);
    return [];
  }
}

const MACRO_SOURCES = [
  {
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    name: 'federal_reserve',
    symbols: ['USD'],
    limit: 10,
  },
  {
    url: 'https://www.ecb.europa.eu/rss/pressrelease.en.rss',
    name: 'ecb',
    symbols: ['EUR'],
    limit: 10,
  },
  {
    url: 'https://www.imf.org/en/News/rss',
    name: 'imf',
    symbols: [],
    limit: 8,
  },
  {
    url: 'https://news.google.com/rss/search?q=central+bank+interest+rate+monetary+policy&hl=en-US&gl=US&ceid=US:en',
    name: 'google_news_macro',
    symbols: [],
    limit: 10,
  },
  {
    url: 'https://news.google.com/rss/search?q=inflation+GDP+employment+economic+data&hl=en-US&gl=US&ceid=US:en',
    name: 'google_news_economic',
    symbols: [],
    limit: 10,
  },
];

export async function fetchMacroNews(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching macro economic news...');

  const batches = await Promise.allSettled(
    MACRO_SOURCES.map(({ url, name, symbols, limit }) =>
      fetchMacroRSS(url, name, symbols, limit),
    ),
  );

  const seen = new Set<string>();
  const all: Partial<NewsItem>[] = [];

  for (const batch of batches) {
    if (batch.status !== 'fulfilled') continue;
    for (const item of batch.value) {
      const key = item.externalId ?? item.url ?? item.title ?? '';
      if (key && !seen.has(key)) {
        seen.add(key);
        all.push(item);
      }
    }
  }

  logger.info(`fetchMacroNews: returning ${all.length} items`);
  return all.slice(0, 40);
}
