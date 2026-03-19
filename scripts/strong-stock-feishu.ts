/**
 * 每日强势股筛选飞书推送
 * 用法: npx ts-node scripts/strong-stock-feishu.ts
 */

import 'dotenv/config';
import { sendMessageToUser } from '../src/services/feishu/bot';
import { fetch_top_gainers, fetch_top_volume, fetch_top_turnover } from '../src/mcp/tools/rank';

interface StockItem {
  rank: number;
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  turnover: number;
  reason: string;
}

interface ScreeningResult {
  items: StockItem[];
  metadata: {
    totalScanned: number;
    matched: number;
    fetchedAt: string;
  };
}

const USER_OPEN_ID = 'ou_3d8c36452b5a0ca480873393ad876e12';

const PARAMS = {
  limit: 15,
  minChange: 2,    // 最小涨幅 2%
  minVolume: 3,    // 最小成交额 3亿
  minTurnover: 0.3 // 最小换手率 0.3%
};

async function screenStrongStocks(): Promise<ScreeningResult> {
  console.log(`[StrongStock] 筛选条件: 涨幅>${PARAMS.minChange}%, 成交额>${PARAMS.minVolume}亿, 换手率>${PARAMS.minTurnover}%`);
  
  const [gainersData, volumeData, turnoverData] = await Promise.all([
    fetch_top_gainers({ limit: 100 }),
    fetch_top_volume({ limit: 100 }),
    fetch_top_turnover({ limit: 100 })
  ]);

  const gainersMap = new Map(gainersData.data.map(s => [s.symbol, s]));
  const volumeMap = new Map(volumeData.data.map(s => [s.symbol, s]));
  const turnoverMap = new Map(turnoverData.data.map(s => [s.symbol, s]));

  const matchedStocks: StockItem[] = [];
  const allSymbols = new Set([
    ...gainersData.data.map(s => s.symbol),
    ...volumeData.data.slice(0, 50).map(s => s.symbol),
    ...turnoverData.data.slice(0, 50).map(s => s.symbol)
  ]);

  for (const symbol of allSymbols) {
    const g = gainersMap.get(symbol);
    const v = volumeMap.get(symbol);
    const t = turnoverMap.get(symbol);

    // 数据源返回的是小数形式: 0.2 = 20%
    const changePercent = (g?.changePercent || v?.changePercent || t?.changePercent || 0) * 100;
    const volume = (v?.amount || 0) / 10000; // 万元转亿元
    const turnover = (t?.turnover || 0) * 100; // 小数转百分比

    if (changePercent < PARAMS.minChange || volume < PARAMS.minVolume || turnover < PARAMS.minTurnover) {
      continue;
    }

    const reasons: string[] = [];
    if (g && g.changePercent * 100 >= PARAMS.minChange) reasons.push('涨幅');
    if (v && v.amount / 10000 >= PARAMS.minVolume) reasons.push('成交额');
    if (t && t.turnover * 100 >= PARAMS.minTurnover) reasons.push('换手率');

    matchedStocks.push({
      rank: matchedStocks.length + 1,
      symbol,
      name: g?.name || v?.name || t?.name || '',
      price: g?.price || v?.price || t?.price || 0,
      changePercent,
      volume,
      turnover,
      reason: reasons.join('/')
    });
  }

  matchedStocks.sort((a, b) => b.changePercent - a.changePercent);

  return {
    items: matchedStocks.slice(0, PARAMS.limit),
    metadata: {
      totalScanned: allSymbols.size,
      matched: matchedStocks.length,
      fetchedAt: new Date().toISOString()
    }
  };
}

function generateMessage(result: ScreeningResult): string {
  const now = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  let msg = `📈 每日强势股筛选 (${now})\n`;
  msg += `筛选条件: 涨幅≥${PARAMS.minChange}% | 成交额≥${PARAMS.minVolume}亿 | 换手率≥${PARAMS.minTurnover}%\n`;
  msg += `初筛: ${result.metadata.totalScanned}只 → 符合: ${result.metadata.matched}只 → 入围: ${result.items.length}只\n`;
  msg += '─'.repeat(32) + '\n';

  if (result.items.length === 0) {
    msg += '⚠️ 今日无符合条件的强势股\n';
  } else {
    for (const item of result.items) {
      const change = item.changePercent > 0 ? `+${item.changePercent.toFixed(2)}%` : `${item.changePercent.toFixed(2)}%`;
      msg += `${item.rank}. ${item.name} ${item.symbol}\n`;
      msg += `   价格:${item.price.toFixed(2)} 涨幅:${change} 成交:${item.volume.toFixed(1)}亿 换手:${item.turnover.toFixed(1)}%\n`;
      msg += `   上榜:${item.reason}\n`;
      msg += '─'.repeat(32) + '\n';
    }
  }

  msg += '\n📊 数据来源: 东方财富 | MarketPlayer 自动筛选\n';
  msg += '⚠️ 仅供参考，不构成投资建议';

  return msg;
}

async function main() {
  console.log('='.repeat(50));
  console.log('🚀 强势股筛选飞书推送开始执行');
  console.log('='.repeat(50) + '\n');

  try {
    const result = await screenStrongStocks();
    console.log(`\n[StrongStock] 筛选完成: ${result.items.length} 只强势股`);

    const msg = generateMessage(result);
    console.log('\n[Feishu] 正在发送消息...');

    const sent = await sendMessageToUser(USER_OPEN_ID, { text: msg });
    
    if (sent) {
      console.log('✅ 飞书消息发送成功!');
    } else {
      console.log('❌ 飞书消息发送失败');
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ 执行完成!');
    console.log('='.repeat(50));

  } catch (error: any) {
    console.error('\n❌ 执行失败:', error.message);
    process.exit(1);
  }
}

main();
