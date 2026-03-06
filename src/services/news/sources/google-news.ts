/**
 * Google News RSS 数据源
 *
 * 核心用途：绕过 Bloomberg/WSJ/FT 等对云服务器 IP 的封锁，
 * 通过 Google News RSS 代理获取这些高质量来源的聚合内容。
 *
 * URL 格式：https://news.google.com/rss/search?q={query}&hl={lang}&gl={country}&ceid={country}:{lang}
 */

import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';

function extractTextRSS(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

async function fetchGoogleNewsRSS(
  query: string,
  market: string,
  symbols: string[],
  hl: string,
  gl: string,
  limit: number = 15,
): Promise<Partial<NewsItem>[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split('-')[0]}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
        source: 'google_news',
        externalId: link,
        title,
        content: description || undefined,
        url: link,
        market,
        symbols,
        triggerType: 'news',
        aiProcessed: false,
        publishedAt: pubDate ? new Date(pubDate) : new Date(),
      });
    }

    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`fetchGoogleNewsRSS(${query.slice(0, 40)}) failed: ${msg}`);
    return [];
  }
}

// ─── 美股：聚合 Reuters/CNBC/Bloomberg/MarketWatch via Google News ─────────────

const US_QUERIES = [
  { q: 'reuters markets finance stock', hl: 'en-US', gl: 'US' },
  { q: 'cnbc stock market wall street', hl: 'en-US', gl: 'US' },
  { q: 'bloomberg stock market finance', hl: 'en-US', gl: 'US' },
  { q: 'marketwatch stocks trading', hl: 'en-US', gl: 'US' },
];

export async function fetchUSMarketNewsViaGoogle(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching US market news via Google News RSS...');

  const batches = await Promise.allSettled(
    US_QUERIES.map(({ q, hl, gl }) => fetchGoogleNewsRSS(q, 'us', [], hl, gl, 10)),
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

  logger.info(`Fetched ${all.length} US market news items via Google News`);
  return all.slice(0, 30);
}

// ─── 港股：英文 + 繁体中文并发 ────────────────────────────────────────────────

const HK_QUERIES = [
  { q: 'Hong Kong stock market Hang Seng', hl: 'en-US', gl: 'US' },
  { q: '港股 恒生指数 股市', hl: 'zh-HK', gl: 'HK' },
  { q: 'Hong Kong finance tencent alibaba business', hl: 'en-US', gl: 'HK' },
];

export async function fetchHKMarketNewsViaGoogle(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching HK market news via Google News RSS...');

  const batches = await Promise.allSettled(
    HK_QUERIES.map(({ q, hl, gl }) => fetchGoogleNewsRSS(q, 'hk', [], hl, gl, 10)),
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

  logger.info(`Fetched ${all.length} HK market news items via Google News`);
  return all.slice(0, 25);
}

// ─── A股：简体中文 ─────────────────────────────────────────────────────────────

const A_QUERIES = [
  { q: 'A股 上证 深证 股票 财经', hl: 'zh-CN', gl: 'CN' },
  { q: '沪深 股市 财经新闻 上市公司', hl: 'zh-CN', gl: 'CN' },
  { q: '中国股市 A股 投资', hl: 'zh-CN', gl: 'CN' },
];

export async function fetchAStockNewsViaGoogle(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching A-stock news via Google News RSS...');

  const batches = await Promise.allSettled(
    A_QUERIES.map(({ q, hl, gl }) => fetchGoogleNewsRSS(q, 'a', [], hl, gl, 10)),
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

  logger.info(`Fetched ${all.length} A-stock news items via Google News`);
  return all.slice(0, 25);
}
