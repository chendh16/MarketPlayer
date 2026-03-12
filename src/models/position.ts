import { TradingMarket } from '../types/market';
export interface Position {
  symbol: string;
  market: TradingMarket;
  quantity: number;
  marketValue: number;      // 当前市值
  positionPct: number;      // 占总资产百分比
}

export interface AccountSnapshot {
  broker: string;
  totalAssets: number;
  availableCash: number;
  positions: Position[];
  totalPositionPct: number;
  fetchedAt: Date;
  source: 'live' | 'cache';
}

