import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';

interface AlphaVantageNewsItem {
  title: string;
  url: string;
  time_published: string;
  summary: string;
  source: string;
  ticker_sentiment?: Array<{ ticker: string; relevance_score: string }>;
}

interface AlphaVantageNewsResponse {
  feed?: AlphaVantageNewsItem[];
  Information?: string;
}

interface AlphaVantageQuoteResponse {
  'Global Quote'?: {
    '05. price'?: string;
  };
}

function parseAlphaVantageDate(s: string): Date {
  // Format: 20241201T103045
  const year = parseInt(s.slice(0, 4));
  const month = parseInt(s.slice(4, 6)) - 1;
  const day = parseInt(s.slice(6, 8));
  const hour = parseInt(s.slice(9, 11));
  const min = parseInt(s.slice(11, 13));
  const sec = parseInt(s.slice(13, 15));
  return new Date(Date.UTC(year, month, day, hour, min, sec));
}

function buildTimeFrom(): string {
  const d = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

export async function fetchUSStockNews(): Promise<Partial<NewsItem>[]> {
  const apiKey = config.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    logger.warn('ALPHA_VANTAGE_API_KEY not set, skipping US stock news fetch');
    return [];
  }

  const tickers = config.NEWS_SYMBOLS_US.join(',');
  const timeFrom = buildTimeFrom();
  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${tickers}&time_from=${timeFrom}&limit=20&apikey=${apiKey}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as AlphaVantageNewsResponse;

    if (data.Information) {
      logger.warn(`Alpha Vantage rate limit: ${data.Information}`);
      return [];
    }

    const feed = data.feed ?? [];
    return feed.slice(0, 20).map((item): Partial<NewsItem> => ({
      source: 'alpha_vantage',
      externalId: item.url,
      title: item.title,
      content: item.summary,
      url: item.url,
      market: 'us',
      symbols: (item.ticker_sentiment ?? [])
        .filter(t => parseFloat(t.relevance_score) > 0.3)
        .map(t => t.ticker),
      triggerType: 'news',
      aiProcessed: false,
      publishedAt: parseAlphaVantageDate(item.time_published),
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`fetchUSStockNews failed: ${msg}`);
    return [];
  }
}

export async function getUSStockPrice(symbol: string): Promise<number | null> {
  const apiKey = config.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as AlphaVantageQuoteResponse;
    const priceStr = data['Global Quote']?.['05. price'];
    if (!priceStr) return null;

    const price = parseFloat(priceStr);
    return isFinite(price) && price > 0 ? price : null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`getUSStockPrice(${symbol}) failed: ${msg}`);
    return null;
  }
}
