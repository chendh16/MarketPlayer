/**
 * 代码质量检查服务
 * CODE-001, CODE-002
 */

import { logger } from '../../utils/logger';
import { spawn } from 'child_process';

interface CodeQualityResult {
  tsErrors: number;
  tsWarnings: number;
  eslintErrors: number;
  eslintWarnings: number;
  coverage: number;
  issues: string[];
}

// 运行 TypeScript 编译检查
function runTypeScriptCheck(): Promise<{ errors: number; warnings: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsc', '--noEmit'], { 
      cwd: process.cwd(),
      shell: true 
    });
    
    let output = '';
    proc.stdout.on('data', (d) => { output += d; });
    proc.stderr.on('data', (d) => { output += d; });
    proc.on('close', (code) => {
      // 统计错误和警告
      const errorMatches = output.match(/error TS\d+:/g) || [];
      const warningMatches = output.match(/warning TS\d+:/g) || [];
      
      resolve({
        errors: errorMatches.length,
        warnings: warningMatches.length,
        output: output.substring(0, 2000) // 限制输出长度
      });
    });
  });
}

// 运行 ESLint
function runESLint(): Promise<{ errors: number; warnings: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['eslint', 'src/', '--format', 'json', '--max-warnings', '100'], { 
      cwd: process.cwd(),
      shell: true 
    });
    
    let output = '';
    proc.stdout.on('data', (d) => { output += d; });
    proc.stderr.on('data', (d) => { output += d; });
    proc.on('close', () => {
      try {
        const results = JSON.parse(output);
        let totalErrors = 0;
        let totalWarnings = 0;
        
        for (const file of results) {
          totalErrors += file.errorCount;
          totalWarnings += file.warningCount;
        }
        
        resolve({
          errors: totalErrors,
          warnings: totalWarnings,
          output: output.substring(0, 2000)
        });
      } catch (e) {
        resolve({ errors: 0, warnings: 0, output: '' });
      }
    });
  });
}

// 运行代码质量检查
export async function runCodeQualityCheck(): Promise<CodeQualityResult> {
  logger.info('[CodeQuality] 开始检查代码质量...');
  
  const [ts, eslint] = await Promise.all([
    runTypeScriptCheck(),
    runESLint()
  ]);
  
  const result: CodeQualityResult = {
    tsErrors: ts.errors,
    tsWarnings: ts.warnings,
    eslintErrors: eslint.errors,
    eslintWarnings: eslint.warnings,
    coverage: 0, // 需要单独运行 coverage
    issues: []
  };
  
  // 收集问题
  if (ts.errors > 0) {
    result.issues.push(`TypeScript 编译错误: ${ts.errors}`);
  }
  if (eslint.warnings > 10) {
    result.issues.push(`ESLint 警告过多: ${eslint.warnings}`);
  }
  
  // 生成报告
  let brief = `# 🔧 代码质量报告 - ${new Date().toLocaleDateString('zh-CN')}\n\n`;
  
  brief += `## 📊 统计\n`;
  brief += `- TypeScript 错误: ${ts.errors}\n`;
  brief += `- TypeScript 警告: ${ts.warnings}\n`;
  brief += `- ESLint 错误: ${eslint.errors}\n`;
  brief += `- ESLint 警告: ${eslint.warnings}\n\n`;
  
  if (result.issues.length > 0) {
    brief += `## ⚠️ 待修复\n`;
    result.issues.forEach(issue => {
      brief += `- ${issue}\n`;
    });
  } else {
    brief += `## ✅ 代码质量良好\n`;
  }
  
  logger.info(`[CodeQuality] 完成 - TS: ${ts.errors}错误/${ts.warnings}警告, ESLint: ${eslint.errors}错误/${eslint.warnings}警告`);
  
  // 如果有错误，记录日志
  if (ts.errors > 0 || eslint.errors > 0) {
    logger.warn(`[CodeQuality] ⚠️ 代码质量问题: ${result.issues.join(', ')}`);
  }
  
  return result;
}
