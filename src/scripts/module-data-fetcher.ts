/**
 * 后台批量获取模块数据
 * - 分批获取避免API限制
 * - 每分钟执行一次
 * - 支持中断续传
 */

import * as fs from 'fs';
import * as path from 'path';
import { getHistoryKLine } from '../services/market/quote-service';
import { getAllModules, IndustryModule } from '../config/industry-modules';

const DATA_DIR = path.join(__dirname, '../../data/stock-history');
const STATE_FILE = path.join(DATA_DIR, 'module-fetch-state.json');

// 状态文件
interface FetchState {
  lastModule: string;
  lastStock: number;
  completed: string[];
  timestamp: string;
}

function loadState(): FetchState {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return { lastModule: '', lastStock: 0, completed: [], timestamp: '' };
}

function saveState(state: FetchState) {
  state.timestamp = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// 识别市场
function getMarket(code: string): 'a' | 'hk' | 'us' {
  if (code.match(/^[0-9]{5}$/)) return 'hk';
  if (code.match(/^[A-Z]+\.?[A-Z]*$/)) return 'us';
  if (code.match(/^[0-9]{6}$/)) return 'a';
  return 'a';
}

// 获取单只股票数据
async function fetchStockData(code: string, moduleId: string): Promise<any> {
  const market = getMarket(code);
  const klines = await getHistoryKLine(code, market, '1d', '1y');
  
  if (klines.length === 0) return null;
  
  const closes = klines.map(k => k.close);
  const current = closes[closes.length - 1];
  const past = closes[0];
  const momentum = ((current - past) / past) * 100;
  
  // 计算波动率
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
  
  return {
    code,
    name: '',
    market,
    moduleId,
    price: current,
    momentum: momentum.toFixed(2),
    volatility: volatility.toFixed(2),
    dataPoints: klines.length,
    high: Math.max(...klines.map(k => k.high)),
    low: Math.min(...klines.map(k => k.low)),
  };
}

async function processBatch(module: IndustryModule, startIndex: number, batchSize: number = 3) {
  const results: any[] = [];
  const endIndex = Math.min(startIndex + batchSize, module.stocks.length);
  
  console.log(`  [${module.name}] 处理 ${startIndex + 1}-${endIndex}/${module.stocks.length}...`);
  
  for (let i = startIndex; i < endIndex; i++) {
    const stock = module.stocks[i];
    try {
      const data = await fetchStockData(stock.code, module.id);
      if (data) {
        data.name = stock.name;
        results.push(data);
        console.log(`    ✓ ${stock.code} ${stock.name}: ${data.momentum}%`);
      }
    } catch (e) {
      console.log(`    ✗ ${stock.code} 失败`);
    }
    
    // 每个请求间隔2秒
    await new Promise(r => setTimeout(r, 2000));
  }
  
  return results;
}

async function main() {
  console.log('='.repeat(50));
  console.log('开始后台批量获取行业模块数据...');
  console.log('='.repeat(50));
  
  // 确保目录
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const modules = getAllModules();
  let state = loadState();
  
  let moduleIndex = state.lastModule ? modules.findIndex(m => m.id === state.lastModule) : 0;
  if (moduleIndex < 0) moduleIndex = 0;
  
  let stockIndex = state.lastStock;
  
  // 最多运行10轮 (每轮3只股票)
  for (let round = 0; round < 10; round++) {
    if (moduleIndex >= modules.length) {
      console.log('\n✅ 所有模块获取完成!');
      break;
    }
    
    const module = modules[moduleIndex];
    
    // 跳过已完成模块
    if (state.completed.includes(module.id)) {
      moduleIndex++;
      stockIndex = 0;
      continue;
    }
    
    console.log(`\n[${round + 1}/10] 模块: ${module.name} (${moduleIndex + 1}/${modules.length})`);
    
    const batchResults = await processBatch(module, stockIndex, 3);
    
    // 保存中间结果
    const outputFile = path.join(DATA_DIR, `module-${module.id}.json`);
    let existingData: any[] = [];
    if (fs.existsSync(outputFile)) {
      existingData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    }
    const allData = [...existingData, ...batchResults];
    fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2));
    
    // 更新状态
    stockIndex += 3;
    if (stockIndex >= module.stocks.length) {
      state.completed.push(module.id);
      state.lastModule = module.id;
      state.lastStock = 0;
      moduleIndex++;
      stockIndex = 0;
    } else {
      state.lastModule = module.id;
      state.lastStock = stockIndex;
    }
    saveState(state);
    
    console.log(`  本轮完成，等待下一轮...`);
    
    // 等待1分钟 (避免API限制)
    await new Promise(r => setTimeout(r, 60000));
  }
  
  console.log('\n✅ 本轮执行完成!');
  console.log('状态:', state);
}

// 导出供定时任务调用
export async function runOneBatch(): Promise<any> {
  const state = loadState();
  const modules = getAllModules();
  
  let moduleIndex = state.lastModule ? modules.findIndex(m => m.id === state.lastModule) : 0;
  let stockIndex = state.lastStock;
  
  if (moduleIndex >= modules.length) {
    console.log('所有模块已完成');
    return null;
  }
  
  const module = modules[moduleIndex];
  
  // 跳过已完成
  if (state.completed.includes(module.id)) {
    moduleIndex++;
    stockIndex = 0;
    state.lastModule = module.id;
    state.lastStock = 0;
    saveState(state);
  }
  
  const results = await processBatch(module, stockIndex, 2);
  
  // 保存
  const outputFile = path.join(DATA_DIR, `module-${module.id}.json`);
  let existingData: any[] = [];
  if (fs.existsSync(outputFile)) {
    existingData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  }
  fs.writeFileSync(outputFile, JSON.stringify([...existingData, ...results], null, 2));
  
  // 更新状态
  stockIndex += 2;
  if (stockIndex >= module.stocks.length) {
    state.completed.push(module.id);
    state.lastModule = module.id;
    state.lastStock = 0;
    state.lastModule = modules[Math.min(moduleIndex + 1, modules.length - 1)]?.id || '';
  } else {
    state.lastModule = module.id;
    state.lastStock = stockIndex;
  }
  saveState(state);
  
  return { module: module.name, results };
}

// 如果直接运行
if (require.main === module) {
  main().catch(console.error);
}