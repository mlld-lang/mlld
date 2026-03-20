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
  },
  {
    name: 'create_event',
    description: 'Create a calendar event (typed params for coercion tests)',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        participants: { type: 'array', description: 'List of participants' },
        count: { type: 'integer', description: 'Number of attendees' },
        all_day: { type: 'boolean', description: 'All day event' }
      },
      required: ['title', 'participants']
    }
  },
  {
    name: 'type_mirror',
    description: 'Returns JSON with the type and value of each arg',
    inputSchema: {
      type: 'object',
      properties: {
        str_arg: { type: 'string' },
        arr_arg: { type: 'array' },
        int_arg: { type: 'integer' },
        num_arg: { type: 'number' },
        bool_arg: { type: 'boolean' }
      },
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
    if (toolName === 'create_event') {
      const parts = [];
      parts.push(`title=${JSON.stringify(args.title)}`);
      parts.push(`participants=${JSON.stringify(args.participants)}`);
      if (args.count !== undefined) parts.push(`count=${JSON.stringify(args.count)}`);
      if (args.all_day !== undefined) parts.push(`all_day=${JSON.stringify(args.all_day)}`);
      respond(id ?? null, { content: [{ type: 'text', text: parts.join(' ') }] });
      return;
    }
    if (toolName === 'type_mirror') {
      const entries = Object.entries(args).map(([k, v]) =>
        `${k}:${typeof v === 'object' && v !== null ? (Array.isArray(v) ? 'array' : 'object') : typeof v}=${JSON.stringify(v)}`
      );
      respond(id ?? null, { content: [{ type: 'text', text: entries.join(' ') }] });
      return;
    }
    respond(id ?? null, null, { code: -32601, message: `Tool '${toolName}' not found` });
    return;
  }

  respond(id ?? null, null, { code: -32601, message: `Method '${method}' not found` });
});
