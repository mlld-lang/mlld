const fs = require('node:fs');
const net = require('node:net');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [, , configPath, toolName, argsJson = '{}'] = process.argv;

if (!configPath || !toolName) {
  fail('Usage: node call-tool-from-config.cjs <configPath> <toolName> [argsJson]');
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const socketPath = config?.mcpServers?.mlld_tools?.env?.MLLD_FUNCTION_MCP_SOCKET;
if (typeof socketPath !== 'string' || socketPath.length === 0) {
  fail('MLLD_FUNCTION_MCP_SOCKET not found in config');
}

let args;
try {
  args = JSON.parse(argsJson);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const socket = net.createConnection(socketPath);
let buffer = '';

socket.once('error', error => {
  fail(error instanceof Error ? error.message : String(error));
});

socket.on('data', chunk => {
  buffer += chunk.toString('utf8');
  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex === -1) {
    return;
  }

  const line = buffer.slice(0, newlineIndex).trim();
  socket.end();

  if (!line) {
    fail('Empty JSON-RPC response');
  }

  let response;
  try {
    response = JSON.parse(line);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  if (response?.error) {
    fail(String(response.error?.message ?? 'Unknown JSON-RPC error'));
  }

  const result = response?.result ?? {};
  const text =
    Array.isArray(result.content) && result.content.length > 0 && typeof result.content[0]?.text === 'string'
      ? result.content[0].text
      : '';
  process.stdout.write(text);
  process.exit(0);
});

socket.once('connect', () => {
  socket.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })}\n`
  );
});
