import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createServeCommand, resolveModulePaths } from './serve';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const startMock = vi.fn();
let lastOptions: any;

vi.mock('../mcp/MCPServer', () => {
  class MockServer {
    constructor(options: any) {
      lastOptions = options;
    }

    start = startMock;
  }

  return { MCPServer: MockServer };
});

describe('serve command', () => {
  beforeEach(() => {
    startMock.mockReset();
    startMock.mockResolvedValue(undefined);
    lastOptions = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves module paths from directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-serve-test-'));
    const fileA = path.join(tmpDir, 'a.mld');
    const nestedDir = path.join(tmpDir, 'nested');
    await fs.mkdir(nestedDir);
    const fileB = path.join(nestedDir, 'b.mld.md');
    await fs.writeFile(fileA, '# test');
    await fs.writeFile(fileB, '# test');

    const files = await resolveModulePaths(tmpDir);
    expect(files).toContain(fileA);
    expect(files).toContain(fileB);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('starts MCP server with exported functions', async () => {
    const command = createServeCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-serve-test-'));
    const modulePath = path.join(tmpDir, 'tools.mld.md');
    const moduleSource = [
      '/exe @greet(name) = js {',
      '  return "Hello " + name;',
      '}',
      '',
      '/export { @greet }',
      '',
    ].join('\n');
    await fs.writeFile(modulePath, moduleSource);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.execute([modulePath], {});

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(lastOptions).toBeDefined();
    expect(lastOptions.exportedFunctions instanceof Map).toBe(true);
    expect(lastOptions.exportedFunctions.has('greet')).toBe(true);

    consoleSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('fails when module argument is missing', async () => {
    const command = createServeCommand();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as any);

    await expect(command.execute([], {})).rejects.toThrow('exit:1');
    expect(consoleSpy).toHaveBeenCalledWith('Usage: mlld serve <module-path>');

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('fails on duplicate function names', async () => {
    const command = createServeCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-serve-test-'));
    const moduleA = path.join(tmpDir, 'module-a.mld.md');
    const moduleB = path.join(tmpDir, 'module-b.mld.md');

    const moduleSourceA = [
      '/exe @greet() = js {',
      '  return "a";',
      '}',
      '',
      '/export { @greet }',
      '',
    ].join('\n');

    const moduleSourceB = [
      '/exe @greet() = js {',
      '  return "b";',
      '}',
      '',
      '/export { @greet }',
      '',
    ].join('\n');

    await fs.writeFile(moduleA, moduleSourceA);
    await fs.writeFile(moduleB, moduleSourceB);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as any);

    await expect(command.execute([tmpDir], {})).rejects.toThrow('exit:1');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate function name'));
    expect(startMock).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
