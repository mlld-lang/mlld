import { describe, expect, it } from 'vitest';
import { McpImportManager } from '@interpreter/mcp/McpImportManager';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import { MCP_CANCELLATION_CONTEXT } from './cancellation';

const fakeServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/fake-server.cjs', import.meta.url)
);
const crashServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/crash-server.cjs', import.meta.url)
);

function createEnvironment(): Environment {
  return new Environment(new NodeFileSystem(), new PathService(), '/');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
}

describe('McpImportManager', () => {
  it('closes idle servers and restarts on next call', async () => {
    const previousIdle = process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS;
    process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS = '30';

    const env = createEnvironment();
    const manager = new McpImportManager(env);
    const spec = `${process.execPath} ${fakeServerPath}`;

    try {
      const first = await manager.callTool(spec, 'echo', { text: 'hello' });
      expect(first).toBe('hello');

      await new Promise(resolve => setTimeout(resolve, 60));

      const server = (manager as any).servers.get(spec);
      expect(server?.isClosed()).toBe(true);

      const second = await manager.callTool(spec, 'echo', { text: 'again' });
      expect(second).toBe('again');
    } finally {
      manager.closeAll();
      if (previousIdle === undefined) {
        delete process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS;
      } else {
        process.env.MLLD_MCP_IMPORT_IDLE_TIMEOUT_MS = previousIdle;
      }
    }
  });

  it('enforces max concurrent servers', async () => {
    const previousMax = process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT;
    process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT = '1';

    const env = createEnvironment();
    const manager = new McpImportManager(env);
    const spec = `${process.execPath} ${fakeServerPath}`;
    const spec2 = `${process.execPath} ${fakeServerPath} --second`;

    try {
      await manager.listTools(spec);
      await expect(manager.listTools(spec2)).rejects.toThrow(/limit exceeded/);
    } finally {
      manager.closeAll();
      if (previousMax === undefined) {
        delete process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT;
      } else {
        process.env.MLLD_MCP_IMPORT_MAX_CONCURRENT = previousMax;
      }
    }
  });

  it('restarts and retries once when a server exits during a tool call', async () => {
    const previousMarker = process.env.MLLD_MCP_CRASH_MARKER;
    const markerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-import-crash-'));
    const markerPath = path.join(markerDir, 'marker');
    process.env.MLLD_MCP_CRASH_MARKER = markerPath;

    const env = createEnvironment();
    const manager = new McpImportManager(env);
    const spec = `${process.execPath} ${crashServerPath}`;

    try {
      await expect(manager.callTool(spec, 'echo', { text: 'retry' })).resolves.toBe('retry');
    } finally {
      manager.closeAll();
      if (previousMarker === undefined) {
        delete process.env.MLLD_MCP_CRASH_MARKER;
      } else {
        process.env.MLLD_MCP_CRASH_MARKER = previousMarker;
      }
      await fs.rm(markerDir, { recursive: true, force: true });
    }
  });

  it('aborts pending tool calls when the execution cancellation signal fires', async () => {
    const serverDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-import-abort-'));
    const serverPath = path.join(serverDir, 'slow-server.cjs');
    const markerPath = path.join(serverDir, 'terminated');
    await fs.writeFile(serverPath, `
const fs = require('fs');
const readline = require('readline');
const markerPath = ${JSON.stringify(markerPath)};

function respond(id, result, error) {
  const payload = { jsonrpc: '2.0', id };
  if (error) payload.error = error;
  else payload.result = result;
  process.stdout.write(JSON.stringify(payload) + '\\n');
}

process.on('SIGTERM', () => {
  fs.writeFileSync(markerPath, 'terminated');
  process.exit(0);
});

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    respond(request.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'slow', version: '0' } });
    return;
  }
  if (request.method === 'tools/call') {
    setTimeout(() => respond(request.id, { content: [{ type: 'text', text: 'late' }] }), 1000);
    return;
  }
  respond(request.id, { tools: [{ name: 'slow', inputSchema: { type: 'object', properties: {}, required: [] } }] });
});
`, 'utf8');

    const env = createEnvironment();
    const manager = new McpImportManager(env);
    const spec = `${process.execPath} ${serverPath}`;
    const controller = new AbortController();

    try {
      const pending = env.withExecutionContext(
        MCP_CANCELLATION_CONTEXT,
        { signal: controller.signal },
        () => manager.callTool(spec, 'slow', {})
      );
      setTimeout(() => controller.abort(new Error('client connection closed')), 30);

      await expect(pending).rejects.toThrow(/client connection closed/);
      await waitFor(async () => await fileExists(markerPath));
      expect((manager as any).servers.get(spec)?.isClosed()).toBe(true);
    } finally {
      manager.closeAll();
      env.cleanup();
      await fs.rm(serverDir, { recursive: true, force: true });
    }
  });
});
