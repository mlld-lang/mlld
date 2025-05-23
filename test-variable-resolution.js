import { processMeld } from './api/index.new.ts';

async function test() {
  const content = `
@text name = "Alice"
@text message = "Hello, {{name}}!"
@add @message
  `.trim();
  
  console.log('Input:', content);
  const result = await processMeld(content, { format: 'markdown' });
  console.log('Output:', result);
}

test().catch(console.error);