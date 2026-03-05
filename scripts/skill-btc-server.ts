/**
 * BTC Skill 服务器
 *
 * 实现 Skill adapter 协议，通过 CoinGecko API 抓取 BTC 资讯。
 * 可选 API key，无 key 时自动降级到 CoinDesk RSS。
 *
 * 用法: npx ts-node scripts/skill-btc-server.ts
 *       默认端口 3104，可通过 SKILL_BTC_PORT 环境变量覆盖
 *
 * 接口：
 *   POST /
 *   Body: { skill, action: "fetchNews", parameters: { market, limit? } }
 *   Response: { items: NewsItem[], metadata: {} }
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { NewsItem } from '../src/models/signal';

const PORT = parseInt(process.env.SKILL_BTC_PORT ?? '3104', 10);

// ─── CoinGecko API ───────────────────────────────────────────────────────────

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

async function fetchCoinGeckoNews(limit = 10): Promise<Partial<NewsItem>[]> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  const apiKey = process.env.COINGECKO_API_KEY;
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/news?page=1', {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json() as CoinGeckoNewsResponse;
    const items: CoinGeckoNewsItem[] = json.data ?? json.news ?? [];

    const results = items.slice(0, limit).map((item): Partial<NewsItem> => ({
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

    console.log(`[Skill-BTC] CoinGecko: ${results.length} items`);
    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Skill-BTC] CoinGecko failed: ${msg}, trying CoinDesk RSS fallback`);
    return fetchCoinDeskRSS(limit);
  }
}

// ─── CoinDesk RSS Fallback ───────────────────────────────────────────────────

function extractText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  return xml.match(re)?.[1]?.trim() ?? '';
}

async function fetchCoinDeskRSS(limit = 10): Promise<Partial<NewsItem>[]> {
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

    while ((match = itemRe.exec(xml)) !== null && results.length < limit) {
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

    console.log(`[Skill-BTC] CoinDesk RSS: ${results.length} items`);
    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Skill-BTC] CoinDesk RSS also failed: ${msg}`);
    return [];
  }
}

// ─── Express 服务器 ──────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/** Skill 协议入口 */
app.post('/', async (req, res) => {
  const { action, parameters } = req.body ?? {};
  console.log(`[Skill-BTC] action=${action} market=${parameters?.market}`);

  if (action !== 'fetchNews') {
    res.status(400).json({ error: `Unsupported action: ${action}` });
    return;
  }
  if (parameters?.market !== 'btc') {
    res.json({ items: [], metadata: { note: `market ${parameters?.market} not supported` } });
    return;
  }

  try {
    const limit: number = parameters?.limit ?? 10;
    const items = await fetchCoinGeckoNews(limit);
    console.log(`[Skill-BTC] Returning ${items.length} BTC items`);
    res.json({ items, metadata: { source: 'coingecko_or_coindesk', fetchedAt: new Date() } });
  } catch (err: any) {
    console.error('[Skill-BTC] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'btc-skill' }));

app.listen(PORT, () => {
  console.log(`\n✅ BTC Skill 服务器运行中 → http://localhost:${PORT}`);
  console.log(`   协议: POST /  body: { action:"fetchNews", parameters:{market:"btc"} }`);
  console.log(`   数据源: CoinGecko API → CoinDesk RSS（自动降级）\n`);
});
