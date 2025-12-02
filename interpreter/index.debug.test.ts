import { describe, it, expect } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('interpret debug mode', () => {
  it('returns DebugResult with trace events and provenance', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/var secret @name = "Ada"
/show @name
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'debug'
    }) as any;

    expect(result.output).toContain('Ada');
    expect(result.ast).toBeDefined();
    expect(result.variables).toBeDefined();
    expect(result.trace).toBeInstanceOf(Array);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const directiveStart = result.trace.find((e: any) => e.type === 'debug:directive:start');
    const directiveComplete = result.trace.find((e: any) => e.type === 'debug:directive:complete');
    const variableCreate = result.trace.find((e: any) => e.type === 'debug:variable:create');
    const effectEvent = result.trace.find((e: any) => e.type === 'effect');

    expect(directiveStart).toBeDefined();
    expect(directiveComplete).toBeDefined();
    expect(variableCreate?.name).toBe('name');
    expect(effectEvent?.effect?.security).toBeDefined();
    expect(Array.isArray(effectEvent?.effect?.security?.labels)).toBe(true);
    expect(effectEvent?.effect?.provenance).toBeDefined();
  });
});
