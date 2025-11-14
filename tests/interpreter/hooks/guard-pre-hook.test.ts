import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('guard pre-hook integration', () => {
  it('denies per-input guard when labels match', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for secret = when [ * => deny "blocked secret" ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
        'secretVar',
        'hi',
        {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          security: makeSecurityDescriptor({ labels: ['secret'], sources: ['test'] })
        }
      )
    );

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/blocked secret/);
  });

  it('applies per-operation guard helpers like @opIs', async () => {
    const env = createEnv();
    const guardDirective = parseSync(
      '/guard for op:show = when [ @input.any.ctx.labels.includes("secret") => deny "secret output blocked" \n * => allow ]'
    )[0] as DirectiveNode;
    await evaluateDirective(guardDirective, env);

    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    env.setVariable(
      'secretVar',
      createSimpleTextVariable(
        'secretVar',
        'value',
        source,
        {
          security: makeSecurityDescriptor({ labels: ['secret'] })
        }
      )
    );

    const directive = parseSync('/show @secretVar')[0] as DirectiveNode;
    await expect(evaluateDirective(directive, env)).rejects.toThrow(/secret output blocked/);
  });
});
