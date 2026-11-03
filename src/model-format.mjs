// Google Gemma 4 text turn format:
// https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4
// E2B/E4B thinking-off prefix:
// https://ai.google.dev/gemma/docs/capabilities/thinking
export function needsGemma4Formatting(info) {
  return info?.details?.family === 'gemma4' && /^\{\{\s*\.Prompt\s*\}\}$/.test(info.template?.trim() || '');
}
export function gemma4Prompt(messages) {
  if (!messages.length || messages.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) throw Error('Unsupported Gemma text message');
  const escape = text => text.replace(/<\|[^>\n]*>|<[^<>\n]*\|>/g, token => token.replaceAll('|', '｜'));
  return messages.map(m => `<|turn>${m.role === 'assistant' ? 'model' : m.role}\n${escape(m.content)}<turn|>\n`).join('') + '<|turn>model\n';
}
