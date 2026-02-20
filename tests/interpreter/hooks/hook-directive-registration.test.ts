import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('/hook directive evaluation', () => {
  it('registers hooks without producing side effects', async () => {
    const env = createEnv();
    const directive = parseSync('/hook @audit before op:exe = [ => @input ]')[0] as DirectiveNode;

    const result = await evaluateDirective(directive, env);
    const hooks = env.getHookRegistry().getOperationHooks('exe', 'before');

    expect(result.value).toBeUndefined();
    expect(hooks).toHaveLength(1);
    expect(hooks[0].name).toBe('audit');
    expect(env.getStateWrites()).toHaveLength(0);
  });

  it('rejects duplicate named hooks when evaluating directives', async () => {
    const env = createEnv();
    const first = parseSync('/hook @audit before op:exe = [ => @input ]')[0] as DirectiveNode;
    const duplicate = parseSync('/hook @audit after op:exe = [ => @output ]')[0] as DirectiveNode;

    await evaluateDirective(first, env);
    await expect(evaluateDirective(duplicate, env)).rejects.toThrow(/already exists/);
  });
});
