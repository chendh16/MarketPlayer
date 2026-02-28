import { config } from '../../config';
import { getActiveUsersWithFutu, getBrokerAccount } from '../../db/queries';
import { decrypt } from '../../utils/encryption';
import { logger } from '../../utils/logger';

type SdkTradeContext = Record<string, unknown>;

export interface FutuPlaceOrderRequest {
  trdMarket: 'US' | 'HK' | 'CN';
  trdSide: 'BUY' | 'SELL';
  orderType: 'NORMAL' | 'MARKET' | 'ABSOLUTE_LIMIT';
  code: string; // e.g. US.AAPL
  qty: number;
  price: number;
  trdEnv: 'SIMULATE' | 'REAL';
  accId?: number;
  accIndex?: number;
  remark?: string;
}

export interface FutuModifyOrderRequest {
  orderId: string;
  modifyOp: 'NORMAL' | 'CANCEL' | 'DISABLE' | 'ENABLE' | 'DELETE';
  price?: number;
  qty?: number;
  trdEnv: 'SIMULATE' | 'REAL';
  accId?: number;
  accIndex?: number;
}

export interface FutuOrderSnapshot {
  orderId: string;
  orderStatus?: string | number;
  dealtAvgPrice?: number;
  dealtQty?: number;
}

export interface FutuPositionItem {
  code: string;
  name?: string;
  qty: number;
  costPrice?: number;
  currentPrice?: number;
  marketVal?: number;
}

export interface FutuFundsInfo {
  power?: number;       // 购买力
  totalAssets?: number; // 总资产
  cash?: number;        // 现金
}

export interface FutuTradeConnection {
  isConnected(): boolean;
  unlockTrade(password?: string, passwordMd5?: string): Promise<void>;
  placeOrder(req: FutuPlaceOrderRequest): Promise<FutuOrderSnapshot>;
  modifyOrder(req: FutuModifyOrderRequest): Promise<void>;
  getOrder(orderId: string, trdEnv: 'SIMULATE' | 'REAL', accId?: number, accIndex?: number): Promise<FutuOrderSnapshot | null>;
  getPositions(trdEnv: 'SIMULATE' | 'REAL', accId?: number, accIndex?: number): Promise<FutuPositionItem[]>;
  getFunds(trdEnv: 'SIMULATE' | 'REAL', accId?: number, accIndex?: number): Promise<FutuFundsInfo>;
  close(): Promise<void>;
}

interface FutuCredentialPayload {
  tradePassword?: string;
  tradePasswordMd5?: string;
  accId?: number;
  trdEnv?: 'SIMULATE' | 'REAL';
}

class FutuSdkConnection implements FutuTradeConnection {
  constructor(private readonly userId: string, private readonly ctx: SdkTradeContext) {}

  isConnected(): boolean {
    const fn = this.ctx.isConnected;
    if (typeof fn === 'function') {
      try {
        return Boolean((fn as () => unknown)());
      } catch {
        return true;
      }
    }
    return true;
  }

  async unlockTrade(password?: string, passwordMd5?: string): Promise<void> {
    if (!password && !passwordMd5) return;

    if (passwordMd5) {
      await this.invokeFirst(['unlock_trade', 'unlockTrade'], passwordMd5, true);
      return;
    }
    await this.invokeFirst(['unlock_trade', 'unlockTrade'], password);
  }

  async placeOrder(req: FutuPlaceOrderRequest): Promise<FutuOrderSnapshot> {
    const raw = await this.invokeFirst(['place_order', 'placeOrder'], {
      trd_market: req.trdMarket,
      trd_side: req.trdSide,
      order_type: req.orderType,
      code: req.code,
      qty: req.qty,
      price: req.price,
      trd_env: req.trdEnv,
      acc_id: req.accId,
      acc_index: req.accIndex,
      remark: req.remark,
    });

    return normalizeOrderSnapshot(raw);
  }

  async modifyOrder(req: FutuModifyOrderRequest): Promise<void> {
    await this.invokeFirst(['modify_order', 'modifyOrder'], {
      modify_order_op: req.modifyOp,
      order_id: req.orderId,
      price: req.price,
      qty: req.qty,
      trd_env: req.trdEnv,
      acc_id: req.accId,
      acc_index: req.accIndex,
    });
  }

  async getOrder(
    orderId: string,
    trdEnv: 'SIMULATE' | 'REAL',
    accId?: number,
    accIndex?: number
  ): Promise<FutuOrderSnapshot | null> {
    const raw = await this.invokeFirst(['order_list_query', 'orderListQuery'], {
      order_id: orderId,
      trd_env: trdEnv,
      acc_id: accId,
      acc_index: accIndex,
    });

    const rows = normalizeRows(raw);
    if (rows.length === 0) return null;
    return normalizeOrderSnapshot(rows[0]);
  }

