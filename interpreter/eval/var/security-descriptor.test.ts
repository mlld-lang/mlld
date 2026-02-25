import { describe, expect, it } from 'vitest';
import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import {
  createDescriptorState,
  extractDescriptorsFromDataAst,
  extractDescriptorsFromTemplateAst
} from './security-descriptor';

const descriptorA: SecurityDescriptor = {
  labels: ['a'],
  taint: ['a'],
  sources: []
};

const descriptorB: SecurityDescriptor = {
  labels: ['b'],
  taint: ['b'],
  sources: []
};

function createVariableWithLabels(labels: string[]) {
  return {
    mx: {
      labels,
      taint: labels,
      sources: []
    }
  };
}

function createEnvStub(variables: Record<string, any>): Environment {
  return {
    getVariable: (name: string) => variables[name],
    mergeSecurityDescriptors: (...descriptors: SecurityDescriptor[]) => mergeDescriptors(...descriptors)
  } as unknown as Environment;
}

describe('security descriptor services', () => {
  it('extracts merged descriptors from data AST variable references', () => {
    const env = createEnvStub({
      left: createVariableWithLabels(['left']),
      right: createVariableWithLabels(['right'])
    });

    const descriptor = extractDescriptorsFromDataAst(
      {
        type: 'object',
        entries: [
          { type: 'pair', key: 'a', value: { type: 'VariableReference', identifier: 'left' } },
          { type: 'pair', key: 'b', value: { type: 'VariableReferenceWithTail', variable: { type: 'VariableReference', identifier: 'right' } } }
        ]
      },
      env
    );

    expect(descriptor?.labels).toEqual(expect.arrayContaining(['left', 'right']));
  });

  it('extracts descriptors from object spread entries', () => {
    const env = createEnvStub({
      spreadSource: createVariableWithLabels(['secret'])
    });

    const descriptor = extractDescriptorsFromDataAst(
      {
        type: 'object',
        entries: [
          {
            type: 'spread',
            value: [
              {
                type: 'VariableReference',
                identifier: 'spreadSource'
              }
            ]
          }
        ]
      },
      env
    );

    expect(descriptor?.labels).toEqual(expect.arrayContaining(['secret']));
    expect(descriptor?.taint).toEqual(expect.arrayContaining(['secret']));
  });

  it('extracts descriptors from template AST references', () => {
    const env = createEnvStub({
      payload: createVariableWithLabels(['payload'])
    });

    const descriptor = extractDescriptorsFromTemplateAst(
      [{ type: 'InterpolationVar', identifier: 'payload' }],
      env
    );

    expect(descriptor?.labels).toContain('payload');
  });

  it('tracks resolved descriptor state through merges', () => {
    const env = createEnvStub({});
    const state = createDescriptorState(env);

    state.mergeResolvedDescriptor(descriptorA);
    state.mergeResolvedDescriptor(descriptorB);

    const resolved = state.getResolvedDescriptor();
    expect(resolved?.labels).toEqual(expect.arrayContaining(['a', 'b']));
    expect(resolved?.taint).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('provides descriptor helpers for variable-like values', () => {
    const env = createEnvStub({});
    const state = createDescriptorState(env);
    const value = createVariableWithLabels(['source']);

    expect(state.descriptorFromVariable(value as any)?.labels).toContain('source');
    expect(state.extractSecurityFromValue(value)?.labels).toContain('source');
    expect(state.mergePipelineDescriptor(descriptorA, descriptorB)?.labels).toEqual(
      expect.arrayContaining(['a', 'b'])
    );
  });
});
