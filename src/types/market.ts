/**
 * Supported market types
 */
export type Market = 'us' | 'hk' | 'a' | 'btc' | 'macro';

/**
 * Core trading markets (excluding macro)
 */
export type TradingMarket = 'us' | 'hk' | 'a' | 'btc';

/**
 * K线数据
 */
export interface KLine {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
