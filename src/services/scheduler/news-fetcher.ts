import cron from 'node-cron';
import { preFilter, markAsProcessed } from '../news/filter';
import { createNewsItem } from '../../db/queries';
import { enqueueNewsItem } from '../../queues/news-queue';
import { newsService } from '../news/adapters/service';
import { logger } from '../../utils/logger';
import { isMarketOpen } from '../../utils/market-hours';
import { config } from '../../config';
import { NewsItem } from '../../models/signal';
import { TradingMarket, Market } from '../../types/market';

// ─── 共用预过滤辅助 ──────────────────────────────────────────────────────────

async function applyPreFilter(
  items: Partial<NewsItem>[],
  market: Market,
): Promise<Partial<NewsItem>[]> {
  const filtered: Partial<NewsItem>[] = [];
  for (const item of items) {
    // Only apply preFilter for trading markets
    if (market === 'macro') {
      filtered.push(item);
      continue;
    }
    const { pass, reason } = await preFilter({
      symbol: item.symbols?.[0] || '',
      market: market as TradingMarket,
      triggerType: item.triggerType,
      changePercent: 0,
    });
    if (pass) {
      await markAsProcessed(item.symbols?.[0] || '', market as TradingMarket);
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

export async function fetchMacroNewsRaw(): Promise<Partial<NewsItem>[]> {
  const result = await newsService.fetchNews({ market: 'macro' });
  return applyPreFilter(result.items, 'macro');
}

// ─── 有界并发辅助（替代 Promise.all 防止 API 超频）──────────────────────────

async function pLimit<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── 核心调度函数（写库 + 幂等入队）──────────────────────────────────────────

async function persistAndQueue(
  items: Partial<NewsItem>[],
  defaultSymbol: string,
  market: string,
): Promise<void> {
  for (const item of items) {
    const created = await createNewsItem(item);
    if (created) {
      await enqueueNewsItem(created.id); // 幂等：1小时内重复 ID 自动跳过
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

export async function runMacroFetch(): Promise<void> {
  try {
    logger.info('Fetching macro news...');
    const items = await fetchMacroNewsRaw();
    await persistAndQueue(items, '', 'macro');
  } catch (error) {
    logger.error('runMacroFetch failed:', error);
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

export function startMacroFetcher() {
  cron.schedule('*/30 * * * *', async () => {
    try { await runMacroFetch(); } catch (error) { logger.error('Error in macro fetcher:', error); }
  });
  logger.info('Macro news fetcher started');
}

export function startAllFetchers() {
  startUSStockFetcher();
  startHKStockFetcher();
  startAStockFetcher();
  startBTCFetcher();
  startMacroFetcher();
  logger.info('All news fetchers started');
}

// ─── 多市场并发拉取（供 MCP pipeline 等场景调用，最多3并发防止 API 超频）──────

export async function runAllFetchesConcurrent(): Promise<void> {
  const tasks = [
    () => runUSStockFetch().catch((e: Error) => logger.error('runUSStockFetch failed:', e)),
    () => runHKStockFetch().catch((e: Error) => logger.error('runHKStockFetch failed:', e)),
    () => runAStockFetch().catch((e: Error) => logger.error('runAStockFetch failed:', e)),
    () => runBTCFetch().catch((e: Error) => logger.error('runBTCFetch failed:', e)),
    () => runMacroFetch().catch((e: Error) => logger.error('runMacroFetch failed:', e)),
  ];
  await pLimit(tasks, 3);
}