  async getPositions(
    trdEnv: 'SIMULATE' | 'REAL',
    accId?: number,
    accIndex?: number
  ): Promise<FutuPositionItem[]> {
    const raw = await this.invokeFirst(['position_list_query', 'positionListQuery'], {
      trd_env: trdEnv,
      acc_id: accId,
      acc_index: accIndex,
    });
    return normalizeRows(raw).map(normalizePositionItem);
  }

  async getFunds(
    trdEnv: 'SIMULATE' | 'REAL',
    accId?: number,
    accIndex?: number
  ): Promise<FutuFundsInfo> {
    const raw = await this.invokeFirst(['funds_query', 'fundsQuery'], {
      trd_env: trdEnv,
      acc_id: accId,
      acc_index: accIndex,
    });
    return normalizeFundsInfo(raw);
  }

  async close(): Promise<void> {
    const fn = this.ctx.close;
    if (typeof fn === 'function') {
      await Promise.resolve((fn as () => unknown)());
    }
    logger.info(`Closed Futu SDK connection for user ${this.userId}`);
  }

  private async invokeFirst(methodNames: string[], ...args: unknown[]): Promise<unknown> {
    for (const methodName of methodNames) {
      const fn = this.ctx[methodName];
      if (typeof fn !== 'function') continue;
      const result = await Promise.resolve((fn as (...fnArgs: unknown[]) => unknown)(...args));
      return unwrapSdkResult(result);
    }
    throw new Error(`Futu SDK method not found: ${methodNames.join(' / ')}`);
  }
}

class UnavailableFutuConnection implements FutuTradeConnection {
  constructor(private readonly reason: string) {}

  isConnected(): boolean {
    return false;
  }

  async unlockTrade(): Promise<void> {
    throw new Error(this.reason);
  }

  async placeOrder(): Promise<FutuOrderSnapshot> {
    throw new Error(this.reason);
  }

  async modifyOrder(): Promise<void> {
    throw new Error(this.reason);
  }

  async getOrder(): Promise<FutuOrderSnapshot | null> {
    throw new Error(this.reason);
  }

  async getPositions(): Promise<FutuPositionItem[]> {
    throw new Error(this.reason);
  }

  async getFunds(): Promise<FutuFundsInfo> {
    throw new Error(this.reason);
  }

  async close(): Promise<void> {}
}

// 富途连接池（每个用户一个连接）
const connectionPool = new Map<string, FutuTradeConnection>();

export async function getFutuConnection(userId: string): Promise<FutuTradeConnection> {
  const cached = connectionPool.get(userId);
  if (cached && cached.isConnected()) {
    return cached;
  }

  const conn = await createFutuConnection(userId);
  connectionPool.set(userId, conn);
  return conn;
}

export async function initAllFutuConnections(): Promise<void> {
  logger.info('Initializing Futu connections...');
  const users = await getActiveUsersWithFutu();
  await Promise.all(users.map(async (user) => {
    try {
      await getFutuConnection(user.id);
      logger.info(`Futu connection initialized for user=${user.id}`);
    } catch (error) {
      logger.error(`Failed to init Futu connection for user=${user.id}:`, error);
    }
  }));
}

export async function closeFutuConnection(userId: string): Promise<void> {
  const conn = connectionPool.get(userId);
  if (!conn) return;
  await conn.close();
  connectionPool.delete(userId);
}

async function createFutuConnection(userId: string): Promise<FutuTradeConnection> {
  const sdk = await loadFutuSdk();
  if (!sdk) {
    const reason = 'futu-api package is not available. Install it before using FUTU_ORDER_MODE=A.';
    logger.warn(reason);
    return new UnavailableFutuConnection(reason);
  }

  const credential = await loadUserCredential(userId);
  const host = config.FUTU_API_HOST;
  const port = config.FUTU_API_PORT;

  const OpenSecTradeContext = resolveCtor(sdk, ['OpenSecTradeContext', 'openSecTradeContext']);
  if (!OpenSecTradeContext) {
    const reason = 'OpenSecTradeContext was not found in futu-api module exports.';
    logger.error(reason);
    return new UnavailableFutuConnection(reason);
  }

  const ctx = new OpenSecTradeContext({
    host,
    port,
    is_encrypt: false,
    isEncrypt: false,
  }) as SdkTradeContext;

  const conn = new FutuSdkConnection(userId, ctx);
  if (config.FUTU_AUTO_UNLOCK) {
    await conn.unlockTrade(credential.tradePassword, credential.tradePasswordMd5);
  }

  return conn;
}

