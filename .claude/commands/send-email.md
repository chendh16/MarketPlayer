通过 nodemailer 发送测试邮件，验证 SMTP 配置是否正常（smtp.qq.com:465）。

参数解析规则：
- to（可选）：收件人地址，默认 845567595@qq.com

调用方式：

使用 Bash 运行测试脚本：
```bash
cd /Users/zhengzefeng/Person/MarketPlayer && npx ts-node scripts/test-email.ts
```

SMTP 配置（来自 .env）：
- EMAIL_SMTP_HOST: smtp.qq.com
- EMAIL_SMTP_PORT: 465
- EMAIL_SMTP_SECURE: true
- EMAIL_SMTP_USER: 845567595@qq.com

用法示例：
$ARGUMENTS

请使用 Bash 工具执行测试邮件脚本，等待执行结果，告知邮件是否发送成功（含 messageId 或错误信息）。
