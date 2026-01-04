import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createMcpCommand, resolveModulePaths } from './mcp';
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

describe('mcp command', () => {
  beforeEach(() => {
    startMock.mockReset();
    startMock.mockResolvedValue(undefined);
    lastOptions = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves module paths from directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-'));
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
    const command = createMcpCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-'));
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
    expect(Array.from(lastOptions.exportedFunctions.keys())).toEqual(['greet']);

    consoleSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('fails when module argument is missing', async () => {
    const command = createMcpCommand();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as any);

    await expect(command.execute([], {})).rejects.toThrow('exit:1');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: mlld mcp'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('llm/mcp/ not found'));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('fails on duplicate function names', async () => {
    const command = createMcpCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-'));
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

  it('excludes built-in executables when no manifest exists', async () => {
    const command = createMcpCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-'));
    const modulePath = path.join(tmpDir, 'tools.mld.md');

    await fs.writeFile(modulePath, [
      '/exe @greet(name) = js {',
      '  return "Hello " + name;',
      '}',
      '',
      '>> No /export directive',
      '',
    ].join('\n'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.execute([modulePath], {});

    expect(startMock).toHaveBeenCalledTimes(1);
    const exportedNames = Array.from(lastOptions.exportedFunctions.keys());
    expect(exportedNames).toEqual(['greet']);

    consoleSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uses default llm/mcp directory when no module path is provided', async () => {
    const command = createMcpCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-default-'));
    const mcpDir = path.join(tmpDir, 'llm', 'mcp');
    await fs.mkdir(mcpDir, { recursive: true });
    const modulePath = path.join(mcpDir, 'default.mld.md');
    await fs.writeFile(modulePath, [
      '/exe @ping() = js {',
      '  return "pong";',
      '}',
      '',
      '/export { @ping }',
      '',
    ].join('\n'));

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.execute([], {});

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(Array.from(lastOptions.exportedFunctions.keys())).toEqual(['ping']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Using default MCP modules directory'));

    consoleSpy.mockRestore();
    cwdSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('applies CLI environment overrides with MLLD_ prefix', async () => {
    const command = createMcpCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-env-'));
    const modulePath = path.join(tmpDir, 'env.mld.md');
    await fs.writeFile(modulePath, [
      '/exe @ping() = js { return "pong"; }',
      '/export { @ping }',
    ].join('\n'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.execute([modulePath], { env: 'MLLD_SAMPLE=abc,PERMISSION=skip' });

    expect(process.env.MLLD_SAMPLE).toBe('abc');
    expect(process.env.PERMISSION).toBeUndefined();

    delete process.env.MLLD_SAMPLE;
    consoleSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads config module to filter tools and apply environment variables', async () => {
    const command = createMcpCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-config-'));
    const modulePath = path.join(tmpDir, 'tools.mld.md');
    await fs.writeFile(modulePath, [
      '/exe @allowed() = js { return "ok"; }',
      '/exe @blocked() = js { return "skip"; }',
      '/export { @allowed, @blocked }',
    ].join('\n'));

    const configPath = path.join(tmpDir, 'config.mld.md');
    await fs.writeFile(configPath, [
      '/var @config = {',
      '  tools: ["allowed"],',
      '  env: { MLLD_EXTRA: "value", NON_MLLD: "nope" }',
      '}',
    ].join('\n'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.execute([modulePath], { config: configPath });

    const exportedNames = Array.from(lastOptions.exportedFunctions.keys());
    expect(exportedNames).toEqual(['allowed']);
    expect(process.env.MLLD_EXTRA).toBe('value');
    expect(process.env.NON_MLLD).toBeUndefined();

    delete process.env.MLLD_EXTRA;
    consoleSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('--tools override takes precedence over config module', async () => {
    const command = createMcpCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-tools-'));
    const modulePath = path.join(tmpDir, 'tools.mld.md');
    await fs.writeFile(modulePath, [
      '/exe @first() = js { return "one"; }',
      '/exe @second() = js { return "two"; }',
      '/export { @first, @second }',
    ].join('\n'));

    const configPath = path.join(tmpDir, 'config.mld.md');
    await fs.writeFile(configPath, [
      '/var @config = { tools: ["first"] }',
    ].join('\n'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.execute([modulePath], { config: configPath, tools: 'second' });

    const exportedNames = Array.from(lastOptions.exportedFunctions.keys());
    expect(exportedNames).toEqual(['second']);

    consoleSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('handles modules with parse errors gracefully during discovery', async () => {
    const command = createMcpCommand();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-mcp-test-parse-'));
    const goodModule = path.join(tmpDir, 'good.mld.md');
    const badModule = path.join(tmpDir, 'bad.mld.md');

    await fs.writeFile(goodModule, [
      '/exe @working() = js { return "ok"; }',
      '/export { @working }',
    ].join('\n'));

    await fs.writeFile(badModule, [
      'invalid syntax here @#$%',
      '/exe @broken() = {{{',
    ].join('\n'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await command.execute([tmpDir], {});

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(Array.from(lastOptions.exportedFunctions.keys())).toEqual(['working']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Parse errors'));

    consoleSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
