# MarketPlayer 安装和运行指南

## 📋 当前状态

✅ **已完成**：
- npm 依赖安装完成（724个包）
- 加密密钥已生成
- .env 配置文件已创建
- 测试全部通过（8/8）

⚠️ **需要安装**：
- Docker Desktop（推荐）或
- PostgreSQL + Redis（本地安装）

---

## 🚀 方案一：使用 Docker（推荐）

### 1. 安装 Docker Desktop

访问 [Docker Desktop](https://www.docker.com/products/docker-desktop) 下载并安装。

**Mac 用户**：
```bash
# 使用 Homebrew 安装
brew install --cask docker
```

安装完成后，启动 Docker Desktop 应用。

### 2. 启动数据库服务

```bash
# 启动 PostgreSQL 和 Redis
docker compose up -d postgres redis

# 检查服务状态
docker compose ps
```

### 3. 运行数据库迁移

```bash
npm run migrate
```

### 4. 启动开发服务器

```bash
npm run dev
```

---

## 🔧 方案二：本地安装数据库

### 1. 安装 PostgreSQL

**Mac 用户**：
```bash
brew install postgresql@15
brew services start postgresql@15

# 创建数据库和用户
createdb trading_bot
psql trading_bot -c "CREATE USER trading_user WITH PASSWORD 'password';"
psql trading_bot -c "GRANT ALL PRIVILEGES ON DATABASE trading_bot TO trading_user;"
```

**Ubuntu/Debian**：
```bash
sudo apt update
sudo apt install postgresql-15
sudo systemctl start postgresql
```

### 2. 安装 Redis

**Mac 用户**：
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian**：
```bash
sudo apt install redis-server
sudo systemctl start redis
```

### 3. 验证服务

```bash
# 测试 PostgreSQL
psql -U trading_user -d trading_bot -c "SELECT version();"

# 测试 Redis
redis-cli ping
```

### 4. 运行数据库迁移

```bash
npm run migrate
```

### 5. 启动开发服务器

```bash
npm run dev
```

---

## 🔑 配置 API Keys

编辑 `.env` 文件，填入真实的 API Keys：

### 1. Discord Bot Token

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)
2. 创建新应用 → Bot → 复制 Token
3. 更新 `.env`：
   ```bash
   DISCORD_BOT_TOKEN=your_real_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   ```

### 2. Anthropic API Key

1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 创建 API Key
3. 更新 `.env`：
   ```bash
   ANTHROPIC_API_KEY=your_anthropic_key_here
   ```

### 3. 富途 API（可选）

如果使用方案A（全自动下单），需要申请富途 OpenAPI 权限。

方案B（深链接）和方案C（纯推送）不需要富途 API。

---

## ✅ 验证安装

### 1. 运行测试

```bash
npm test
```

应该看到：
```
Test Suites: 3 passed, 3 total
Tests:       8 passed, 8 total
```

### 2. 运行演示模式

```bash
node demo.js
```

### 3. 检查配置

```bash
# 生成新的加密密钥（如果需要）
npm run generate-keys

# 查看项目状态
cat PROJECT_STATUS.md
```

---

## 📝 常用命令

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm test                 # 运行测试
npm run lint             # 代码检查

# 工具
npm run generate-keys    # 生成加密密钥
npm run cost-report      # AI成本报告
node demo.js             # 演示模式

# Docker
docker compose up -d     # 启动所有服务
docker compose down      # 停止所有服务
docker compose logs -f   # 查看日志
docker compose ps        # 查看状态

# 数据库
npm run migrate          # 运行迁移
psql -U trading_user -d trading_bot  # 连接数据库
redis-cli                # 连接 Redis
```

---

## 🐛 故障排查

### 问题1：npm install 失败

```bash
# 清理缓存重试
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### 问题2：Docker 启动失败

```bash
# 检查 Docker 是否运行
docker ps

# 查看日志
docker compose logs postgres
docker compose logs redis

# 重启服务
docker compose restart
```

### 问题3：数据库连接失败

```bash
# 检查 PostgreSQL 状态
brew services list | grep postgresql

# 检查 Redis 状态
brew services list | grep redis

# 测试连接
psql -U trading_user -d trading_bot
redis-cli ping
```

### 问题4：端口被占用

```bash
# 查看端口占用
lsof -i :3000  # API 端口
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# 修改 .env 中的 PORT 配置
```

---

## 📊 测试结果

当前测试状态：
- ✅ 风控测试：3/3 通过
- ✅ 加密测试：2/2 通过
- ✅ 配置测试：3/3 通过
- ✅ 总计：8/8 通过

---

## 🎯 下一步

1. **安装数据库**：选择 Docker 或本地安装
2. **配置 API Keys**：Discord + Anthropic
3. **运行迁移**：`npm run migrate`
4. **启动服务**：`npm run dev`
5. **开始开发**：实现资讯源对接

---

## 📚 相关文档

- [README.md](README.md) - 项目概览
- [DEVELOPMENT.md](DEVELOPMENT.md) - 开发指南
- [PROJECT_STATUS.md](PROJECT_STATUS.md) - 项目状态
- [dev-docs/](dev-docs/) - 详细设计文档

---

## 💡 提示

- 开发阶段保持 `COLD_START_MODE=true`
- 定期运行 `npm run cost-report` 监控成本
- 查看 `logs/` 目录了解运行日志
- 遇到问题查看 FAQ 或提交 Issue

---

**祝你开发顺利！🚀**

