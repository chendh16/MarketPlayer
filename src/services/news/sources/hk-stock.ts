import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';

const HK_SYMBOLS = ['0700.HK', '9988.HK', '3690.HK', '1299.HK', '2318.HK', '0941.HK', '0388.HK', '1810.HK'];

function extractText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function parseRSSItems(xml: string, symbol: string): Partial<NewsItem>[] {
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const results: Partial<NewsItem>[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const title = extractText(block, 'title');
    const link = extractText(block, 'link') || extractText(block, 'guid');
    const pubDate = extractText(block, 'pubDate');
    const description = extractText(block, 'description');

    if (!title || !link) continue;

    results.push({
      source: 'yahoo_finance_hk',
      externalId: link,
      title,
      content: description || undefined,
      url: link,
      market: 'hk',
      symbols: [symbol.replace('.HK', '')],
      triggerType: 'news',
      aiProcessed: false,
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
    });
  }
  return results;
}

async function fetchSymbolRSS(symbol: string): Promise<Partial<NewsItem>[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=HK&lang=zh-Hant-HK`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRSSItems(xml, symbol);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`fetchSymbolRSS(${symbol}) failed: ${msg}`);
    return [];
  }
}

export async function fetchHKStockNews(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching HK stock news via Yahoo Finance RSS...');

  const results = await Promise.allSettled(HK_SYMBOLS.map(fetchSymbolRSS));

  const all: Partial<NewsItem>[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const item of r.value) {
        const key = item.url ?? item.externalId ?? item.title ?? '';
        if (key && !seen.has(key)) {
          seen.add(key);
          all.push(item);
        }
      }
    }
  }

  logger.info(`Fetched ${all.length} HK news items`);
  return all.slice(0, 30);
}

export async function getHKStockPrice(symbol: string): Promise<number | null> {
  const ticker = symbol.includes('.') ? symbol : `${symbol}.HK`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price != null && isFinite(price) && price > 0 ? price : null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`getHKStockPrice(${symbol}) failed: ${msg}`);
    return null;
  }
}
