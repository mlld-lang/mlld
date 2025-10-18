// Minimal NDJSON streaming example using Anthropic's SDK
// Requires: npm install @anthropic-ai/sdk
// Usage: node examples/claude-code-streaming/stream.js [optional prompt]

import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(JSON.stringify({ level: 'error', message: 'Missing ANTHROPIC_API_KEY in environment' }));
  process.exit(1);
}

const prompt = process.env.PROMPT || process.argv.slice(2).join(' ') || 'Write a short haiku about streaming JSON.';

const client = new Anthropic({ apiKey });

// Helper to print NDJSON safely
function emit(obj) {
  try {
    process.stdout.write(JSON.stringify(obj) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ level: 'warn', message: 'Could not serialize event', error: String(e) }) + '\n');
  }
}

async function main() {
  emit({ level: 'info', type: 'start', prompt });

  // Prefer the modern stream helper if available, else fallback to .create({ stream: true })
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  const messages = [{ role: 'user', content: prompt }];

  try {
    if (client.messages && typeof client.messages.stream === 'function') {
      const stream = await client.messages.stream({
        model,
        messages,
        max_output_tokens: 1024,
      });
      for await (const event of stream) {
        emit({ type: 'event', event });
      }
      const final = await stream.finalMessage();
      emit({ type: 'final', message: final });
    } else {
      const response = await client.messages.create({
        model,
        messages,
        max_output_tokens: 1024,
        stream: true,
      });
      for await (const event of response) {
        emit({ type: 'event', event });
      }
      emit({ type: 'final', message: 'done' });
    }
    emit({ level: 'info', type: 'complete' });
  } catch (err) {
    emit({ level: 'error', message: 'streaming error', error: String(err && err.message || err) });
    process.exit(2);
  }
}

await main();

