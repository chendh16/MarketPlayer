#!/bin/bash

echo "=== MarketPlayer 环境安装脚本 ==="
echo ""

# 检查 Homebrew
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew 未安装"
    echo ""
    echo "请先安装 Homebrew："
    echo "打开终端，运行以下命令："
    echo ""
    echo '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo ""
    echo "安装完成后，重新运行此脚本"
    exit 1
else
    echo "✅ Homebrew 已安装: $(brew --version | head -1)"
fi

echo ""
echo "=== 开始安装数据库 ==="
echo ""

# 安装 PostgreSQL
echo "📦 安装 PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL 已安装"
else
    brew install postgresql@15
    echo "✅ PostgreSQL 安装完成"
fi

# 安装 Redis
echo ""
echo "📦 安装 Redis..."
if command -v redis-cli &> /dev/null; then
    echo "✅ Redis 已安装"
else
    brew install redis
    echo "✅ Redis 安装完成"
fi

# 启动服务
echo ""
echo "=== 启动数据库服务 ==="
echo ""

echo "🚀 启动 PostgreSQL..."
brew services start postgresql@15

echo "🚀 启动 Redis..."
brew services start redis

# 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 3

# 创建数据库
echo ""
echo "=== 创建数据库 ==="
echo ""

echo "📊 创建数据库 trading_bot..."
createdb trading_bot 2>/dev/null || echo "数据库已存在"

echo "👤 创建用户 trading_user..."
psql trading_bot -c "CREATE USER trading_user WITH PASSWORD 'password';" 2>/dev/null || echo "用户已存在"

echo "🔐 授予权限..."
psql trading_bot -c "GRANT ALL PRIVILEGES ON DATABASE trading_bot TO trading_user;" 2>/dev/null

# 验证安装
echo ""
echo "=== 验证安装 ==="
echo ""

echo "✅ PostgreSQL 状态:"
brew services list | grep postgresql

echo ""
echo "✅ Redis 状态:"
brew services list | grep redis

echo ""
echo "✅ 测试 PostgreSQL 连接:"
psql -U trading_user -d trading_bot -c "SELECT version();" 2>&1 | head -3

echo ""
echo "✅ 测试 Redis 连接:"
redis-cli ping

echo ""
echo "=== 安装完成 ==="
echo ""
echo "下一步："
echo "1. 运行数据库迁移: npm run migrate"
echo "2. 启动开发服务器: npm run dev"
echo ""

