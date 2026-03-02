/**
 * 查询富途账户余额与持仓（只读，不产生任何交易）
 *
 * 用法:
 *   npx ts-node scripts/query-futu-balance.ts
 *
 * 环境变量（从 .env 读取）：
 *   FUTU_API_HOST    OpenD 地址（默认 127.0.0.1）
 *   FUTU_TRD_ENV     SIMULATE | REAL（默认 SIMULATE）
 *   FUTU_TRADE_PWD   交易密码（真实账户必填，用于 UnlockTrade）
 *
 * 流程：
 *   连接 OpenD → [UnlockTrade 解锁] → 获取账户列表 → 查资金 + 持仓 → 打印 → 断开
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

// ─── 环境变量 ─────────────────────────────────────────────────────────────────

const FUTU_HOST = process.env.FUTU_API_HOST ?? '127.0.0.1';
// JS SDK 通过 WebSocket 连 FTWebSocket 桥接进程，端口与 OpenD TCP 端口不同
const FUTU_WS_PORT = parseInt(process.env.FUTU_WEBSOCKET_PORT ?? '33333', 10);
const FUTU_WS_KEY  = process.env.FUTU_WEBSOCKET_KEY ?? '';
const TRD_ENV_STR = (process.env.FUTU_TRD_ENV ?? 'SIMULATE').toUpperCase();
const TRD_ENV_NUM = TRD_ENV_STR === 'REAL' ? 1 : 0; // 0=模拟, 1=真实
const TRADE_PWD   = process.env.FUTU_TRADE_PWD ?? '';

// TrdMarket 枚举（futu-api 协议定义）
const TRD_MARKET = { HK: 1, US: 2, CN: 3, HKCC: 4 } as const;

// ─── 加载 SDK ─────────────────────────────────────────────────────────────────

function loadSdk(): any {
  try {
    // futu-api 是 ESM 包，通过 eval('require') 加载
    const runtimeRequire = eval('require') as (id: string) => any;
    return runtimeRequire('futu-api');
  } catch {
    return null;
  }
}

// ─── 连接 OpenD ───────────────────────────────────────────────────────────────

function connectOpenD(sdk: any): Promise<any> {
  const FtWebsocket = sdk.default ?? sdk;
  if (typeof FtWebsocket !== 'function') {
    throw new Error('futu-api: 无法找到 ftWebsocket 构造函数，请确认包版本');
  }
  const client = new FtWebsocket();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(
        `连接 OpenD 超时（${FUTU_HOST}:${FUTU_WS_PORT}）\n` +
        '请确认富途 OpenD 正在运行，并检查 FUTU_WEBSOCKET_PORT / FUTU_WEBSOCKET_KEY 配置'
      ));
    }, 10000);

    // onlogin 回调：ret 为 boolean（true=成功），msg 为响应对象
    client.onlogin = (ret: boolean, _msg: unknown) => {
      clearTimeout(timer);
      if (!ret) {
        reject(new Error(`OpenD 登录失败，请检查 websocket_key 或 OpenD 状态`));
      } else {
        resolve(client);
      }
    };

    // ssl=false 表示本地不加密连接；FUTU_WS_KEY 为 OpenD 设置的 websocket_key
    client.start(FUTU_HOST, FUTU_WS_PORT, false, FUTU_WS_KEY);
  });
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function fmt(n: number | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return 'N/A';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function marketName(m: number): string {
  return { 1: 'HK 港股', 2: 'US 美股', 3: 'CN A股', 4: 'HKCC', 5: '期货' }[m] ?? `市场(${m})`;
}

// ─── UnlockTrade ──────────────────────────────────────────────────────────────

async function unlockTrade(client: any): Promise<boolean> {
  if (!TRADE_PWD) {
    console.log('  ⚠️  FUTU_TRADE_PWD 未设置，跳过 UnlockTrade（真实账户余额可能为 0）');
    return false;
  }
  const pwdMd5 = crypto.createHash('md5').update(TRADE_PWD).digest('hex');
  try {
    const res = await client.UnlockTrade({ c2s: { pwdMD5: pwdMd5, unlock: true, securityFirm: 1 } });
    if (res?.retType === 0) {
      console.log('  [*] UnlockTrade ✅ 解锁成功');
      return true;
    }
    console.log(`  ⚠️  UnlockTrade 失败: ${res?.retMsg ?? '未知错误'}`);
    return false;
  } catch (e: any) {
    const msg = e?.retMsg ?? e?.message ?? String(e);
    console.log(`  ⚠️  UnlockTrade 异常: ${msg}`);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║      富途账户余额查询（只读，无交易操作）       ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log(`  OpenD:    ${FUTU_HOST}:${FUTU_WS_PORT} (WebSocket)`);
  console.log(`  环境:     ${TRD_ENV_STR} (trdEnv=${TRD_ENV_NUM})`);
  if (TRD_ENV_NUM === 1) {
    console.log(`  交易密码: ${TRADE_PWD ? '已配置 (FUTU_TRADE_PWD)' : '未配置 ⚠️'}`);
  }
  console.log('');

  // 1. 加载 SDK
  const sdk = loadSdk();
  if (!sdk) {
    console.error('❌ futu-api 包未找到，请先执行: npm install futu-api');
    process.exit(1);
  }
  console.log('  [1/4] futu-api 已加载 ✅');

  // 2. 连接 OpenD
  process.stdout.write('  [2/4] 连接 OpenD ...');
  let client: any;
  try {
    client = await connectOpenD(sdk);
    console.log(' ✅ 已连接');
  } catch (err: any) {
    console.log(' ❌');
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  }

  // 2b. 真实环境下先 UnlockTrade（否则 GetFunds 返回全 0）
  if (TRD_ENV_NUM === 1) {
    await unlockTrade(client);
  }

  // 3. 获取账户列表（自动发现 accID，无需手动配置）
  process.stdout.write('  [3/4] 获取账户列表 ...');
  let accList: any[] = [];
  try {
    const accRes = await client.GetAccList({ c2s: { userID: 0 } });
    accList = accRes?.s2c?.accList ?? [];
    console.log(` ✅  共 ${accList.length} 个账户`);
  } catch (err: any) {
    console.log(' ❌');
    console.error(`\n❌ 获取账户列表失败: ${err.message}`);
    client.stop?.();
    process.exit(1);
  }

  if (accList.length === 0) {
    console.log('\n⚠️  账户列表为空（OpenD 可能未登录或没有对应环境的账户）');
    client.stop?.();
    process.exit(0);
  }

  // 只查询与当前 TRD_ENV 匹配的账户
  const targetAccounts = accList.filter((a: any) => a.trdEnv === TRD_ENV_NUM);
  if (targetAccounts.length === 0) {
    console.log(`\n⚠️  当前 ${TRD_ENV_STR} 环境下没有账户`);
    console.log('   全部账户:');
    for (const a of accList) {
      const status = a.accStatus === 0 ? '✅ Active' : '❌ Disabled';
      console.log(`     accID=${a.accID}  env=${a.trdEnv === 0 ? 'SIMULATE' : 'REAL'}  market=${a.trdMarketAuthList?.map(marketName).join('/')}  ${status}`);
    }
    client.stop?.();
    process.exit(0);
  }

  // 检测 Disabled 账户（accStatus=1 对真实账户是正常现象，需 UnlockTrade 才能获取数据）
  const disabledAccounts = targetAccounts.filter((a: any) => a.accStatus !== 0);
  if (disabledAccounts.length > 0 && TRD_ENV_NUM === 1 && !TRADE_PWD) {
    console.log(`\n⚠️  真实账户需要交易密码才能查看余额，请设置 FUTU_TRADE_PWD 环境变量`);
    console.log('  用法: FUTU_TRADE_PWD=你的交易密码 FUTU_TRD_ENV=REAL npx ts-node scripts/query-futu-balance.ts\n');
  }

  console.log('  [4/4] 查询资金与持仓 ...\n');

  // 4. 逐账户查询（资金 + 持仓）
  for (const acc of targetAccounts) {
    const { accID, trdMarketAuthList = [] } = acc;
    const markets: number[] = trdMarketAuthList.length > 0
      ? trdMarketAuthList
      : [TRD_MARKET.HK]; // 默认港股

    console.log(`  ━━━ 账户 accID=${accID}  环境=${TRD_ENV_STR} ━━━`);

    for (const market of markets) {
      const header = { trdEnv: TRD_ENV_NUM, accID, trdMarket: market };

      // 4a. 资金
      try {
        const fundsRes = await client.GetFunds({ c2s: { header } });
        const funds = fundsRes?.s2c?.funds;
        if (funds) {
          console.log(`\n  📊 资金 (${marketName(market)})`);
          console.log(`     总资产:   ${fmt(funds.totalAssets)}`);
          console.log(`     现金余额: ${fmt(funds.cash)}`);
          console.log(`     购买力:   ${fmt(funds.power)}`);
          if (funds.marketVal != null) {
            console.log(`     持仓市值: ${fmt(funds.marketVal)}`);
          }
          if (funds.unrealizedPL != null) {
            const sign = funds.unrealizedPL >= 0 ? '+' : '';
            console.log(`     未实现盈亏: ${sign}${fmt(funds.unrealizedPL)}`);
          }
        }
      } catch (err: any) {
        console.log(`\n  ⚠️  资金查询失败 (${marketName(market)}): ${err.message}`);
      }

      // 4b. 持仓
      try {
        const posRes = await client.GetPositionList({ c2s: { header } });
        const positions: any[] = posRes?.s2c?.positionList ?? [];
        if (positions.length === 0) {
          console.log(`\n  📋 持仓 (${marketName(market)}): 空仓`);
        } else {
          console.log(`\n  📋 持仓 (${marketName(market)}):`);
          console.log(`     ${'标的'.padEnd(12)} ${'数量'.padStart(8)} ${'成本价'.padStart(10)} ${'现价'.padStart(10)} ${'市值'.padStart(12)} ${'盈亏'.padStart(12)}`);
          console.log(`     ${'─'.repeat(70)}`);
          for (const p of positions) {
            const code = (p.code ?? '').toString().padEnd(12);
            const qty = fmt(p.qty, 0).padStart(8);
            const cost = fmt(p.costPrice).padStart(10);
            const cur = fmt(p.price).padStart(10);
            const mv = fmt(p.marketVal).padStart(12);
            const pl = p.unrealizedPL != null
              ? `${p.unrealizedPL >= 0 ? '+' : ''}${fmt(p.unrealizedPL)}`.padStart(12)
              : 'N/A'.padStart(12);
            console.log(`     ${code} ${qty} ${cost} ${cur} ${mv} ${pl}`);
          }
        }
      } catch (err: any) {
        console.log(`\n  ⚠️  持仓查询失败 (${marketName(market)}): ${err.message}`);
      }
    }
    console.log('');
  }

  // 5. 断开连接
  client.stop?.();
  console.log('  ✅ 查询完成，已断开 OpenD 连接\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ 未预期错误:', err?.message ?? err);
  process.exit(1);
});
