/**
 * Smoke test: prove that crossProviderChat() routes to local Ollama
 * and produces output without any Anthropic credentials.
 */
import { readFileSync } from 'node:fs';

// Load .env early
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

// Force local mode for the test
process.env.LAVERN_PROVIDER = 'local';
delete process.env.ANTHROPIC_API_KEY;

const { crossProviderChat, checkProviderReady } = await import('../src/providers/cross-provider-chat.js');
const { config } = await import('../src/config.js');

console.log(`Provider:           ${config.provider}`);
console.log(`Local URL:          ${config.local.baseUrl}`);
console.log(`Local default model:${config.local.defaultModel}`);
console.log();

const notReady = await checkProviderReady();
if (notReady) {
  console.error(`FAIL — provider not ready: ${notReady}`);
  process.exit(1);
}
console.log('Provider ready. Sending test prompt…');

const t0 = Date.now();
const { text, cost, model, provider } = await crossProviderChat({
  system: 'You are a precise, terse legal assistant.',
  user: 'In one sentence: under NSW law, what is the difference between a unanimous reserved-matter veto and a simple-majority decision in an unincorporated joint venture?',
  tier: 'sonnet',
  maxTokens: 200,
  timeoutMs: 600_000,
});
const elapsed = ((Date.now() - t0)/1000).toFixed(1);

console.log(`\n── Response (${text.length} chars, ${elapsed}s, $${cost.toFixed(4)} via ${provider}/${model}) ──\n`);
console.log(text);
console.log('\n── PASS ──');
