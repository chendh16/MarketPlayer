# 07 — REST API 接口定义

---

## 通用规范

- **Base URL:** `/api/v1`
- **认证:** Bearer Token（JWT），所有接口必须认证，除注册/登录
- **错误格式:**
```json
{ "error": "ERROR_CODE", "message": "描述", "details": {} }
```
- **成功格式:**
```json
{ "data": {}, "message": "成功" }
```

---

## 用户 & 账户

### POST /auth/register
注册账户（必须签署风险协议）

**Request:**
```json
{
  "discordUserId": "123456789",
  "discordUsername": "user#1234",
  "riskAgreementSigned": true
}
```
**Response 201:**
```json
{
  "data": {
    "userId": "uuid",
    "token": "jwt-token"
  }
}
```
**规则:** `riskAgreementSigned` 必须为 `true`，否则返回 400

---

### GET /users/me
获取当前用户信息

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "discordUsername": "user#1234",
    "riskPreference": "balanced",
    "dailySignalLimit": 20,
    "riskLimits": {
      "singlePositionLimit": 20,
      "totalPositionLimit": 80,
      "singleOrderLimit": 10
    }
  }
}
```

---

### PATCH /users/me/preferences
更新风险偏好设置

**Request:**
```json
{
  "riskPreference": "conservative",
  "customSinglePositionLimit": null,
  "customTotalPositionLimit": null,
  "customSingleOrderLimit": null,
  "dailySignalLimit": 20
}
```

---

### POST /broker-accounts
绑定券商账户

**Request:**
```json
{
  "broker": "futu",
  "credentials": {
    "appId": "xxxx",
    "appSecret": "xxxx",
    "accountId": "xxxx"
  }
}
```
**规则:**
- credentials 在服务端 AES-256 加密后存储
- 绑定前测试连接，连接失败返回 400
- 绑定成功后记录 `lastConnectedAt`

---

### GET /broker-accounts
获取已绑定的券商账户列表

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "broker": "futu",
      "isActive": true,
      "lastConnectedAt": "2026-02-27T10:00:00Z",
      "maskedCredentials": "****xxxx"
    }
  ]
}
```

---

### DELETE /broker-accounts/:id
解绑券商账户

---

## 持仓管理

### GET /positions
获取账户持仓（富途实时 + 手动填写）

**Query:** `?broker=futu&includeManual=true`

**Response 200:**
```json
{
  "data": {
    "futu": {
      "totalAssets": 100000,
      "availableCash": 48000,
      "totalPositionPct": 52,
      "positions": [
        { "symbol": "NVDA", "market": "us", "quantity": 10, "marketValue": 4850, "positionPct": 4.85 }
      ],
      "fetchedAt": "2026-02-27T10:00:00Z",
      "source": "cache"
    },
    "manual": [
      { "symbol": "00700", "market": "hk", "quantity": 100, "avgCost": 350, "updatedAt": "..." }
    ]
  }
}
```

---

### PUT /positions/manual
更新手动填写的其他平台持仓

**Request:**
```json
{
  "positions": [
    { "symbol": "00700", "market": "hk", "quantity": 100, "avgCost": 350 },
    { "symbol": "600519", "market": "a", "quantity": 5, "avgCost": 1800 }
  ]
}
```
**规则:** 全量替换，不支持部分更新

---

## 信号 & 交割

### GET /signals
获取信号列表

**Query:** `?status=pending&limit=20&offset=0`

**Response 200:**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "symbol": "NVDA",
        "market": "us",
        "direction": "long",
        "confidence": 78,
        "suggestedPositionPct": 5,
        "reasoning": "Q4财报EPS超预期12%",
        "status": "sent",
        "createdAt": "2026-02-27T10:00:00Z"
      }
    ],
    "total": 50
  }
}
```

---

### GET /deliveries/:id
获取单条信号推送详情（含风控结果）

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "signal": { "symbol": "NVDA", "direction": "long", "confidence": 78 },
    "status": "pending",
    "riskCheckResult": {
      "status": "pass",
      "currentSinglePositionPct": 0,
      "projectedSinglePositionPct": 5,
      "currentTotalPositionPct": 65,
      "projectedTotalPositionPct": 70,
      "availableCash": 48000,
      "coverageNote": "风控仅覆盖富途账户，..."
    },
    "orderToken": "uuid",
    "sentAt": "2026-02-27T10:00:00Z",
    "expiresAt": "2026-02-27T10:15:00Z"
  }
}
```

---

### POST /deliveries/:id/confirm
用户确认下单（此接口为 Discord Bot 内部调用，不直接暴露给用户）

**Request:**
```json
{
  "orderToken": "uuid",
  "adjustedPositionPct": null
}
```
**规则:**
- `orderToken` 必须与数据库记录匹配
- delivery 必须是 `pending` 状态
- delivery 未超过15分钟有效期

---

### POST /deliveries/:id/ignore
用户忽略信号

---

## 订单管理

### GET /orders
获取订单历史

**Query:** `?status=filled&limit=20&offset=0&startDate=2026-01-01`

**Response 200:**
```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "symbol": "NVDA",
        "direction": "buy",
        "quantity": 5,
        "referencePrice": 462,
        "executedPrice": 463.5,
        "status": "filled",
        "broker": "futu",
        "createdAt": "2026-02-27T10:00:00Z"
      }
    ],
    "total": 100
  }
}
```

---

## 系统状态

### GET /health
系统健康检查

**Response 200:**
```json
{
  "status": "ok",
  "services": {
    "postgres": "ok",
    "redis": "ok",
    "discord": "ok",
    "futu": "ok"
  },
  "aiDailyCalls": 45,
  "aiDailyCallLimit": 500
}
```

---

### GET /admin/cost-summary
AI 调用成本摘要（管理员接口）

**Response 200:**
```json
{
  "data": {
    "today": { "calls": 45, "estimatedCostUsd": 1.23 },
    "thisMonth": { "calls": 1200, "estimatedCostUsd": 32.50 },
    "breakdown": {
      "analysis": { "calls": 20, "cost": 0.55 },
      "signal": { "calls": 15, "cost": 0.42 },
      "summary": { "calls": 10, "cost": 0.26 }
    }
  }
}
```

---

## 错误码定义

| 错误码 | HTTP | 说明 |
|--------|------|------|
| `RISK_AGREEMENT_REQUIRED` | 400 | 未签署风险协议 |
| `DELIVERY_EXPIRED` | 400 | 信号参考已失效 |
| `DELIVERY_NOT_PENDING` | 400 | 信号参考不是待确认状态 |
| `ORDER_TOKEN_MISMATCH` | 400 | OrderToken 不匹配 |
| `ORDER_TOKEN_USED` | 409 | OrderToken 已使用（幂等） |
| `BROKER_CONNECTION_FAILED` | 400 | 券商 API 连接失败 |
| `RISK_BLOCKED` | 422 | 风控拦截 |
| `DAILY_LIMIT_REACHED` | 429 | 今日推送上限 |
| `UNAUTHORIZED` | 401 | 未认证 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `INTERNAL_ERROR` | 500 | 系统内部错误 |
