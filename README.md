# MarketPlayer

<div align="center">

**AI 智能交易助手 - 面向华人个人投资者**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Development-orange.svg)](PROJECT_STATUS.md)
[![Market News](https://github.com/actions/workflows/market-news.yml/badge.svg)](../../actions/workflows/market-news.yml)

</div>

---

## 📖 项目简介

MarketPlayer 是一个基于 AI 的智能交易助手系统，7×24 监控 **A股/港股/美股/BTC** 市场，通过 Discord Bot 推送 AI 信号参考，用户人工确认后自动在富途下单。

### 核心价值

- ✅ **7×24 全市场监控**：自动抓取四大市场资讯，主动推送关键信号
- ✅ **AI 中文解读**：Claude AI 深度分析，生成中文交易参考
- ✅ **智能风控**：实时持仓检查，多层风控保障
- ✅ **人工确认**：永不自动下单，所有交易必须用户确认
- ✅ **一键执行**：Discord 内确认后自动在富途下单

### 核心流程

```mermaid
graph LR
    A[资讯抓取] --> B[规则预筛选]
    B --> C[AI分析]
    C --> D[风控检查]
    D --> E[Discord推送]
    E --> F[用户确认]
    F --> G[富途下单]
    G --> H[执行反馈]
```

### 项目特点

- ✅ **安全第一**：强制人工确认，永不绕过人工确认
- ✅ **智能分析**：支持多种 AI 提供商（Anthropic、OpenAI、Azure、自定义）
- ✅ **风控保障**：多层风控检查，实时持仓验证
- ✅ **幂等性**：防止重复下单，分布式锁保护
- ✅ **可插拔架构**：AI 和资讯获取都支持多种方式
- ✅ **生产就绪**：Docker 部署，PM2 管理，完整日志

## 🛠️ 技术栈

### 后端技术
- **Runtime**: Node.js 20+ (TypeScript 5.3)
- **框架**: Express.js 4.18
- **任务队列**: BullMQ 5.0 (基于 Redis)
- **定时任务**: node-cron 3.0

### 数据存储
- **主数据库**: PostgreSQL 15+ (状态持久化、日志)
- **缓存/队列**: Redis 7+ (持仓缓存、分布式锁、消息队列)

### AI & 外部服务
- **AI 模型**: 可插拔架构，支持 Anthropic Claude、OpenAI、Azure、自定义 API
- **推送渠道**: Discord.js v14 (主渠道) + Telegram (备用)
- **券商对接**: 富途 API (futu-api)
- **资讯获取**: 可插拔架构，支持 API、Skill、MCP 等多种方式

### 基础设施
- **容器化**: Docker + Docker Compose
- **进程管理**: PM2
- **日志系统**: Winston 3.11
- **错误追踪**: Sentry 7.0
- **测试框架**: Jest 29 + ts-jest

## 🚀 快速开始

### 方式一：一键启动（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd MarketPlayer

# 安装依赖
npm install

# 生成加密密钥
npm run generate-keys

# 配置环境变量（将生成的密钥复制到 .env）
cp .env.example .env
# 编辑 .env 文件，填入必需的配置

# 一键启动
./start.sh
```

### 方式二：手动启动

#### 1. 环境准备

```bash
# 安装依赖
npm install

# 生成加密密钥
npm run generate-keys
```

#### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填入以下必需配置：

```bash
# 数据库
DATABASE_URL=postgresql://trading_user:password@localhost:5432/trading_bot
REDIS_URL=redis://localhost:6379

# Discord Bot（在 https://discord.com/developers/applications 创建）
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# AI 配置（可插拔）
AI_PROVIDER=anthropic
AI_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-20250514
# 可选：OpenAI 兼容 API 地址
AI_API_BASE_URL=

# 加密密钥（使用 npm run generate-keys 生成）
ENCRYPTION_KEY=your_generated_key
ENCRYPTION_IV=your_generated_iv
JWT_SECRET=your_generated_secret
```

#### 3. 启动数据库

**使用 Docker（推荐）：**
```bash
# 使用 Docker Compose 启动
docker-compose up -d postgres redis
```

**本地安装（如果没有 Docker）：**
```bash
# 查看详细安装指南
cat DATABASE_SETUP.md

# 或运行自动安装脚本
./install-db.sh
```

> 💡 **提示**：如果你还没有安装 Homebrew 或数据库，请查看 [DATABASE_SETUP.md](DATABASE_SETUP.md) 获取详细的安装指南。

#### 4. 运行数据库迁移

```bash
npm run migrate
```

#### 5. 启动开发服务器

```bash
npm run dev
```

### 生产部署

```bash
# 构建项目
npm run build

# 使用 Docker Compose 启动所有服务
docker-compose up -d

# 或使用 PM2 启动
pm2 start ecosystem.config.js --env production

# 查看日志
pm2 logs market-player
```

### GitHub Actions 定时运行（每 2 小时）

项目内置 `.github/workflows/market-news.yml`，在 GitHub Actions 上每 2 小时自动完成完整管道：

```
资讯抓取（4 市场）→ AI 分析 → Discord 推送
```

**首次配置**：在仓库 **Settings → Secrets and variables → Actions** 中添加以下 Secrets：

| Secret | 说明 |
|--------|------|
| `DATABASE_URL` | PostgreSQL 连接串（需外网可访问，如 Supabase / Railway） |
| `REDIS_URL` | Redis 连接串（如 Upstash） |
| `DISCORD_BOT_TOKEN` | Discord Bot Token |
| `DISCORD_CLIENT_ID` | Discord 应用 Client ID |
| `AI_API_KEY` | Anthropic API Key |
| `JWT_SECRET` | 任意随机字符串 |
| `COINGECKO_API_KEY` | 可选，免费层不填也可运行 |

配置完成后可在 **Actions → Market News → Run workflow** 手动触发验证。

> Workflow 会在同一 job 内自动启动 US Skill 服务器（Yahoo Finance RSS）和 A 股 MCP 服务器（新浪财经），无需额外配置外部服务。

## 📁 项目结构

```
MarketPlayer/
├── src/
│   ├── index.ts                    # 主入口文件
│   ├── config/                     # 配置管理
│   │   └── index.ts               # 环境变量读取与验证
│   ├── db/                         # 数据库层
│   │   ├── postgres.ts            # PostgreSQL 连接
│   │   ├── redis.ts               # Redis 连接
│   │   ├── queries.ts             # 查询辅助函数
│   │   └── migrations/            # 数据库迁移脚本
│   ├── models/                     # 数据模型
│   │   ├── user.ts                # 用户模型
│   │   ├── signal.ts              # 信号模型
│   │   ├── order.ts               # 订单模型
│   │   └── position.ts            # 持仓模型
│   ├── services/                   # 业务服务
│   │   ├── news/                  # 资讯抓取
│   │   │   ├── sources/          # 各市场数据源
│   │   │   └── filter.ts         # 预筛选规则
│   │   ├── ai/                    # AI 分析
│   │   │   └── analyzer.ts       # Claude 集成
│   │   ├── risk/                  # 风控引擎
│   │   │   └── engine.ts         # 风控规则
│   │   ├── discord/               # Discord Bot
│   │   │   ├── bot.ts            # Bot 主逻辑
│   │   │   └── formatter.ts      # 消息格式化
│   │   ├── futu/                  # 富途对接
│   │   │   ├── connection.ts     # 连接管理
│   │   │   ├── position.ts       # 持仓查询
│   │   │   └── order.ts          # 下单执行
│   │   └── scheduler/             # 定时任务
│   │       ├── news-fetcher.ts   # 资讯抓取定时器
│   │       └── expiry-checker.ts # 过期检查定时器
│   ├── queues/                     # BullMQ 队列
│   │   ├── news-queue.ts          # 资讯处理队列
│   │   └── order-queue.ts         # 订单执行队列
│   ├── api/                        # REST API
│   │   ├── server.ts              # Express 服务器
│   │   └── routes/                # API 路由
│   └── utils/                      # 工具函数
│       ├── logger.ts              # 日志系统
│       ├── encryption.ts          # 加密工具
│       ├── idempotency.ts         # 幂等性工具
│       └── market-hours.ts        # 市场时间工具
├── tests/                          # 测试文件
├── dev-docs/                       # 开发文档
├── scripts/                        # 工具脚本
├── docker-compose.yml              # Docker 配置
├── ecosystem.config.js             # PM2 配置
└── package.json                    # 项目配置
```

## ⚡ 核心功能

### 1. 📰 资讯抓取与AI处理

- **多市场监控**：美股、港股、A股、BTC 全覆盖
- **可插拔数据源**：支持 API、Skill、MCP 等多种方式获取资讯
- **定时抓取**：每5分钟自动抓取最新资讯
- **智能预筛选**：规则过滤减少 30-40% 无效 AI 调用
- **AI 深度分析**：支持多种 AI 提供商（Anthropic、OpenAI、Azure、自定义）
- **成本控制**：每日调用限制，实时成本监控

### 2. 🛡️ 风控引擎

- **多层检查**：
  - 单标的持仓上限（保守10%/均衡20%/激进30%）
  - 总仓位上限（保守60%/均衡80%/激进95%）
  - 可用资金验证
- **实时持仓**：60秒缓存，下单前强制实时拉取
- **多平台合并**：支持富途 + 手动填写的其他平台持仓
- **二次验证**：下单前再次风控检查

### 3. 💬 Discord Bot 交互

- **实时推送**：信号生成后立即推送到用户 DM
- **按钮交互**：一键确认/调整/忽略
- **有效期管理**：15分钟自动失效
- **风控提示**：清晰显示持仓状态和风险警告
- **3秒响应**：按钮交互立即 ACK，异步处理

### 4. 📦 订单执行

- **幂等性保障**：每个订单唯一 Token，防止重复下单
- **分布式锁**：用户维度锁，防止并发冲突
- **二次风控**：下单前实时拉取持仓再次验证
- **自动重试**：`retryable` 错误自动指数退避重试（2s/4s/8s，最多3次）
- **状态回写**：订单重试中/成功/失败会回写到原 Discord 消息
- **多种模式**：
  - 方案A：全自动下单（需富途 API 权限）
  - 方案B：深链接跳转（MVP 默认）
  - 方案C：纯推送通知

## ⚙️ 环境变量说明

详见 `.env.example` 文件，关键配置：

| 变量名 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | - | ✅ |
| `REDIS_URL` | Redis 连接字符串 | - | ✅ |
| `DISCORD_BOT_TOKEN` | Discord Bot Token | - | ✅ |
| `AI_PROVIDER` | AI 提供商（anthropic/openai/azure/custom） | `anthropic` | ✅ |
| `AI_API_KEY` | AI API Key | - | ✅ |
| `AI_MODEL` | AI 模型名 | `claude-sonnet-4-20250514` | - |
| `AI_API_BASE_URL` | 自定义 AI API 地址 | - | - |
| `ENCRYPTION_KEY` | 加密密钥（32字节hex） | - | ✅ |
| `ENCRYPTION_IV` | 加密IV（16字节hex） | - | ✅ |
| `JWT_SECRET` | JWT 密钥 | - | ✅ |
| `COLD_START_MODE` | 测试模式（禁用实际下单） | `true` | ⚠️ |
| `AI_DAILY_CALL_LIMIT` | AI 每日调用上限 | `500` | - |
| `FUTU_ORDER_MODE` | 富途下单模式 | `B` | - |
| `FUTU_TRD_ENV` | 富途交易环境（SIMULATE/REAL） | `SIMULATE` | - |
| `FUTU_TRADE_ACC_ID` | 富途交易账号 ID | - | - |
| `FUTU_TRADE_ACC_INDEX` | 富途账号索引 | `0` | - |
| `FUTU_TRADE_PASSWORD` | 富途交易密码（明文） | - | - |
| `FUTU_TRADE_PASSWORD_MD5` | 富途交易密码（MD5） | - | - |
| `FUTU_AUTO_UNLOCK` | 是否自动解锁交易 | `true` | - |
| `FUTU_FALLBACK_TO_PLAN_B` | 方案A失败时降级到方案B | `true` | - |
| `FUTU_ORDER_PRICE_SLIPPAGE_PCT` | 方案A下单价格滑点比例 | `0.01` | - |
| `PORT` | API 服务端口 | `3000` | - |
| `LOG_LEVEL` | 日志级别 | `info` | - |

**下单模式说明**：
- `A` = 全自动下单（需富途交易级 API 权限）
- `B` = 深链接跳转（MVP 默认，无需特殊权限）
- `C` = 纯推送通知（仅提示，不执行）
- `A` 模式需安装 `futu-api` 并配置交易参数（见 `.env.example`）

## 📝 常用命令

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run migrate          # 运行数据库迁移
npm test                 # 运行测试
npm run lint             # 代码检查

# 工具
npm run generate-keys    # 生成加密密钥
npm run cost-report      # 查看 AI 成本报告

# 部署
docker-compose up -d     # 启动所有服务（Docker）
pm2 start ecosystem.config.js  # 使用 PM2 启动
pm2 logs market-player   # 查看日志
pm2 restart market-player  # 重启服务
pm2 stop market-player   # 停止服务
```

## 📚 开发文档

详细开发文档请查看以下文件：

| 文档 | 说明 |
|------|------|
| [DATABASE_SETUP.md](DATABASE_SETUP.md) | 数据库安装指南 |
| [INSTALLATION.md](INSTALLATION.md) | 完整安装指南 |
| [AI_PROVIDER_GUIDE.md](AI_PROVIDER_GUIDE.md) | AI 提供商配置指南 |
| [NEWS_ADAPTER_GUIDE.md](NEWS_ADAPTER_GUIDE.md) | 资讯获取架构指南 |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | 项目状态报告 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 开发指南 |
| [dev-docs/00-INDEX.md](dev-docs/00-INDEX.md) | 文档索引 |
| [dev-docs/01-OVERVIEW.md](dev-docs/01-OVERVIEW.md) | 项目概览 |
| [dev-docs/02-DATA-MODELS.md](dev-docs/02-DATA-MODELS.md) | 数据模型 |
| [dev-docs/03-NEWS-PIPELINE.md](dev-docs/03-NEWS-PIPELINE.md) | 资讯流水线 |
| [dev-docs/04-RISK-ENGINE.md](dev-docs/04-RISK-ENGINE.md) | 风控引擎 |
| [dev-docs/05-DISCORD-BOT.md](dev-docs/05-DISCORD-BOT.md) | Discord Bot |
| [dev-docs/06-ORDER-EXECUTION.md](dev-docs/06-ORDER-EXECUTION.md) | 订单执行 |
| [dev-docs/10-ENV-CONFIG.md](dev-docs/10-ENV-CONFIG.md) | 环境配置 |

## 🔒 安全注意事项

### 核心安全原则

1. ✅ **永不绕过人工确认**：所有交易必须用户在 Discord 手动确认后才会进入执行流程
2. ✅ **加密存储**：API 密钥使用 AES-256 加密存储
3. ✅ **幂等性保障**：每个订单唯一 Token，防止重复下单
4. ✅ **二次验证**：下单前实时拉取持仓再次风控检查
5. ✅ **分布式锁**：防止并发下单冲突

### 风控声明

- 每条推送必须显示"风控仅覆盖富途账户"声明
- 用户需手动确认其他平台持仓
- 超出风控限制时明确提示并拦截

### 免责声明

- 每条推送底部显示免责声明
- 明确标注"不构成投资建议，盈亏自负"
- 测试模式下禁用实际下单功能

### 开发安全

- ⚠️ 不要提交 `.env` 文件到代码仓库
- ⚠️ 定期更换 API 密钥
- ⚠️ 加密密钥一旦设置不要更改（会导致已加密数据无法解密）
- ⚠️ 生产环境使用 HTTPS
- ⚠️ 定期备份数据库

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 编写单元测试
- 更新相关文档

## ❓ 常见问题 (FAQ)

### Q: 如何获取 Discord Bot Token？
A: 访问 [Discord Developer Portal](https://discord.com/developers/applications)，创建应用 → Bot → 复制 Token。需要启用以下权限：
- Send Messages
- Read Messages
- Use Slash Commands
- Manage Messages

### Q: 如何获取 Anthropic API Key？
A: 访问 [Anthropic Console](https://console.anthropic.com/)，注册账号后在 API Keys 页面创建。

### Q: 富途 API 需要什么权限？
A:
- **方案A（全自动）**：需要申请富途 OpenAPI 交易级权限
- **方案B（深链接）**：无需特殊权限，使用富途 App 深链接
- **方案C（纯推送）**：无需富途 API

### Q: 如何控制 AI 成本？
A:
1. 设置 `AI_DAILY_CALL_LIMIT` 限制每日调用次数
2. 运行 `npm run cost-report` 查看实时成本
3. 调整资讯抓取频率
4. 优化预筛选规则

### Q: 测试模式和生产模式有什么区别？
A:
- **测试模式** (`COLD_START_MODE=true`)：禁用实际下单，仅推送信号
- **生产模式** (`COLD_START_MODE=false`)：启用真实下单功能

### Q: 如何测试完整流程？
A:
```bash
# 1. 启动 MCP 测试服务器（第一个终端）
npm run mcp-server

# 2. 运行端到端测试（第二个终端）
npm run test-e2e

# 3. 检查 Discord 私信是否收到信号推送
```

详细测试指南请查看 [E2E_TEST_GUIDE.md](E2E_TEST_GUIDE.md)

### Q: 如何添加新的资讯源？
A:
1. 配置 MCP 服务器或 Skill 适配器
2. 在 `.env` 中添加 `NEWS_ADAPTERS` 配置
3. 重启服务即可

详细配置请查看 [NEWS_ADAPTER_GUIDE.md](NEWS_ADAPTER_GUIDE.md)

### Q: 数据库迁移失败怎么办？
A:
```bash
# 检查数据库连接
docker ps | grep postgres

# 查看数据库日志
docker logs marketplayer-postgres-1

# 手动连接数据库检查
docker exec -it marketplayer-postgres-1 psql -U trading_user -d trading_bot
```

### Q: Redis 连接失败怎么办？
A:
```bash
# 检查 Redis 状态
docker ps | grep redis

# 测试 Redis 连接
docker exec -it marketplayer-redis-1 redis-cli ping
```

## 📊 项目状态

- **当前版本**: V1.0
- **开发状态**: 🟢 核心流程全部完成并验证
- **代码质量**: ✅ 无 TypeScript 错误
- **文档完整度**: ✅ 齐全
- **测试覆盖**: 🟡 基础测试 + 端到端测试

### 已完成功能

✅ **Phase 1: 核心流程**
- [x] 资讯获取可插拔架构（API / Skill / MCP 外部源）
- [x] AI 分析可插拔架构（Anthropic / OpenAI / Azure / 自定义）
- [x] Prompt 可配置（`prompts/*.md` 无需改代码即可调整 AI 行为）
- [x] 规则预筛选
- [x] AI 深度分析 + 信号生成
- [x] 风控引擎（持仓上限 / 总仓位 / 可用资金）
- [x] Discord Bot 推送 + 按钮交互（确认 / 调整仓位 / 忽略 / 提醒）
- [x] 订单执行（富途方案A全自动 / 方案B深链接 / 方案C纯通知）
- [x] 富途持仓 / 资金查询

✅ **Phase 2: 数据源（四市场全通）**
- [x] 美股（Yahoo Finance RSS，无需 API key）
- [x] 港股（Yahoo Finance RSS，无需 API key）
- [x] A 股（新浪财经滚动新闻，无需 API key）
- [x] BTC（CoinGecko + CoinDesk RSS 备用）
- [x] 端到端 MCP 管道验证（四市场 fetch → AI 分析 → Discord ✅）

✅ **Phase 3: Agent 兼容 + 自动化**
- [x] MCP 工具服务器（`src/mcp/server.ts`，10 个工具，POST /tools/:name）
- [x] US Skill 服务器 / A 股 MCP 服务器（独立外部适配器脚本）
- [x] GitHub Actions 定时 workflow（每 2 小时，四市场全量管道）

### 下一步方向 📋
- [ ] 增加单元测试覆盖率
- [ ] 性能优化 / 成本优化
- [ ] Telegram 备用推送
- [ ] Web 管理后台

详细状态请查看 [PROJECT_STATUS.md](PROJECT_STATUS.md)

## 📞 支持与反馈

- 📖 查看 [开发文档](DEVELOPMENT.md)
- 📊 查看 [项目状态](PROJECT_STATUS.md)
- 🐛 提交 [Issue](../../issues)
- 💬 加入讨论

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

## ⚠️ 免责声明

**重要提示**：

1. 本系统仅供技术研究和学习使用
2. 不构成任何投资建议或推荐
3. 使用本系统进行交易的所有风险由用户自行承担
4. 开发者不对任何投资损失负责
5. 请在使用前充分了解金融市场风险
6. 建议咨询专业金融顾问

**合规提醒**：

- 上线前请咨询当地金融合规律师
- 确保符合所在地区的金融监管要求
- 完善用户风险协议和免责声明
- 定期审查和更新合规文档

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star！**

Made with ❤️ by MarketPlayer Team

</div>
