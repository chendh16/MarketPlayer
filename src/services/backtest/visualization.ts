/**
 * 收益曲线可视化
 * 生成文本/JSON 格式的收益图表
 */

import { BacktestResult, EquityPoint } from './data-source/types';

/**
 * 生成 ASCII 收益曲线
 */
export function generateEquityCurveChart(
  equityCurve: EquityPoint[], 
  width: number = 60,
  height: number = 15
): string {
  if (equityCurve.length < 2) {
    return 'Not enough data to generate chart';
  }
  
  // 采样
  const step = Math.max(1, Math.floor(equityCurve.length / width));
  const sampled = [];
  for (let i = 0; i < equityCurve.length; i += step) {
    sampled.push(equityCurve[i]);
  }
  if (sampled[sampled.length - 1] !== equityCurve[equityCurve.length - 1]) {
    sampled.push(equityCurve[equityCurve.length - 1]);
  }
  
  // 找到最大最小值
  const values = sampled.map(p => p.equity);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  
  // 生成图表
  const lines: string[] = [];
  
  for (let row = height - 1; row >= 0; row--) {
    const threshold = minVal + (range * row / height);
    let line = '';
    
    for (const val of values) {
      if (val >= threshold) {
        line += '█';
      } else {
        line += ' ';
      }
    }
    
    lines.push(line);
  }
  
  // 添加边框
  const border = '┌' + '─'.repeat(values.length) + '┐';
  const bottom = '└' + '─'.repeat(values.length) + '┘';
  
  // 添加 Y 轴标签
  const chartWithY = lines.map((line, i) => {
    const yLabel = height - 1 - i === 0 
      ? maxVal.toFixed(0) 
      : height - 1 - i === Math.floor(height / 2)
        ? ((maxVal + minVal) / 2).toFixed(0)
        : '';
    return (yLabel + ' │' + line + '│').padStart(values.length + 10);
  });
  
  return [
    border,
    ...chartWithY,
    bottom,
    '      ' + '─'.repeat(Math.floor(values.length / 2)) + '时间' + '─'.repeat(Math.floor(values.length / 2))
  ].join('\n');
}

/**
 * 生成回测报告（JSON）
 */
export function generateReport(result: BacktestResult): any {
  return {
    summary: {
      totalTrades: result.metrics.totalTrades,
      totalReturn: (result.metrics.totalReturn * 100).toFixed(2) + '%',
      annualizedReturn: (result.metrics.annualizedReturn * 100).toFixed(2) + '%',
      sharpeRatio: result.metrics.sharpeRatio.toFixed(2),
      maxDrawdown: (result.metrics.maxDrawdown * 100).toFixed(2) + '%',
      winRate: (result.metrics.winRate * 100).toFixed(2) + '%',
      profitFactor: result.metrics.profitFactor.toFixed(2),
    },
    trades: result.trades.map(t => ({
      date: t.date.toISOString().split('T')[0],
      action: t.direction === 'long' ? 'BUY' : 'SELL',
      price: t.price.toFixed(2),
      quantity: t.quantity,
      commission: t.commission.toFixed(2),
    })),
    equityCurve: result.equityCurve.map(p => ({
      date: p.date.toISOString().split('T')[0],
      equity: p.equity.toFixed(2),
    })),
  };
}

/**
 * 打印回测摘要
 */
export function printSummary(result: BacktestResult): void {
  console.log('═══════════════════════════════════════');
  console.log('           回 测 报 告');
  console.log('═══════════════════════════════════════');
  console.log(`  交易次数:      ${result.metrics.totalTrades}`);
  console.log(`  总收益率:      ${(result.metrics.totalReturn * 100).toFixed(2)}%`);
  console.log(`  年化收益率:    ${(result.metrics.annualizedReturn * 100).toFixed(2)}%`);
  console.log(`  夏普比率:      ${result.metrics.sharpeRatio.toFixed(2)}`);
  console.log(`  最大回撤:      ${(result.metrics.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  胜率:          ${(result.metrics.winRate * 100).toFixed(2)}%`);
  console.log(`  盈利因子:      ${result.metrics.profitFactor.toFixed(2)}`);
  console.log('═══════════════════════════════════════');
  
  if (result.trades.length > 0) {
    console.log('\n📈 最近 5 笔交易:');
    result.trades.slice(-5).forEach(t => {
      const action = t.direction === 'long' ? '🟢 买入' : '🔴 卖出';
      console.log(`  ${t.date.toISOString().split('T')[0]} ${action} ${t.symbol} @ $${t.price.toFixed(2)} x ${t.quantity}`);
    });
  }
}
