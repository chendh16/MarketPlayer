#!/usr/bin/env ts-node

/**
 * AI成本报告脚本
 * 运行: npm run cost-report
 */

import { query } from '../db/postgres';
import { initPostgres, closePostgres } from '../db/postgres';

async function generateCostReport() {
  await initPostgres();
  
  console.log('=== AI 成本报告 ===\n');
  
  // 今日成本
  const today = await query(`
    SELECT 
      COUNT(*) as call_count,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(estimated_cost_usd) as total_cost
    FROM ai_cost_logs
    WHERE created_at >= CURRENT_DATE
  `);
  
  console.log('📅 今日统计:');
  console.log(`  调用次数: ${today[0].call_count}`);
  console.log(`  输入Token: ${today[0].total_input_tokens?.toLocaleString() || 0}`);
  console.log(`  输出Token: ${today[0].total_output_tokens?.toLocaleString() || 0}`);
  console.log(`  总成本: $${Number(today[0].total_cost || 0).toFixed(4)}\n`);
  
  // 本月成本
  const thisMonth = await query(`
    SELECT 
      COUNT(*) as call_count,
      SUM(estimated_cost_usd) as total_cost
    FROM ai_cost_logs
    WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
  `);
  
  console.log('📊 本月统计:');
  console.log(`  调用次数: ${thisMonth[0].call_count}`);
  console.log(`  总成本: $${Number(thisMonth[0].total_cost || 0).toFixed(2)}\n`);
  
  // 按类型分组
  const byType = await query(`
    SELECT 
      call_type,
      COUNT(*) as count,
      SUM(estimated_cost_usd) as cost
    FROM ai_cost_logs
    WHERE created_at >= CURRENT_DATE
    GROUP BY call_type
    ORDER BY cost DESC
  `);
  
  console.log('📈 今日按类型统计:');
  byType.forEach((row: any) => {
    console.log(`  ${row.call_type}: ${row.count} 次, $${Number(row.cost).toFixed(4)}`);
  });
  
  await closePostgres();
}

generateCostReport().catch(console.error);

