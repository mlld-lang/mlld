const fs = require('node:fs');
const net = require('node:net');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [
  ,
  ,
  configPath,
  lookupTool,
  lookupArgsJson = '{}',
  mappingJson = '{}',
  targetTool,
  targetArgsJson = '{}',
  targetArgName = 'value'
] = process.argv;

if (!configPath || !lookupTool || !targetTool) {
  fail(
    'Usage: node call-projected-object-from-config.cjs <configPath> <lookupTool> <lookupArgsJson> <mappingJson> <targetTool> <targetArgsJson> [targetArgName]'
  );
}

function parseJsonArg(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(error instanceof Error ? `${label}: ${error.message}` : `${label}: ${String(error)}`);
  }
}

const config = parseJsonArg(fs.readFileSync(configPath, 'utf8'), 'Invalid config');
const socketPath = config?.mcpServers?.mlld_tools?.env?.MLLD_FUNCTION_MCP_SOCKET;
if (typeof socketPath !== 'string' || socketPath.length === 0) {
  fail('MLLD_FUNCTION_MCP_SOCKET not found in config');
}

const lookupArgs = parseJsonArg(lookupArgsJson, 'Invalid lookupArgsJson');
const mapping = parseJsonArg(mappingJson, 'Invalid mappingJson');
const targetArgs = parseJsonArg(targetArgsJson, 'Invalid targetArgsJson');

function sendJsonRpc(path, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(path);
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

function extractText(response) {
  const result = response?.result ?? {};
  if (response?.error) {
    fail(String(response.error?.message ?? 'Unknown JSON-RPC error'));
  }
  if (result?.isError) {
    const text =
      Array.isArray(result.content) && result.content.length > 0 && typeof result.content[0]?.text === 'string'
        ? result.content[0].text
        : 'Unknown tool error';
    fail(text);
  }
  return Array.isArray(result.content) && result.content.length > 0 && typeof result.content[0]?.text === 'string'
    ? result.content[0].text
    : '';
}

function getPathValue(root, path) {
  const segments = String(path).split('.').filter(Boolean);
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

(async () => {
  const lookupResponse = await sendJsonRpc(socketPath, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: lookupTool,
      arguments:
        lookupArgs && typeof lookupArgs === 'object' && !Array.isArray(lookupArgs)
          ? lookupArgs
          : {}
    }
  });

  const lookupText = extractText(lookupResponse);
  const parsedLookup = parseJsonArg(lookupText, 'Lookup result was not valid JSON');
  const built = {};

  for (const [key, valuePath] of Object.entries(mapping)) {
    const value = getPathValue(parsedLookup, valuePath);
    if (value === undefined) {
      fail(`Expected value at path '${valuePath}' for key '${key}'`);
    }
    built[key] = value;
  }

  const response = await sendJsonRpc(socketPath, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: targetTool,
      arguments: {
        ...(targetArgs && typeof targetArgs === 'object' && !Array.isArray(targetArgs) ? targetArgs : {}),
        [targetArgName]: built
      }
    }
  });

  process.stdout.write(extractText(response));
})().catch(error => {
  fail(error instanceof Error ? error.message : String(error));
});
