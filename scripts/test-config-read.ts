/**
 * 测试配置读取
 */
import 'dotenv/config';
import { evaluateShortTerm } from '../src/strategies/shortTerm';

async function main() {
  console.log('🧪 测试策略配置读取...\n');
  
  const result = await evaluateShortTerm('AAPL', 'us', '苹果');
  
  console.log('📊 信号结果:');
  console.log('  - 信号:', result.signal);
  console.log('  - 强度:', result.strength);
  console.log('  - 形态:', result.pattern);
  console.log('  - 原因:', result.reasons);
  console.log('  - 止损:', (result.stopLoss/result.entryPrice*100).toFixed(1) + '%');
  console.log('  - 止盈:', (result.targetPrice/result.entryPrice*100).toFixed(1) + '%');
}

main().catch(console.error);
