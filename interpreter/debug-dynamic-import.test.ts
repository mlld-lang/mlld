import { describe, it, expect } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';

describe('debug dynamic import events', () => {
  it('emits debug event with provenance for dynamic modules', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    env.setProvenanceEnabled(true);
    const emitter = new ExecutionEmitter();
    const events: any[] = [];
    emitter.on('debug:import:dynamic', event => events.push(event));
    env.enableSDKEvents(emitter);
    await env.registerBuiltinResolvers();

    (env as any).importResolver.resolveModule = async () => ({
      content: `
/var @exported = "value"
/export { exported }
      `.trim(),
      contentType: 'module',
      mx: { source: 'dynamic://@user/context', taint: ['src:dynamic'] },
      metadata: { exports: ['exported'] },
      resolverName: 'dynamic'
    });

    const parseResult = await parse('/import "@user/context"');
    if (!parseResult.success) {
      throw parseResult.error ?? new Error('Parse failed');
    }

    await evaluate(parseResult.ast, env);

    const event = events.find(e => e.type === 'debug:import:dynamic');

    expect(event).toBeDefined();
    expect(event.variables).toContain('exported');
    expect(event.tainted).toBe(true);
    expect(event.provenance).toBeDefined();
  });
});
