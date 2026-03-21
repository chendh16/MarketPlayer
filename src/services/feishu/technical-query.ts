/**
 * 技术指标查询处理器 - 飞书Bot
 */

import { sendMessageToUser } from '../feishu/bot';
import { getHistoryKLine } from '../../services/market/quote-service';
import { 
  calculateBollingerBands, 
  calculateRSI, 
  calculateMACD,
  determineTrend,
  detectAllPatterns
} from '../../utils/technical-analysis';
import { logger } from '../../utils/logger';

interface TechnicalQuery {
  symbol: string;
  market: 'a' | 'us' | 'hk';
  name?: string;
}

/**
 * 处理技术指标查询请求
 */
export async function handleTechnicalQuery(
  openId: string,
  query: string
): Promise<void> {
  try {
    // 解析查询 (格式: "指标 AAPL" 或 "技术分析 600519")
    const parsed = parseQuery(query);
    
    if (!parsed) {
      await sendMessageToUser(openId, {
        text: '❌ 格式错误。请使用:\n- 指标 AAPL\n- 技术分析 腾讯\n\n支持市场: a(A股), us(美股), hk(港股)'
      });
      return;
    }

    await sendMessageToUser(openId, {
      text: `🔍 正在查询 ${parsed.name || parsed.symbol} 技术指标...`
    });

    // 获取数据
    const klines = await getHistoryKLine(parsed.symbol, parsed.market, '1d', '1mo');
    
    if (klines.length < 20) {
      await sendMessageToUser(openId, {
        text: `❌ ${parsed.symbol} 数据不足，无法分析`
      });
      return;
    }

    // 计算指标
    const bb = calculateBollingerBands(klines);
    const rsi = calculateRSI(klines, 14);
    const macd = calculateMACD(klines);
    const trend = determineTrend(klines);
    const patterns = detectAllPatterns(klines);

    const latest = klines[klines.length - 1];
    const changePct = ((latest.close - klines[klines.length - 2].close) / klines[klines.length - 2].close) * 100;

    // 构建消息
    const card = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: `📊 ${parsed.name || parsed.symbol} 技术分析` },
        template: getTemplate(bb?.bands.rating || 0)
      },
      elements: [
        // 价格信息
        {
          tag: 'div',
          text: { tag: 'lark_md', content: `**当前价格**: ¥${latest.close.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)` }
        },
        { tag: 'hr' },
        // Bollinger Bands
        {
          tag: 'div',
          text: { 
            tag: 'lark_md', 
            content: bb ? `**📈 Bollinger Bands**\n上轨: ${bb.bands.upper.toFixed(2)}\n中轨: ${bb.bands.middle.toFixed(2)}\n下轨: ${bb.bands.lower.toFixed(2)}\n带宽: ${(bb.bands.width * 100).toFixed(2)}%\n评级: ${getRatingText(bb.bands.rating)}` : 'N/A'
          }
        },
        { tag: 'hr' },
        // RSI & MACD
        {
          tag: 'div',
          text: { 
            tag: 'lark_md', 
            content: `**📉 RSI(14)**: ${rsi.toFixed(1)} ${getRSIText(rsi)}\n\n**📊 MACD**: ${macd ? macd.trend : 'N/A'}\nHistogram: ${macd?.histogram.toFixed(2) || 'N/A'}`
          }
        },
        { tag: 'hr' },
        // 趋势 & 形态
        {
          tag: 'div',
          text: { 
            tag: 'lark_md', 
            content: `**🔔 趋势**: ${getTrendText(trend)}\n**🕯️ 形态**: ${patterns.length > 0 ? patterns.map(p => p.name).join(', ') : '无明显形态'}`
          }
        },
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: '数据来源: MarketPlayer 技术分析' }]
        }
      ]
    };

    await sendMessageToUser(openId, { card });

  } catch (error) {
    logger.error('[TechnicalQuery] 处理失败:', error);
    await sendMessageToUser(openId, {
      text: '❌ 查询失败，请稍后重试'
    });
  }
}

/**
 * 解析查询字符串
 */
function parseQuery(query: string): TechnicalQuery | null {
  // 移除命令词
  const cleanQuery = query
    .replace(/^(指标|技术|分析|查询|看)\s*/i, '')
    .replace(/\s*$/, '')
    .trim();

  if (!cleanQuery) return null;

  // 常见股票映射
  const stockMap: Record<string, { symbol: string; market: 'a' | 'us' | 'hk'; name: string }> = {
    '苹果': { symbol: 'AAPL', market: 'us', name: '苹果' },
    '特斯拉': { symbol: 'TSLA', market: 'us', name: '特斯拉' },
    '微软': { symbol: 'MSFT', market: 'us', name: '微软' },
    '谷歌': { symbol: 'GOOGL', market: 'us', name: '谷歌' },
    '英伟达': { symbol: 'NVDA', market: 'us', name: '英伟达' },
    '腾讯': { symbol: '00700', market: 'hk', name: '腾讯控股' },
    '阿里': { symbol: '09988', market: 'hk', name: '阿里巴巴' },
    '茅台': { symbol: '600519', market: 'a', name: '贵州茅台' },
    '平安': { symbol: '000001', market: 'a', name: '平安银行' },
  };

  // 检查中文名
  for (const [key, value] of Object.entries(stockMap)) {
    if (cleanQuery.includes(key)) {
      return { symbol: value.symbol, market: value.market, name: value.name };
    }
  }

  // 检查是否是代码格式
  // A股: 6位数字 (如 600519)
  if (/^\d{6}$/.test(cleanQuery)) {
    return { symbol: cleanQuery, market: 'a', name: cleanQuery };
  }

  // 美股: 大写字母 (如 AAPL)
  if (/^[A-Z]{1,5}$/.test(cleanQuery.toUpperCase())) {
    return { symbol: cleanQuery.toUpperCase(), market: 'us', name: cleanQuery.toUpperCase() };
  }

  // 港股: 5位数字 (如 00700)
  if (/^\d{5}$/.test(cleanQuery)) {
    return { symbol: cleanQuery, market: 'hk', name: cleanQuery };
  }

  return { symbol: cleanQuery.toUpperCase(), market: 'us', name: cleanQuery.toUpperCase() };
}

function getRatingText(rating: number): string {
  const texts: Record<number, string> = {
    3: '🔥 强烈买入',
    2: '✅ 买入',
    1: '⬆️ 弱买入',
    0: '➡️ 中性',
    '-1': '⬇️ 弱卖出',
    '-2': '❌ 卖出',
    '-3': '🔥 强烈卖出',
  };
  return texts[rating] || '未知';
}

function getRSIText(rsi: number): string {
  if (rsi >= 70) return '(超买⚠️)';
  if (rsi <= 30) return '(超卖📈)';
  return '';
}

function getTrendText(trend: 'UP' | 'DOWN' | 'SIDE'): string {
  const texts = { UP: '↗️ 上涨', DOWN: '↘️ 下跌', SIDE: '➡️ 震荡' };
  return texts[trend];
}

function getTemplate(rating: number): string {
  if (rating >= 2) return 'green';
  if (rating <= -2) return 'red';
  return 'blue';
}
