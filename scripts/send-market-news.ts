/**
 * 手动触发：抓取真实市场资讯 → AI 分析 → Discord 推送
 * 用法: npx ts-node scripts/send-market-news.ts [market]
 *       market: us | hk | a | btc (默认 btc)
 */

import dotenv from 'dotenv';
dotenv.config();

import { initPostgres, closePostgres } from '../src/db/postgres';
import { initRedis } from '../src/db/redis';
import { redisClient } from '../src/db/redis';
import { startDiscordBot } from '../src/services/discord/bot';
import { newsWorker, newsQueue } from '../src/queues/news-queue';
import {
  createNewsItem,
  getUserByDiscordId,
  createUser,
} from '../src/db/queries';
import { logger } from '../src/utils/logger';

const MARKET = (process.argv[2] ?? 'btc') as 'us' | 'hk' | 'a' | 'btc';

async function main() {
  console.log(`\n=== 市场资讯推送测试 (market=${MARKET}) ===\n`);

  // 1. 初始化
  console.log('📊 连接数据库...');
  await initPostgres();
  await initRedis();
  console.log('✅ 数据库 + Redis 就绪\n');

  // 2. 启动 Discord Bot
  console.log('🤖 启动 Discord Bot...');
  await startDiscordBot();
  console.log('✅ Discord Bot 已登录\n');

  // 3. 获取或创建测试用户
  const testDiscordId = process.env.TEST_DISCORD_USER_ID!;
  if (!testDiscordId) {
    console.error('❌ 请设置环境变量 TEST_DISCORD_USER_ID');
    process.exit(1);
  }

  let testUser = await getUserByDiscordId(testDiscordId);
  if (!testUser) {
    testUser = await createUser({
      discordUserId: testDiscordId,
      discordUsername: 'TestUser',
      riskPreference: 'balanced',
    });
    console.log(`✅ 创建测试用户: ${testUser.id}\n`);
  } else {
    console.log(`✅ 使用现有用户: ${testUser.id}\n`);
  }

  // 4. 抓取真实资讯
  console.log(`📰 抓取 ${MARKET.toUpperCase()} 真实资讯...`);
  let newsItems: any[] = [];

  if (MARKET === 'btc') {
    const { fetchBTCNews } = await import('../src/services/news/sources/btc');
    newsItems = await fetchBTCNews();
  } else if (MARKET === 'hk') {
    const { fetchHKStockNews } = await import('../src/services/news/sources/hk-stock');
    newsItems = await fetchHKStockNews();
  } else if (MARKET === 'a') {
    const { fetchAStockNews } = await import('../src/services/news/sources/a-stock');
    newsItems = await fetchAStockNews();
  } else {
    const { fetchUSStockNews } = await import('../src/services/news/sources/us-stock');
    newsItems = await fetchUSStockNews();
  }

  if (newsItems.length === 0) {
    console.error('❌ 未获取到资讯（可能 API 限流或网络问题）');
    process.exit(1);
  }

  const first = newsItems[0];
  console.log(`✅ 获取到 ${newsItems.length} 条资讯`);
  console.log(`   选取第 1 条：${first.title}`);
  console.log(`   来源: ${first.source}  标的: ${first.symbols?.join(', ')}\n`);

  // 5. 写库
  console.log('💾 写入数据库...');
  let newsItem = await createNewsItem({
    source: first.source!,
    externalId: first.externalId ?? `manual-${Date.now()}`,
    title: first.title!,
    content: first.content,
    url: first.url,
    market: first.market!,
    symbols: first.symbols ?? [],
    triggerType: first.triggerType ?? 'news',
    aiProcessed: false,
    publishedAt: first.publishedAt ?? new Date(),
  });

  if (!newsItem) {
    // 已存在（externalId 重复），换个唯一 id
    newsItem = await createNewsItem({
      source: first.source!,
      externalId: `manual-${Date.now()}`,
      title: first.title!,
      content: first.content,
      url: first.url,
      market: first.market!,
      symbols: first.symbols ?? [],
      triggerType: first.triggerType ?? 'news',
      aiProcessed: false,
      publishedAt: first.publishedAt ?? new Date(),
    });
  }

  if (!newsItem) throw new Error('写库失败');
  console.log(`✅ 资讯已入库: ${newsItem.id}\n`);

  // 6. 推入 AI 队列
  console.log('🔄 推入 AI 处理队列...');
  const job = await newsQueue.add('process-news', { newsItemId: newsItem.id });
  console.log(`✅ 任务 ${job.id} 已入队\n`);

  // 7. 等待处理完成
  console.log('⏳ 等待 AI 分析 + Discord 推送（最多 90 秒）...\n');
  await new Promise<void>((resolve) => {
    const interval = setInterval(async () => {
      const state = await job.getState();
      process.stdout.write(`   状态: ${state}\r`);
      if (state === 'completed' || state === 'failed') {
        clearInterval(interval);
        console.log(`\n\n   最终状态: ${state}`);
        resolve();
      }
    }, 2000);
    setTimeout(() => { clearInterval(interval); resolve(); }, 90000);
  });

  const finalState = await job.getState();
  if (finalState === 'completed') {
    console.log('\n✅ 成功！请检查 Discord 是否收到资讯推送');
  } else {
    const failedReason = (await job.toJSON()).failedReason;
    console.log(`\n⚠️  任务状态: ${finalState}`);
    if (failedReason) console.log(`   原因: ${failedReason}`);
  }

  // 清理
  await newsWorker.close();
  await closePostgres();
  await redisClient.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ 错误:', err?.message ?? err);
  process.exit(1);
});
