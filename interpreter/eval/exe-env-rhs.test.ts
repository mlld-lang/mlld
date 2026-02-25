import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/main.mld.md'
};

describe('exe env RHS', () => {
  it('applies env tools scope at call time from exe params', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe @read() = `read-ok`',
      '/exe @write() = `write-ok`',
      '/var tools @readOnlyTools = {',
      '  read: { mlld: @read }',
      '}',
      '/exe @agent(tools) = env with { tools: @tools } [',
      '  => @read()',
      ']',
      '/show @agent(@readOnlyTools)'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown'
    });

    expect(output.trim()).toBe('read-ok');
  });

  it('enforces env tools restrictions inside exe env RHS', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe @read() = `read-ok`',
      '/var tools @readOnlyTools = {',
      '  read: { mlld: @read }',
      '}',
      '/exe @agent(tools) = env with { tools: @tools } [',
      '  run cmd { echo should-fail }',
      ']',
      '/show @agent(@readOnlyTools)'
    ].join('\n');

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        format: 'markdown'
      })
    ).rejects.toThrow(/env\.tools|Bash|ENV_TOOL_DENIED/i);
  });

  it('supports env RHS executables when invoked through run', async () => {
    const fileSystem = new MemoryFileSystem();
    const source = [
      '/exe @read() = `read-ok`',
      '/var tools @readOnlyTools = {',
      '  read: { mlld: @read }',
      '}',
      '/exe @agent(tools) = env with { tools: @tools } [',
      '  => @read()',
      ']',
      '/run @agent(@readOnlyTools)'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown'
    });

    expect(output.trim()).toBe('read-ok');
  });
});
