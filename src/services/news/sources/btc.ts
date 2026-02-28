import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';

interface CoinGeckoNewsItem {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  url?: string;
  updated_at?: number;
}

interface CoinGeckoNewsResponse {
  data?: CoinGeckoNewsItem[];
  news?: CoinGeckoNewsItem[];
}

interface CoinGeckoPriceResponse {
  bitcoin?: { usd?: number };
}

export async function fetchBTCNews(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching BTC news via CoinGecko...');

  const headers: Record<string, string> = { 'Accept': 'application/json' };
  const apiKey = config.COINGECKO_API_KEY;
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/news?page=1', {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json() as CoinGeckoNewsResponse;
    const items: CoinGeckoNewsItem[] = json.data ?? json.news ?? [];

    const results = items.slice(0, 10).map((item): Partial<NewsItem> => ({
      source: 'coingecko',
      externalId: item.id ?? item.slug ?? item.url ?? item.title,
      title: item.title ?? '',
      content: item.description ?? undefined,
      url: item.url ?? undefined,
      market: 'btc',
      symbols: ['BTC'],
      triggerType: 'news',
      aiProcessed: false,
      publishedAt: item.updated_at ? new Date(item.updated_at * 1000) : new Date(),
    }));

    logger.info(`Fetched ${results.length} BTC news items from CoinGecko`);
    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`CoinGecko news failed: ${msg}, trying CoinDesk RSS fallback`);
    return fetchBTCNewsFallback();
  }
}

async function fetchBTCNewsFallback(): Promise<Partial<NewsItem>[]> {
  try {
    const res = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xml = await res.text();
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    const results: Partial<NewsItem>[] = [];
    let match: RegExpExecArray | null;

    const extractText = (block: string, tag: string): string => {
      const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      const m = block.match(re);
      return m ? m[1].trim() : '';
    };

    while ((match = itemRe.exec(xml)) !== null && results.length < 10) {
      const block = match[1];
      const title = extractText(block, 'title');
      const link = extractText(block, 'link') || extractText(block, 'guid');
      const pubDate = extractText(block, 'pubDate');
      const description = extractText(block, 'description');

      if (!title) continue;

      results.push({
        source: 'coindesk_rss',
        externalId: link || title,
        title,
        content: description || undefined,
        url: link || undefined,
        market: 'btc',
        symbols: ['BTC'],
        triggerType: 'news',
        aiProcessed: false,
        publishedAt: pubDate ? new Date(pubDate) : new Date(),
      });
    }

    logger.info(`Fetched ${results.length} BTC news items from CoinDesk RSS`);
    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`BTC RSS fallback also failed: ${msg}`);
    return [];
  }
}

export async function getBTCPrice(): Promise<number | null> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  const apiKey = config.COINGECKO_API_KEY;
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as CoinGeckoPriceResponse;
    const price = data.bitcoin?.usd;
    return price != null && isFinite(price) && price > 0 ? price : null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`getBTCPrice failed: ${msg}`);
    return null;
  }
}
