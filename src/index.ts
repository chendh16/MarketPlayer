import { initPostgres, closePostgres } from './db/postgres';
import { initRedis, closeRedis } from './db/redis';
import { runMigrations } from './db/migrations/runner';
import { startDiscordBot } from './services/discord/bot';
import { newsWorker } from './queues/news-queue';
import { orderWorker } from './queues/order-queue';
import { remindWorker } from './queues/remind-queue';
import { startAPIServer } from './api/server';
import { initAllFutuConnections } from './services/futu/connection';
import { startAllFetchers } from './services/scheduler/news-fetcher';
import { startExpiryChecker } from './services/scheduler/expiry-checker';
import { logger } from './utils/logger';
import { config } from './config';

async function bootstrap() {
  try {
    logger.info('Starting MarketPlayer...');
    logger.info(`Environment: ${config.NODE_ENV}`);
    logger.info(`Cold Start Mode: ${config.COLD_START_MODE}`);
    
    // 1. 初始化数据库连接
    logger.info('Initializing database connections...');
    await initPostgres();
    await initRedis();
    
    // 2. 运行数据库迁移
    logger.info('Running database migrations...');
    await runMigrations();
    
    // 3. 启动 Discord Bot
    logger.info('Starting Discord Bot...');
    try {
      await startDiscordBot();
    } catch (error: any) {
      if (config.COLD_START_MODE) {
        logger.warn('Discord Bot failed to start in Cold Start Mode, continuing without it...');
        logger.warn(`Discord error: ${error.message}`);
      } else {
        throw error;
      }
    }
    
    // 4. 启动 BullMQ Workers
    logger.info('Starting BullMQ workers...');
    // newsWorker、orderWorker、remindWorker 已在导入时自动启动

    // 5. 启动定时任务
    logger.info('Starting scheduled tasks...');
    startAllFetchers();
    startExpiryChecker();

    // 6. 启动富途连接
    logger.info('Initializing Futu connections...');
    await initAllFutuConnections();

    // 7. 启动 Express API
    logger.info('Starting API server...');
    await startAPIServer();

    // 8. 启动 MCP 工具服务器（Agent 调用层，可选）
    const mcpPort = process.env.MCP_SERVER_PORT ? parseInt(process.env.MCP_SERVER_PORT, 10) : null;
    if (mcpPort) {
      const { startMCPServer } = await import('./mcp/server');
      startMCPServer(mcpPort);
    }

    logger.info('MarketPlayer started successfully');
    
    // 优雅关闭
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      await shutdown();
    });
    
    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      await shutdown();
    });
    
  } catch (error) {
    logger.error('Failed to start MarketPlayer:', error);
    process.exit(1);
  }
}

async function shutdown() {
  try {
    logger.info('Closing workers...');
    await newsWorker.close();
    await orderWorker.close();
    await remindWorker.close();
    
    logger.info('Closing database connections...');
    await closePostgres();
    await closeRedis();
    
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  logger.error('Unhandled error in bootstrap:', error);
  process.exit(1);
});

