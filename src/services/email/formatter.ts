import { Signal, SignalDelivery, RiskCheckResult, NewsItem } from '../../models/signal';
import { AccountSnapshot } from '../../models/position';
import { AnalysisResult } from '../ai/analyzer';

const BASE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
  .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { padding: 20px 24px; color: #fff; }
  .header h1 { margin: 0; font-size: 18px; font-weight: 600; }
  .body { padding: 24px; }
  .field { margin-bottom: 12px; }
  .label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .value { font-size: 15px; color: #222; font-weight: 500; }
  .divider { border: none; border-top: 1px solid #eee; margin: 16px 0; }
  .reasoning { background: #f8f8f8; border-left: 3px solid #ddd; padding: 12px 16px; border-radius: 4px; font-size: 14px; color: #444; line-height: 1.6; }
  .cta { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1a73e8; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; }
  .footer { padding: 16px 24px; background: #f8f8f8; border-top: 1px solid #eee; font-size: 12px; color: #999; }
`;

function wrap(headerColor: string, headerContent: string, bodyContent: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
<body><div class="container">
  <div class="header" style="background:${headerColor}">
    <h1>${headerContent}</h1>
  </div>
  <div class="body">${bodyContent}</div>
  <div class="footer">免责声明：本内容仅供信息参考，不构成投资建议，盈亏自负。</div>
</div></body></html>`;
}

export function buildSignalEmailHtml(
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult,
  account: AccountSnapshot
): { subject: string; html: string } {
  const directionText = signal.direction === 'long' ? '做多' : '做空';
  const directionEmoji = signal.direction === 'long' ? '📈' : '📉';
  const expiresAt = new Date(delivery.sentAt.getTime() + 15 * 60 * 1000);
  const expiresText = expiresAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const body = `
    <div class="field"><div class="label">标的</div><div class="value">${signal.symbol}</div></div>
    <div class="field"><div class="label">方向</div><div class="value">${directionEmoji} ${directionText}</div></div>
    <div class="field"><div class="label">建议仓位</div><div class="value">${signal.suggestedPositionPct}%</div></div>
    <div class="field"><div class="label">置信度</div><div class="value">${signal.confidence}%</div></div>
    <div class="field"><div class="label">风控状态</div><div class="value" style="color:#16a34a">✅ 通过</div></div>
    <hr class="divider">
    <div class="field"><div class="label">推理依据</div></div>
    <div class="reasoning">${signal.reasoning}</div>
    <div class="field" style="margin-top:12px"><div class="label">信号有效期至</div><div class="value" style="font-size:13px;color:#666">${expiresText}</div></div>
  `;

  return {
    subject: `[MarketPlayer] ${directionEmoji} ${signal.symbol} AI信号参考 | 置信度 ${signal.confidence}%`,
    html: wrap('#16a34a', `AI信号参考 | ${signal.symbol} · 置信度 ${signal.confidence}%`, body),
  };
}

export function buildWarningSignalEmailHtml(
  signal: Signal,
  delivery: SignalDelivery,
  riskCheck: RiskCheckResult
): { subject: string; html: string } {
  const directionText = signal.direction === 'long' ? '做多' : '做空';
  const directionEmoji = signal.direction === 'long' ? '📈' : '📉';
  const warningMessages = riskCheck.warningMessages?.join('；') || '存在风险提示';

  const body = `
    <div class="field"><div class="label">标的</div><div class="value">${signal.symbol}</div></div>
    <div class="field"><div class="label">方向</div><div class="value">${directionEmoji} ${directionText}</div></div>
    <div class="field"><div class="label">建议仓位</div><div class="value">${signal.suggestedPositionPct}%</div></div>
    <div class="field"><div class="label">置信度</div><div class="value">${signal.confidence}%</div></div>
    <div class="field"><div class="label">风控状态</div><div class="value" style="color:#d97706">⚠️ 存在风险提示</div></div>
    <div class="reasoning" style="border-left-color:#d97706;background:#fffbeb">${warningMessages}</div>
    <hr class="divider">
    <div class="field"><div class="label">推理依据</div></div>
    <div class="reasoning">${signal.reasoning}</div>
    <p style="font-size:13px;color:#888;margin-top:16px">如需确认，请前往 Dashboard 操作。</p>
  `;

  return {
    subject: `[MarketPlayer] ⚠️ ${signal.symbol} AI信号（含风险提示） | 置信度 ${signal.confidence}%`,
    html: wrap('#d97706', `AI信号参考（含风险提示） | ${signal.symbol} · 置信度 ${signal.confidence}%`, body),
  };
}

export function buildNewsOnlyEmailHtml(
  newsItem: NewsItem,
  analysis: AnalysisResult
): { subject: string; html: string } {
  const sentimentEmoji = analysis.sentiment === 'positive' ? '📈' : analysis.sentiment === 'negative' ? '📉' : '📊';
  const importanceLabel = analysis.importance === 'high' ? '重要' : analysis.importance === 'medium' ? '一般' : '参考';
  const marketLabel = newsItem.market.toUpperCase();
  const headerColor = analysis.importance === 'high' ? '#dc2626' : analysis.importance === 'medium' ? '#2563eb' : '#6b7280';

  const symbolsLine = newsItem.symbols?.length
    ? `<div class="field"><div class="label">相关标的</div><div class="value">${newsItem.symbols.join(', ')}</div></div>`
    : '';

  const sourceLine = newsItem.url
    ? `<a href="${newsItem.url}" class="cta" style="background:#6b7280">查看原文</a>`
    : '';

  const body = `
    <div class="field"><div class="label">标题</div><div class="value" style="font-size:16px">${newsItem.title}</div></div>
    ${symbolsLine}
    <hr class="divider">
    <div class="field"><div class="label">摘要</div></div>
    <div class="reasoning">${analysis.summary}</div>
    <div class="field" style="margin-top:16px"><div class="label">市场影响</div></div>
    <div class="reasoning">${analysis.impact}</div>
    ${sourceLine}
  `;

  return {
    subject: `[MarketPlayer] ${sentimentEmoji} 资讯解读 | ${marketLabel} · ${importanceLabel}`,
    html: wrap(headerColor, `${sentimentEmoji} 资讯解读 | ${marketLabel} · ${importanceLabel}`, body),
  };
}
