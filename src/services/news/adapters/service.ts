/**
 * 统一资讯获取服务
 * 支持多种数据源：API、Skill、MCP
 */

import { NewsAdapter, NewsAdapterFactory, NewsFetchParams, NewsResult } from './base';
import { logger } from '../../../utils/logger';

/**
 * 资讯服务配置
 */
interface NewsServiceConfig {
  adapters: {
    name: string;
    type: 'api' | 'skill' | 'mcp' | 'custom';
    config: any;
    markets: string[];
    priority: number;
    enabled: boolean;
  }[];
}

/**
 * 统一资讯获取服务
 */
export class NewsService {
  private adapters: Map<string, NewsAdapter> = new Map();
  private marketAdapters: Map<string, NewsAdapter[]> = new Map();
  
  constructor(private serviceConfig: NewsServiceConfig) {
    this.initializeAdapters();
  }
  
  /**
   * 初始化适配器
   */
  private initializeAdapters(): void {
    // 按 priority 升序排列（越小优先级越高，外部 adapter 可设 1-10 覆盖内置 100）
    const sorted = [...this.serviceConfig.adapters].sort((a, b) => a.priority - b.priority);
    for (const adapterConfig of sorted) {
      if (!adapterConfig.enabled) {
        logger.info(`Adapter ${adapterConfig.name} is disabled, skipping`);
        continue;
      }
      
      try {
        const adapter = NewsAdapterFactory.create(adapterConfig.type, adapterConfig.config);
        this.adapters.set(adapterConfig.name, adapter);
        
        // 为每个市场注册适配器
        for (const market of adapterConfig.markets) {
          if (!this.marketAdapters.has(market)) {
            this.marketAdapters.set(market, []);
          }
          this.marketAdapters.get(market)!.push(adapter);
        }
        
        logger.info(`Initialized adapter: ${adapterConfig.name} (${adapterConfig.type}) for markets: ${adapterConfig.markets.join(', ')}`);
      } catch (error) {
        logger.error(`Failed to initialize adapter ${adapterConfig.name}:`, error);
      }
    }
  }
  
  /**
   * 获取资讯
   */
  async fetchNews(params: NewsFetchParams): Promise<NewsResult> {
    const adapters = this.marketAdapters.get(params.market);
    
    if (!adapters || adapters.length === 0) {
      logger.warn(`No adapters configured for market: ${params.market}`);
      return {
        items: [],
        source: 'none',
        fetchedAt: new Date(),
      };
    }
    
    // 按优先级排序并尝试获取
    for (const adapter of adapters) {
      try {
        logger.debug(`Fetching news from ${adapter.getName()} for market ${params.market}`);
        const result = await adapter.fetchNews(params);
        logger.info(`Fetched ${result.items.length} news items from ${adapter.getName()}`);
        return result;
      } catch (error) {
        logger.error(`Failed to fetch from ${adapter.getName()}:`, error);
        // 继续尝试下一个适配器
      }
    }
    
    // 所有适配器都失败
    logger.error(`All adapters failed for market: ${params.market}`);
    return {
      items: [],
      source: 'failed',
      fetchedAt: new Date(),
    };
  }
  
  /**
   * 健康检查
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [name, adapter] of this.adapters) {
      try {
        const healthy = await adapter.healthCheck();
        results.set(name, healthy);
      } catch (error) {
        logger.error(`Health check failed for ${name}:`, error);
        results.set(name, false);
      }
    }
    
    return results;
  }
  
  /**
   * 获取所有适配器
   */
  getAdapters(): Map<string, NewsAdapter> {
    return this.adapters;
  }
  
  /**
   * 获取市场适配器
   */
  getMarketAdapters(market: string): NewsAdapter[] {
    return this.marketAdapters.get(market) || [];
  }
}

/**
 * 从环境变量加载资讯服务
 * NEWS_ADAPTERS 为 JSON 数组时优先使用，否则合并内置默认 adapter
 */
