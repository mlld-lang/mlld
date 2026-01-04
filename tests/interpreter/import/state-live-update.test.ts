import { describe, it, expect } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { makeSecurityDescriptor } from '@core/types/security';

describe('State live updates', () => {
  it('mirrors state:// writes into @state for subsequent reads and imports', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    await env.registerBuiltinResolvers();

    env.registerDynamicModules(
      {
        '@state': { value: 'old', nested: { count: 1 } }
      },
      'user-data',
      { literalStrings: true }
    );

    // Initial snapshot is available via @state
    expect(env.getVariable('state')?.value.value).toBe('old');

    // Apply state write
    env.recordStateWrite({
      path: 'value',
      value: 'new',
      operation: 'set',
      security: makeSecurityDescriptor()
    });

    expect(env.getVariable('state')?.value.value).toBe('new');

    // Nested paths update
    env.recordStateWrite({
      path: 'nested.count',
      value: 2,
      operation: 'set',
      security: makeSecurityDescriptor()
    });

    expect(env.getVariable('state')?.value.nested.count).toBe(2);

    // Dynamic @state module content reflects updates for future imports
    const resolver = env.getResolverManager();
    const resolved = await resolver?.resolve('@state', { context: 'import' as any });
    expect(resolved?.content.content).toContain('new');
    expect(resolved?.content.content).toContain('nested');
  });
});
