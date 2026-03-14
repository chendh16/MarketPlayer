/**
 * 行业板块 MCP 工具
 * 
 * 提供行业板块涨跌、概念板块、资金流向等数据
 * 数据来源：东方财富API
 */

import { logger } from '../../utils/logger';

const EASTMONEY_BASE_URL = 'https://push2.eastmoney.com';

/**
 * 板块类型
 */
export type BoardType = '行业' | '概念' | '地域';

/**
 * 行业板块项目
 */
export interface BoardItem {
  rank: number;
  boardCode: string;
  boardName: string;
  price: number;
  changePercent: number;
  turnover: number;
  upCount: number;      // 上涨家数
  downCount: number;    // 下跌家数
  leadStock: string;    // 领涨股票
  leadChange: number;   // 领涨涨幅
  marketCap?: number;   // 总市值(万亿)
  flowAmount?: number; // 主力净流入
}

/**
 * 获取行业/概念板块涨跌
 * 
 * @param params 参数
 * @returns 板块数据
 */
export async function fetch_board_rank(params: {
  boardType?: BoardType;
  limit?: number;
}): Promise<{
  boardType: string;
  data: BoardItem[];
  total: number;
  updateTime: string;
}> {
  const { boardType = '行业', limit = 50 } = params;
  
  logger.info(`[MCP] fetch_board_rank boardType=${boardType}`);

  try {
    // 板块涨跌榜API
    // 行业: m:90+t:2,f:!,p:2,o:1,v:1  概念: m:90+t:3,f:!,p:2,o:1,v:1
    const boardCode = boardType === '行业' ? 'm:90+t:2' : 
                     boardType === '概念' ? 'm:90+t:3' : 
                     'm:90+t:1';
    
    const url = `${EASTMONEY_BASE_URL}/api/qt/clist/get`;
    const queryParams = new URLSearchParams({
      pn: '1',
      pz: limit.toString(),
      po: '1',                              // 降序
      np: '1',
      ut: 'bd1d9ddb04089700cf9c27f6f7426281',
      fltt: '2',
      invt: '2',
      fid: 'f3',
      fs: boardCode,
      fields: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18'
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
        boardType,
        data: [],
        total: 0,
        updateTime: new Date().toISOString()
      };
    }

    const boards = result.data.diff as any[];
    const data: BoardItem[] = boards.map((item, index) => ({
      rank: index + 1,
      boardCode: item.f12 || '',
      boardName: item.f14 || '',
      price: item.f2 || 0,
      changePercent: item.f3 || 0,
      turnover: item.f8 / 100 || 0,
      upCount: item.f4 || 0,
      downCount: item.f5 || 0,
      leadStock: item.f15 || '',
      leadChange: item.f16 || 0,
      marketCap: item.f9 ? item.f9 / 100000000 : undefined,
      flowAmount: item.f17 ? item.f17 / 10000 : undefined
    }));

    return {
      boardType,
      data,
      total: result.data.total || boards.length,
      updateTime: new Date().toISOString()
    };
  } catch (error: any) {
    logger.error(`[MCP] fetch_board_rank error:`, error);
    throw new Error(`Failed to fetch board rank: ${error.message}`);
  }
}

/**
 * 获取行业板块涨跌
 */
export async function fetch_industry_board(params?: {
  limit?: number;
}): Promise<{
  data: BoardItem[];
  updateTime: string;
}> {
  const result = await fetch_board_rank({
    boardType: '行业',
    limit: params?.limit || 50
  });
  
  return {
    data: result.data,
    updateTime: result.updateTime
  };
}

/**
 * 获取概念板块涨跌
 */
export async function fetch_concept_board(params?: {
  limit?: number;
}): Promise<{
  data: BoardItem[];
  updateTime: string;
}> {
  const result = await fetch_board_rank({
    boardType: '概念',
    limit: params?.limit || 50
  });
  
  return {
    data: result.data,
    updateTime: result.updateTime
  };
}

/**
 * 获取地域板块涨跌
 */
export async function fetch_region_board(params?: {
  limit?: number;
}): Promise<{
  data: BoardItem[];
  updateTime: string;
}> {
  const result = await fetch_board_rank({
    boardType: '地域',
    limit: params?.limit || 50
  });
  
  return {
    data: result.data,
    updateTime: result.updateTime
  };
}

/**
 * 获取板块内个股
 */
export async function fetch_board_stocks(params: {
  boardCode: string;
  boardType?: BoardType;
  limit?: number;
}): Promise<{
  boardCode: string;
  boardName: string;
  stocks: Array<{
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
  }>;
  updateTime: string;
}> {
  const { boardCode, boardType = '行业', limit = 20 } = params;
  
  logger.info(`[MCP] fetch_board_stocks boardCode=${boardCode}`);

  try {
    // 板块详情API - 获取成分股
    const url = `${EASTMONEY_BASE_URL}/api/qt/stock/get`;
    const queryParams = new URLSearchParams({
      secid: boardCode,
      fields: 'f2,f3,f4,f12,f14'
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
    
    if (!result.data || !result.data.klines) {
      return {
        boardCode,
        boardName: '',
        stocks: [],
        updateTime: new Date().toISOString()
      };
    }

    // 解析成分股
    const klines = result.data.klines as string[];
    const stocks = klines.slice(0, limit).map((line: string) => {
      const parts = line.split(',');
      return {
        symbol: parts[0] || '',
        name: parts[1] || '',
        price: parseFloat(parts[2]) || 0,
        changePercent: parseFloat(parts[3]) || 0
      };
    });

    return {
      boardCode,
      boardName: result.data.name || boardCode,
      stocks,
      updateTime: new Date().toISOString()
    };
  } catch (error: any) {
    logger.error(`[MCP] fetch_board_stocks error:`, error);
    throw new Error(`Failed to fetch board stocks: ${error.message}`);
  }
}
