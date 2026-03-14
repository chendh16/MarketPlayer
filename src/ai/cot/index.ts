/**
 * CoT (Chain-of-Thought) 提示词模块
 * 
 * 提供分步推理的金融分析提示词
 * 借鉴 FinRobot 的 Financial CoT 设计
 */

import { logger } from '../../utils/logger';

// ==================== 类型定义 ====================

export type AnalysisType = 
  | 'stock_overview'      // 股票概览
  | 'fundamental'         // 基本面分析
  | 'technical'           // 技术分析
  | 'news_sentiment'      // 舆情分析
  | 'comprehensive'       // 综合研报
  | 'risk_assessment'     // 风险评估
  | 'valuation'           // 估值分析
  | 'peer_comparison';    // 竞品对比

export interface AnalysisContext {
  stock_code: string;
  stock_name?: string;
  market?: 'a' | 'us' | 'hk';
  analysis_type: AnalysisType;
  data?: Record<string, any>;
}

// ==================== CoT 提示词模板 ====================

/**
 * 股票综合分析 CoT
 * 包含数据收集、分步分析、综合结论
 */
export const COT_STOCK_OVERVIEW = `你是一位专业的A股量化分析师。请对 {stock_name}({stock_code}) 进行全面的综合分析。

## 任务理解
用户想要了解这只股票的 {analysis_type}，你需要进行系统性的分析并给出专业判断。

## 分析步骤（请严格按照以下步骤思考）

### 步骤1：数据收集
首先调用必要的工具获取数据：
- get_realtime_quote: 获取实时行情
- fetch_kline: 获取历史K线（用于技术分析）
- get_financials: 获取财务数据
- get_news: 获取最新资讯

### 步骤2：趋势判断（技术面）
基于K线数据分析：
- 短期(5日)、中期(20日)、长期(60日)均线走势
- 趋势方向及斜率判断
- 近期是否有突破信号

### 步骤3：基本评估（基本面）
基于财务数据分析：
- 营收增长趋势
- 盈利能力（毛利率、净利率）
- 估值水平（PE、PB）

### 步骤4：风险评估
- 市场整体风险
- 个股特殊风险
- 流动性风险

### 步骤5：综合结论
综合以上分析，给出：
- 当前投资建议（买入/持有/卖出）
- 目标价位区间
- 风险提示

## 输出要求
- 使用中文输出
- 每个分析步骤都要有数据支撑
- 最终结论要清晰明确
- 保持专业、客观的语调
`;

/**
 * 基本面分析 CoT
 */
export const COT_FUNDAMENTAL = `你是一位资深的A股基本面分析师。请对 {stock_name}({stock_code}) 进行深度的基本面分析。

## 分析框架

### 一、盈利能力分析
1. 毛利率趋势（近3年）
2. 净利率变化
3. ROE（净资产收益率）
4. 每股收益(EPS)

### 二、成长能力
1. 营收增速
2. 净利润增速
3. 增速变化趋势

### 三、资产质量
1. 资产负债率
2. 应收账款周转
3. 存货周转

### 四、现金流
1. 经营现金流/营收
2. 自由现金流
3. 分红能力

### 五、行业地位
1. 市场份额
2. 竞争优势
3. 护城河

## 输出要求
- 使用具体数据说明问题
- 与行业平均对比
- 给出基本面评级（优秀/良好/一般/较差）
`;

/**
 * 技术分析 CoT
 */
export const COT_TECHNICAL = `你是一位专业的A股技术分析师。请对 {stock_name}({stock_code}) 进行全面的技术分析。

## 分析步骤

### 1. 趋势判断
- 短期均线(5日)方向
- 中期均线(20日)方向  
- 长期均线(60日)方向
- 当前趋势：上升/下降/震荡

### 2. 形态识别
- 支撑位与阻力位
- 突破信号（向上/向下）
- 整理形态（三角形/矩形/旗形）

### 3. 动能指标
- MACD：金叉/死叉状态，柱状图方向
- RSI：当前数值，超买/超卖
- KDJ：K、D、J值位置

### 4. 成交量分析
- 量价配合（放量涨/缩量跌）
- 主力资金流向
- 异常放量/缩量信号

### 5. 次日预测
- 走势预判
- 关键价位
- 操作建议

## 输出格式
- 每个指标都要有具体数值
- 给出明确的信号判断
- 次日操作建议（买入/卖出/持有）
`;

/**
 * 舆情分析 CoT
 */
