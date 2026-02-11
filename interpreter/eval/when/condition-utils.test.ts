import { describe, expect, it } from 'vitest';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { Environment } from '@interpreter/env/Environment';
import { compareValues, conditionTargetsDenied, isTruthy } from './condition-utils';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('when condition utilities', () => {
  it('keeps string and boolean comparison edge cases stable', async () => {
    const env = createEnvironment();

    await expect(compareValues('true', true, env)).resolves.toBe(true);
    await expect(compareValues('false', false, env)).resolves.toBe(true);
    await expect(compareValues(true, 'true', env)).resolves.toBe(true);
    await expect(compareValues(false, 'false', env)).resolves.toBe(true);
    await expect(compareValues('True', true, env)).resolves.toBe(false);
  });

  it('keeps boolean-condition truthiness comparisons stable', async () => {
    const env = createEnvironment();

    await expect(compareValues(0, false, env)).resolves.toBe(true);
    await expect(compareValues(null, false, env)).resolves.toBe(true);
    await expect(compareValues({ value: 'hello' }, true, env)).resolves.toBe(true);
    await expect(compareValues([], false, env)).resolves.toBe(true);
  });

  it('keeps denied-target detection stable for denied literals and mx.denied fields', () => {
    const deniedLiteral = [
      {
        type: 'Literal',
        nodeId: 'denied-literal',
        value: 'denied',
        valueType: 'string'
      } as any
    ];

    const mxDeniedField = [
      {
        type: 'VariableReference',
        nodeId: 'mx-denied',
        identifier: 'mx',
        fields: [
          {
            type: 'FieldAccess',
            name: 'denied'
          }
        ]
      } as any
    ];

    const nonDeniedField = [
      {
        type: 'VariableReference',
        nodeId: 'mx-allowed',
        identifier: 'mx',
        fields: [
          {
            type: 'FieldAccess',
            name: 'allowed'
          }
        ]
      } as any
    ];

    expect(conditionTargetsDenied(deniedLiteral)).toBe(true);
    expect(conditionTargetsDenied(mxDeniedField)).toBe(true);
    expect(conditionTargetsDenied(nonDeniedField)).toBe(false);
  });

  it('keeps direct truthiness utility behavior stable for strings and collections', () => {
    expect(isTruthy('false')).toBe(false);
    expect(isTruthy('True')).toBe(true);
    expect(isTruthy([])).toBe(false);
    expect(isTruthy([1])).toBe(true);
  });
});
