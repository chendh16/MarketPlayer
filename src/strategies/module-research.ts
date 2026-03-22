/**
 * 板块研究框架
 * 基于产业链联动的深度研究
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '../../data/stock-history');

/**
 * 产业链定义
 */
export interface Chain {
  name: string;
  modules: string[];
  description: string;
}

export const CHAINS: Chain[] = [
  {
    name: '电力产业链',
    modules: ['coal', 'power', 'steel', 'cement'],
    description: '煤炭→电力→钢铁/水泥'
  },
  {
    name: '新能源车产业链',
    modules: ['ev', 'us_ev', 'us_semi', 'tech'],
    description: '锂电池→整车→芯片/AI'
  },
  {
    name: '科技产业链',
    modules: ['us_semi', 'us_tech', 'hk_tech', 'tech'],
    description: '半导体→科技硬件→互联网'
  },
  {
    name: '金融产业链',
    modules: ['finance', 'us_finance', 'hk_finance', 'realestate'],
    description: '银行→保险→地产'
  }
];

/**
 * 板块统计数据
 */
export interface ModuleStats {
  name: string;
  avgMomentum: number;
  avgVolatility: number;
  stockCount: number;
  topStock: { code: string; name: string; momentum: number };
  stocks: Array<{ code: string; name: string; momentum: number; volatility: number }>;
}

/**
 * 加载所有模块数据
 */
export function loadModules(): Record<string, any[]> {
  const modules: Record<string, any[]> = {};
  
  if (!fs.existsSync(DATA_DIR)) {
    return modules;
  }
  
  fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('module-') && f.endsWith('.json') && !f.includes('state'))
    .forEach(f => {
      const name = f.replace('module-', '').replace('.json', '');
      modules[name] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    });
  
  return modules;
}

/**
 * 计算板块统计
 */
export function calculateModuleStats(modules: Record<string, any[]>): ModuleStats[] {
  return Object.entries(modules).map(([name, stocks]) => {
    const momenta = stocks.map((s: any) => parseFloat(s.momentum));
    const vols = stocks.map((s: any) => parseFloat(s.volatility));
    
    const sortedByMomentum = [...stocks].sort((a: any, b: any) => 
      parseFloat(b.momentum) - parseFloat(a.momentum)
    );
    
    return {
      name,
      avgMomentum: momenta.reduce((a, b) => a + b, 0) / momenta.length,
      avgVolatility: vols.reduce((a, b) => a + b, 0) / vols.length,
      stockCount: stocks.length,
      topStock: {
        code: sortedByMomentum[0].code,
        name: sortedByMomentum[0].name,
        momentum: parseFloat(sortedByMomentum[0].momentum)
      },
      stocks: stocks.map((s: any) => ({
        code: s.code,
        name: s.name,
        momentum: parseFloat(s.momentum),
        volatility: parseFloat(s.volatility)
      }))
    };
  }).sort((a, b) => b.avgMomentum - a.avgMomentum);
}

/**
 * 分析产业链传导
 */
export function analyzeChain(modules: Record<string, any[]>, chain: Chain): {
  name: string;
  momenta: number[];
  direction: 'upstream' | 'downstream' | 'sync';
  recommendation: string;
} {
  const momenta = chain.modules
    .filter(m => modules[m])
    .map(m => {
      const stocks = modules[m];
      return stocks.reduce((sum, s: any) => sum + parseFloat(s.momentum), 0) / stocks.length;
    });
  
  let direction: 'upstream' | 'downstream' | 'sync' = 'sync';
  let recommendation = '观望';
  
  if (momenta.length >= 2) {
    if (momenta[0] > momenta[1]) {
      direction = 'upstream';
      recommendation = '上游带动下游，关注下游补涨机会';
    } else if (momenta[0] < momenta[1]) {
      direction = 'downstream';
      recommendation = '下游需求旺盛，关注上游机会';
    }
  }
  
  return {
    name: chain.name,
    momenta,
    direction,
    recommendation
  };
}

/**
 * 找出攻守兼备板块
 */
export function findBalancedModules(stats: ModuleStats[], minMomentum = 5, maxVol = 30): ModuleStats[] {
  return stats.filter(s => s.avgMomentum > minMomentum && s.avgVolatility < maxVol);
}

/**
 * 找出反转信号板块
 */
export function findReversalCandidates(stats: ModuleStats[]): ModuleStats[] {
  // 动量为负但波动率高 = 可能在筑底
  return stats.filter(s => s.avgMomentum < 0 && s.avgVolatility > 20);
}

/**
 * 生成投资建议
 */
export function generateRecommendations(modules: Record<string, any[]>): {
  shortTerm: string[];   // 短线
  mediumTerm: string[];  // 中线
  longTerm: string[];    // 长线
} {
  const stats = calculateModuleStats(modules);
  
  // 短线: 高动量板块
  const shortTerm = stats
    .filter(s => s.avgMomentum > 10)
    .slice(0, 3)
    .map(s => s.name);
  
  // 中线: 稳定增长板块
  const mediumTerm = stats
    .filter(s => s.avgMomentum > 0 && s.avgMomentum < 10 && s.avgVolatility < 20)
    .slice(0, 3)
    .map(s => s.name);
  
  // 长线: 低位板块，等待反转
  const longTerm = stats
    .filter(s => s.avgMomentum < 0)
    .slice(0, 3)
    .map(s => s.name);
  
  return { shortTerm, mediumTerm, longTerm };
}

export default {
  CHAINS,
  loadModules,
  calculateModuleStats,
  analyzeChain,
  findBalancedModules,
  findReversalCandidates,
  generateRecommendations
};
