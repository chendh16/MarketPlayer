import { logger } from '../../../utils/logger';
import { NewsItem } from '../../../models/signal';

interface EastMoneyNewsItem {
  InfoCode?: string;
  id?: string;
  Title?: string;
  Content?: string;
  Brief?: string;
  ShowTime?: string;
  CreateTime?: string;
}

interface EastMoneyResponse {
  data?: { list?: EastMoneyNewsItem[] };
  re?: EastMoneyNewsItem[];
}

// DataCenter API：返回稳定 JSON，无需登录
const PRIMARY_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_KUAIBAO_NEWS&columns=ALL&filter=(MARK%3D%221%22)&pageNumber=1&pageSize=30&sortTypes=-1&sortColumns=ACTIVE_TIME&source=WEB&client=WEB';
const FALLBACK_URL = 'https://gblobapi.eastmoney.com/Information/NewFlash/GetInformationList?client=WAP&type=1&IsGlobalNews=0&count=30';

function extractAStockCodes(text: string): string[] {
  const matches = text.match(/\b[036]\d{5}\b/g);
  return matches ? [...new Set(matches)] : [];
}

async function fetchEastMoneyNews(url: string): Promise<EastMoneyNewsItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.eastmoney.com/',
      'Origin': 'https://www.eastmoney.com',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Unexpected HTML response');
  const data = JSON.parse(text) as EastMoneyResponse;
  // DataCenter API 返回格式：{ result: { data: [...] } }
  const dcData = (data as any)?.result?.data;
  if (dcData) {
    return dcData.map((item: any): EastMoneyNewsItem => ({
      InfoCode: item.SECURITY_CODE ?? item.CODE,
      Title: item.TITLE ?? item.NOTICE_TITLE,
      Content: item.CONTENT ?? item.MEDIA_NAME,
      ShowTime: item.ACTIVE_TIME ?? item.UPDATE_DATE,
    }));
  }
  return data?.data?.list ?? data?.re ?? [];
}

export async function fetchAStockNews(): Promise<Partial<NewsItem>[]> {
  logger.info('Fetching A-stock news via Eastmoney...');

  let items: EastMoneyNewsItem[] = [];
  try {
    items = await fetchEastMoneyNews(PRIMARY_URL);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Eastmoney primary API failed: ${msg}, trying fallback`);
    try {
      items = await fetchEastMoneyNews(FALLBACK_URL);
    } catch (fallbackError: unknown) {
      const fbMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      logger.error(`Eastmoney fallback also failed: ${fbMsg}`);
      return [];
    }
  }

  const results: Partial<NewsItem>[] = items.map((item): Partial<NewsItem> => {
    const title = item.Title ?? '';
    const externalId = item.InfoCode ?? item.id ?? title;
    const symbols = extractAStockCodes(title);
    const publishedRaw = item.ShowTime ?? item.CreateTime;

    return {
      source: 'eastmoney',
      externalId,
      title,
      content: item.Content ?? item.Brief ?? undefined,
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
