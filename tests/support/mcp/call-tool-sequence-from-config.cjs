const fs = require('node:fs');
const net = require('node:net');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [, , configPath, callsJson = '[]'] = process.argv;

if (!configPath) {
  fail('Usage: node call-tool-sequence-from-config.cjs <configPath> [callsJson]');
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

let calls;
try {
  calls = JSON.parse(callsJson);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (!Array.isArray(calls) || calls.length === 0) {
  fail('callsJson must be a non-empty JSON array');
}

function sendJsonRpc(socketPath, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';

    socket.once('error', reject);
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      socket.end();
      if (!line) {
        reject(new Error('Empty JSON-RPC response'));
        return;
      }

      try {
        resolve(JSON.parse(line));
      } catch (error) {
        reject(error);
      }
    });

    socket.once('connect', () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
  });
}

(async () => {
  let lastText = '';

  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index] ?? {};
    const name = typeof call.name === 'string' ? call.name : '';
    if (!name) {
      fail(`Call ${index} is missing a valid name`);
    }

    const response = await sendJsonRpc(socketPath, {
      jsonrpc: '2.0',
      id: index + 1,
      method: 'tools/call',
      params: {
        name,
        arguments:
          call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
            ? call.arguments
            : {}
      }
    });

    if (response?.error) {
      fail(String(response.error?.message ?? 'Unknown JSON-RPC error'));
    }

    const result = response?.result ?? {};
    if (result?.isError) {
      const text =
        Array.isArray(result.content) && result.content.length > 0 && typeof result.content[0]?.text === 'string'
          ? result.content[0].text
          : 'Unknown tool error';
      fail(text);
    }

    lastText =
      Array.isArray(result.content) && result.content.length > 0 && typeof result.content[0]?.text === 'string'
        ? result.content[0].text
        : '';
  }

  process.stdout.write(lastText);
})().catch(error => {
  fail(error instanceof Error ? error.message : String(error));
});
