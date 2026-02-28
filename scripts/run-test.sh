#!/bin/bash

echo "=== MarketPlayer 完整测试流程 ==="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查环境变量
echo "🔍 检查环境配置..."

if [ -z "$DISCORD_BOT_TOKEN" ] || [ "$DISCORD_BOT_TOKEN" = "test-key" ]; then
    echo -e "${YELLOW}⚠️  警告: DISCORD_BOT_TOKEN 未配置或使用测试值${NC}"
    echo "   请在 .env 中配置真实的 Discord Bot Token"
    echo "   获取方式: https://discord.com/developers/applications"
    echo ""
fi

if [ -z "$AI_API_KEY" ] || [ "$AI_API_KEY" = "test-key" ]; then
    echo -e "${YELLOW}⚠️  警告: AI_API_KEY 未配置或使用测试值${NC}"
    echo "   请在 .env 中配置真实的 AI API Key"
    echo "   Anthropic: https://console.anthropic.com/"
    echo ""
fi

if [ -z "$TEST_DISCORD_USER_ID" ]; then
    echo -e "${YELLOW}⚠️  警告: TEST_DISCORD_USER_ID 未配置${NC}"
    echo "   请在 .env 中配置你的 Discord User ID"
    echo "   获取方式: Discord 设置 → 高级 → 开发者模式 → 右键用户名 → 复制 ID"
    echo ""
fi

# 检查数据库
echo "📊 检查数据库连接..."
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

if psql -U trading_user -d trading_bot -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL 连接正常${NC}"
else
    echo -e "${RED}❌ PostgreSQL 连接失败${NC}"
    echo "   请运行: brew services start postgresql@15"
    exit 1
fi

if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis 连接正常${NC}"
else
    echo -e "${RED}❌ Redis 连接失败${NC}"
    echo "   请运行: brew services start redis"
    exit 1
fi

echo ""

# 运行数据库迁移
echo "🔄 运行数据库迁移..."
npm run migrate > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 数据库迁移完成${NC}"
else
    echo -e "${YELLOW}⚠️  数据库迁移可能已完成或遇到问题${NC}"
fi

echo ""

# 启动 MCP 服务器
echo "🚀 启动 MCP 测试服务器..."
node scripts/mcp-news-server.js > /tmp/mcp-server.log 2>&1 &
MCP_PID=$!
echo "   PID: $MCP_PID"

# 等待 MCP 服务器启动
sleep 3

# 检查 MCP 服务器
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MCP 服务器已启动${NC}"
else
    echo -e "${RED}❌ MCP 服务器启动失败${NC}"
    kill $MCP_PID 2>/dev/null
    exit 1
fi

echo ""

# 询问是否继续
echo "📋 准备运行端到端测试"
echo ""
echo "测试将会："
echo "  1. 创建测试用户"
echo "  2. 从 MCP 服务器获取新闻"
echo "  3. AI 分析新闻"
echo "  4. 生成交易信号"
echo "  5. 推送到 Discord"
echo ""
echo -e "${YELLOW}注意: 如果配置了真实的 AI API Key，将会产生少量费用（约 $0.01）${NC}"
echo ""

read -p "是否继续？(y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "测试已取消"
    kill $MCP_PID 2>/dev/null
    exit 0
fi

echo ""
echo "🧪 运行端到端测试..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 运行测试
npm run test-e2e

TEST_RESULT=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 停止 MCP 服务器
echo "🛑 停止 MCP 服务器..."
kill $MCP_PID 2>/dev/null
echo -e "${GREEN}✅ MCP 服务器已停止${NC}"

echo ""

if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}🎉 测试成功！${NC}"
    echo ""
    echo "📱 请检查你的 Discord 私信，应该收到一条交易信号推送"
    echo ""
    echo "💡 下一步："
    echo "   1. 查看日志: tail -f logs/combined.log"
    echo "   2. 查看数据库: psql -U trading_user -d trading_bot"
    echo "   3. 配置真实的 MCP 服务器或 Skill 适配器"
    echo "   4. 启用定时任务自动抓取新闻"
    echo ""
else
    echo -e "${RED}❌ 测试失败${NC}"
    echo ""
    echo "🔍 故障排查："
    echo "   1. 查看错误日志: tail -f logs/error.log"
    echo "   2. 检查 Discord Bot Token 是否正确"
    echo "   3. 检查 AI API Key 是否正确"
    echo "   4. 检查 TEST_DISCORD_USER_ID 是否正确"
    echo "   5. 查看详细测试指南: cat E2E_TEST_GUIDE.md"
    echo ""
fi

echo "=== 测试完成 ==="

