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
      basePath: '/'
    });

    const output = typeof result === 'string' ? result : result.output;
    expect(output).toContain('<@1417671839676891206>');
  });

  it('preserves large numeric strings produced by commands before template interpolation', async () => {
    const source = `/var @discordId = run { echo 1417671839676891206 }\n/exe @mention(id) = :::<@{{id}}>:::\n/show @mention(@discordId)`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/'
    });

    const output = typeof result === 'string' ? result : result.output;
    expect(output).toContain('<@1417671839676891206>');
  });

  it('keeps long numeric strings intact inside foreach templates', async () => {
    const source = `/var @agents = [{ discordId: "1417671839676891206", name: "Party", role: "Role" }]\n` +
      `/exe @mentionBullet(discordId, name, role) = :::- <@{{discordId}}> ({{name}}): {{role}}:::\n` +
      `/exe @format(agent) = @mentionBullet(@agent.discordId, @agent.name, @agent.role)\n` +
      `/show foreach @format(@agents)`;

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/'
    });

    const output = typeof result === 'string' ? result : result.output;
    expect(output).toContain('<@1417671839676891206>');
  });
});
