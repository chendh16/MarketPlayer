/**
 * MCP 工具服务器 — Agent 可调用层
 *
 * 将系统各模块的关键函数暴露为 HTTP 工具端点，供 AI Agent 按需调用。
 * 运行模式：
 *   - 独立进程: MCP_SERVER_PORT=3001 ts-node src/mcp/server.ts
 *   - 随主服务: 在 src/index.ts 中设置 MCP_SERVER_PORT 后自动启动
 *
 * 调用格式（与现有 callMCP 兼容）：
 *   POST http://localhost:{MCP_SERVER_PORT}/tools/{toolName}
 *   Content-Type: application/json
 *   Body: { ...params }
 */

import express from 'express';
import { logger } from '../utils/logger';

import { fetch_news, process_pipeline } from './tools/news';
import { analyze_news, generate_signal } from './tools/analysis';
import { check_risk } from './tools/risk';
import { get_positions, get_account, get_broker_balance } from './tools/position';
import { get_deliveries, get_delivery, confirm_order } from './tools/order';
import { execute_longbridge_order, cancel_longbridge_order } from './tools/execute-order';
import { fetch_realtime_quote, fetch_kline, fetch_batch_quote, search_stock } from './tools/stock';
import { fetch_stock_rank, fetch_top_gainers, fetch_top_losers, fetch_top_volume, fetch_top_turnover } from './tools/rank';
import { fetch_board_rank, fetch_industry_board, fetch_concept_board, fetch_region_board, fetch_board_stocks } from './tools/board';
import { fetch_technical_indicators, fetch_batch_indicators } from './tools/indicator';
import { fetch_position_review } from './tools/position-review';
import { get_financial_indicator, get_financial_summary } from './tools/financial';
import { calculate_valuation, compare_valuation } from './tools/valuation';
import { calculate_risk, calculate_portfolio_risk } from './tools/risk_metrics';
import { analyze_stock_sentiment, analyze_batch_sentiment, get_sentiment_alert } from './tools/sentiment';
import { compare_stock, get_competitors, compare_valuation_quick, compare_profitability_quick } from './tools/comparison';
import { get_model_status, toggle_model, recommend_model, get_cost_status, test_model_connection } from './tools/model_config';

// ─── 工具注册表 ───────────────────────────────────────────────────────────────

const tools: Record<string, (body: any) => Promise<any>> = {
  // 资讯
  fetch_news,
  process_pipeline,
  // AI 分析
  analyze_news,
  generate_signal,
  // 风控
  check_risk,
  // 持仓 / 账户
  get_positions,
  get_account,
  get_broker_balance,
  // 订单
  get_deliveries,
  get_delivery,
  confirm_order,
  // 长桥下单
  execute_longbridge_order,
  cancel_longbridge_order,
  // A股行情（东方财富）
  fetch_realtime_quote,
  fetch_kline,
  fetch_batch_quote,
  search_stock,
  // A股排行榜
  fetch_stock_rank,
  fetch_top_gainers,
  fetch_top_losers,
  fetch_top_volume,
  fetch_top_turnover,
  // 行业板块
  fetch_board_rank,
  fetch_industry_board,
  fetch_concept_board,
  fetch_region_board,
  fetch_board_stocks,
  // 技术指标
  fetch_technical_indicators,
  fetch_batch_indicators,
  // 持仓复盘
  fetch_position_review,
  // 财务数据
  get_financial_indicator,
  get_financial_summary,
  // 估值计算
  calculate_valuation,
  compare_valuation,
  // 风险指标
  calculate_risk,
  calculate_portfolio_risk,
  // 舆情分析
  analyze_stock_sentiment,
  analyze_batch_sentiment,
  get_sentiment_alert,
  // 竞品对比
  compare_stock,
  get_competitors,
  compare_valuation_quick,
  compare_profitability_quick,
  // 模型配置
  get_model_status,
  toggle_model,
  recommend_model,
  get_cost_status,
  test_model_connection,
};

// ─── Express 路由 ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/** 列出所有已注册工具 */
app.get('/tools', (_req, res) => {
  res.json({
    tools: Object.keys(tools),
    count: Object.keys(tools).length,
  });
});

/** 调用工具 */
app.post('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const handler = tools[name];
  if (!handler) {
    res.status(404).json({ error: `Unknown tool: ${name}` });
    return;
  }
  try {
    const result = await handler(req.body ?? {});
    res.json(result);
  } catch (err: any) {
    logger.error(`[MCP] tool error [${name}]:`, err);
    res.status(500).json({ error: err?.message ?? 'Internal error' });
  }
});

/** 健康检查 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 启动函数（被 index.ts 调用，或独立运行）─────────────────────────────────

export function startMCPServer(port: number): void {
  app.listen(port, () => {
    logger.info(`MCP tool server listening on :${port}`);
    logger.info(`Tools: ${Object.keys(tools).join(', ')}`);
  });
}

// 独立进程入口（初始化 DB/Redis 后再启动）
if (require.main === module) {
  const port = parseInt(process.env.MCP_SERVER_PORT ?? '3001', 10);
  (async () => {
    const { initPostgres } = await import('../db/postgres');
    const { initRedis } = await import('../db/redis');
    await initPostgres();
    await initRedis();
    startMCPServer(port);
  })().catch(err => {
    logger.error('Failed to start MCP server:', err);
    process.exit(1);
  });
}
