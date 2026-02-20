import { describe, expect, it } from 'vitest';
import type { GuardDefinition } from '@interpreter/guards';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import {
  applyDescriptorToVariables,
  extractOutputDescriptor,
  mergeDescriptorWithFallbackInputs,
  mergeGuardDescriptor
} from '@interpreter/hooks/guard-post-descriptor';

const VARIABLE_SOURCE = {
  directive: 'var' as const,
  syntax: 'quoted' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createInput(name: string, labels: string[], sources?: string[]) {
  return createSimpleTextVariable(
    name,
    `${name}-value`,
    VARIABLE_SOURCE,
    {
      security: makeSecurityDescriptor({
        labels,
        sources: sources ?? [`source:${name}`]
      })
    }
  );
}

function createGuard(name: string): GuardDefinition {
  return {
    id: name,
    name,
    filterKind: 'data',
    filterValue: 'secret',
    scope: 'perInput',
    modifier: 'default',
    block: {
      type: 'GuardBlock',
      modifier: 'default',
      rules: [],
      location: null
    },
    registrationOrder: 1,
    timing: 'after'
  };
}

describe('guard post descriptor utilities', () => {
  it('extracts and merges descriptors from result value and output variable', () => {
    const resultValue = createInput('resultValue', ['value-label'], ['value-source']);
    const output = createInput('output', ['output-label'], ['output-source']);
    const result = {
      value: resultValue,
      mx: {
        labels: ['result-label'],
        taint: [],
        sources: ['result-source'],
        policy: null
      }
    } as any;

    const descriptor = extractOutputDescriptor(result, output);
    expect(descriptor.labels).toEqual(
      expect.arrayContaining(['value-label', 'output-label'])
    );
    expect(descriptor.sources).toEqual(
      expect.arrayContaining(['value-source', 'output-source'])
    );
  });

  it('merges fallback input descriptors into the current descriptor', () => {
    const current = makeSecurityDescriptor({
      labels: ['output-label'],
      sources: ['output-source']
    });
    const fallbackInputs = [
      createInput('inputA', ['secret'], ['input-a']),
      createInput('inputB', ['internal'], ['input-b'])
    ];

    const merged = mergeDescriptorWithFallbackInputs(current, fallbackInputs);
    expect(merged.labels).toEqual(expect.arrayContaining(['output-label', 'secret', 'internal']));
    expect(merged.sources).toEqual(expect.arrayContaining(['output-source', 'input-a', 'input-b']));
  });

  it('merges replacement descriptors, applies guard label mods, and writes descriptor to targets', () => {
    const current = makeSecurityDescriptor({
      labels: ['existing'],
      sources: ['existing-source']
    });
    const replacements = [createInput('replacement', ['masked'], ['replacement-source'])];
    const guard = createGuard('sanitize');
    const merged = mergeGuardDescriptor(
      current,
      replacements,
      guard,
      { addLabels: ['sanitized'] }
    );

    expect(merged.labels).toEqual(expect.arrayContaining(['existing', 'masked', 'sanitized']));
    expect(merged.sources).toEqual(
      expect.arrayContaining(['existing-source', 'replacement-source', 'guard:sanitize'])
    );

    const target = createInput('target', []);
    (target.mx as any).mxCache = { stale: true };
    applyDescriptorToVariables(merged, [target]);

    const targetDescriptor = extractSecurityDescriptor(target, {
      recursive: true,
      mergeArrayElements: true
    });
    expect(targetDescriptor?.labels).toEqual(
      expect.arrayContaining(['existing', 'masked', 'sanitized'])
    );
    expect((target.mx as any).mxCache).toBeUndefined();
  });
});
