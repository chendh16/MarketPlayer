/**
 * 每日代码验证和提交脚本
 * 每天晚上自动执行
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function log(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  const color = type === 'error' ? RED : type === 'success' ? GREEN : '';
  console.log(`${color}${msg}${RESET}`);
}

async function verify() {
  log('\n========== 每日代码验证 ==========\n', 'info');

  // 1. 检查 TypeScript 编译
  log('1. TypeScript 编译检查...', 'info');
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    log('   ✅ TypeScript 编译通过', 'success');
  } catch (e: any) {
    const errors = e.stdout?.toString() || e.message;
    // 只显示关键错误
    const lines = errors.split('\n').filter((l: string) => l.includes('error TS'));
    if (lines.length > 0) {
      log(`   ❌ ${lines.length} 个错误`, 'error');
      lines.slice(0, 5).forEach((l: string) => log(`      ${l}`, 'error'));
    } else {
      log('   ✅ 编译通过', 'success');
    }
  }

  // 2. 检查数据文件
  log('\n2. 数据文件检查...', 'info');
  const dataFiles = [
    'data/cache/klines/a_600519.json',
    'data/cache/klines/us_AAPL.json', 
    'data/fundamental/a_pb_percentile.csv'
  ];
  let dataOk = true;
  for (const f of dataFiles) {
    if (fs.existsSync(f)) {
      const stat = fs.statSync(f);
      log(`   ✅ ${f} (${(stat.size/1024).toFixed(1)}KB)`, 'success');
    } else {
      log(`   ❌ ${f} 不存在`, 'error');
      dataOk = false;
    }
  }

  // 3. 检查策略文件
  log('\n3. 策略文件检查...', 'info');
  const strategyFiles = [
    'src/strategies/shortTerm.ts',
    'src/strategies/longTerm.ts'
  ];
  for (const f of strategyFiles) {
    if (fs.existsSync(f)) {
      log(`   ✅ ${f}`, 'success');
    } else {
      log(`   ❌ ${f} 不存在`, 'error');
    }
  }

  // 4. Git 状态
  log('\n4. Git 状态...', 'info');
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    const lines = status.split('\n').filter(l => l.trim());
    log(`   📝 ${lines.length} 个文件变更`, 'info');
    
    if (lines.length > 0) {
      log('\n   变更文件:', 'info');
      lines.slice(0, 10).forEach((l: string) => log(`      ${l.substring(0, 60)}`, 'info'));
    }
  } catch (e) {
    log('   ❌ Git 检查失败', 'error');
  }

  log('\n========== 验证完成 ==========\n', 'info');
}

verify();
