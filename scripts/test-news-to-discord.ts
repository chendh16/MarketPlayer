/**
 * 端到端测试：MCP 新闻 → AI 分析 → Discord 推送
 */

import { initPostgres, closePostgres } from '../src/db/postgres';
import { redisClient } from '../src/db/redis';
import { newsQueue } from '../src/queues/news-queue';
import { logger } from '../src/utils/logger';
import { createUser, createNewsItem } from '../src/db/queries';

async function testNewsToDiscord() {
  console.log('\n=== 端到端测试：新闻 → Discord 推送 ===\n');

  try {
    // 1. 初始化数据库
    console.log('📊 初始化数据库连接...');
    await initPostgres();
    console.log('✅ 数据库连接成功\n');

    // 2. 初始化 Redis
    console.log('🔴 初始化 Redis 连接...');
    const { initRedis } = await import('../src/db/redis');
    await initRedis();
    console.log('✅ Redis 连接成功\n');
    
    // 2. 创建或获取测试用户
    console.log('👤 创建/获取测试用户...');
    const testDiscordId = process.env.TEST_DISCORD_USER_ID || 'test_user_123';

    // 先尝试获取现有用户
    const { getUserByDiscordId } = await import('../src/db/queries');
    let testUser = await getUserByDiscordId(testDiscordId);

    if (!testUser) {
      // 用户不存在，创建新用户
      testUser = await createUser({
        discordUserId: testDiscordId,
        discordUsername: 'TestUser',
        riskPreference: 'balanced',
      });
      console.log(`✅ 测试用户已创建: ${testUser.id}\n`);
    } else {
      console.log(`✅ 使用现有测试用户: ${testUser.id}\n`);
    }
    
    // 3. 创建测试新闻
    console.log('📰 创建测试新闻...');
    const newsItem = await createNewsItem({
      source: 'test-mcp',
      title: 'Apple announces revolutionary AI chip',
      content: 'Apple Inc. unveiled a groundbreaking AI chip that promises 10x performance improvement...',
      market: 'us',
      symbols: ['AAPL'],
      triggerType: 'news',
      publishedAt: new Date(),
    });
    
    if (!newsItem) {
      throw new Error('Failed to create news item');
    }
    
    console.log(`✅ 新闻已创建: ${newsItem.id}`);
    console.log(`   标题: ${newsItem.title}`);
    console.log(`   市场: ${newsItem.market}`);
    console.log(`   标的: ${newsItem.symbols?.join(', ')}\n`);
    
    // 4. 推入处理队列
    console.log('🔄 推入 AI 处理队列...');
    const job = await newsQueue.add('process-news', {
      newsItemId: newsItem.id,
    });
    console.log(`✅ 任务已创建: ${job.id}\n`);
    
    // 5. 等待处理完成
    console.log('⏳ 等待 AI 分析和 Discord 推送...');
    console.log('   (这可能需要 10-30 秒)\n');

    // 等待任务完成
    await new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const state = await job.getState();
        if (state === 'completed' || state === 'failed') {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 1000);

      // 超时保护
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, 60000); // 60秒超时
    });

    const state = await job.getState();

    if (state === 'completed') {
      console.log('✅ 处理完成！\n');
      console.log('📋 任务状态: completed');
    } else {
      console.log(`⚠️  任务状态: ${state}\n`);
    }
    
    console.log('\n🎉 测试成功！');
    console.log('\n💡 提示：');
    console.log('   1. 检查 Discord 私信是否收到信号推送');
    console.log('   2. 查看日志文件: logs/combined.log');
    console.log('   3. 检查数据库中的 signals 和 signal_deliveries 表\n');
    
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('\n错误详情:');
    console.error(error);
    
    console.log('\n🔍 故障排查：');
    console.log('   1. 确保 MC行: npm run mcp-server');
    console.log('   2. 确保 Discord Bot Token 已配置');
    console.log('   3. 确保 AI API Key 已配置');
    console.log('   4. 检查数据库连接');
    console.log('   5. 查看详细日志: tail -f logs/combined.log\n');
  } finally {
    // 清理
    await closePostgres();
    await redisClient.quit();
  }
}

// 运行测试
testNewsToDiscord().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

