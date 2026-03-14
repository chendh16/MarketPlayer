/**
 * 持仓复盘 Skill 服务器
 * 
 * 一键分析持仓状况，生成风险报告
 * 
 * 用法: npx ts-node scripts/skill-position-review.ts
 *       默认端口 3103
 * 
 * 接口：
 *   POST /
 *   Body: { 
 *     action: "review", 
 *     parameters: { 
 *       broker?: string,     // 券商默认futu
 *       forceRefresh?: boolean 
 *     } 
 *   }
 *   Response: { report: ReviewReport, metadata: {} }
 */

import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { fetch_position_review } from '../src/mcp/tools/position-review';

const PORT = parseInt(process.env.SKILL_POSITION_PORT ?? '3103', 10);

// 复盘报告
interface ReviewReport {
  summary: string;
  totalAssets: number;
  marketValue: number;
  cash: number;
  positionPct: number;
  profitLoss: number;
  profitPercent: number;
  riskLevel: string;
  riskScore: number;
  warnings: string[];
  allocation: {
    byMarket: { a: number; hk: number; us: number; cash: number };
    byIndustry: Array<{ industry: string; pct: number }>;
  };
  positions: Array<{
    symbol: string;
    name: string;
    marketValue: number;
    profitLoss: number;
    profitPercent: number;
    positionPct: number;
    industry: string;
  }>;
}

interface ReviewResult {
  report: ReviewReport;
  metadata: {
    broker: string;
    fetchedAt: string;
  };
}

/**
 * 持仓复盘主逻辑
 */
async function runPositionReview(params: {
  broker?: string;
  forceRefresh?: boolean;
}): Promise<ReviewResult> {
  const { broker = 'futu', forceRefresh = false } = params;

  console.log(`[PositionReview] broker=${broker} forceRefresh=${forceRefresh}`);

  const result = await fetch_position_review({ broker, forceRefresh });

  // 转换格式
  const report: ReviewReport = {
    summary: result.summary,
    totalAssets: result.snapshot.totalAssets,
    marketValue: result.snapshot.marketValue,
    cash: result.snapshot.availableCash,
    positionPct: result.snapshot.positionPct,
    profitLoss: result.snapshot.profitLoss,
    profitPercent: result.snapshot.profitPercent,
    riskLevel: result.snapshot.riskMetrics.riskLevel,
    riskScore: result.snapshot.riskMetrics.riskScore,
    warnings: result.warnings,
    allocation: {
      byMarket: {
        a: result.allocation.byMarket.a,
        hk: result.allocation.byMarket.hk,
        us: result.allocation.byMarket.us,
        cash: result.allocation.byMarket.cash
      },
      byIndustry: result.snapshot.riskMetrics.industryConcentration.map(i => ({
        industry: i.industry,
        pct: i.pct
      }))
    },
    positions: result.snapshot.positions.map(p => ({
      symbol: p.symbol,
      name: p.name,
      marketValue: p.marketValue,
      profitLoss: p.profitLoss,
      profitPercent: p.profitPercent,
      positionPct: p.positionPct,
      industry: p.industry || '其他'
    }))
  };

  return {
    report,
    metadata: {
      broker,
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
  console.log(`[PositionReview] action=${action}`);

  if (action !== 'review') {
    res.status(400).json({ error: `Unsupported action: ${action}` });
    return;
  }

  try {
    const result = await runPositionReview(parameters || {});
    console.log(`[PositionReview] 完成: 总资产=${result.report.totalAssets} 风险=${result.report.riskLevel}`);
    res.json(result);
  } catch (err: any) {
    console.error('[PositionReview] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** 健康检查 */
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'position-review-skill' }));

app.listen(PORT, () => {
  console.log(`\n✅ 持仓复盘 Skill 服务器运行中 → http://localhost:${PORT}`);
  console.log(`   协议: POST /  body: { action:"review", parameters:{...} }`);
  console.log(`   功能: 持仓分析/风险指标/资产配置\n`);
});
