调用 POST /api/admin/token，使用 JWT_SECRET 获取管理员 Bearer Token。

获取到的 token 可用于所有 /api/admin/* 受保护端点（如 admin-costs、admin-stats、admin-news、admin-signals、admin-users 等）。

参数解析规则：
- secret（必填）：JWT_SECRET 环境变量的值（见项目 .env 文件）

调用方式：
```
POST http://localhost:{PORT}/api/admin/token
Content-Type: application/json

{
  "secret": "<JWT_SECRET>"
}
```

返回结构：
```json
{
  "token": "<JWT Bearer Token>",
  "expiresIn": "7d"
}
```

用法示例：
$ARGUMENTS

请根据上述参数调用 admin-token，获取管理员 token 并保存，用于后续管理员接口调用。
