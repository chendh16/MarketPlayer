/**
 * Learning Coordinator Test Script
 * 
 * 触发首次学习循环，测试所有组件是否正常工作
 * 
 * Usage: node test-learning-coordinator.js
 */

import { LearningCoordinator } from './coordinator';

async function test() {
  console.log('🧪 Testing Learning Coordinator...\n');

  try {
    // 1. 运行协调学习
    console.log('📡 Running coordinateLearning()...');
    const result = await LearningCoordinator.coordinateLearning();

    console.log('\n✅ Results:');
    for (const r of result.results) {
      console.log(`   [${r.strategy}] signals=${r.signals_total}, accuracy=${r.accuracy?.toFixed(1)}%`);
    }

    console.log('\n📊 System Metrics:');
    console.log(`   Sharpe: ${result.metrics.overall_sharpe.toFixed(2)}`);
    console.log(`   Accuracy: ${result.metrics.overall_accuracy.toFixed(1)}%`);
    console.log(`   Active Strategies: ${result.metrics.active_strategies}`);
    console.log(`   Should Upgrade: ${result.metrics.should_upgrade}`);

    // 2. 获取系统摘要
    console.log('\n📋 System Summary:');
    const summary = await LearningCoordinator.getSystemSummary();
    console.log(`   Version: ${summary.version}`);
    console.log(`   Status: ${summary.status}`);

    // 3. 获取学习历史
    console.log('\n📜 Learning History:');
    const history = await LearningCoordinator.getLearningHistory(7);
    console.log(`   Records in last 7 days: ${history.length}`);

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test();