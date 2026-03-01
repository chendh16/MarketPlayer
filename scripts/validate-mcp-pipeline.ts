/**
 * MCP 管道端到端验证
 *
 * 步骤：
 *  1. 启动 DB / Redis / Discord Bot / newsWorker
 *  2. 启动 MCP 工具服务器（端口 3099）
 *  3. fetch_news 验证各市场资讯获取
 *  4. process_pipeline 触发完整管道（fetch→DB→队列→AI分析→Discord）
 *
 * 用法:
 *   npx ts-node scripts/validate-mcp-pipeline.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { initPostgres, closePostgres } from '../src/db/postgres';
import { initRedis } from '../src/db/redis';
import { redisClient } from '../src/db/redis';
import { startDiscordBot } from '../src/services/discord/bot';
import { newsWorker } from '../src/queues/news-queue';
import { startMCPServer } from '../src/mcp/server';

const MCP_PORT = 3099;
const MCP_BASE = `http://localhost:${MCP_PORT}`;

// ─── MCP HTTP 调用辅助 ────────────────────────────────────────────────────────

async function mcpCall(tool: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`${MCP_BASE}/tools/${tool}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(60000),
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(`[${tool}] ${json.error ?? res.statusText}`);
  return json;
}

// ─── 格式化辅助 ───────────────────────────────────────────────────────────────

const MARKETS = ['btc', 'hk', 'us', 'a'] as const;
const pad = (s: string, n = 6) => s.padEnd(n);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     MCP 管道端到端验证                   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. 基础服务
  process.stdout.write('[ 1/4 ] 初始化 DB + Redis ...');
  await initPostgres();
  await initRedis();
  console.log(' ✅');

  process.stdout.write('[ 2/4 ] 启动 Discord Bot ...');
  await startDiscordBot();
  console.log(' ✅  (' + process.env.DISCORD_BOT_TOKEN?.slice(0, 8) + '...)');

  process.stdout.write('[ 3/4 ] 启动 MCP 服务器 ...');
  startMCPServer(MCP_PORT);
  await new Promise(r => setTimeout(r, 500)); // 等待端口就绪
  const health = await fetch(`${MCP_BASE}/health`).then(r => r.json()) as any;
  console.log(` ✅  ${MCP_BASE}  status=${health.status}`);

  const toolList = await fetch(`${MCP_BASE}/tools`).then(r => r.json()) as any;
  console.log(`       已注册工具: ${(toolList.tools as string[]).join(', ')}\n`);

  // newsWorker 已在 import 时自动启动
  console.log('[ 4/4 ] newsWorker 已就绪（auto-start on import）\n');

  // ─── Phase 1：fetch_news 各市场 ─────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 1  fetch_news — 各市场资讯获取验证');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const fetchResults: Record<string, { ok: boolean; count: number; title: string; error?: string }> = {};

  for (const market of MARKETS) {
    process.stdout.write(`  ${pad(market.toUpperCase())} fetch_news ... `);
    try {
      const result = await mcpCall('fetch_news', { market, limit: 5 });
      const count = result.total ?? result.items?.length ?? 0;
      const title = result.items?.[0]?.title?.slice(0, 50) ?? '(no items)';
      fetchResults[market] = { ok: count > 0, count, title };
      console.log(count > 0 ? `✅  ${count} 条  「${title}」` : `⚠️  0 条`);
    } catch (e: any) {
      fetchResults[market] = { ok: false, count: 0, title: '', error: e.message };
      console.log(`❌  ${e.message}`);
    }
  }

  // ─── Phase 2：process_pipeline 触发完整管道 ─────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 2  process_pipeline — 完整管道（→ AI 分析 → Discord）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 只对资讯获取成功的市场触发管道
  const targetMarkets = MARKETS.filter(m => fetchResults[m]?.ok);
  if (targetMarkets.length === 0) {
    console.log('  ⚠️  所有市场 fetch 均失败，跳过管道验证');
  }

  for (const market of targetMarkets) {
    console.log(`  ▶ ${market.toUpperCase()} process_pipeline 启动...`);
    try {
      await mcpCall('process_pipeline', { market });
      console.log(`    ✅  管道触发完成（AI + Discord 异步处理中）`);
    } catch (e: any) {
      console.log(`    ❌  ${e.message}`);
    }
    // 稍等避免并发过多 AI 调用
    if (targetMarkets.indexOf(market) < targetMarkets.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // ─── Phase 3：等待 newsWorker 处理完 ────────────────────────────────────────
  console.log('\n⏳ 等待 newsWorker 处理完成（最多 120 秒）...');
  await new Promise(r => setTimeout(r, 120000));

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('验证汇总');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nPhase 1  fetch_news:');
  for (const market of MARKETS) {
    const r = fetchResults[market];
    const icon = r.ok ? '✅' : r.error ? '❌' : '⚠️ ';
    console.log(`  ${icon} ${pad(market.toUpperCase())} ${r.count} 条  ${r.error ?? r.title}`);
  }

  console.log('\nPhase 2  process_pipeline:');
  console.log(`  触发市场: ${targetMarkets.join(', ') || '无'}`);
  console.log('  结果: 请检查 Discord 是否收到资讯推送\n');

  // 清理
  await newsWorker.close();
  await closePostgres();
  await redisClient.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ 致命错误:', err?.message ?? err);
  process.exit(1);
});
