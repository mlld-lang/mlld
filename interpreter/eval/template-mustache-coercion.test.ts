import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '../index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('Triple-colon template interpolation', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  it('preserves long numeric strings inside mustache interpolations', async () => {
    const source = `/var @discordId = "1417671839676891206"\n/exe @mention(id) = :::<@{{id}}>:::\n/show @mention(@discordId)`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      returnEnvironment: false
    } as any);

    const output = typeof result === 'string' ? result : result.output;
    expect(output).toContain('<@1417671839676891206>');
  });

  it('preserves large numeric strings produced by commands before template interpolation', async () => {
    const source = `/var @discordId = run { echo 1417671839676891206 }\n/exe @mention(id) = :::<@{{id}}>:::\n/show @mention(@discordId)`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      returnEnvironment: false
    } as any);

    const output = typeof result === 'string' ? result : result.output;
    expect(output).toContain('<@1417671839676891206>');
  });
});
