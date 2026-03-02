import { initPostgres } from '../src/db/postgres';
import { initRedis } from '../src/db/redis';
import { createNewsItem, getUserByDiscordId } from '../src/db/queries';
import { newsQueue } from '../src/queues/news-queue';
import { fetchBTCNews } from '../src/services/news/sources/btc';
import { logger } from '../src/utils/logger';

async function testRealNews() {
  console.log('\n=== 真实新闻获取测试：BTC 新闻 → Discord 推送 ===\n');
  
  try {
    // 1. 初始化数据库
    console.log('📊 初始化数据库连接...');
    await initPostgres();
    console.log('✅ 数据库连接成功\n');
    
    // 2. 初始化 Redis
    console.log('🔴 初始化 Redis 连接...');
    await initRedis();
    console.log('✅ Redis 连接成功\n');

    // 3. 获取或创建测试用户
    console.log('👤 获取测试用户...');
    const testDiscordId = process.env.TEST_DISCORD_USER_ID || 'test_user_123';
    const testUser = await getUserByDiscordId(testDiscordId);
    
    if (!testUser) {
      console.log('❌ 测试用户不存在，请先运行 npm run test-e2e 创建用户');
      process.exit(1);
    }
    console.log(`✅ 使用测试用户: ${testUser.id}\n`);

    // 4. 获取真实的 BTC 新闻
    console.log('📰 从 CoinGecko 获取真实 BTC 新闻...');
    const newsItems = await fetchBTCNews();
    
    if (newsItems.length === 0) {
      console.log('❌ 未获取到新闻，可能是 API 限流或网络问题');
      process.exit(1);
    }
    
    console.log(`✅ 获取到 ${newsItems.length} 条新闻\n`);

    // 5. 选择第一条新闻进行测试
    const firstNews = newsItems[0];
    console.log('📋 选择第一条新闻进行测试：');
    console.log(`   标题: ${firstNews.title}`);
    console.log(`   来源: ${firstNews.source}`);
    console.log(`   市场: ${firstNews.market}`);
    console.log(`   标的: ${firstNews.symbols?.join(', ')}\n`);

    // 6. 创建新闻记录
    console.log('💾 创建新闻记录...');
    let newsItem = await createNewsItem({
      source: firstNews.source!,
      externalId: firstNews.externalId!,
      title: firstNews.title!,
      content: firstNews.content,
      url: firstNews.url,
      market: firstNews.market!,
      symbols: firstNews.symbols || [],
      triggerType: firstNews.triggerType!,
      aiProcessed: false,
      publishedAt: firstNews.publishedAt || new Date(),
    });

    // 如果新闻已存在，使用唯一的 externalId
    if (!newsItem) {
      console.log('⚠️  新闻已存在，使用新的 externalId 重试...');
      const uniqueId = `${firstNews.externalId}-${Date.now()}`;
      newsItem = await createNewsItem({
        source: firstNews.source!,
        externalId: uniqueId,
        title: firstNews.title!,
        content: firstNews.content,
        url: firstNews.url,
        market: firstNews.market!,
        symbols: firstNews.symbols || [],
        triggerType: firstNews.triggerType!,
        aiProcessed: false,
        publishedAt: firstNews.publishedAt || new Date(),
      });
    }

    if (!newsItem) throw new Error('创建新闻记录失败');
    console.log(`✅ 新闻已创建: ${newsItem.id}\n`);

    // 7. 推入 AI 处理队列
    console.log('🔄 推入 AI 处理队列...');
    const job = await newsQueue.add('process-news', {
      newsItemId: newsItem.id,
    });
    console.log(`✅ 任务已创建: ${job.id}\n`);

    // 8. 等待处理完成
    console.log('⏳ 等待 AI 分析和 Discord 推送...');
    console.log('   (这可能需要 10-30 秒)\n');
    
    await new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const state = await job.getState();
        if (state === 'completed' || state === 'failed') {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 1000);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, 60000);
    });
    
    const state = await job.getState();
    
    if (state === 'completed') {
      console.log('✅ 处理完成！\n');
      console.log('📋 任务状态: completed');
    } else {
      console.log(`⚠️  任务状态: ${state}\n`);
    }

    console.log('\n🎉 测试成功！\n');
    console.log('💡 提示：');
    console.log('   1. 检查 Discord 私信是否收到信号推送');
    console.log('   2. 查看日志文件: logs/combined.log');
    console.log('   3. 检查数据库中的 signals 和 signal_deliveries 表\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 测试失败:', error instanceof Error ? error.message : error);
    console.error('\n错误详情:');
    console.error(error);
    
    console.log('\n🔍 故障排查：');
    console.log('   1. 确保 MCP 服务器正在运行: npm run mcp-server');
    console.log('   2. 确保 Discord Bot Token 已配置');
    console.log('   3. 确保 AI API Key 已配置');
    console.log('   4. 检查数据库连接');
    console.log('   5. 查看详细日志: tail -f logs/combined.log\n');
    
    process.exit(1);
  }
}

testRealNews();