export function createNewsService(): NewsService {
  let externalAdapters: NewsServiceConfig['adapters'] = [];
  const rawAdapters = process.env.NEWS_ADAPTERS;
  if (rawAdapters?.trim()) {
    try {
      externalAdapters = JSON.parse(rawAdapters) as NewsServiceConfig['adapters'];
    } catch (e) {
      logger.warn(`Invalid NEWS_ADAPTERS JSON, ignoring external adapters: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 外部 adapter + 内置 adapter 合并，外部优先（priority 较小）
  const serviceConfig: NewsServiceConfig = {
    adapters: [...externalAdapters, ...getDefaultAdapters()],
  };

  return new NewsService(serviceConfig);
}

/**
 * 内置默认 adapter — 包装现有 source 函数，priority=100（最低）。
 * 若设置 MCP_NEWS_SERVER，自动注册 priority=50 的 MCP adapter，覆盖内置 source。
 * 可被 NEWS_ADAPTERS 中 priority ≤ 10 的外部 adapter 进一步覆盖。
 *
 * 优先级顺序：外部 adapter (1-10) > MCP_NEWS_SERVER (50) > 内置 source (100)
 */
function getDefaultAdapters(): NewsServiceConfig['adapters'] {
  const mcpServer = process.env.MCP_NEWS_SERVER;
  const mcpTool = process.env.MCP_NEWS_TOOL ?? 'fetch_news';

  const mcpAdapter: NewsServiceConfig['adapters'] = mcpServer ? [
    {
      name: 'mcp-news-source',
      type: 'mcp' as const,
      config: {
        server: mcpServer,
        tool: mcpTool,
        timeout: 30000,
      },
      markets: ['us', 'hk', 'a', 'btc'],
      priority: 50,
      enabled: true,
    },
  ] : [];

  return [...mcpAdapter,
    {
      name: 'us-stock-builtin',
      type: 'custom' as const,
      config: {
        name: 'us-stock-builtin',
        fetchFunction: async (_params: NewsFetchParams): Promise<NewsResult> => {
          const { fetchUSStockNews } = await import('../sources/us-stock');
          const items = await fetchUSStockNews();
          return { items, source: 'alpha_vantage', fetchedAt: new Date() };
        },
      },
      markets: ['us'],
      priority: 100,
      enabled: !!process.env.ALPHA_VANTAGE_API_KEY,
    },
    {
      name: 'hk-stock-builtin',
      type: 'custom' as const,
      config: {
        name: 'hk-stock-builtin',
        fetchFunction: async (_params: NewsFetchParams): Promise<NewsResult> => {
          const { fetchHKStockNews } = await import('../sources/hk-stock');
          const items = await fetchHKStockNews();
          return { items, source: 'yahoo_finance_hk', fetchedAt: new Date() };
        },
      },
      markets: ['hk'],
      priority: 100,
      enabled: true,
    },
    {
      name: 'a-stock-builtin',
      type: 'custom' as const,
      config: {
        name: 'a-stock-builtin',
        fetchFunction: async (_params: NewsFetchParams): Promise<NewsResult> => {
          const { fetchAStockNews } = await import('../sources/a-stock');
          const items = await fetchAStockNews();
          return { items, source: 'eastmoney', fetchedAt: new Date() };
        },
      },
      markets: ['a'],
      priority: 100,
      enabled: true,
    },
    {
      name: 'btc-builtin',
      type: 'custom' as const,
      config: {
        name: 'btc-builtin',
        fetchFunction: async (_params: NewsFetchParams): Promise<NewsResult> => {
          const { fetchBTCNews } = await import('../sources/btc');
          const items = await fetchBTCNews();
          return { items, source: 'coingecko', fetchedAt: new Date() };
        },
      },
      markets: ['btc'],
      priority: 100,
      enabled: true,
    },
  ];
}



// 导出单例
export const newsService = createNewsService();

