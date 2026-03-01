import { newsService } from '../../services/news/adapters/service';
import { runUSStockFetch, runHKStockFetch, runAStockFetch, runBTCFetch } from '../../services/scheduler/news-fetcher';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * fetch_news — 通过 newsService 拉取指定市场资讯（不写库/不入队）
 */
export async function fetch_news(params: {
  market: 'us' | 'hk' | 'a' | 'btc';
  symbols?: string[];
  limit?: number;
  since?: string;
}) {
  const { market, limit, since } = params;
  const symbols = params.symbols ?? (market === 'us' ? config.NEWS_SYMBOLS_US : market === 'hk' ? config.NEWS_SYMBOLS_HK : undefined);

  logger.info(`[MCP] fetch_news market=${market}`);

  const result = await newsService.fetchNews({
    market,
    symbols,
    limit,
    since: since ? new Date(since) : undefined,
  });

  return {
    items: result.items,
    source: result.source,
    fetchedAt: result.fetchedAt,
    total: result.items.length,
  };
}

/**
 * process_pipeline — 完整资讯处理流程：抓取→过滤→写库→入队
 * 等同于 cron 触发一次，可由 Agent 手动调用
 */
export async function process_pipeline(params: { market: 'us' | 'hk' | 'a' | 'btc' }) {
  const { market } = params;
  logger.info(`[MCP] process_pipeline market=${market}`);

  switch (market) {
    case 'us': await runUSStockFetch(); break;
    case 'hk': await runHKStockFetch(); break;
    case 'a':  await runAStockFetch(); break;
    case 'btc': await runBTCFetch(); break;
    default: throw new Error(`Unknown market: ${market}`);
  }

  return { ok: true, market };
}
