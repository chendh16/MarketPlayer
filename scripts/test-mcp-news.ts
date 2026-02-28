/**
 * MCP 新闻服务测试脚本
 * 用于验证 MCP 资讯获取功能
 */

import { newsService } from '../src/services/news/adapters/service';
import { NewsAdapterFactory } from '../src/services/news/adapters/base';
import { logger } from '../src/utils/logger';

async function testMCPNews() {
  console.log('=== MCP 新闻服务测试 ===\n');
  
  // 配置 MCP 适配器
  const mcpAdapter = NewsAdapterFactory.create('mcp', {
    server: process.env.MCP_NEWS_SERVER || 'http://localhost:3001',
    tool: process.env.MCP_NEWS_TOOL || 'fetch_news',
    timeout: 30000,
  });
  
  // 注册适配器
  NewsAdapterFactory.register('test-mcp', mcpAdapter);
  
  console.log(`✅ MCP 适配器已创建`);
  console.log(`   服务器: ${process.env.MCP_NEWS_SERVER || 'http://localhost:3001'}`);
  console.log(`   工具: ${process.env.MCP_NEWS_TOOL || 'fetch_news'}\n`);
  
  // 健康检查
  console.log('🔍 执行健康检查...');
  const healthy = await mcpAdapter.healthCheck();
  console.log(`   健康状态: ${healthy ? '✅ 正常' : '❌ 异常'}\n`);
  
  if (!healthy) {
    console.log('⚠️  MCP 服务器不可用，请检查：');
    console.log('   1. MCP 服务器是否已启动');
    console.log('   2. 服务器地址是否正确');
    console.log('   3. 网络连接是否正常\n');
    return;
  }
  
  // 测试获取新闻
  console.log('📰 测试获取美股新闻...');
  try {
    const result = await mcpAdapter.fetchNews({
      market: 'us',
      limit: 5,
      since: new Date(Date.now() - 3600000), // 最近1小时
    });
    
    console.log(`✅ 成功获取 ${result.items.length} 条新闻`);
    console.log(`   数据源: ${result.source}`);
    console.log(`   获取时间: ${result.fetchedAt.toISOString()}\n`);
    
    if (result.items.length > 0) {
      console.log('📋 新闻列表：\n');
      result.items.forEach((item, index) => {
        console.log(`${index + 1}. ${item.title || '无标题'}`);
        console.log(`   市场: ${item.market || 'N/A'}`);
        console.log(`   标的: ${item.symbols?.join(', ') || 'N/A'}`);
        console.log(`   时间: ${item.publishedAt || 'N/A'}`);
        if (item.content) {
          console.log(`   内容: ${item.content.substring(0, 100)}...`);
        }
        console.log('');
      });
    } else {
      console.log('⚠️  未获取到新闻数据\n');
    }
    
    // 测试其他市场
    console.log('📰 测试获取 BTC 新闻...');
    const btcResult = await mcpAdapter.fetchNews({
      market: 'btc',
      limit: 3,
    });
    
    console.log(`✅ 成功获取 ${btcResult.items.length} 条 BTC 新闻\n`);
    
  } catch (error: any) {
    console.log(`❌ 获取新闻失败: ${error.message}\n`);
    console.log('错误详情:');
    console.log(error);
  }
  
  console.log('=== 测试完成 ===');
}

// 运行测试
testMCPNews().catch(error => {
  console.error('测试失败:', error);
  process.exit(1);
});

