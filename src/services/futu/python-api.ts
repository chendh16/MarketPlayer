/**
 * 富途Python API调用
 * 通过子进程调用Python脚本执行富途交易
 */

import { logger } from '../../utils/logger';
import { config } from '../../config';

const PYTHON_CMD = 'python3';

interface PythonResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * 执行Python脚本
 */
async function runPython(code: string): Promise<PythonResult> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    
    const child = spawn(PYTHON_CMD, ['-c', code], {
      env: { ...process.env, PYTHONPATH: '/Users/zhengzefeng/Library/Python/3.9/lib/python3.9/site-packages' }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data: any) => { stdout += data.toString(); });
    child.stderr.on('data', (data: any) => { stderr += data.toString(); });
    
    child.on('close', (code: any) => {
      if (code === 0) {
        resolve({ success: true, data: stdout });
      } else {
        resolve({ success: false, error: stderr || stdout });
      }
    });
    
    child.on('error', (err: any) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * 解锁富途交易
 */
export async function unlockFutu(): Promise<PythonResult> {
  const code = `
from futu import *
import sys
trd_ctx = OpenSecTradeContext(filter_trdmarket=TrdMarket.US, host='127.0.0.1', port=11111, security_firm=SecurityFirm.FUTUSECURITIES)
ret, data = trd_ctx.unlock_trade('602602')
print('RESULT:', ret, '|', data)
trd_ctx.close()
`;
  
  return runPython(code);
}

/**
 * 获取富途账户资金
 */
export async function getFutuFunds(): Promise<PythonResult> {
  const code = `
from futu import *
import json
trd_ctx = OpenSecTradeContext(filter_trdmarket=TrdMarket.US, host='127.0.0.1', port=11111, security_firm=SecurityFirm.FUTUSECURITIES)
ret, data = trd_ctx.accinfo_query(trd_env=TrdEnv.SIMULATE)
if ret == 0:
    print('RESULT:', json.dumps({'power': float(data['power'].iloc[0]) if len(data) > 0 else 0, 'cash': float(data['cash'].iloc[0]) if len(data) > 0 else 0}))
else:
    print('RESULT: ERROR')
trd_ctx.close()
`;
  
  return runPython(code);
}

/**
 * 获取富途持仓
 */
export async function getFutuPositions(): Promise<PythonResult> {
  const code = `
from futu import *
import json
trd_ctx = OpenSecTradeContext(filter_trdmarket=TrdMarket.US, host='127.0.0.1', port=11111, security_firm=SecurityFirm.FUTUSECURITIES)
ret, data = trd_ctx.position_list_query(trd_env=TrdEnv.SIMULATE)
if ret == 0 and len(data) > 0:
    positions = []
    for i in range(len(data)):
        positions.append({'code': str(data['code'].iloc[i]), 'name': str(data['stock_name'].iloc[i]), 'qty': float(data['qty'].iloc[i])})
    print('RESULT:', json.dumps(positions))
else:
    print('RESULT: []')
trd_ctx.close()
`;
  
  return runPython(code);
}

/**
 * 富途下单
 */
export async function placeFutuOrder(
  symbol: string,
  direction: 'buy' | 'sell',
  quantity: number,
  price: number = 0
): Promise<PythonResult> {
  // 格式化股票代码
  const code = symbol.includes('.') ? symbol : `US.${symbol}`;
  const side = direction === 'buy' ? 'TrdSide.BUY' : 'TrdSide.SELL';
  
  // 使用正确的API格式
  const pythonCode = `
from futu import *
trd_ctx = OpenSecTradeContext(
    filter_trdmarket=TrdMarket.US,
    host='127.0.0.1',
    port=11111,
    security_firm=SecurityFirm.FUTUSECURITIES
)
ret, data = trd_ctx.place_order(
    price=${price},
    qty=${quantity},
    code='${code}',
    trd_side=${side},
    order_type=OrderType.NORMAL,
    trd_env=TrdEnv.SIMULATE
)
print('RESULT:', ret, '|', 'SUCCESS' if ret == 0 else 'FAILED')
trd_ctx.close()
`;
  
  logger.info(`[Futu] 下单: ${code} ${direction} ${quantity} @ ${price}`);
  return runPython(pythonCode);
}

/**
 * 同步富途账户
 */
export async function syncFutuAccount(): Promise<{
  account: { power: number; cash: number };
  positions: Array<{ code: string; name: string; qty: number }>;
}> {
  const [fundsResult, positionsResult] = await Promise.all([
    getFutuFunds(),
    getFutuPositions()
  ]);
  
  let account = { power: 0, cash: 0 };
  let positions: any[] = [];
  
  if (fundsResult.success && fundsResult.data) {
    try {
      const match = fundsResult.data.match(/RESULT: (.+)/);
      if (match) {
        account = JSON.parse(match[1]);
      }
    } catch (e) {
      logger.warn('[Futu] 解析资金数据失败');
    }
  }
  
  if (positionsResult.success && positionsResult.data) {
    try {
      const match = positionsResult.data.match(/RESULT: (.+)/);
      if (match) {
        positions = JSON.parse(match[1]);
      }
    } catch (e) {
      logger.warn('[Futu] 解析持仓数据失败');
    }
  }
  
  return { account, positions };
}
