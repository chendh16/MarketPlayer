#!/usr/bin/env ts-node

/**
 * 飞书推送测试脚本
 *
 * 用法：
 * 1. 配置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET
 * 2. 运行: npx ts-node scripts/test-feishu-push.ts <open_id>
 */

import { sendMessageToUser } from '../src/services/feishu/bot';
import { buildNormalSignalCard, buildNewsOnlyCard } from '../src/services/feishu/formatter';
import { config } from '../src/config';
import { logger } from '../src/utils/logger';

async function testFeishuPush(openId: string) {
  if (!config.FEISHU_APP_ID || !config.FEISHU_APP_SECRET) {
    console.error('❌ 请先配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    process.exit(1);
  }

  console.log('🚀 开始测试飞书推送...');
  console.log(`📱 目标用户: ${openId}`);

  // 测试1: 发送文本消息
  console.log('\n📝 测试1: 发送文本消息');
  const textResult = await sendMessageToUser(openId, {
    text: '你好！这是来自 MarketPlayer 的测试消息。',
  });
  if (textResult) {
    console.log(`✅ 文本消息发送成功: ${textResult.messageId}`);
  } else {
    console.log('❌ 文本消息发送失败');
  }

  // 等待1秒
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试2: 发送交易信号卡片
  console.log('\n📊 测试2: 发送交易信号卡片');
  const mockSignal = {
    id: 'test-signal-1',
    symbol: 'AAPL',
    market: 'us' as const,
    direction: 'long' as const,
    confidence: 85,
    suggestedPositionPct: 10,
    reasoning: '苹果公司发布新产品，市场反应积极，预计短期内股价将上涨。',
    status: 'generated' as const,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  };

  const mockDelivery = {
    id: 'test-delivery-1',
    signalId: 'test-signal-1',
    userId: 'test-user-1',
    orderToken: 'test-token-123',
    riskCheckResult: {
      status: 'pass' as const,
      currentSinglePositionPct: 5,
      projectedSinglePositionPct: 15,
      currentTotalPositionPct: 30,
      projectedTotalPositionPct: 40,
      availableCash: 50000,
      singlePositionLimit: 20,
      totalPositionLimit: 80,
      warningMessages: [],
      blockReasons: [],
      dataSource: 'live' as const,
      checkedAt: new Date(),
      coverageNote: '测试数据',
    },
    status: 'pending' as const,
    overrideRiskWarning: false,
    sentAt: new Date(),
  };

  const mockAccount = {
    userId: 'test-user-1',
    broker: 'futu' as const,
    totalAssets: 100000,
    cash: 50000,
    marketValue: 50000,
    positions: [],
    fetchedAt: new Date(),
    dataSource: 'live' as const,
  };

  const signalCard = buildNormalSignalCard(mockSignal, mockDelivery, mockDelivery.riskCheckResult, mockAccount);
  const signalResult = await sendMessageToUser(openId, { card: signalCard });
  if (signalResult) {
    console.log(`✅ 交易信号卡片发送成功: ${signalResult.messageId}`);
  } else {
    console.log('❌ 交易信号卡片发送失败');
  }

  // 等待1秒
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试3: 发送资讯解读卡片
  console.log('\n📰 测试3: 发送资讯解读卡片');
  const mockNewsItem = {
    id: 'test-news-1',
    source: 'test',
    title: '美联储宣布维持利率不变',
    content: '美联储在最新的货币政策会议上宣布维持联邦基金利率不变...',
    url: 'https://example.com/news/1',
    market: 'us' as const,
    symbols: ['SPY', 'QQQ'],
    aiProcessed: true,
    publishedAt: new Date(),
    createdAt: new Date(),
  };

  const mockAnalysis = {
    sentiment: 'positive' as const,
    importance: 'high' as const,
    summary: '美联储维持利率不变，符合市场预期，有利于股市稳定。',
    impact: '短期内市场情绪将保持乐观，科技股可能受益。',
    confidence: 75,
    tradingSignal: null,
  };

  const newsCard = buildNewsOnlyCard(mockNewsItem, mockAnalysis);
  const newsResult = await sendMessageToUser(openId, { card: newsCard });
  if (newsResult) {
    console.log(`✅ 资讯解读卡片发送成功: ${newsResult.messageId}`);
  } else {
    console.log('❌ 资讯解读卡片发送失败');
  }

  console.log('\n✨ 测试完成！请检查飞书是否收到消息。');
}

// 主函数
const openId = process.argv[2];
if (!openId) {
  console.error('❌ 请提供飞书用户 open_id');
  console.error('用法: npx ts-node scripts/test-feishu-push.ts <open_id>');
  process.exit(1);
}

testFeishuPush(openId).catch((error) => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
