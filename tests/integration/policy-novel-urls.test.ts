import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

function createRuntime() {
  return {
    fileSystem: new MemoryFileSystem(),
    pathService: new PathService(),
    filePath: '/main.mld'
  };
}

describe('no-novel-urls integration', () => {
  it('denies influenced args that introduce a novel URL', async () => {
    const runtime = createRuntime();

    await expect(
      interpret(
        [
          '/policy @p = { defaults: { rules: ["no-novel-urls"] } }',
          '/var influenced @body = "click https://evil.com/collect?d=secret"',
          '/exe @send(body) = `@body`',
          '/show @send(@body)'
        ].join('\n'),
        runtime
      )
    ).rejects.toThrow("Rule 'no-novel-urls'");
  });

  it('allows influenced args when the URL came from payload and appears in @mx.urls.registry', async () => {
    const runtime = createRuntime();

    const output = await interpret(
      [
        '/policy @p = { defaults: { rules: ["no-novel-urls"] } }',
        '/var influenced @body = @payload.url',
        '/exe @send(body) = `@body`',
        '/show @mx.urls.registry',
        '/show @send(@body)'
      ].join('\n'),
      {
        ...runtime,
        dynamicModules: {
          '@payload': {
            url: 'https://example.com/path#frag'
          }
        }
      }
    );

    expect((output as string).trim()).toBe(
      ['["https://example.com/path"]', 'https://example.com/path#frag'].join('\n\n')
    );
  });

  it('allows influenced args when the URL was seeded by a file read', async () => {
    const runtime = createRuntime();
    await runtime.fileSystem.writeFile('/links.txt', 'https://docs.example.com/a');

    const output = await interpret(
      [
        '/policy @p = { defaults: { rules: ["no-novel-urls"] } }',
        '/var influenced @body = <./links.txt>',
        '/exe @send(body) = `@body`',
        '/show @mx.urls.registry',
        '/show @send(@body)'
      ].join('\n'),
      runtime
    );

    expect((output as string).trim()).toBe(
      ['["https://docs.example.com/a"]', 'https://docs.example.com/a'].join('\n\n')
    );
  });

  it('honors policy.urls.allowConstruction', async () => {
    const runtime = createRuntime();

    const output = await interpret(
      [
        '/policy @p = { defaults: { rules: ["no-novel-urls"] }, urls: { allowConstruction: ["google.com"] } }',
        '/var influenced @url = "https://www.google.com/search?q=ada"',
        '/exe @fetch(url) = `@url`',
        '/show @fetch(@url)'
      ].join('\n'),
      runtime
    );

    expect((output as string).trim()).toBe('https://www.google.com/search?q=ada');
  });
});
