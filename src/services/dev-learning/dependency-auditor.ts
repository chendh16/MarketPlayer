/**
 * 依赖安全检查服务
 * DEPS-001, DEPS-002
 */

import { logger } from '../../utils/logger';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface AuditResult {
  vulnerabilities: {
    name: string;
    severity: 'low' | 'moderate' | 'high' | 'critical';
    via: string;
  }[];
  stats: {
    dependencies: number;
    devDependencies: number;
    totalDependencies: number;
  };
}

interface OutdatedDep {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  type: 'dependencies' | 'devDependencies';
}

// 运行 npm audit
function runNpmAudit(): Promise<AuditResult> {
  return new Promise((resolve) => {
    const result: AuditResult = {
      vulnerabilities: [],
      stats: { dependencies: 0, devDependencies: 0, totalDependencies: 0 }
    };
    
    const proc = spawn('npm', ['audit', '--json'], { 
      cwd: process.cwd(),
      shell: true 
    });
    
    let output = '';
    proc.stdout.on('data', (d) => { output += d; });
    proc.stderr.on('data', (d) => { output += d; });
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(output);
        if (parsed.vulnerabilities) {
          result.vulnerabilities = Object.entries(parsed.vulnerabilities).map(([name, info]: [string, any]) => ({
            name,
            severity: info.severity || 'moderate',
            via: info.via || ''
          }));
        }
        if (parsed.metadata) {
          result.stats = {
            dependencies: parsed.metadata.dependencies || 0,
            devDependencies: parsed.metadata.devDependencies || 0,
            totalDependencies: (parsed.metadata.dependencies || 0) + (parsed.metadata.devDependencies || 0)
          };
        }
      } catch (e) {
        logger.error('[DependencyAudit] 解析失败:', e);
      }
      resolve(result);
    });
  });
}

// 运行 npm outdated
function runNpmOutdated(): Promise<OutdatedDep[]> {
  return new Promise((resolve) => {
    const proc = spawn('npm', ['outdated', '--json'], { 
      cwd: process.cwd(),
      shell: true 
    });
    
    let output = '';
    proc.stdout.on('data', (d) => { output += d; });
    proc.stderr.on('data', (d) => { output += d; });
    proc.on('close', () => {
      try {
        const parsed = JSON.parse(output);
        const deps: OutdatedDep[] = Object.entries(parsed).map(([name, info]: [string, any]) => ({
          name,
          current: info.current || '',
          wanted: info.wanted || '',
          latest: info.latest || '',
          type: info.type || 'dependencies'
        }));
        resolve(deps);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

// 生成依赖报告
export async function runDependencyAudit(): Promise<string> {
  logger.info('[DependencyAudit] 开始检查依赖...');
  
  const [audit, outdated] = await Promise.all([
    runNpmAudit(),
    runNpmOutdated()
  ]);
  
  // 保存报告
  const reportDir = path.join(process.cwd(), 'data/dependency-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  
  const report = {
    date: new Date().toISOString(),
    audit,
    outdated
  };
  
  fs.writeFileSync(
    path.join(reportDir, `audit-${Date.now()}.json`),
    JSON.stringify(report, null, 2)
  );
  
  // 生成简报
  let brief = `# 🔍 依赖安全报告 - ${new Date().toLocaleDateString('zh-CN')}\n\n`;
  
  // 漏洞统计
  const critical = audit.vulnerabilities.filter(v => v.severity === 'critical').length;
  const high = audit.vulnerabilities.filter(v => v.severity === 'high').length;
  const moderate = audit.vulnerabilities.filter(v => v.severity === 'moderate').length;
  
  brief += `## ⚠️ 安全漏洞\n`;
  brief += `- 🔴 Critical: ${critical}\n`;
  brief += `- 🟠 High: ${high}\n`;
  brief += `- 🟡 Moderate: ${moderate}\n\n`;
  
  // 高危漏洞详情
  if (audit.vulnerabilities.length > 0) {
    brief += `### 高危漏洞\n`;
    audit.vulnerabilities
      .filter(v => v.severity === 'critical' || v.severity === 'high')
      .slice(0, 5)
      .forEach(v => {
        brief += `- **${v.name}** (${v.severity}): ${v.via}\n`;
      });
    brief += '\n';
  }
  
  // 可更新依赖
  if (outdated.length > 0) {
    brief += `## 📦 可更新依赖 (${outdated.length})\n`;
    outdated.slice(0, 10).forEach(d => {
      brief += `- ${d.name}: ${d.current} → ${d.latest}\n`;
    });
  }
  
  // 统计
  brief += `\n---\n`;
  brief += `总依赖: ${audit.stats.totalDependencies} (dependencies: ${audit.stats.dependencies}, dev: ${audit.stats.devDependencies})\n`;
  
  logger.info(`[DependencyAudit] 完成 - ${audit.vulnerabilities.length} 漏洞, ${outdated.length} 可更新`);
  
  // 告警
  if (critical > 0 || high > 0) {
    logger.warn(`[DependencyAudit] ⚠️ 发现高危漏洞: ${critical} critical, ${high} high`);
  }
  
  return brief;
}
