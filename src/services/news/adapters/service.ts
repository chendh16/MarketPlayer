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
    for (const adapterConfig of this.serviceConfig.adapters) {
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
 * 从配置文件加载资讯服务
 */
export function createNewsService(): NewsService {
  // 从环境变量或配置文件加载
  const serviceConfig: NewsServiceConfig = {
    adapters: JSON.parse(process.env.NEWS_ADAPTERS || '[]'),
  };
  
  // 如果没有配置，使用默认配置
  if (serviceConfig.adapters.length === 0) {
    serviceConfig.adapters = getDefaultAdapters();
  }
  
  return new NewsService(serviceConfig);
}

/**
 * 获取默认适配器配置
 */
function getDefaultAdapters() {
  return [
    {
      name: 'us-stock-api',
      type: 'api' as const,
      config: {
        name: 'US Stock API',
        endpoint: process.env.US_STOCK_API_ENDPOINT || 'https://api.example.com/us-stock',
        apiKey: process.env.US_STOCK_API_KEY || '',
      },
      markets: ['us'],
      priority: 1,
      enabled: !!process.env.US_STOCK_API_KEY,
    },
    {
      name: 'hk-stock-api',
      type: 'api' as const,
      config: {
        name: 'HK Stock API',
        endpoint: process.env.HK_STOCK_API_ENDPOINT || 'https://api.example.com/hk-stock',
        apiKey: process.env.HK_STOCK_API_KEY || '',
      },
      markets: ['hk'],
      priority: 1,
      enabled: !!process.env.HK_STOCK_API_KEY,
    },
    {
      name: 'a-stock-api',
      type: 'api' as const,
      config: {
        name: 'A Stock API',
        endpoint: process.env.A_STOCK_API_ENDPOINT || 'https://api.example.com/a-stock',
        apiKey: process.env.A_STOCK_API_KEY || '',
      },
      markets: ['a'],
      priority: 1,
      enabled: !!process.env.A_STOCK_API_KEY,
    },
    {
      name: 'btc-api',
      type: 'api' as const,
      config: {
        name: 'BTC API',
        endpoint: process.env.BTC_API_ENDPOINT || 'https://api.example.com/btc',
        apiKey: process.env.BTC_API_KEY || '',
      },
      markets: ['btc'],
      priority: 1,
      enabled: !!process.env.BTC_API_KEY,
    },
  ];
}

// 导出单例
export const newsService = createNewsService();

