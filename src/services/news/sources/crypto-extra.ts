/**
 * 加密货币扩展数据源
 *
 * 补充现有 CoinGecko/CoinDesk，从 Cointelegraph 和 The Block 抓取加密货币新闻。
 */

import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';

function extractTextRSS(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

async function fetchCryptoRSS(
  feedUrl: string,
  sourceName: string,
  limit: number = 20,
): Promise<Partial<NewsItem>[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
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
        market: 'btc',
        symbols: ['BTC'],
        triggerType: 'news',
        aiProcessed: false,
        publishedAt: pubDate ? new Date(pubDate) : new Date(),
      });
    }

    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`fetchCryptoRSS(${sourceName}) failed: ${msg}`);
    return [];
  }
}

export async function fetchCryptoExtraNews(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching extra crypto news from Cointelegraph and The Block...');

  const [cointelegraphItems, theBlockItems] = await Promise.all([
    fetchCryptoRSS('https://cointelegraph.com/rss', 'cointelegraph', 20),
    fetchCryptoRSS('https://www.theblock.co/rss.xml', 'theblock', 20),
  ]);

  const seen = new Set<string>();
  const combined: Partial<NewsItem>[] = [];

  for (const item of [...cointelegraphItems, ...theBlockItems]) {
    const key = item.externalId ?? item.title ?? '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    combined.push(item);
    if (combined.length >= 20) break;
  }

  logger.info(`fetchCryptoExtraNews: returning ${combined.length} items`);
  return combined;
}
