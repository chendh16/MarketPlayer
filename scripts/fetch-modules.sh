#!/bin/bash
# 每分钟运行一次的模块数据获取
# 用法: 在cron中设置 */1 * * * *

cd /Users/zhengzefeng/.openclaw/workspace/MarketPlayer

echo "=== $(date) 开始获取模块数据 ==="

# 检查API状态，如果被限制则等待
check_limit() {
  while true; do
    # 尝试获取一只股票测试
    result=$(npx ts-node -e "
import { getHistoryKLine } from './src/services/market/quote-service';
(async () => {
  const data = await getHistoryKLine('AAPL', 'us', '1d', '5');
  console.log(data.length > 0 ? 'OK' : 'FAIL');
})();
" 2>&1)
    
    if echo "$result" | grep -q "OK"; then
      echo "API可用"
      return 0
    else
      echo "API受限，等待30秒..."
      sleep 30
    fi
  done
}

# 检查并运行
check_limit

# 运行一次批量获取
npx ts-node src/scripts/module-data-fetcher.ts 2>&1

echo "=== $(date) 本轮完成 ==="