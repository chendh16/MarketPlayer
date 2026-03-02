import { logger } from '../../utils/logger';

// ─── 公共接口（对标 futu/connection.ts 的 FutuTradeConnection）────────────────

export interface LongbridgePositionItem {
  symbol: string;
  quantity: number;
  costPrice?: number;
  currentPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
}

export interface LongbridgeFundsInfo {
  totalCash?: number;
  netAssets?: number;
  maxFinanceAmount?: number;
  currency?: string;
}

export interface LongbridgePlaceOrderRequest {
  symbol: string;        // e.g. "700.HK", "AAPL.US"
  side: 'Buy' | 'Sell';
  orderType: 'LO' | 'ELO' | 'MO' | 'AO' | 'ALO'; // LO=限价, MO=市价
  quantity: number;
  price?: number;        // 限价单必填
  timeInForce?: 'Day' | 'GTC' | 'GTD';
  remark?: string;
}

export interface LongbridgeOrderResult {
  orderId: string;
}

export interface LongbridgeTradeContext {
  accountBalance(currency?: string): Promise<LongbridgeFundsInfo[]>;
  stockPositions(symbols?: string[]): Promise<LongbridgePositionItem[]>;
  submitOrder(req: LongbridgePlaceOrderRequest): Promise<LongbridgeOrderResult>;
  cancelOrder(orderId: string): Promise<void>;
  todayOrders(opts?: { symbol?: string }): Promise<unknown[]>;
  close(): void;
}

// ─── SDK 适配层 ───────────────────────────────────────────────────────────────

class LongbridgeSdkContext implements LongbridgeTradeContext {
  constructor(private readonly ctx: any) {}

  async accountBalance(currency?: string): Promise<LongbridgeFundsInfo[]> {
    const raw = await this.ctx.accountBalance(currency);
    const list: any[] = Array.isArray(raw) ? raw : [raw];
    return list.map(b => ({
      totalCash: toNum(b.totalCash),
      netAssets: toNum(b.netAssets),
      maxFinanceAmount: toNum(b.maxFinanceAmount),
      currency: b.currency,
    }));
  }

  async stockPositions(symbols?: string[]): Promise<LongbridgePositionItem[]> {
    const raw = await this.ctx.stockPositions(symbols);
    const channels: any[] = raw?.channels ?? [];
    const items: LongbridgePositionItem[] = [];
    for (const ch of channels) {
      for (const p of (ch.positions ?? [])) {
        items.push({
          symbol: String(p.symbol ?? ''),
          quantity: toNum(p.quantity) ?? 0,
          costPrice: toNum(p.costPrice),
          currentPrice: toNum(p.currentPrice),
          marketValue: toNum(p.marketValue),
          unrealizedPnl: toNum(p.unrealizedPnl),
        });
      }
    }
    return items;
  }

  async submitOrder(req: LongbridgePlaceOrderRequest): Promise<LongbridgeOrderResult> {
    const sdk = eval('require')('longport');
    const { OrderSide, OrderType, TimeInForceType, Decimal } = sdk;

    const sideEnum = req.side === 'Buy' ? OrderSide.Buy : OrderSide.Sell;
    const typeMap: Record<string, any> = {
      LO: OrderType.LO, ELO: OrderType.ELO, MO: OrderType.MO,
      AO: OrderType.AO, ALO: OrderType.ALO,
    };
    const tifMap: Record<string, any> = {
      Day: TimeInForceType.Day, GTC: TimeInForceType.GoodTilCanceled,
      GTD: TimeInForceType.GoodTilDate,
    };

    const opts: any = {
      symbol: req.symbol,
      orderType: typeMap[req.orderType] ?? OrderType.LO,
      side: sideEnum,
      timeInForce: tifMap[req.timeInForce ?? 'Day'] ?? TimeInForceType.Day,
      submittedQuantity: req.quantity,
    };
    if (req.price != null) {
      opts.submittedPrice = new Decimal(req.price.toFixed(4));
    }
    if (req.remark) opts.remark = req.remark;

    const res = await this.ctx.submitOrder(opts);
    return { orderId: String(res.orderId ?? res.order_id ?? '') };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.ctx.cancelOrder(orderId);
  }

  async todayOrders(opts?: { symbol?: string }): Promise<unknown[]> {
    const raw = await this.ctx.todayOrders(opts ?? {});
    return Array.isArray(raw) ? raw : [];
  }

  close(): void {
    // longport SDK 无需显式关闭
  }
}

class UnavailableLongbridgeContext implements LongbridgeTradeContext {
  constructor(private readonly reason: string) {}
  async accountBalance(): Promise<LongbridgeFundsInfo[]> { throw new Error(this.reason); }
  async stockPositions(): Promise<LongbridgePositionItem[]> { throw new Error(this.reason); }
  async submitOrder(): Promise<LongbridgeOrderResult> { throw new Error(this.reason); }
  async cancelOrder(): Promise<void> { throw new Error(this.reason); }
  async todayOrders(): Promise<unknown[]> { throw new Error(this.reason); }
  close(): void {}
}

// ─── 连接池（单例，按需懒创建）───────────────────────────────────────────────

let sharedContext: LongbridgeTradeContext | null = null;

export async function getLongbridgeContext(): Promise<LongbridgeTradeContext> {
  if (sharedContext) return sharedContext;

  const appKey     = process.env.LONGPORT_APP_KEY;
  const appSecret  = process.env.LONGPORT_APP_SECRET;
  const token      = process.env.LONGPORT_ACCESS_TOKEN;

  if (!appKey || !appSecret || !token) {
    const reason = 'LongBridge API credentials not configured (LONGPORT_APP_KEY / LONGPORT_APP_SECRET / LONGPORT_ACCESS_TOKEN)';
    logger.warn(reason);
    return new UnavailableLongbridgeContext(reason);
  }

  try {
    const sdk = eval('require')('longport');
    const { Config, TradeContext } = sdk;
    const cfg = Config.fromEnv();
    const ctx = await TradeContext.new(cfg);
    sharedContext = new LongbridgeSdkContext(ctx);
    logger.info('LongBridge TradeContext created');
    return sharedContext;
  } catch (err: any) {
    const reason = `Failed to create LongBridge TradeContext: ${err?.message ?? err}`;
    logger.error(reason);
    return new UnavailableLongbridgeContext(reason);
  }
}

export function resetLongbridgeContext(): void {
  sharedContext = null;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v); return isFinite(n) ? n : undefined; }
  if (typeof (v as any)?.toFixed === 'function') {
    const n = parseFloat((v as any).toFixed(10));
    return isFinite(n) ? n : undefined;
  }
  if (typeof (v as any)?.toString === 'function') {
    const n = parseFloat((v as any).toString());
    return isFinite(n) ? n : undefined;
  }
  return undefined;
}
