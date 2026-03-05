#!/usr/bin/env ts-node
/**
 * Skill 服务器测试脚本
 *
 * 用法: npx ts-node scripts/test-skills.ts
 *
 * 测试所有 Skill 服务器的健康状态和数据获取功能
 */

interface SkillTest {
  name: string;
  port: number;
  market: string;
  endpoint: string;
}

const TESTS: SkillTest[] = [
  { name: 'US Stock Skill', port: 3101, market: 'us', endpoint: 'http://localhost:3101' },
  { name: 'A Stock Skill', port: 3102, market: 'a', endpoint: 'http://localhost:3102' },
  { name: 'HK Stock Skill', port: 3103, market: 'hk', endpoint: 'http://localhost:3103' },
  { name: 'BTC Skill', port: 3104, market: 'btc', endpoint: 'http://localhost:3104' },
];

async function testHealth(test: SkillTest): Promise<boolean> {
  try {
    const response = await fetch(`${test.endpoint}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error(`  ❌ Health check failed: HTTP ${response.status}`);
      return false;
    }
    const data = await response.json();
    console.log(`  ✅ Health check passed:`, data);
    return true;
  } catch (error) {
    console.error(`  ❌ Health check failed:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function testFetchNews(test: SkillTest): Promise<boolean> {
  try {
    const response = await fetch(test.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'fetchNews',
        parameters: {
          market: test.market,
          limit: 3,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`  ❌ Fetch news failed: HTTP ${response.status} - ${text}`);
      return false;
    }

    const data = await response.json();
    const itemCount = data.items?.length ?? 0;

    if (itemCount === 0) {
      console.warn(`  ⚠️  Fetch news returned 0 items (may be normal if no news available)`);
      console.log(`     Metadata:`, data.metadata);
      return true; // Not a failure, just no news
    }

    console.log(`  ✅ Fetch news passed: ${itemCount} items returned`);
    console.log(`     First item:`, {
      title: data.items[0]?.title?.substring(0, 60) + '...',
      source: data.items[0]?.source,
      market: data.items[0]?.market,
      symbols: data.items[0]?.symbols,
    });
    return true;
  } catch (error) {
    console.error(`  ❌ Fetch news failed:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Skill Servers Test Suite');
  console.log('═══════════════════════════════════════════════════════════\n');

  const results: { name: string; health: boolean; fetch: boolean }[] = [];

  for (const test of TESTS) {
    console.log(`\n[${test.name}] Testing on port ${test.port}...`);
    console.log('─────────────────────────────────────────────────────────');

    console.log('\n1. Health Check:');
    const healthOk = await testHealth(test);

    console.log('\n2. Fetch News:');
    const fetchOk = await testFetchNews(test);

    results.push({ name: test.name, health: healthOk, fetch: fetchOk });
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════════════════════\n');

  let allPassed = true;
  for (const result of results) {
    const healthIcon = result.health ? '✅' : '❌';
    const fetchIcon = result.fetch ? '✅' : '❌';
    const status = result.health && result.fetch ? '✅ PASS' : '❌ FAIL';

    console.log(`${status} ${result.name.padEnd(20)} Health: ${healthIcon}  Fetch: ${fetchIcon}`);

    if (!result.health || !result.fetch) {
      allPassed = false;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  if (allPassed) {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please check the logs above.\n');
    console.log('Troubleshooting:');
    console.log('  1. Make sure all Skill servers are running:');
    console.log('     npx ts-node scripts/start-all-skills.ts');
    console.log('  2. Check if ports are available:');
    console.log('     lsof -i :3101 -i :3102 -i :3103 -i :3104');
    console.log('  3. Check server logs for errors\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
