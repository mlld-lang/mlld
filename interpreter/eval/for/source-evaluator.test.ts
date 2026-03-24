import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { evaluateForDirectiveSource } from './source-evaluator';

const TEXT_SOURCE = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
} as const;

describe('evaluateForDirectiveSource', () => {
  it('preserves source descriptors for inline array literals', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    env.setVariable(
      'token',
      createSimpleTextVariable('token', 'sk-loop-123', TEXT_SOURCE, {
        security: makeSecurityDescriptor({
          labels: ['secret'],
          taint: ['secret'],
          sources: ['test']
        })
      })
    );

    const result = await evaluateForDirectiveSource(
      {
        values: {
          source: {
            type: 'array',
            items: [
              {
                type: 'VariableReference',
                identifier: 'token'
              }
            ]
          }
        }
      } as any,
      env
    );

    expect([...result.iterable]).toEqual([['0', 'sk-loop-123']]);
    expect(result.sourceDescriptor?.labels).toContain('secret');
    expect(result.sourceDescriptor?.taint).toContain('secret');
  });
});
