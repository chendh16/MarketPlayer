# AI 提供商配置指南

MarketPlayer 支持多种 AI 提供商，你可以根据需要选择和配置。

---

## 🎯 支持的 AI 提供商

| 提供商 | 配置值 | 说明 |
|--------|--------|------|
| **Anthropic Claude** | `anthropic` | 默认推荐，性能优秀 |
| **OpenAI** | `openai` | GPT-4 系列模型 |
| **Azure OpenAI** | `azure` | 企业级 OpenAI 服务 |
| **自定义 API** | `custom` | 兼容 OpenAI 格式的任何 API |

---

## 📝 配置方式

### 方式 1: Anthropic Claude（默认）

```bash
# .env 文件
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-api03-xxxxx
AI_MODEL=claude-sonnet-4-20250514
```

**获取 API Key：**
1. 访问 https://console.anthropic.com/
2. 注册并创建 API Key
3. 复制 Key 到 `.env` 文件

**定价：**
- Claude Sonnet 4: $3/M input tokens, $15/M output tokens

---

### 方式 2: OpenAI

```bash
# .env 文件
AI_PROVIDER=openai
AI_API_KEY=sk-xxxxx
AI_MODEL=gpt-4-turbo-preview
AI_API_BASE_URL=https://api.openai.com/v1
```

**获取 API Key：**
1. 访问 https://platform.openai.com/
2. 创建 API Key
3. 复制 Key 到 `.env` 文件

**定价：**
- GPT-4 Turbo: $10/M input tokens, $30/M output tokens

---

### 方式 3: Azure OpenAI

```bash
# .env 文件
AI_PROVIDER=azure
AI_API_KEY=your_azure_key
AI_MODEL=your_deployment_name
AI_API_BASE_URL=https://your-resource.openai.azure.com/
```

**配置步骤：**
1. 在 Azure Portal 创建 OpenAI 资源
2. 部署模型（如 GPT-4）
3. 获取 API Key 和 Endpoint
4. 填入配置

---

### 方式 4: 自定义 API（兼容 OpenAI 格式）

```bash
# .env 文件
AI_PROVIDER=custom
AI_API_KEY=your_custom_key
AI_MODEL=your_model_name
AI_API_BASE_URL=https://your-api.com/v1
```

**适用场景：**
- 使用国内 AI 服务（如智谱、百川等）
- 自建 AI 服务
- 使用代理服务

**要求：**
- API 必须兼容 OpenAI Chat Completions 格式
- 支持 `/v1/chat/completions` 端点

---

## 🔄 切换 AI 提供商

### 步骤 1: 修改配置

编辑 `.env` 文件：

```bash
# 从 Anthropic 切换到 OpenAI
AI_PROVIDER=openai
AI_API_KEY=sk-xxxxx
AI_MODEL=gpt-4-turbo-preview
AI_API_BASE_URL=https://api.openai.com/v1
```

### 步骤 2: 重启服务

```bash
npm run dev
```

### 步骤 3: 验证

查看日志确认 AI 提供商已切换：

```
[info]: AI Provider initialized: OpenAI
```

---

## 💰 成本对比

| 提供商 | Input ($/M tokens) | Output ($/M tokens) | 总成本估算 |
|--------|-------------------|---------------------|-----------|
| Claude Sonnet 4 | $3 | $15 | 较低 ✅ |
| GPT-4 Turbo | $10 | $30 | 较高 |
| Azure OpenAI | $10 | $30 | 较高 |
| 自定义 API | 取决于提供商 | 取决于提供商 | 可能更低 |

**每日 500 次调用估算：**
- 平均每次：1000 input + 500 output tokens
- Claude Sonnet 4: ~$10.5/天
- GPT-4 Turbo: ~$25/天

---

## ❓ 常见问题

### Q: 如何使用国内 AI 服务？

A: 使用 `custom` 提供商，配置对应的 API 地址。

### Q: 如何降低 AI 成本？

A:
1. 使用 Claude Sonnet 4（成本最低）
2. 调整 `AI_DAILY_CALL_LIMIT` 限制调用次数
3. 优化预筛选规则，减少无效调用

