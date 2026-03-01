import cron from 'node-cron';
import { preFilter, markAsProcessed } from '../news/filter';
import { createNewsItem } from '../../db/queries';
import { newsQueue } from '../../queues/news-queue';
import { newsService } from '../news/adapters/service';
import { logger } from '../../utils/logger';
import { isMarketOpen } from '../../utils/market-hours';
import { config } from '../../config';
import { NewsItem } from '../../models/signal';

// ─── 共用预过滤辅助 ──────────────────────────────────────────────────────────

async function applyPreFilter(
  items: Partial<NewsItem>[],
  market: string,
): Promise<Partial<NewsItem>[]> {
  const filtered: Partial<NewsItem>[] = [];
  for (const item of items) {
    const { pass, reason } = await preFilter({
      symbol: item.symbols?.[0] || '',
      market: market as 'us' | 'hk' | 'a' | 'btc',
      triggerType: item.triggerType,
      changePercent: 0,
    });
    if (pass) {
      filtered.push(item);
    } else {
      logger.debug(`Filtered out: ${item.title} (${reason})`);
    }
  }
  return filtered;
}

// ─── 纯抓取函数（不写库、不入队）────────────────────────────────────────────
// 通过 newsService 调用适配器（内置 source 或外部 Skill/MCP），经预过滤后返回。
// 外部 adapter 可通过 NEWS_ADAPTERS 环境变量注册，priority < 100 即可优先于内置。

export async function fetchUSStockNewsRaw(): Promise<Partial<NewsItem>[]> {
  if (!isMarketOpen('us')) {
    logger.debug('US market closed, skipping fetch');
    return [];
  }
  const result = await newsService.fetchNews({
    market: 'us',
    symbols: config.NEWS_SYMBOLS_US,
  });
  return applyPreFilter(result.items, 'us');
}

export async function fetchHKStockNewsRaw(): Promise<Partial<NewsItem>[]> {
  if (!isMarketOpen('hk')) {
    logger.debug('HK market closed, skipping fetch');
    return [];
  }
  const result = await newsService.fetchNews({
    market: 'hk',
    symbols: config.NEWS_SYMBOLS_HK,
  });
  return applyPreFilter(result.items, 'hk');
}

export async function fetchAStockNewsRaw(): Promise<Partial<NewsItem>[]> {
  if (!isMarketOpen('a')) {
    logger.debug('A stock market closed, skipping fetch');
    return [];
  }
  const result = await newsService.fetchNews({ market: 'a' });
  return applyPreFilter(result.items, 'a');
}

export async function fetchBTCNewsRaw(): Promise<Partial<NewsItem>[]> {
  const result = await newsService.fetchNews({ market: 'btc' });
  return applyPreFilter(result.items, 'btc');
}

// ─── 核心调度函数（写库 + 入队）──────────────────────────────────────────────

async function persistAndQueue(
  items: Partial<NewsItem>[],
  defaultSymbol: string,
  market: string,
): Promise<void> {
  for (const item of items) {
    const created = await createNewsItem(item);
    if (created) {
      await markAsProcessed(item.symbols?.[0] || defaultSymbol, market);
      await newsQueue.add('process-news', { newsItemId: created.id });
      logger.info(`Queued news item: ${created.id}`);
    }
  }
}

export async function runUSStockFetch(): Promise<void> {
  try {
    logger.info('Fetching US stock news...');
    const items = await fetchUSStockNewsRaw();
    await persistAndQueue(items, '', 'us');
  } catch (error) {
    logger.error('runUSStockFetch failed:', error);
    throw error;
  }
}

export async function runHKStockFetch(): Promise<void> {
  try {
    logger.info('Fetching HK stock news...');
    const items = await fetchHKStockNewsRaw();
    await persistAndQueue(items, '', 'hk');
  } catch (error) {
    logger.error('runHKStockFetch failed:', error);
    throw error;
  }
}

export async function runAStockFetch(): Promise<void> {
  try {
    logger.info('Fetching A stock news...');
    const items = await fetchAStockNewsRaw();
    await persistAndQueue(items, '', 'a');
  } catch (error) {
    logger.error('runAStockFetch failed:', error);
    throw error;
  }
}

export async function runBTCFetch(): Promise<void> {
  try {
    logger.info('Fetching BTC news...');
    const items = await fetchBTCNewsRaw();
    await persistAndQueue(items, 'BTC', 'btc');
  } catch (error) {
    logger.error('runBTCFetch failed:', error);
    throw error;
  }
}

// ─── Cron 注册 ────────────────────────────────────────────────────────────────

export function startUSStockFetcher() {
  cron.schedule('*/5 * * * *', async () => {
    try { await runUSStockFetch(); } catch (error) { logger.error('Error in US stock fetcher:', error); }
  });
  logger.info('US stock fetcher started');
}

export function startHKStockFetcher() {
  cron.schedule('*/5 * * * *', async () => {
    try { await runHKStockFetch(); } catch (error) { logger.error('Error in HK stock fetcher:', error); }
  });
  logger.info('HK stock fetcher started');
}

export function startAStockFetcher() {
  cron.schedule('*/5 * * * *', async () => {
    try { await runAStockFetch(); } catch (error) { logger.error('Error in A stock fetcher:', error); }
  });
  logger.info('A stock fetcher started');
}

export function startBTCFetcher() {
  cron.schedule('0 */4 * * *', async () => {
    try { await runBTCFetch(); } catch (error) { logger.error('Error in BTC fetcher:', error); }
  });
  logger.info('BTC fetcher started');
}

export function startAllFetchers() {
  startUSStockFetcher();
  startHKStockFetcher();
  startAStockFetcher();
  startBTCFetcher();
  logger.info('All news fetchers started');
}
