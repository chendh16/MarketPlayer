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

// 美股资讯抓取（每5分钟）
export function startUSStockFetcher() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      if (!isMarketOpen('us')) {
        logger.debug('US market closed, skipping fetch');
        return;
      }
      
      logger.info('Fetching US stock news...');
      const newsItems = await fetchUSStockNews();
      
      for (const item of newsItems) {
        // 预筛选
        const filterResult = await preFilter({
          symbol: item.symbols?.[0] || '',
          market: 'us',
          triggerType: item.triggerType,
          changePercent: 0,
        });
        
        if (!filterResult.pass) {
          logger.debug(`Filtered out: ${item.title} (${filterResult.reason})`);
          continue;
        }
        
        // 创建资讯记录
        const created = await createNewsItem(item);
        if (created) {
          // 标记为已处理
          await markAsProcessed(item.symbols?.[0] || '', 'us');
          
          // 推入AI处理队列
          await newsQueue.add('process-news', { newsItemId: created.id });
          logger.info(`Queued news item: ${created.id}`);
        }
      }
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
      if (!isMarketOpen('hk')) {
        logger.debug('HK market closed, skipping fetch');
        return;
      }
      
      logger.info('Fetching HK stock news...');
      const newsItems = await fetchHKStockNews();
      
      for (const item of newsItems) {
        const filterResult = await preFilter({
          symbol: item.symbols?.[0] || '',
          market: 'hk',
          triggerType: item.triggerType,
          changePercent: 0,
        });
        
        if (!filterResult.pass) continue;
        
        const created = await createNewsItem(item);
        if (created) {
          await markAsProcessed(item.symbols?.[0] || '', 'hk');
          await newsQueue.add('process-news', { newsItemId: created.id });
        }
      }
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
      if (!isMarketOpen('a')) {
        logger.debug('A stock market closed, skipping fetch');
        return;
      }
      
      logger.info('Fetching A stock news...');
      const newsItems = await fetchAStockNews();
      
      for (const item of newsItems) {
        const filterResult = await preFilter({
          symbol: item.symbols?.[0] || '',
          market: 'a',
          triggerType: item.triggerType,
          changePercent: 0,
        });
        
        if (!filterResult.pass) continue;
        
        const created = await createNewsItem(item);
        if (created) {
          await markAsProcessed(item.symbols?.[0] || '', 'a');
          await newsQueue.add('process-news', { newsItemId: created.id });
        }
      }
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
      logger.info('Fetching BTC news...');
      const newsItems = await fetchBTCNews();
      
      for (const item of newsItems) {
        const filterResult = await preFilter({
          symbol: 'BTC',
          market: 'btc',
          triggerType: item.triggerType,
          changePercent: 0,
        });
        
        if (!filterResult.pass) continue;
        
        const created = await createNewsItem(item);
        if (created) {
          await markAsProcessed('BTC', 'btc');
          await newsQueue.add('process-news', { newsItemId: created.id });
        }
      }
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
