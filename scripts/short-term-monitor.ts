/**
 * 短线实时监控服务启动脚本
 * 
 * 运行方式:
 *   npm run short-term-monitor
 *   # 或后台运行
 *   npm run short-term-monitor & 
 */

import 'dotenv/config';
import { startRealTimeMonitor, stopRealTimeMonitor, getMonitorStatus } from '../src/services/scheduler/short-term-scheduler';
import { logger } from '../src/utils/logger';

const args = process.argv.slice(2);
const command = args[0] || 'start';

async function main() {
  switch (command) {
    case 'start':
      logger.info('🚀 启动短线实时监控服务...');
      startRealTimeMonitor();
      
      // 显示状态
      setTimeout(() => {
        const status = getMonitorStatus();
        logger.info('📊 当前状态:', JSON.stringify(status, null, 2));
      }, 5000);
      
      // 优雅退出
      process.on('SIGINT', () => {
        logger.info('🛑 收到停止信号...');
        stopRealTimeMonitor();
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        logger.info('🛑 收到终止信号...');
        stopRealTimeMonitor();
        process.exit(0);
      });
      break;
      
    case 'status':
      const status = getMonitorStatus();
      console.log('📊 监控状态:', JSON.stringify(status, null, 2));
      break;
      
    case 'stop':
      stopRealTimeMonitor();
      break;
      
    default:
      console.log('用法: npm run short-term-monitor [start|status|stop]');
  }
}

main().catch(console.error);