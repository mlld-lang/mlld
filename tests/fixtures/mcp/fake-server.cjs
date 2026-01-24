const readline = require('readline');

const tools = [
  {
    name: 'echo',
    description: 'Echo input',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    }
  },
  {
    name: 'ping',
    description: 'Ping',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

function respond(id, result, error) {
  const payload = { jsonrpc: '2.0', id };
  if (error) {
    payload.error = error;
  } else {
    payload.result = result;
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (error) {
    respond(null, null, { code: -32700, message: 'Parse error' });
    return;
  }

  const { id, method, params } = request;

  if (method === 'initialize') {
    respond(id ?? null, {
      protocolVersion: params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'fake-mcp', version: '0.0.0' }
    });
    return;
  }

  if (method === 'tools/list') {
    respond(id ?? null, { tools });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};
    if (toolName === 'echo') {
      const text = typeof args.text === 'string' ? args.text : '';
      respond(id ?? null, { content: [{ type: 'text', text }] });
      return;
    }
    if (toolName === 'ping') {
      respond(id ?? null, { content: [{ type: 'text', text: 'pong' }] });
      return;
    }
    respond(id ?? null, null, { code: -32601, message: `Tool '${toolName}' not found` });
    return;
  }

  respond(id ?? null, null, { code: -32601, message: `Method '${method}' not found` });
});
