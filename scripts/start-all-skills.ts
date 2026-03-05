/**
 * 统一启动所有 Skill 服务器
 *
 * 用法: npx ts-node scripts/start-all-skills.ts
 *
 * 启动顺序：
 *   - US Stock Skill (port 3101)
 *   - A Stock Skill  (port 3102)
 *   - HK Stock Skill (port 3103)
 *   - BTC Skill      (port 3104)
 *
 * 环境变量：
 *   SKILL_US_PORT  - 美股服务器端口（默认 3101）
 *   SKILL_A_PORT   - A股服务器端口（默认 3102）
 *   SKILL_HK_PORT  - 港股服务器端口（默认 3103）
 *   SKILL_BTC_PORT - BTC服务器端口（默认 3104）
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';

interface SkillServer {
  name: string;
  script: string;
  port: number;
  envVar: string;
  process?: ChildProcess;
}

const SERVERS: SkillServer[] = [
  {
    name: 'US Stock Skill',
    script: 'scripts/skill-us-server.ts',
    port: parseInt(process.env.SKILL_US_PORT ?? '3101', 10),
    envVar: 'SKILL_US_PORT',
  },
  {
    name: 'A Stock Skill',
    script: 'scripts/skill-a-server.ts',
    port: parseInt(process.env.SKILL_A_PORT ?? '3102', 10),
    envVar: 'SKILL_A_PORT',
  },
  {
    name: 'HK Stock Skill',
    script: 'scripts/skill-hk-server.ts',
    port: parseInt(process.env.SKILL_HK_PORT ?? '3103', 10),
    envVar: 'SKILL_HK_PORT',
  },
  {
    name: 'BTC Skill',
    script: 'scripts/skill-btc-server.ts',
    port: parseInt(process.env.SKILL_BTC_PORT ?? '3104', 10),
    envVar: 'SKILL_BTC_PORT',
  },
];

const PROJECT_ROOT = path.resolve(__dirname, '..');

function startServer(server: SkillServer): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Starting ${server.name} on port ${server.port}...`);

    const scriptPath = path.join(PROJECT_ROOT, server.script);
    const proc = spawn('npx', ['ts-node', scriptPath], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        [server.envVar]: server.port.toString(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    server.process = proc;

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        reject(new Error(`${server.name} failed to start within 10 seconds`));
      }
    }, 10000);

    proc.stdout?.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(`[${server.name}] ${output}`);

      if (output.includes('运行中') || output.includes('listening')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          resolve();
        }
      }
    });

    proc.stderr?.on('data', (data) => {
      process.stderr.write(`[${server.name}] ${data.toString()}`);
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`${server.name} failed to start: ${error.message}`));
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`\n❌ ${server.name} exited with code ${code}`);
      }
    });
  });
}

async function healthCheck(port: number, name: string): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      console.log(`✅ ${name} health check passed`);
      return true;
    }
    console.error(`❌ ${name} health check failed: HTTP ${response.status}`);
    return false;
  } catch (error) {
    console.error(`❌ ${name} health check failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MarketPlayer Skill Servers Launcher');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Start all servers
  for (const server of SERVERS) {
    try {
      await startServer(server);
    } catch (error) {
      console.error(`\n❌ Failed to start ${server.name}:`, error);
      process.exit(1);
    }
  }

  // Wait a bit for servers to fully initialize
  console.log('\n⏳ Waiting for servers to initialize...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Health checks
  console.log('\n🏥 Running health checks...\n');
  let allHealthy = true;
  for (const server of SERVERS) {
    const healthy = await healthCheck(server.port, server.name);
    if (!healthy) allHealthy = false;
  }

  if (allHealthy) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ All Skill servers are running and healthy!');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('Server endpoints:');
    for (const server of SERVERS) {
      console.log(`  • ${server.name.padEnd(20)} → http://localhost:${server.port}`);
    }
    console.log('\nPress Ctrl+C to stop all servers.\n');
  } else {
    console.error('\n❌ Some servers failed health checks. Check logs above.');
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down all servers...');
    for (const server of SERVERS) {
      if (server.process) {
        server.process.kill('SIGTERM');
        console.log(`  • Stopped ${server.name}`);
      }
    }
    console.log('\n✅ All servers stopped.\n');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n🛑 Received SIGTERM, shutting down...');
    for (const server of SERVERS) {
      if (server.process) {
        server.process.kill('SIGTERM');
      }
    }
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
