import cron from 'node-cron';
import { fetchUSStockNews } from '../news/sources/us-stock';
import { fetchHKStockNews } from '../news/sources/hk-stock';
import { fetchAStockNews } from '../news/sources/a-stock';
import { fetchBTCNews } from '../news/sources/btc';
import { preFilter, markAsProcessed } from '../news/filter';
import { createNewsItem } from '../../db/queries';
import { newsQueue } from '../../queues/news-queue';
import { logger } from '../../utils/logger';
import { isMarketOpen } from '../../utils/market-hours';
import { NewsItem } from '../../models/signal';

// ─── 纯抓取函数（不写库、不入队）────────────────────────────────────────────
// 供 OpenClaw agent 直接调用；返回经过预过滤的资讯列表

export async function fetchUSStockNewsRaw(): Promise<Partial<NewsItem>[]> {
  if (!isMarketOpen('us')) {
    logger.debug('US market closed, skipping fetch');
    return [];
  }
  const items = await fetchUSStockNews();
  const filtered: Partial<NewsItem>[] = [];
  for (const item of items) {
    const { pass, reason } = await preFilter({
      symbol: item.symbols?.[0] || '',
      market: 'us',
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

export async function fetchHKStockNewsRaw(): Promise<Partial<NewsItem>[]> {
  if (!isMarketOpen('hk')) {
    logger.debug('HK market closed, skipping fetch');
    return [];
  }
  const items = await fetchHKStockNews();
  const filtered: Partial<NewsItem>[] = [];
  for (const item of items) {
    const { pass } = await preFilter({
      symbol: item.symbols?.[0] || '',
      market: 'hk',
      triggerType: item.triggerType,
      changePercent: 0,
    });
    if (pass) filtered.push(item);
  }
  return filtered;
}

export async function fetchAStockNewsRaw(): Promise<Partial<NewsItem>[]> {
  if (!isMarketOpen('a')) {
    logger.debug('A stock market closed, skipping fetch');
    return [];
  }
  const items = await fetchAStockNews();
  const filtered: Partial<NewsItem>[] = [];
  for (const item of items) {
    const { pass } = await preFilter({
      symbol: item.symbols?.[0] || '',
      market: 'a',
      triggerType: item.triggerType,
      changePercent: 0,
    });
    if (pass) filtered.push(item);
  }
  return filtered;
}

export async function fetchBTCNewsRaw(): Promise<Partial<NewsItem>[]> {
  const items = await fetchBTCNews();
  const filtered: Partial<NewsItem>[] = [];
  for (const item of items) {
    const { pass } = await preFilter({
      symbol: 'BTC',
      market: 'btc',
      triggerType: item.triggerType,
      changePercent: 0,
    });
    if (pass) filtered.push(item);
  }
  return filtered;
}

// ─── 核心抓取逻辑（调用 raw 函数后写库 + 入队）──────────────────────────────

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

// ─── Cron 注册（每个 fetcher 的 cron 回调直接调用对应的 run* 函数）────────────

// 美股资讯抓取（每5分钟）
export function startUSStockFetcher() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runUSStockFetch();
    } catch (error) {
      logger.error('Error in US stock fetcher:', error);
    }
  });

  logger.info('US stock fetcher started');
}

// 港股资讯抓取（每5分钟）
export function startHKStockFetcher() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runHKStockFetch();
    } catch (error) {
      logger.error('Error in HK stock fetcher:', error);
    }
  });

  logger.info('HK stock fetcher started');
}

// A股资讯抓取（每5分钟）
export function startAStockFetcher() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runAStockFetch();
    } catch (error) {
      logger.error('Error in A stock fetcher:', error);
    }
  });

  logger.info('A stock fetcher started');
}

// BTC资讯抓取（每4小时）
export function startBTCFetcher() {
  cron.schedule('0 */4 * * *', async () => {
    try {
      await runBTCFetch();
    } catch (error) {
      logger.error('Error in BTC fetcher:', error);
    }
  });

  logger.info('BTC fetcher started');
}

// 启动所有资讯抓取器
export function startAllFetchers() {
  startUSStockFetcher();
  startHKStockFetcher();
  startAStockFetcher();
  startBTCFetcher();
  logger.info('All news fetchers started');
}
