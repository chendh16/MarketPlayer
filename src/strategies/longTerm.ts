/**
 * 长线策略 - 估值择时规则
 * 使用PB分位数据进行估值判断
 */

import * as fs from 'fs';

export interface PBRecord {
  date: string;
  middlePB: number;
  equalWeightAveragePB: number;
  close: number;
  quantileInRecent10YearsMiddlePB: number;
  quantileInRecent10YearsEqualWeightAveragePB: number;
}

export interface LongTermSignal {
  market: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  pbPercentile: number; // PB分位 0-100
  strength: number;
  reasons: string[];
  currentPB: number;
  currentIndex: number;
}

/**
 * 加载PB分位数据
 */
export function loadPBData(): PBRecord[] {
  const data = fs.readFileSync('data/fundamental/a_pb_percentile.csv', 'utf8');
  const lines = data.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return {
      date: values[0],
      middlePB: parseFloat(values[1]),
      equalWeightAveragePB: parseFloat(values[2]),
      close: parseFloat(values[3]),
      quantileInRecent10YearsMiddlePB: parseFloat(values[4]),
      quantileInRecent10YearsEqualWeightAveragePB: parseFloat(values[5])
    };
  });
}

/**
 * 长线估值择时规则
 */
export function evaluateLongTerm(pbData: PBRecord[]): LongTermSignal {
  const latest = pbData[pbData.length - 1];
  const percentile = latest.quantileInRecent10YearsMiddlePB * 100;
  
  const reasons: string[] = [];
  let score = 50;
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  
  // 规则1: PB分位 < 20% -> 极度低估
  if (percentile < 20) {
    score += 30;
    reasons.push('PB分位历史最低20%');
  }
  
  // 规则2: PB分位 20-40% -> 低估
  if (percentile >= 20 && percentile < 40) {
    score += 15;
    reasons.push('PB分位历史较低');
  }
  
  // 规则3: PB分位 > 80% -> 极度高估
  if (percentile > 80) {
    score -= 30;
    reasons.push('PB分位历史最高20%');
  }
  
  // 规则4: PB分位 60-80% -> 高估
  if (percentile >= 60 && percentile <= 80) {
    score -= 15;
    reasons.push('PB分位历史较高');
  }
  
  // 规则5: PB < 2 -> 历史低位
  if (latest.middlePB < 2) {
    score += 10;
    reasons.push('PB < 2 历史低位');
  }
  
  // 规则6: PB > 4 -> 历史高位
  if (latest.middlePB > 4) {
    score -= 10;
    reasons.push('PB > 4 历史高位');
  }
  
  // 确定信号
  if (score >= 70) signal = 'BUY';
  else if (score <= 30) signal = 'SELL';
  else signal = 'HOLD';
  
  return {
    market: 'A股',
    signal,
    pbPercentile: Math.round(percentile),
    strength: Math.max(0, Math.min(100, score)),
    reasons,
    currentPB: parseFloat(latest.middlePB.toFixed(2)),
    currentIndex: Math.round(latest.close)
  };
}
