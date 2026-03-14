/**
 * 港股美股基本面 MCP 工具
 */

import { logger } from '../../utils/logger';
import { getHKStockDetail, getUSStockDetail, HKStockDetail, USStockDetail } from '../../services/market/hk-us-service';

/**
 * 获取港股基本面数据
 */
export async function get_hk_stock_detail(params: {
  code: string;
}): Promise<{
  success: boolean;
  data?: HKStockDetail;
  error?: string;
}> {
  const { code } = params;
  logger.info(`[MCP] get_hk_stock_detail code=${code}`);
  
  try {
    const data = await getHKStockDetail(code);
    
    if (!data) {
      return {
        success: false,
        error: `无法获取港股${code}数据`,
      };
    }
    
    return {
      success: true,
      data,
    };
  } catch (error: any) {
    logger.error(`[MCP] get_hk_stock_detail error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取美股基本面数据
 */
export async function get_us_stock_detail(params: {
  code: string;
}): Promise<{
  success: boolean;
  data?: USStockDetail;
  error?: string;
}> {
  const { code } = params;
  logger.info(`[MCP] get_us_stock_detail code=${code}`);
  
  try {
    const data = await getUSStockDetail(code);
    
    if (!data) {
      return {
        success: false,
        error: `无法获取美股${code}数据`,
      };
    }
    
    return {
      success: true,
      data,
    };
  } catch (error: any) {
    logger.error(`[MCP] get_us_stock_detail error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 批量获取港股数据
 */
export async function get_batch_hk_stocks(params: {
  codes: string[];
}): Promise<{
  success: boolean;
  data: HKStockDetail[];
  errors: string[];
}> {
  const { codes } = params;
  logger.info(`[MCP] get_batch_hk_stocks count=${codes.length}`);
  
  const results: HKStockDetail[] = [];
  const errors: string[] = [];
  
  for (const code of codes) {
    try {
      const data = await getHKStockDetail(code);
      if (data) {
        results.push(data);
      } else {
        errors.push(code);
      }
    } catch (error) {
      errors.push(code);
    }
  }
  
  return {
    success: results.length > 0,
    data: results,
    errors,
  };
}

/**
 * 批量获取美股数据
 */
export async function get_batch_us_stocks(params: {
  codes: string[];
}): Promise<{
  success: boolean;
  data: USStockDetail[];
  errors: string[];
}> {
  const { codes } = params;
  logger.info(`[MCP] get_batch_us_stocks count=${codes.length}`);
  
  const results: USStockDetail[] = [];
  const errors: string[] = [];
  
  for (const code of codes) {
    try {
      const data = await getUSStockDetail(code);
      if (data && data.price > 0) {
        results.push(data);
      } else {
        errors.push(code);
      }
    } catch (error) {
      errors.push(code);
    }
  }
  
  return {
    success: results.length > 0,
    data: results,
    errors,
  };
}
