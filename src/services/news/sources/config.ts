export const FETCH_CONFIGS = {
  us: {
    interval: '*/5 * * * *',        // 每5分钟
    tradingHours: { start: '22:30', end: '05:00', timezone: 'Asia/Shanghai' },
    premarketHours: { start: '04:00', end: '22:30' },
  },
  hk: {
    interval: '*/5 * * * *',
    tradingHours: { start: '09:30', end: '16:00', timezone: 'Asia/Shanghai' },
  },
  a: {
    interval: '*/5 * * * *',
    tradingHours: { start: '09:30', end: '15:00', timezone: 'Asia/Shanghai' },
  },
  btc: {
    interval: '0 */4 * * *',         // 每4小时
    tradingHours: null,              // 全天
    maxSignalsPerDay: 6,
  },
};

