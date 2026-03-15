/**
 * 虚拟盘定时汇报服务
 * 每10分钟向用户汇报账户状态
 */

import cron from 'node-cron';
import { init_virtual_account, get_virtual_summary, get_virtual_positions } from '../src/services/virtual';
import { sendMessageToUser } from '../src/services/feishu/bot';

const CRON_INTERVAL = '*/10 * * * *'; // 每10分钟

async function report() {
  try {
    console.log(`[${new Date().toISOString()}] 开始汇报...`);
    
    // 初始化（如未初始化）
    await init_virtual_account({ initialCash: 1000000 });
    
    // 获取账户摘要
    const summary = await get_virtual_summary();
    
    // 获取持仓
    const positions = await get_virtual_positions();
    
    // 格式化消息
    let msg = `📊 虚拟盘汇报 (${new Date().toLocaleString('zh-CN', { hour12: false })})\n\n`;
    msg += `💰 账户总价值: ¥${summary.summary.totalValue.toLocaleString()}\n`;
    msg += `📈 总盈亏: ${summary.summary.profitPercent >= 0 ? '+' : ''}${summary.summary.profitPercent.toFixed(2)}% (¥${summary.summary.totalProfit.toLocaleString()})\n`;
    msg += `💵 可用现金: ¥${summary.summary.cash.toLocaleString()}\n`;
    msg += `📋 持仓数量: ${summary.summary.positions}\n`;
    
    if (positions.positions.length > 0) {
      msg += `\n📌 持仓明细:\n`;
      for (const p of positions.positions) {
        msg += `  • ${p.symbol} x${p.quantity} (${p.direction === 'long' ? '多' : '空'}) - ${p.profit >= 0 ? '+' : ''}¥${p.profit.toFixed(2)} (${p.profitPercent >= 0 ? '+' : ''}${p.profitPercent.toFixed(2)}%)\n`;
      }
    } else {
      msg += `\n📌 无持仓`;
    }
    
    // 发送消息 (发送给默认用户)
    await sendMessageToUser('ou_3d8c36452b5a0ca480873393ad876e12', { text: msg });
    console.log('汇报已发送');
  } catch (error) {
    console.error('汇报失败:', error);
  }
}

// 立即执行一次
report();

// 启动定时任务
cron.schedule(CRON_INTERVAL, report);

console.log(`✅ 虚拟盘汇报服务已启动 (每10分钟)`);
