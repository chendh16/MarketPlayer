/**
 * Level 3 告警脚本
 * 触发条件：risk-agent 输出 result: fail
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(process.cwd(), 'agents/fin-chain/risk-agent/output.json');

// 告警消息格式
function formatAlert(item) {
  return {
    level: 3,
    source_agent: "risk-agent",
    event_type: "risk_fail",
    content: `信号 ${item.symbol} 被拒绝，原因：${item.reason}`,
    risk_level: item.risk_level,
    timestamp: new Date().toISOString()
  };
}

// 主函数
async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('[alert] 错误: 未找到 risk-agent 输出文件');
    process.exit(1);
  }
  
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const results = input.results || [];
  
  // 筛选失败的
  const failed = results.filter(r => r.result === 'fail');
  
  if (failed.length === 0) {
    console.log('[alert] 无失败信号，跳过告警');
    return;
  }
  
  console.log(`[alert] 检测到 ${failed.length} 个失败信号，准备发送告警...`);
  
  // 发送告警到文件（用于调试）
  const alertFile = path.join(process.cwd(), 'agents/fin-chain/risk-agent/alerts.json');
  const alerts = failed.map(formatAlert);
  fs.writeFileSync(alertFile, JSON.stringify(alerts, null, 2));
  console.log(`[alert] 告警已写入 ${alertFile}`);
  
  // 输出推送格式
  console.log('\n---FEISHU PAYLOAD---');
  console.log(JSON.stringify(alerts, null, 2));
  
  console.log('\n[alert] 请配置飞书/微信 webhook 后启用自动推送');
  console.log('[alert] 当前仅输出到文件');
}

main().catch(err => {
  console.error('[alert] 错误:', err.message);
  process.exit(1);
});