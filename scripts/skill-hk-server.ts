/**
 * HK 股 Skill 服务器
 *
 * 实现 Skill adapter 协议，通过 Yahoo Finance RSS 抓取港股资讯。
 * 无需 API key，随时可用。
 *
 * 用法: npx ts-node scripts/skill-hk-server.ts
 *       默认端口 3103，可通过 SKILL_HK_PORT 环境变量覆盖
 *
 * 接口：
 *   POST /
 *   Body: { skill, action: "fetchNews", parameters: { market, symbols?, limit? } }
 *   Response: { items: NewsItem[], metadata: {} }
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { NewsItem } from '../src/models/signal';

const PORT = parseInt(process.env.SKILL_HK_PORT ?? '3103', 10);

// ─── Yahoo Finance RSS 抓取 ──────────────────────────────────────────────────

function extractText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  return xml.match(re)?.[1]?.trim() ?? '';
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
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml, symbol);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Skill-HK] fetchSymbolRSS(${symbol}) failed: ${msg}`);
    return [];
  }
}

async function fetchHKNews(symbols: string[], limit = 30): Promise<Partial<NewsItem>[]> {
  const results = await Promise.allSettled(symbols.map(fetchSymbolRSS));
  const all: Partial<NewsItem>[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      const key = item.url ?? item.externalId ?? item.title ?? '';
      if (key && !seen.has(key)) {
        seen.add(key);
        all.push(item);
      }
    }
  }

  return all.slice(0, limit);
}

// ─── Express 服务器 ──────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const DEFAULT_SYMBOLS = (process.env.NEWS_SYMBOLS_HK ?? '0700.HK,9988.HK,0941.HK,1810.HK,2318.HK,3690.HK,1024.HK,9618.HK')
  .split(',').map(s => s.trim()).filter(Boolean);

/** Skill 协议入口 */
app.post('/', async (req, res) => {
  const { action, parameters } = req.body ?? {};
  console.log(`[Skill-HK] action=${action} market=${parameters?.market}`);

  if (action !== 'fetchNews') {
    res.status(400).json({ error: `Unsupported action: ${action}` });
    return;
  }
  if (parameters?.market !== 'hk') {
    res.json({ items: [], metadata: { note: `market ${parameters?.market} not supported` } });
    return;
  }

  try {
    const symbols: string[] = parameters?.symbols?.length ? parameters.symbols : DEFAULT_SYMBOLS;
    const limit: number = parameters?.limit ?? 30;
    const items = await fetchHKNews(symbols, limit);
    console.log(`[Skill-HK] Returning ${items.length} HK items`);
    res.json({ items, metadata: { source: 'yahoo_finance_rss', fetchedAt: new Date() } });
  } catch (err: any) {
    console.error('[Skill-HK] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'hk-stock-skill' }));

app.listen(PORT, () => {
  console.log(`\n✅ HK Stock Skill 服务器运行中 → http://localhost:${PORT}`);
  console.log(`   协议: POST /  body: { action:"fetchNews", parameters:{market:"hk"} }`);
  console.log(`   数据源: Yahoo Finance RSS（无需 API key）\n`);
});