async function loadUserCredential(userId: string): Promise<FutuCredentialPayload> {
  const account = await getBrokerAccount(userId, 'futu');
  if (!account?.encryptedCredentials) {
    return {
      tradePassword: config.FUTU_TRADE_PASSWORD,
      tradePasswordMd5: config.FUTU_TRADE_PASSWORD_MD5,
      accId: config.FUTU_TRADE_ACC_ID,
      trdEnv: config.FUTU_TRD_ENV,
    };
  }

  try {
    const decrypted = decrypt(account.encryptedCredentials);
    const parsed = JSON.parse(decrypted) as FutuCredentialPayload;
    return {
      tradePassword: parsed.tradePassword ?? config.FUTU_TRADE_PASSWORD,
      tradePasswordMd5: parsed.tradePasswordMd5 ?? config.FUTU_TRADE_PASSWORD_MD5,
      accId: parsed.accId ?? config.FUTU_TRADE_ACC_ID,
      trdEnv: parsed.trdEnv ?? config.FUTU_TRD_ENV,
    };
  } catch (error) {
    logger.warn(`Invalid futu credential payload for user=${userId}, fallback to env config`, error);
    return {
      tradePassword: config.FUTU_TRADE_PASSWORD,
      tradePasswordMd5: config.FUTU_TRADE_PASSWORD_MD5,
      accId: config.FUTU_TRADE_ACC_ID,
      trdEnv: config.FUTU_TRD_ENV,
    };
  }
}

async function loadFutuSdk(): Promise<Record<string, unknown> | null> {
  try {
    const runtimeRequire = eval('require') as (id: string) => unknown;
    const mod = runtimeRequire('futu-api');
    return mod as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveCtor(sdk: Record<string, unknown>, names: string[]): (new (...args: unknown[]) => unknown) | null {
  for (const name of names) {
    const maybeCtor = sdk[name];
    if (typeof maybeCtor === 'function') {
      return maybeCtor as new (...args: unknown[]) => unknown;
    }
  }
  const defaultExport = sdk.default as Record<string, unknown> | undefined;
  if (defaultExport) {
    for (const name of names) {
      const maybeCtor = defaultExport[name];
      if (typeof maybeCtor === 'function') {
        return maybeCtor as new (...args: unknown[]) => unknown;
      }
    }
  }
  return null;
}

function unwrapSdkResult(result: unknown): unknown {
  if (!Array.isArray(result)) return result;
  if (result.length < 2) return result[0];

  const ret = result[0];
  const payload = result[1];
  if (typeof ret === 'number' && ret !== 0) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`Futu SDK returned error code=${ret}, detail=${detail}`);
  }
  return payload;
}

function normalizeRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  if (typeof raw === 'object' && raw !== null) {
    const maybeRows = (raw as { data?: unknown }).data;
    if (Array.isArray(maybeRows)) {
      return maybeRows.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
    }
    return [raw as Record<string, unknown>];
  }
  return [];
}

function normalizeOrderSnapshot(raw: unknown): FutuOrderSnapshot {
  const row = normalizeRows(raw)[0] ?? {};
  return {
    orderId: String(row.order_id ?? row.orderId ?? ''),
    orderStatus: (row.order_status ?? row.orderStatus) as string | number | undefined,
    dealtAvgPrice: toNumber(row.dealt_avg_price ?? row.dealtAvgPrice ?? row.price),
    dealtQty: toNumber(row.dealt_qty ?? row.dealtQty ?? row.qty),
  };
}

function normalizePositionItem(row: Record<string, unknown>): FutuPositionItem {
  return {
    code: String(row.code ?? row.stock_code ?? ''),
    name: row.stock_name != null ? String(row.stock_name) : undefined,
    qty: toNumber(row.qty ?? row.position_qty ?? row.can_sell_qty) ?? 0,
    costPrice: toNumber(row.cost_price ?? row.cost_price_valid),
    currentPrice: toNumber(row.current_price ?? row.price),
    marketVal: toNumber(row.market_val ?? row.market_value),
  };
}

function normalizeFundsInfo(raw: unknown): FutuFundsInfo {
  const row = normalizeRows(raw)[0] ?? (typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {});
  return {
    power: toNumber((row as Record<string, unknown>).power ?? (row as Record<string, unknown>).buying_power),
    totalAssets: toNumber((row as Record<string, unknown>).total_assets ?? (row as Record<string, unknown>).totalAssets),
    cash: toNumber((row as Record<string, unknown>).cash ?? (row as Record<string, unknown>).cash_infos),
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
