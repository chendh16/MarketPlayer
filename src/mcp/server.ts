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
import { get_positions, get_account } from './tools/position';
import { get_deliveries, get_delivery, confirm_order } from './tools/order';

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
  // 持仓
  get_positions,
  get_account,
  // 订单
  get_deliveries,
  get_delivery,
  confirm_order,
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

// 独立进程入口
if (require.main === module) {
  const port = parseInt(process.env.MCP_SERVER_PORT ?? '3001', 10);
  startMCPServer(port);
}
