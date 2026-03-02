/**
 * 查询长桥账户余额与持仓（只读，不产生任何交易）
 *
 * 用法:
 *   npx ts-node scripts/query-longbridge-balance.ts
 *
 * 环境变量（从 .env 读取）：
 *   LONGPORT_APP_KEY      长桥 App Key
 *   LONGPORT_APP_SECRET   长桥 App Secret
 *   LONGPORT_ACCESS_TOKEN 长桥 Access Token
 *
 * 流程：
 *   创建 TradeContext → 查余额 → 查持仓 → 打印 → 关闭
 */

import dotenv from 'dotenv';
dotenv.config();

// ─── 加载 SDK ─────────────────────────────────────────────────────────────────

function loadSdk(): any {
  try {
    const runtimeRequire = eval('require') as (id: string) => any;
    return runtimeRequire('longport');
  } catch {
    return null;
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function fmt(n: number | string | undefined | null, decimals = 2): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (num == null || !Number.isFinite(num)) return 'N/A';
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function extractNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v); return isFinite(n) ? n : undefined; }
  // Decimal 对象（longport SDK 用 Decimal 类型）
  if (typeof (v as any)?.toFixed === 'function') return parseFloat((v as any).toFixed(10));
  if (typeof (v as any)?.toString === 'function') {
    const n = parseFloat((v as any).toString());
    return isFinite(n) ? n : undefined;
  }
  return undefined;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║    长桥账户余额查询（只读，无交易操作）         ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const appKey = process.env.LONGPORT_APP_KEY;
  const appSecret = process.env.LONGPORT_APP_SECRET;
  const accessToken = process.env.LONGPORT_ACCESS_TOKEN;

  if (!appKey || !appSecret || !accessToken) {
    console.error('❌ 缺少长桥 API 凭证，请在 .env 中配置：');
    console.error('   LONGPORT_APP_KEY / LONGPORT_APP_SECRET / LONGPORT_ACCESS_TOKEN');
    process.exit(1);
  }
  console.log(`  App Key:  ${appKey.slice(0, 8)}...`);
  console.log('');

  // 1. 加载 SDK
  const sdk = loadSdk();
  if (!sdk) {
    console.error('❌ longport 包未找到，请先执行: npm install longport');
    process.exit(1);
  }
  console.log('  [1/3] longport SDK 已加载 ✅');

  // 2. 创建 TradeContext
  process.stdout.write('  [2/3] 连接长桥 API ...');
  let ctx: any;
  try {
    const { Config, TradeContext } = sdk;
    const cfg = Config.fromEnv();
    ctx = await TradeContext.new(cfg);
    console.log(' ✅ 已连接');
  } catch (err: any) {
    console.log(' ❌');
    console.error(`\n❌ 连接失败: ${err?.message ?? err}`);
    process.exit(1);
  }

  // 3. 查询余额 + 持仓
  console.log('  [3/3] 查询余额与持仓 ...\n');

  // 3a. 账户余额
  try {
    const balances = await ctx.accountBalance();
    const list: any[] = Array.isArray(balances) ? balances : [balances];

    if (list.length === 0) {
      console.log('  ⚠️  未获取到账户余额（账户可能为空或 token 权限不足）');
    }

    for (const bal of list) {
      const currency = bal.currency ?? '—';
      const totalCash = extractNum(bal.totalCash);
      const maxFinanceAmount = extractNum(bal.maxFinanceAmount);
      const remainingFinanceAmount = extractNum(bal.remainingFinanceAmount);
      const riskLevel = bal.riskLevel ?? '—';
      const marginCall = extractNum(bal.marginCall);
      const netAssets = extractNum(bal.netAssets);
      const initMargin = extractNum(bal.initMargin);
      const maintenanceMargin = extractNum(bal.maintenanceMargin);

      console.log(`  ━━━ 账户余额 (${currency}) ━━━`);
      if (totalCash != null)         console.log(`     现金余额:     ${fmt(totalCash)}`);
      if (netAssets != null)         console.log(`     净资产:       ${fmt(netAssets)}`);
      if (maxFinanceAmount != null)  console.log(`     最大融资额:   ${fmt(maxFinanceAmount)}`);
      if (remainingFinanceAmount != null) console.log(`     剩余融资额:   ${fmt(remainingFinanceAmount)}`);
      if (marginCall != null)        console.log(`     追缴保证金:   ${fmt(marginCall)}`);
      if (initMargin != null)        console.log(`     初始保证金:   ${fmt(initMargin)}`);
      if (maintenanceMargin != null) console.log(`     维持保证金:   ${fmt(maintenanceMargin)}`);
      console.log(`     风险等级:     ${riskLevel}`);

      // cashInfos（多货币明细）
      const cashInfos: any[] = bal.cashInfos ?? [];
      if (cashInfos.length > 0) {
        console.log(`\n     现金明细:`);
        for (const ci of cashInfos) {
          const cur = ci.currency ?? '—';
          const cash = extractNum(ci.cash);
          const avail = extractNum(ci.availableBalance);
          console.log(`       [${cur}] 现金: ${fmt(cash)}  可提: ${fmt(avail)}`);
        }
      }
      console.log('');
    }
  } catch (err: any) {
    console.log(`  ⚠️  余额查询失败: ${err?.message ?? err}\n`);
  }

  // 3b. 股票持仓
  try {
    const posResp = await ctx.stockPositions();
    const channels: any[] = posResp?.channels ?? [];

    if (channels.length === 0) {
      console.log('  📋 持仓: 空仓\n');
    } else {
      for (const ch of channels) {
        const acctType = ch.accountChannel ?? '—';
        const positions: any[] = ch.positions ?? [];
        console.log(`  ━━━ 持仓 (账户类型: ${acctType}) ━━━`);

        if (positions.length === 0) {
          console.log('     空仓\n');
          continue;
        }

        console.log(`     ${'标的'.padEnd(12)} ${'数量'.padStart(8)} ${'成本价'.padStart(12)} ${'现价'.padStart(12)} ${'市值'.padStart(14)} ${'盈亏'.padStart(14)}`);
        console.log(`     ${'─'.repeat(76)}`);

        for (const p of positions) {
          const sym    = (p.symbol ?? '').toString().padEnd(12);
          const qty    = fmt(extractNum(p.quantity), 0).padStart(8);
          const cost   = fmt(extractNum(p.costPrice)).padStart(12);
          const cur    = fmt(extractNum(p.currentPrice)).padStart(12);
          const mv     = fmt(extractNum(p.marketValue)).padStart(14);
          const pl     = (() => {
            const unrealized = extractNum(p.unrealizedPnl);
            if (unrealized == null) return 'N/A'.padStart(14);
            const prefix = unrealized >= 0 ? '+' : '';
            return `${prefix}${fmt(unrealized)}`.padStart(14);
          })();
          console.log(`     ${sym} ${qty} ${cost} ${cur} ${mv} ${pl}`);
        }
        console.log('');
      }
    }
  } catch (err: any) {
    console.log(`  ⚠️  持仓查询失败: ${err?.message ?? err}\n`);
  }

  console.log('  ✅ 查询完成\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ 未预期错误:', err?.message ?? err);
  process.exit(1);
});
