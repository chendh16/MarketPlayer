import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';

interface EastMoneyNewsItem {
  id?: string;
  title?: string;
  content?: string;
  digest?: string;
  ShowTime?: string;
  url_w?: string;
  column?: string;
}

interface EastMoneyResponse {
  rc?: number;
  LivesList?: EastMoneyNewsItem[];
}

// 有效的新闻API
const NEWS_URL = 'https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_50_1_.html';

function extractAStockCodes(text: string): string[] {
  const matches = text.match(/\b[036]\d{5}\b/g);
  return matches ? [...new Set(matches)] : [];
}

async function fetchEastMoneyNews(url: string): Promise<EastMoneyNewsItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://www.eastmoney.com/',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  
  // 解析 JavaScript 回调格式: var ajaxResult={...}
  const match = text.match(/var\s+ajaxResult\s*=\s*({[\s\S]*})/);
  if (!match) throw new Error('Invalid response format');
  
  const data = JSON.parse(match[1]) as EastMoneyResponse;
  if (data.rc !== 0 && data.rc !== 1) {
    throw new Error(`API error: rc=${data.rc}`);
  }
  
  return data.LivesList || [];
}

export async function fetchAStockNews(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching A-stock news via Eastmoney...');

  let items: EastMoneyNewsItem[] = [];
  try {
    items = await fetchEastMoneyNews(NEWS_URL);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Eastmoney API failed: ${msg}`);
    return [];
  }

  const results: Partial<NewsItem>[] = items.map((item): Partial<NewsItem> => {
    const title = item.title || '';
    const content = item.digest || item.content || '';
    // 使用新闻ID作为标识
    const externalId = item.id || title;
    const symbols = extractAStockCodes(title + content);
    const publishedRaw = item.ShowTime || '';

    return {
      source: 'eastmoney',
      externalId,
      title,
      content: item.digest || item.content || '',
      market: 'a',
      symbols: symbols.length > 0 ? symbols : undefined,
      triggerType: 'news',
      aiProcessed: false,
      publishedAt: publishedRaw ? new Date(publishedRaw) : new Date(),
    };
  });

  logger.info(`Fetched ${results.length} A-stock news items`);
  return results;
}

export async function getAStockPrice(symbol: string): Promise<number | null> {
  // secid prefix: 1 for SH (600/601/603/605/688), 0 for SZ (000/001/002/003/300)
  const code = symbol.replace(/^(SH|SZ)\./i, '');
  const prefix = /^[16]/.test(code) ? '1' : '0';
  const secid = `${prefix}.${code}`;
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.eastmoney.com' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as { data?: { f43?: number } };
    const raw = data?.data?.f43;
    if (raw == null || raw <= 0) return null;

    // Eastmoney returns price * 100 (in fen)
    const price = raw / 100;
    return isFinite(price) && price > 0 ? price : null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`getAStockPrice(${symbol}) failed: ${msg}`);
    return null;
  }
}
