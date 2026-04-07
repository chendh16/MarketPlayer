// 测试 Python 下单
import { executeFutuOrderPython } from './dist/services/futu/order.js';

const testOrder = {
  id: 'test-001',
  userId: '79a54f3c-5d54-4844-920f-ef69d5bf0d40',
  symbol: 'AAPL',
  market: 'us' as any,
  direction: 'buy' as any,
  quantity: 100,
  referencePrice: 0,
  status: 'pending' as any,
  createdAt: new Date(),
  updatedAt: new Date(),
  deliveryId: 'test-delivery',
  broker: 'futu' as any,
  retryCount: 0,
};

console.log('开始测试下单 AAPL 100股...');

executeFutuOrderPython(testOrder as any).then(result => {
  console.log('下单结果:', JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('下单失败:', err);
  process.exit(1);
});