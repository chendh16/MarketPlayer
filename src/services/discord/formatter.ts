// Discord formatter disabled due to version incompatibility
export function buildNormalSignalMessage(signal: any, delivery: any, riskCheck: any) {
  return { content: '信号消息（已禁用）', embeds: [], components: [] };
}

export function buildWarningSignalMessage(signal: any, delivery: any, riskCheck: any) {
  return { content: '警告消息（已禁用）', embeds: [], components: [] };
}

export function buildNewsOnlyMessage(newsItem: any, analysis: any) {
  return { content: '资讯消息（已禁用）', embeds: [], components: [] };
}
