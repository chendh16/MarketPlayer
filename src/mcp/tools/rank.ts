/**
 * A股排行榜 MCP 工具
 * 
 * 提供涨跌幅排行、成交额排行、换手率排行等数据
 * 数据来源：东方财富API
 */

import { logger } from '../../utils/logger';

const EASTMONEY_BASE_URL = 'https://push2.eastmoney.com';

/**
 * 排行榜类型
 */
export type RankType = '涨跌幅' | '成交额' | '换手率' | '涨跌幅跌幅';

/**
 * 市场类型
 */
export type MarketType = '沪深A股' | '上证A股' | '深证A股' | '创业板' | '科创板';

/**
 * 股票排行榜项目
 */
export interface StockRankItem {
  rank: number;
  symbol: string;
  name: string;
  market: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  turnover: number;
  pe: number;
  highLimit: boolean;   // 是否涨停
  lowLimit: boolean;   // 是否跌停
}

/**
 * 获取A股排行榜
 * 
 * @param params 参数
 * @returns 排行榜数据
 */
export async function fetch_stock_rank(params: {
  rankType?: RankType;
  market?: MarketType;
  limit?: number;
}): Promise<{
  rankType: string;
  market: string;
  data: StockRankItem[];
  total: number;
  updateTime: string;
}> {
  const { 
    rankType = '涨跌幅',
    market = '沪深A股',
    limit = 50 
  } = params;
  
  logger.info(`[MCP] fetch_stock_rank rankType=${rankType} market=${market}`);

  try {
    // 排行榜API参数配置
    const config = getRankConfig(rankType, market);
    const url = `${EASTMONEY_BASE_URL}/api/qt/clist/get`;
    
    const queryParams = new URLSearchParams({
      pn: '1',
      pz: limit.toString(),
      po: config.po,        // 1=降序 0=升序
      np: '1',             // 1=当前页
      ut: 'bd1d9ddb04089700cf9c27f6f7426281',
      fltt: '2',
      invt: '2',
      fid: config.fid,
      fs: config.fs,
      fields: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f22,f11,f62,f128,f136,f115,f152'
    });

    const response = await fetch(`${url}?${queryParams}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json() as any;
    
    if (!result.data || !result.data.diff) {
      return {
        rankType,
        market,
        data: [],
        total: 0,
        updateTime: new Date().toISOString()
      };
    }

    const stocks = result.data.diff as any[];
    const data: StockRankItem[] = stocks.map((item, index) => ({
      rank: index + 1,
      symbol: item.f12 || '',
      name: item.f14 || '',
      market: getMarketName(item.f13),
      price: item.f2 / 1000 || 0,         // f2=最新价
      change: item.f4 / 1000 || 0,         // f4=涨跌额
      changePercent: item.f3 / 100 || 0,   // f3=涨跌幅
      volume: item.f5 || 0,                // f5=成交量(手)
      amount: item.f6 / 10000 || 0,        // f6=成交额(万元)
      turnover: item.f8 / 100 || 0,        // f8=换手率
      pe: item.f9 / 100 || 0,              // f9=市盈率
      highLimit: item.f2 > 0 && (item.f3 / 100) >= 9.9,  // 涨停判断
      lowLimit: item.f2 > 0 && (item.f3 / 100) <= -9.9   // 跌停判断
    }));

    return {
      rankType,
      market,
      data,
      total: result.data.total || stocks.length,
      updateTime: new Date().toISOString()
    };
  } catch (error: any) {
    logger.error(`[MCP] fetch_stock_rank error:`, error);
    throw new Error(`Failed to fetch stock rank: ${error.message}`);
  }
}

/**
 * 获取排行榜配置
 */
function getRankConfig(rankType: RankType, market: MarketType): {
  po: string;
  fid: string;
  fs: string;
} {
  // 市场筛选
  let fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'; // 默认沪深A股
  
  switch (market) {
    case '上证A股':
      fs = 'm:0+t:6,m:0+t:80';  // 上海
      break;
    case '深证A股':
      fs = 'm:1+t:2,m:1+t:23';  // 深圳
      break;
    case '创业板':
      fs = 'm:0+t:80,m:1+t:23';  // 创业板
      break;
    case '科创板':
      fs = 'm:1+t:23';  // 科创板
      break;
  }

  // 排序字段
  let po = '1';  // 降序
  let fid = 'f3'; // 默认涨跌幅
  
  switch (rankType) {
    case '涨跌幅':
    case '涨跌幅跌幅':
      fid = 'f3';
      po = rankType === '涨跌幅跌幅' ? '0' : '1'; // 涨跌幅排序
      break;
    case '成交额':
      fid = 'f6';
      break;
    case '换手率':
      fid = 'f8';
      break;
  }

  return { po, fid, fs };
}

/**
 * 获取市场名称
 */
function getMarketName(f13: number): string {
  if (f13 === 1) return '上海';
  if (f13 === 0) return '深圳';
  return '未知';
}

/**
 * 获取今日涨幅榜
 */
export async function fetch_top_gainers(params?: {
  limit?: number;
}): Promise<{
  data: StockRankItem[];
  updateTime: string;
}> {
  const result = await fetch_stock_rank({
    rankType: '涨跌幅',
    market: '沪深A股',
    limit: params?.limit || 50
  });
  
  return {
    data: result.data,
    updateTime: result.updateTime
  };
}

/**
 * 获取今日跌幅榜
 */
export async function fetch_top_losers(params?: {
  limit?: number;
}): Promise<{
  data: StockRankItem[];
  updateTime: string;
}> {
  const result = await fetch_stock_rank({
    rankType: '涨跌幅跌幅',
    market: '沪深A股',
    limit: params?.limit || 50
  });
  
  return {
    data: result.data,
    updateTime: result.updateTime
  };
}

/**
 * 获取成交额排行
 */
export async function fetch_top_volume(params?: {
  limit?: number;
}): Promise<{
  data: StockRankItem[];
  updateTime: string;
}> {
  const result = await fetch_stock_rank({
    rankType: '成交额',
    market: '沪深A股',
    limit: params?.limit || 50
  });
  
  return {
    data: result.data,
    updateTime: result.updateTime
  };
}

/**
 * 获取换手率排行
 */
export async function fetch_top_turnover(params?: {
  limit?: number;
}): Promise<{
  data: StockRankItem[];
  updateTime: string;
}> {
  const result = await fetch_stock_rank({
    rankType: '换手率',
    market: '沪深A股',
    limit: params?.limit || 50
  });
  
  return {
    data: result.data,
    updateTime: result.updateTime
  };
}
