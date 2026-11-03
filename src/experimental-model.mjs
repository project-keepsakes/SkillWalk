// The experimental worker has its own profile; featured recipes keep their
// configured runtime. Model downloads remain an explicit setup action.
export function experimentalModelEnvironment(env = process.env) {
  const base = env.EXPERIMENTAL_OLLAMA_BASE || env.OLLAMA_BASE || 'http://127.0.0.1:11435';
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw Error('Experimental inference must stay on local loopback.');
  }
  const model = env.EXPERIMENTAL_GEMMA_MODEL || 'gemma3:12b';
  return {OLLAMA_BASE: base, OLLAMA_TEXT_BASE: base, GEMMA_MODEL: model, GEMMA_TEXT_MODEL: model};
}
