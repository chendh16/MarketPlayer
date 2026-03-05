/**
 * OpenClaw 集成测试脚本
 *
 * 测试所有 MCP 工具端点，验证 openclaw 可以正常调用
 */

import axios from 'axios';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';

interface TestResult {
  tool: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

async function testTool(
  toolName: string,
  params: any,
  skipCondition?: () => boolean
): Promise<void> {
  if (skipCondition && skipCondition()) {
    results.push({
      tool: toolName,
      status: 'skip',
      message: 'Skipped due to missing dependencies',
    });
    return;
  }

  const start = Date.now();
  try {
    const response = await axios.post(
      `${MCP_SERVER_URL}/tools/${toolName}`,
      params,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
    const duration = Date.now() - start;

    results.push({
      tool: toolName,
      status: 'pass',
      message: `Success (${response.status})`,
      duration,
    });

    console.log(`✅ ${toolName}: ${duration}ms`);
  } catch (error: any) {
    const duration = Date.now() - start;
    const message = error.response?.data?.error || error.message;

    results.push({
      tool: toolName,
      status: 'fail',
      message,
      duration,
    });

    console.log(`❌ ${toolName}: ${message}`);
  }
}

async function main() {
  console.log('🚀 OpenClaw Integration Test\n');
  console.log(`MCP Server: ${MCP_SERVER_URL}\n`);

  // 1. Health check
  console.log('1. Health Check');
  try {
    const response = await axios.get(`${MCP_SERVER_URL}/health`);
    console.log(`✅ Health check: ${response.data.status}\n`);
  } catch (error) {
    console.log('❌ MCP Server is not running!\n');
    process.exit(1);
  }

  // 2. List tools
  console.log('2. List Available Tools');
  try {
    const response = await axios.get(`${MCP_SERVER_URL}/tools`);
    console.log(`✅ Found ${response.data.count} tools:`);
    console.log(response.data.tools.join(', '));
    console.log();
  } catch (error) {
    console.log('❌ Failed to list tools\n');
  }

  // 3. Test each tool
  console.log('3. Test Each Tool\n');

  // News tools
  await testTool('fetch_news', {
    market: 'us',
    limit: 1,
  });

  await testTool('process_pipeline', {
    market: 'btc',
  });

  // Analysis tools (需要 newsItemId，预期失败)
  await testTool('analyze_news', {
    newsItemId: '00000000-0000-0000-0000-000000000000',
  });

  await testTool('generate_signal', {
    newsItemId: '00000000-0000-0000-0000-000000000000',
  });

  // Risk tool (需要 userId，预期失败)
  await testTool('check_risk', {
    userId: '00000000-0000-0000-0000-000000000000',
    symbol: 'AAPL',
    market: 'us',
    direction: 'long',
    positionPct: 5,
  });

  // Position tools
  await testTool('get_broker_balance', {
    broker: 'longbridge',
  });

  await testTool('get_positions', {
    userId: '00000000-0000-0000-0000-000000000000',
  });

  await testTool('get_account', {
    userId: '00000000-0000-0000-0000-000000000000',
  });

  // Order tools
  await testTool('get_deliveries', {
    limit: 10,
  });

  await testTool('get_delivery', {
    deliveryId: '00000000-0000-0000-0000-000000000000',
  });

  await testTool('confirm_order', {
    deliveryId: '00000000-0000-0000-0000-000000000000',
    orderToken: 'test-token',
  });

  // Execute order tools
  await testTool('execute_longbridge_order', {
    userId: '00000000-0000-0000-0000-000000000000',
    symbol: 'AAPL',
    market: 'us',
    direction: 'buy',
    quantity: 1,
  });

  await testTool('cancel_longbridge_order', {
    userId: '00000000-0000-0000-0000-000000000000',
    brokerOrderId: 'test-order-id',
  });

  // 4. Summary
  console.log('\n📊 Test Summary\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  console.log(`Total: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);

  console.log('\n📋 Detailed Results:\n');
  results.forEach(r => {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏭️';
    const duration = r.duration ? ` (${r.duration}ms)` : '';
    console.log(`${icon} ${r.tool}${duration}`);
    if (r.status === 'fail') {
      console.log(`   ${r.message}`);
    }
  });

  console.log('\n✨ Test completed!\n');

  // Exit with error if any critical tools failed
  const criticalTools = ['fetch_news', 'get_broker_balance'];
  const criticalFailures = results.filter(
    r => r.status === 'fail' && criticalTools.includes(r.tool)
  );

  if (criticalFailures.length > 0) {
    console.log('⚠️  Critical tools failed. Please check configuration.\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
