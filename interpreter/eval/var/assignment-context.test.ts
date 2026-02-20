import { describe, expect, it } from 'vitest';
import type { DirectiveNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import { createVarAssignmentContext } from './assignment-context';

const env = {
  getCurrentFilePath: () => '/tmp/context-test.mld'
} as unknown as Environment;

function createDirective(identifierNode: unknown): DirectiveNode {
  return {
    kind: 'var',
    type: 'Directive',
    location: {
      start: { line: 3, column: 2, offset: 10 },
      end: { line: 3, column: 20, offset: 28 }
    },
    values: {
      identifier: [identifierNode]
    },
    meta: {
      securityLabels: ['secret']
    }
  } as unknown as DirectiveNode;
}

describe('createVarAssignmentContext', () => {
  it('builds identifier, descriptor, and capability metadata', () => {
    const directive = createDirective({ identifier: 'payload' });
    const result = createVarAssignmentContext(directive, env);

    expect(result.identifier).toBe('payload');
    expect(result.operationMetadata).toEqual({
      kind: 'var',
      identifier: 'payload',
      location: directive.location
    });
    expect(result.baseDescriptor.labels).toEqual(['secret']);
    expect(result.capabilityKind).toBe('var');
    expect(result.sourceLocation?.filePath).toBe('/tmp/context-test.mld');
  });

  it('throws when identifier list is missing', () => {
    const directive = {
      ...createDirective({ identifier: 'x' }),
      values: {}
    } as DirectiveNode;

    expect(() => createVarAssignmentContext(directive, env)).toThrow('Var directive missing identifier');
  });

  it('throws when identifier node shape is invalid', () => {
    const directive = createDirective({ notIdentifier: 'x' });
    expect(() => createVarAssignmentContext(directive, env)).toThrow('Invalid identifier node structure');
  });
});
