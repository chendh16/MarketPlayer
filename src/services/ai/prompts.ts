import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';

const PROMPT_DIR = process.env.PROMPT_DIR
  ? path.resolve(process.env.PROMPT_DIR)
  : path.resolve(process.cwd(), 'prompts');

// 内置默认 prompt（prompts/ 目录文件不存在时 fallback）
const DEFAULTS: Record<string, string> = {
  analyze_news: `你是一个专业的金融分析师。请分析以下资讯并以 JSON 格式返回结果。

## 输入资讯

- **标题**：{title}
- **内容**：{content}
- **市场**：{market}
- **相关标的**：{symbols}

## 输出要求

请返回以下 JSON（不要包含其他文字）：

\`\`\`json
{
  "summary": "50字以内的中文摘要",
  "impact": "对市场和相关标的的潜在影响分析（100字以内）",
  "sentiment": "positive | negative | neutral",
  "importance": "high | medium | low"
}
\`\`\``,

  generate_signal: `你是一个专业的股票交易信号分析师。基于以下分析，生成交易参考信号。

## 分析结果

- **摘要**：{summary}
- **市场影响**：{impact}
- **情绪**：{sentiment}
- **标的**：{symbols}

## 输出要求

请返回以下 JSON（不要包含其他文字）：

\`\`\`json
{
  "should_generate": true,
  "direction": "long | short",
  "confidence": 0,
  "suggested_position_pct": 5,
  "reasoning": "简短的决策依据（50字以内）",
  "key_risk": "主要风险提示"
}
\`\`\`

## 注意事项

- \`confidence < 25\` 时 \`should_generate\` 应为 \`false\`
- 这是信号参考，不是投资建议`,
};

// 模板缓存（进程级，重启后重新加载）
const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  if (cache.has(name)) return cache.get(name)!;

  const filePath = path.join(PROMPT_DIR, `${name}.md`);
  let template: string;

  if (fs.existsSync(filePath)) {
    template = fs.readFileSync(filePath, 'utf-8');
    logger.debug(`Loaded prompt from file: ${filePath}`);
  } else {
    template = DEFAULTS[name] ?? '';
    logger.debug(`Using default prompt: ${name}`);
  }

  cache.set(name, template);
  return template;
}

export function renderPrompt(name: string, vars: Record<string, string>): string {
  let template = loadPrompt(name);
  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{${key}}`, value);
  }
  return template;
}
