import 'dotenv/config';
import nodemailer from 'nodemailer';

const to = '845567595@qq.com';

async function main() {
  const config = {
    host: process.env.EMAIL_SMTP_HOST!,
    port: Number(process.env.EMAIL_SMTP_PORT || 465),
    secure: process.env.EMAIL_SMTP_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_SMTP_USER!,
      pass: process.env.EMAIL_SMTP_PASS!,
    },
  };

  console.log('SMTP config:', { ...config, auth: { user: config.auth.user, pass: '***' } });

  const transporter = nodemailer.createTransport(config);

  // 验证连接
  await transporter.verify();
  console.log('SMTP connection OK');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
  .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { padding: 20px 24px; background: #1a73e8; color: #fff; }
  .header h1 { margin: 0; font-size: 18px; }
  .body { padding: 24px; }
  .field { margin-bottom: 12px; }
  .label { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 2px; }
  .value { font-size: 15px; color: #222; font-weight: 500; }
  .reasoning { background: #f8f8f8; border-left: 3px solid #1a73e8; padding: 12px 16px; border-radius: 4px; font-size: 14px; color: #444; line-height: 1.6; }
  .footer { padding: 16px 24px; background: #f8f8f8; border-top: 1px solid #eee; font-size: 12px; color: #999; }
</style></head>
<body><div class="container">
  <div class="header"><h1>MarketPlayer 邮件推送测试</h1></div>
  <div class="body">
    <div class="field"><div class="label">状态</div><div class="value" style="color:#16a34a">✅ 邮件模块运行正常</div></div>
    <div class="field"><div class="label">时间</div><div class="value">${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</div></div>
    <div class="field"><div class="label">SMTP</div><div class="value">${process.env.EMAIL_SMTP_HOST}:${process.env.EMAIL_SMTP_PORT}</div></div>
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
    <div class="field"><div class="label">说明</div></div>
    <div class="reasoning">
      这是 MarketPlayer 的邮件推送测试。<br><br>
      系统支持三种邮件类型：<br>
      1. 📈 AI 交易信号（含置信度、仓位建议、推理依据）<br>
      2. ⚠️ 风险提示信号（含风控警告信息）<br>
      3. 📊 纯资讯解读（摘要 + 市场影响分析）<br><br>
      邮件模块已就绪，可通过用户 notificationChannels 配置启用。
    </div>
  </div>
  <div class="footer">免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负。</div>
</div></body></html>`;

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER,
    to,
    subject: '[MarketPlayer] 邮件推送测试 - 连接验证成功',
    html,
  });

  console.log('Email sent! messageId:', info.messageId);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
