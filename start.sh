#!/bin/bash

# MarketPlayer 快速启动脚本

echo "=== MarketPlayer 启动检查 ==="
echo ""

# 检查 Node.js 版本
echo "检查 Node.js 版本..."
node --version || { echo "❌ Node.js 未安装"; exit 1; }

# 检查 npm
echo "检查 npm..."
npm --version || { echo "❌ npm 未安装"; exit 1; }

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  .env 文件不存在，正在从 .env.example 复制..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件，请编辑填入实际配置"
    echo ""
    echo "必须配置的环境变量："
    echo "  - DATABASE_URL"
    echo "  - REDIS_URL"
    echo "  - DISCORD_BOT_TOKEN"
    echo "  - ANTHROPIC_API_KEY"
    echo "  - ENCRYPTION_KEY (运行 npm run generate-keys 生成)"
    echo "  - ENCRYPTION_IV"
    echo ""
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 检查 Docker 服务
echo ""
echo "检查 Docker 服务..."
if command -v docker &> /dev/null; then
    echo "✅ Docker 已安装"
    COMPOSE_CMD=""
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        echo "⚠️  未检测到 docker compose / docker-compose，请手动启动 PostgreSQL 和 Redis"
    fi
    
    # 检查 PostgreSQL 容器
    if docker ps | grep -q postgres; then
        echo "✅ PostgreSQL 容器正在运行"
    else
        echo "⚠️  PostgreSQL 容器未运行，正在启动..."
        if [ -n "$COMPOSE_CMD" ]; then
            $COMPOSE_CMD up -d postgres
        fi
    fi
    
    # 检查 Redis 容器
    if docker ps | grep -q redis; then
        echo "✅ Redis 容器正在运行"
    else
        echo "⚠️  Redis 容器未运行，正在启动..."
        if [ -n "$COMPOSE_CMD" ]; then
            $COMPOSE_CMD up -d redis
        fi
    fi
else
    echo "⚠️  Docker 未安装，请确保 PostgreSQL 和 Redis 已手动启动"
fi

echo ""
echo "=== 启动 MarketPlayer ==="
echo ""

# 运行数据库迁移
echo "运行数据库迁移..."
npm run migrate || { echo "❌ 数据库迁移失败"; exit 1; }

echo ""
echo "✅ 准备就绪，启动开发服务器..."
echo ""

# 启动开发服务器
npm run dev