export const COT_NEWS_SENTIMENT = `你是一位专业的金融舆情分析师。请分析 {stock_name}({stock_code}) 相关的新闻和舆情。

## 分析维度

### 1. 消息面分析
- 近期重大利好/利空
- 公告内容解读
- 研报观点汇总

### 2. 情绪指标
- 新闻数量
- 正面/负面/中性比例
- 情绪变化趋势

### 3. 市场反应
- 消息发布后的股价走势
- 成交量变化
- 资金流向

### 4. 风险提示
- 潜在利空因素
- 需要关注的风险点

## 输出要求
- 舆情评分（-100到+100）
- 情绪判断（乐观/中性/悲观）
- 操作建议
`;

/**
 * 综合研报 CoT
 */
export const COT_COMPREHENSIVE = `请为 {stock_name}({stock_code}) 生成一份专业的研究报告。

## 报告结构

### 一、投资要点
- 核心投资逻辑（3条）
- 目标价与评级

### 二、公司概况
- 主营业务
- 行业地位
- 核心竞争力

### 三、基本面分析
- 财务数据摘要
- 盈利能力评估
- 成长性判断

### 四、技术面分析
- 近期走势
- 关键价位
- 形态分析

### 五、风险因素
- 行业风险
- 公司风险
- 市场风险

### 六、投资建议
- 评级（买入/持有/卖出）
- 目标价
- 风险收益比

## 输出要求
- 字数控制在1500字以内
- 数据详实、逻辑清晰
- 结论明确
`;

/**
 * 风险评估 CoT
 */
export const COT_RISK_ASSESSMENT = `请对 {stock_name}({stock_code}) 进行全面的风险评估。

## 风险维度

### 1. 市场风险
- β系数
- 与大盘相关性
- 系统性风险敞口

### 2. 流动性风险
- 日均成交量
- 买卖价差
- 流动性评级

### 3. 财务风险
- 资产负债率
- 利息保障倍数
- 债务违约风险

### 4. 经营风险
- 营收集中度
- 毛利率波动
- 核心竞争力变化

### 5. 估值风险
- 当前估值水平
- 历史估值分位
- 泡沫化程度

## 输出要求
- 每项风险给出评分（1-5分，5分最高）
- 综合风险评级（低/中/高）
- 风险提示和建议
`;

// ==================== 提示词映射 ====================

export const COT_PROMPTS: Record<AnalysisType, string> = {
  stock_overview: COT_STOCK_OVERVIEW,
  fundamental: COT_FUNDAMENTAL,
  technical: COT_TECHNICAL,
  news_sentiment: COT_NEWS_SENTIMENT,
  comprehensive: COT_COMPREHENSIVE,
  risk_assessment: COT_RISK_ASSESSMENT,
  valuation: COT_STOCK_OVERVIEW, // TODO: 估值专用模板
  peer_comparison: COT_FUNDAMENTAL, // TODO: 竞品对比模板
};

// ==================== 工具函数 ====================

/**
 * 渲染 CoT 提示词
 */
export function renderCoTPrompt(
  type: AnalysisType,
  context: AnalysisContext
): string {
  const template = COT_PROMPTS[type];
  
  let prompt = template;
  
  // 替换变量
  prompt = prompt.replace(/{stock_code}/g, context.stock_code);
  prompt = prompt.replace(/{stock_name}/g, context.stock_name || context.stock_code);
  prompt = prompt.replace(/{analysis_type}/g, getAnalysisTypeName(context.analysis_type));
  prompt = prompt.replace(/{market}/g, context.market || 'a');
  
  logger.debug(`[CoT] Rendered prompt for ${context.stock_code} - ${context.analysis_type}`);
  
  return prompt;
}

/**
 * 获取分析类型的中文名称
 */
function getAnalysisTypeName(type: AnalysisType): string {
  const names: Record<AnalysisType, string> = {
    stock_overview: '股票概览',
    fundamental: '基本面分析',
    technical: '技术分析',
    news_sentiment: '舆情分析',
    comprehensive: '综合研报',
    risk_assessment: '风险评估',
    valuation: '估值分析',
    peer_comparison: '竞品对比',
  };
  return names[type];
}

/**
 * 验证上下文是否完整
 */
export function validateContext(context: AnalysisContext): { valid: boolean; missing: string[] } {
  const required = ['stock_code', 'analysis_type'];
  const missing: string[] = [];
  
  for (const field of required) {
    if (!context[field as keyof AnalysisContext]) {
      missing.push(field);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
