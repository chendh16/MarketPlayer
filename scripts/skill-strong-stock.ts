/**
 * 强势股筛选 Skill 服务器
 * 
 * 一键筛选当日强势股票，结合多维度数据
 * 
 * 用法: npx ts-node scripts/skill-strong-stock.ts
 *       默认端口 3102
 * 
 * 接口：
 *   POST /
 *   Body: { 
 *     action: "screening", 
 *     parameters: { 
 *       limit?: number,        // 返回数量默认20
 *       minChange?: number,   // 最小涨幅默认5
 *       minVolume?: number,   // 最小成交额(亿)默认10
 *       minTurnover?: number  // 最小换手率默认3
 *     } 
 *   }
 *   Response: { items: StockItem[], metadata: {} }
 */

import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { fetch_top_gainers, fetch_top_volume, fetch_top_turnover } from '../src/mcp/tools/rank';
import { fetch_industry_board, fetch_concept_board } from '../src/mcp/tools/board';
import { fetch_technical_indicators } from '../src/mcp/tools/indicator';

const PORT = parseInt(process.env.SKILL_STRONG_PORT ?? '3102', 10);

// 强势股项目
interface StockItem {
  rank: number;
  symbol: string;
  name: string;
  changePercent: number;
  volume: number;      // 成交额(亿)
  turnover: number;   // 换手率
  industry: string;   // 所属板块
  reason?: string;    // 上榜原因
  techSignal?: string; // 技术信号
}

interface ScreeningResult {
  items: StockItem[];
  metadata: {
    market: string;
    totalScanned: number;
    matched: number;
    fetchedAt: string;
  };
}

/**
 * 强势股筛选主逻辑
 */
async function screenStrongStocks(params: {
  limit?: number;
  minChange?: number;
  minVolume?: number;
  minTurnover?: number;
}): Promise<ScreeningResult> {
  const { 
    limit = 20, 
    minChange = 5, 
    minVolume = 10, 
    minTurnover = 3 
  } = params;

  console.log(`[StrongStock] 筛选条件: 涨幅>${minChange}%, 成交额>${minVolume}亿, 换手率>${minTurnover}%`);

  // 获取多维度数据
  const [gainersData, volumeData, turnoverData, industryData] = await Promise.all([
    fetch_top_gainers({ limit: 100 }).catch(() => ({ data: [] as any[] })),
    fetch_top_volume({ limit: 100 }).catch(() => ({ data: [] as any[] })),
    fetch_top_turnover({ limit: 100 }).catch(() => ({ data: [] as any[] })),
    fetch_industry_board({ limit: 20 }).catch(() => ({ data: [] as any[] }))
  ]);

  // 构建映射
  const gainersMap = new Map(gainersData.data.map(s => [s.symbol, s]));
  const volumeMap = new Map(volumeData.data.map(s => [s.symbol, s]));
  const turnoverMap = new Map(turnoverData.data.map(s => [s.symbol, s]));
  
  // 热门板块
  const hotIndustries = new Set(
    industryData.data
      .filter(b => b.changePercent > 1)
      .slice(0, 10)
      .map(b => b.boardName)
  );

  // 综合筛选
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

    // 数据源返回的小数形式需转换为百分比 (0.2 = 20%)
    const changePercent = (g?.changePercent || v?.changePercent || t?.changePercent || 0) * 100;
    const volume = (v?.amount || 0) / 10000; // amount 单位是万元，转换为亿
    const turnover = (t?.turnover || 0) * 100; // 换手率也是小数形式

    // 筛选条件
    if (changePercent < minChange || volume < minVolume || turnover < minTurnover) {
      continue;
    }

    // 判断上榜原因
    const reasons: string[] = [];
    if (g && g.changePercent >= minChange) reasons.push('涨幅榜');
    if (v && v.amount / 100000000 >= minVolume) reasons.push('成交额榜');
    if (t && t.turnover >= minTurnover) reasons.push('换手率榜');

    // 获取技术指标 (可选，简化处理)
    let techSignal = '';
    // if (g) {
    //   try {
    //     const tech = await fetch_technical_indicators({ symbol, limit: 60 });
    //     techSignal = tech.indicators.macd.signal;
    //   } catch (e) {}
    // }

    matchedStocks.push({
      rank: matchedStocks.length + 1,
      symbol,
      name: g?.name || v?.name || t?.name || '',
      changePercent,
      volume,
      turnover,
      industry: g?.name?.slice(0, 2) || '其他', // 简化处理
      reason: reasons.join('/'),
      techSignal
    });
  }

  // 按涨幅排序
  matchedStocks.sort((a, b) => b.changePercent - a.changePercent);

  return {
    items: matchedStocks.slice(0, limit),
    metadata: {
      market: 'A股',
      totalScanned: allSymbols.size,
      matched: matchedStocks.length,
      fetchedAt: new Date().toISOString()
    }
  };
}

// ─── Express 服务器 ──────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/** Skill 协议入口 */
app.post('/', async (req, res) => {
  const { action, parameters } = req.body ?? {};
  console.log(`[StrongStock] action=${action}`);

  if (action !== 'screening') {
    res.status(400).json({ error: `Unsupported action: ${action}` });
    return;
  }

  try {
    const result = await screenStrongStocks(parameters || {});
    console.log(`[StrongStock] 筛选结果: ${result.items.length} 只`);
    res.json(result);
  } catch (err: any) {
    console.error('[StrongStock] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** 健康检查 */
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'strong-stock-skill' }));

app.listen(PORT, () => {
  console.log(`\n✅ 强势股筛选 Skill 服务器运行中 → http://localhost:${PORT}`);
  console.log(`   协议: POST /  body: { action:"screening", parameters:{...} }`);
  console.log(`   数据源: 东方财富 (排行榜/板块)\n`);
});
