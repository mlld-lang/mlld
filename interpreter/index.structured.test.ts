import { describe, it, expect } from 'vitest';
import { interpret, Environment } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('interpret structured mode', () => {
  it('returns structured result with effects and exports', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/var secret @apiKey = "sk-123"
/show "Hello there"
/export { @apiKey }
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      format: 'markdown',
      mode: 'structured',
      streaming: { enabled: false }
    });

    expect(typeof result).toBe('object');
    const effects = (result as any).effects;
    const exports = (result as any).exports;

    expect((result as any).output).toContain('Hello there');
    expect(Array.isArray(effects)).toBe(true);
    expect(effects.length).toBeGreaterThan(0);
    expect(effects[0].type).toBe('doc');
    expect(effects[0].security).toBeDefined();
    expect(Array.isArray(effects[0].security?.labels)).toBe(true);
    expect(effects[0].security?.taintLevel).toBeDefined();
    expect(Array.isArray(effects[0].security?.sources)).toBe(true);

    const exportKey = exports.apiKey ? 'apiKey' : '@apiKey';
    expect(exports[exportKey].value).toBe('sk-123');
    expect(exports[exportKey].metadata?.security).toBeDefined();
    expect((result as any).environment).toBeInstanceOf(Environment);
  });
});
