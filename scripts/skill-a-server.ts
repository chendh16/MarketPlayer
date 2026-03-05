/**
 * A 股 Skill 服务器
 *
 * 实现 Skill adapter 协议，通过新浪财经滚动新闻 API 抓取 A 股资讯。
 * 无需 API key，随时可用。
 *
 * 用法: npx ts-node scripts/skill-a-server.ts
 *       默认端口 3102，可通过 SKILL_A_PORT 环境变量覆盖
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

const PORT = parseInt(process.env.SKILL_A_PORT ?? '3102', 10);

// ─── 新浪财经滚动新闻 ──────────────────────────────────────────────────────────

interface SinaNewsItem {
  id?: string;
  oid?: string;
  title?: string;
  intro?: string;
  ctime?: string;
  mtime?: string;
  url?: string;
}

interface SinaResponse {
  result?: {
    status?: { code?: number };
    data?: SinaNewsItem[];
  };
}

// 新浪财经滚动新闻（lid=2516 = A股财经快讯，无需登录）
const SINA_ROLL_URL =
  'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&num=30&versionNumber=1.2.8&page=1&encode=utf-8';

// 东方财富快讯（备用）
const EF_URL =
  'https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page=1&page_size=30&type=0&token=10jqcioprebmvdnvpvlqxiy8uyif5x18';

function extractAStockCodes(text: string): string[] {
  const matches = text.match(/\b[036]\d{5}\b/g);
  return matches ? [...new Set(matches)] : [];
}

async function fetchSinaNews(): Promise<Partial<NewsItem>[]> {
  const res = await fetch(SINA_ROLL_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://finance.sina.com.cn/',
      'Accept': 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as SinaResponse;
  const list: SinaNewsItem[] = data?.result?.data ?? [];

  return list.map((item): Partial<NewsItem> => {
    const title = item.title ?? '';
    const symbols = extractAStockCodes(title);
    return {
      source: 'sina_finance',
      externalId: item.id ?? item.oid ?? title,
      title,
      content: item.intro ?? undefined,
      url: item.url ?? undefined,
      market: 'a',
      symbols: symbols.length > 0 ? symbols : undefined,
      triggerType: 'news',
      aiProcessed: false,
      publishedAt: item.ctime ? new Date(parseInt(item.ctime) * 1000) : new Date(),
    };
  });
}

async function fetchEFNews(): Promise<Partial<NewsItem>[]> {
  const res = await fetch(EF_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://www.eastmoney.com/',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('HTML response from EF');
  const data = JSON.parse(text) as { data?: { list?: any[] } };
  const list: any[] = data?.data?.list ?? [];

  return list.map((item): Partial<NewsItem> => {
    const title = item.NOTICE_TITLE ?? item.TITLE ?? '';
    const symbols = item.CODES
      ? (Array.isArray(item.CODES) ? item.CODES : [item.CODES])
      : extractAStockCodes(title);
    return {
      source: 'eastmoney_ann',
      externalId: item.ANN_ID ?? item.ID ?? title,
      title,
      content: item.CONTENT ?? undefined,
      market: 'a',
      symbols: symbols.length > 0 ? symbols : undefined,
      triggerType: 'news',
      aiProcessed: false,
      publishedAt: item.NOTICE_DATE ? new Date(item.NOTICE_DATE) : new Date(),
    };
  });
}

async function fetchANews(limit = 30): Promise<Partial<NewsItem>[]> {
  try {
    const items = await fetchSinaNews();
    console.log(`[Skill-A] 新浪财经: ${items.length} 条`);
    return items.slice(0, limit);
  } catch (err: any) {
    console.warn(`[Skill-A] 新浪财经失败: ${err.message}，尝试东方财富公告...`);
  }
  try {
    const items = await fetchEFNews();
    console.log(`[Skill-A] 东方财富公告: ${items.length} 条`);
    return items.slice(0, limit);
  } catch (err: any) {
    console.error(`[Skill-A] 备用源也失败: ${err.message}`);
    return [];
  }
}

// ─── Express 服务器 ──────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/** Skill 协议入口 */
app.post('/', async (req, res) => {
  const { action, parameters } = req.body ?? {};
  console.log(`[Skill-A] action=${action} market=${parameters?.market}`);

  if (action !== 'fetchNews') {
    res.status(400).json({ error: `Unsupported action: ${action}` });
    return;
  }
  if (parameters?.market !== 'a') {
    res.json({ items: [], metadata: { note: `market ${parameters?.market} not supported` } });
    return;
  }

  try {
    const limit: number = parameters?.limit ?? 30;
    const items = await fetchANews(limit);
    console.log(`[Skill-A] Returning ${items.length} A-stock items`);
    res.json({ items, metadata: { source: 'sina_finance', fetchedAt: new Date() } });
  } catch (err: any) {
    console.error('[Skill-A] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'a-stock-skill' }));

app.listen(PORT, () => {
  console.log(`\n✅ A 股 Skill 服务器运行中 → http://localhost:${PORT}`);
  console.log(`   协议: POST /  body: { action:"fetchNews", parameters:{market:"a"} }`);
  console.log(`   数据源: 新浪财经滚动新闻（无需 API key）\n`);
});
