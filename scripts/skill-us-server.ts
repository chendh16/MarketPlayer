/**
 * US 股 Skill 服务器
 *
 * 实现 Skill adapter 协议，通过 Yahoo Finance RSS 抓取美股资讯。
 * 无需 API key，随时可用。
 *
 * 用法: npx ts-node scripts/skill-us-server.ts
 *       默认端口 3101，可通过 SKILL_US_PORT 环境变量覆盖
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

const PORT = parseInt(process.env.SKILL_US_PORT ?? '3101', 10);

// ─── Yahoo Finance RSS 抓取 ──────────────────────────────────────────────────

function extractText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  return xml.match(re)?.[1]?.trim() ?? '';
}

async function fetchYahooRSS(symbol: string): Promise<Partial<NewsItem>[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items: Partial<NewsItem>[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const title = extractText(b, 'title');
    const link  = extractText(b, 'link') || extractText(b, 'guid');
    const pub   = extractText(b, 'pubDate');
    const desc  = extractText(b, 'description');
    if (!title || !link) continue;
    items.push({
      source: 'yahoo_finance_us',
      externalId: link,
      title,
      content: desc || undefined,
      url: link,
      market: 'us',
      symbols: [symbol],
      triggerType: 'news',
      aiProcessed: false,
      publishedAt: pub ? new Date(pub) : new Date(),
    });
  }
  return items;
}

async function fetchUSNews(symbols: string[], limit = 20): Promise<Partial<NewsItem>[]> {
  const results = await Promise.allSettled(symbols.map(fetchYahooRSS));
  const all: Partial<NewsItem>[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      const key = item.externalId ?? item.url ?? item.title ?? '';
      if (key && !seen.has(key)) { seen.add(key); all.push(item); }
    }
  }
  return all.slice(0, limit);
}

// ─── Express 服务器 ──────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const DEFAULT_SYMBOLS = (process.env.NEWS_SYMBOLS_US ?? 'AAPL,GOOGL,MSFT,TSLA,NVDA,AMZN,META,NFLX,SPY,QQQ')
  .split(',').map(s => s.trim()).filter(Boolean);

/** Skill 协议入口 */
app.post('/', async (req, res) => {
  const { action, parameters } = req.body ?? {};
  console.log(`[Skill] action=${action} market=${parameters?.market}`);

  if (action !== 'fetchNews') {
    res.status(400).json({ error: `Unsupported action: ${action}` });
    return;
  }
  if (parameters?.market !== 'us') {
    res.json({ items: [], metadata: { note: `market ${parameters?.market} not supported` } });
    return;
  }

  try {
    const symbols: string[] = parameters?.symbols?.length ? parameters.symbols : DEFAULT_SYMBOLS;
    const limit: number = parameters?.limit ?? 20;
    const items = await fetchUSNews(symbols, limit);
    console.log(`[Skill] Returning ${items.length} US items`);
    res.json({ items, metadata: { source: 'yahoo_finance_rss', fetchedAt: new Date() } });
  } catch (err: any) {
    console.error('[Skill] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'us-stock-skill' }));

app.listen(PORT, () => {
  console.log(`\n✅ US Stock Skill 服务器运行中 → http://localhost:${PORT}`);
  console.log(`   协议: POST /  body: { action:"fetchNews", parameters:{market:"us"} }`);
  console.log(`   数据源: Yahoo Finance RSS（无需 API key）\n`);
});
