调用管理员接口，查看所有注册用户列表（含活跃度统计）。

返回每位用户的基本信息、风险偏好、通知渠道配置，以及信号和订单统计。

如尚未获取 adminToken，请先调用 admin-token skill。

参数解析规则：
- adminToken（必填）：管理员 JWT Bearer Token，通过 admin-token skill 获取

调用方式：
```
GET http://localhost:{PORT}/api/admin/users
Authorization: Bearer <adminToken>
```

返回结构：
```json
[
  {
    "id": "<uuid>",
    "discord_user_id": "...",
    "discord_username": "...",
    "risk_preference": "conservative | moderate | aggressive",
    "notification_channels": ["discord", "email"],
    "email": "user@example.com",
    "custom_single_position_limit": null,
    "custom_total_position_limit": null,
    "daily_signal_limit": 10,
    "is_active": true,
    "created_at": "<ISO8601>"
  }
]
```

风险偏好说明：
- conservative：保守型（单仓 ≤10%，总仓 ≤60%）
- moderate：稳健型（单仓 ≤20%，总仓 ≤80%）
- aggressive：激进型（单仓 ≤30%，总仓 ≤95%）

用法示例：
$ARGUMENTS

请根据上述参数调用用户列表接口，展示所有用户信息，标注活跃状态和风险偏好，并统计总用户数。
