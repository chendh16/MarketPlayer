#!/bin/bash

echo "=== MarketPlayer MCP 新闻测试 ==="
echo ""

# 启动 MCP 服务器
echo "🚀 启动 MCP 新闻服务器..."
node scripts/mcp-news-server.js &
MCP_PID=$!

# 等待服务器启动
echo "⏳ 等待服务器启动..."
sleep 3

# 测试健康检查
echo ""
echo "🔍 测试健康检查..."
curl -s http://localhost:3001/health | jq .

# 测试获取美股新闻
echo ""
echo "📰 测试获取美股新闻..."
curl -s -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"market": "us", "limit": 3}}' | jq .

# 测试获取 BTC 新闻
echo ""
echo "📰 测试获取 BTC 新闻..."
curl -s -X POST http://localhost:3001/tools/fetch_news \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"market": "btc", "limit": 2}}' | jq .

# 运行 TypeScript 测试
echo ""
echo "🧪 运行 TypeScript 测试..."
MCP_NEWS_SERVER=http://localhost:3001 npm run test-mcp

# 停止服务器
echo ""
echo "🛑 停止 MCP 服务器..."
kill $MCP_PID

echo ""
echo "=== 测试完成 ==="

