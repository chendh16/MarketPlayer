/**
 * 简单的 MCP 新闻服务器（用于测试）
 * 模拟 MCP 协议返回新闻数据
 */

const express = require('express');
const app = express();

app.use(express.json());

// 模拟新闻数据
const mockNews = {
  us: [
    {
      title: 'Apple announces new iPhone with AI features',
      content: 'Apple Inc. unveiled its latest iPhone model featuring advanced AI capabilities...',
      market: 'us',
      symbols: ['AAPL'],
      publishedAt: new Date().toISOString(),
      source: 'Reuters',
      url: 'https://example.com/news/1',
      triggerType: 'news',
    },
    {
      title: 'Tesla stock surges on strong delivery numbers',
      content: 'Tesla Inc. reported better-than-expected vehicle deliveries for the quarter...',
      market: 'us',
      symbols: ['TSLA'],
      publishedAt: new Date(Date.now() - 1800000).toISOString(),
      source: 'Bloomberg',
      url: 'https://example.com/news/2',
      triggerType: 'news',
    },
    {
      title: 'Microsoft expands AI partnership with OpenAI',
      content: 'Microsoft Corporation announced a deeper collaboration with OpenAI...',
      market: 'us',
      symbols: ['MSFT'],
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      source: 'CNBC',
      url: 'https://example.com/news/3',
      triggerType: 'news',
    },
  ],
  btc: [
    {
      title: 'Bitcoin reaches new all-time high',
      content: 'Bitcoin surged past $100,000 for the first time in history...',
      market: 'btc',
      symbols: ['BTC'],
      publishedAt: new Date().toISOString(),
      source: 'CoinDesk',
      url: 'https://example.com/news/4',
      triggerType: 'price',
    },
    {
      title: 'Major institutions increase Bitcoin holdings',
      content: 'Several large financial institutions have significantly increased their Bitcoin positions...',
      market: 'btc',
      symbols: ['BTC'],
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      source: 'CoinTelegraph',
      url: 'https://example.com/news/5',
      triggerType: 'news',
    },
  ],
  hk: [
    {
      title: '腾讯发布最新财报，营收超预期',
      content: '腾讯控股发布2024年第四季度财报，营收同比增长15%...',
      market: 'hk',
      symbols: ['00700'],
      publishedAt: new Date().toISOString(),
      source: '财新网',
      url: 'https://example.com/news/6',
      triggerType: 'earnings',
    },
  ],
  a: [
    {
      title: '贵州茅台股价创历史新高',
      content: '贵州茅台今日股价突破2000元大关，创历史新高...',
      market: 'a',
      symbols: ['600519'],
      publishedAt: new Date().toISOString(),
      source: '东方财富',
      url: 'https://example.com/news/7',
      triggerType: 'price',
    },
  ],
};

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MCP 工具调用：获取新闻
app.post('/tools/fetch_news', (req, res) => {
  const { arguments: args } = req.body;
  const { market, limit = 10, since } = args || {};
  
  console.log(`[MCP] Received request: market=${market}, limit=${limit}`);
  
  // 获取对应市场的新闻
  let news = mockNews[market] || [];
  
  // 过滤时间
  if (since) {
    const sinceDate = new Date(since);
    news = news.filter(item => new Date(item.publishedAt) >= sinceDate);
  }
  
  // 限制数量
  news = news.slice(0, limit);
  
  console.log(`[MCP] Returning ${news.length} news items`);
  
  // 返回 MCP 格式的响应
  res.json({
    items: news,
    metadata: {
      total: news.length,
      market,
      fetchedAt: new Date().toISOString(),
    },
  });
});

// 启动服务器
const PORT = process.env.MCP_PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n=== MCP 新闻服务器已启动 ===`);
  console.log(`端口: ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`新闻接口: http://localhost:${PORT}/tools/fetch_news`);
  console.log(`\n支持的市场: us, btc, hk, a`);
  console.log(`\n示例请求:`);
  console.log(`curl -X POST http://localhost:${PORT}/tools/fetch_news \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"arguments": {"market": "us", "limit": 5}}'`);
  console.log(`\n按 Ctrl+C 停止服务器\n`);
});

