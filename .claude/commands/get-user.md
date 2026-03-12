调用 GET /api/users/:discordUserId，按 Discord 用户 ID 查询用户信息（只读）。

返回字段包括：数据库 UUID（userId）、风险偏好、通知渠道、自定义仓位限制等。

参数解析规则：
- discordUserId（必填）：Discord 用户的雪花 ID（字符串数字），如 123456789012345678

调用方式：
```
GET http://localhost:{PORT}/api/users/<discordUserId>
```

返回结构：
```json
{
  "id": "<uuid>",
  "discordUserId": "...",
  "riskPreference": "conservative | moderate | aggressive",
  "notificationChannels": ["discord", "email", "feishu"],
  "customSinglePositionLimit": null,
  "customTotalPositionLimit": null,
  "createdAt": "<ISO8601>"
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 get-user，展示该 Discord 用户的完整信息（uuid 可用于后续 get-user-signals / get-user-orders 等调用）。
