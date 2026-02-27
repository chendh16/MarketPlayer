import { DateTime } from 'luxon';

export function isMarketOpen(market: 'us' | 'hk' | 'a' | 'btc'): boolean {
  if (market === 'btc') return true;

  const now = DateTime.now().setZone('Asia/Shanghai');
  const time = now.hour * 100 + now.minute;

  switch (market) {
    case 'a':
      return time >= 930 && time <= 1500;
    case 'hk':
      return time >= 930 && time <= 1600;
    case 'us':
      return time >= 2230 || time <= 500;
    default:
      return false;
  }
}

export function getPreMarketWarning(market: string): string | null {
  const now = DateTime.now().setZone('Asia/Shanghai');
  const time = now.hour * 100 + now.minute;

  // A股开盘前30分钟
  if (market === 'a' && time >= 900 && time < 930) {
    return '距A股开盘不足30分钟，请注意评估最新行情';
  }
  // 港股开盘前30分钟
  if (market === 'hk' && time >= 900 && time < 930) {
    return '距港股开盘不足30分钟，请注意评估最新行情';
  }
  // 美股开盘前30分钟
  if (market === 'us' && time >= 2200 && time < 2230) {
    return '距美股开盘不足30分钟，请注意评估最新行情';
  }

  return null;
}

export function getMarketClosedText(market: string): string {
  const texts: Record<string, string> = {
    a: 'A股已休市',
    hk: '港股已休市',
    us: '美股已休市',
    btc: 'BTC市场'
  };
  return texts[market] ?? '市场已休市';
}

