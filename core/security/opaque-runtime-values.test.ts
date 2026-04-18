import { describe, expect, it } from 'vitest';
import {
  getOpaqueRuntimeValueKind,
  isOpaqueRuntimeValue
} from './opaque-runtime-values';
import { markExecutableDefinition } from '@core/types/executable';

describe('opaque runtime executable tagging', () => {
  it('requires an explicit runtime tag for bare executable definitions', () => {
    const lookalike = {
      type: 'code',
      sourceDirective: 'exec',
      language: 'js',
      paramNames: ['payload'],
      codeTemplate: [{ type: 'Text', content: 'noop' }]
    };

    expect(getOpaqueRuntimeValueKind(lookalike)).toBeUndefined();

    markExecutableDefinition(lookalike);

    expect(getOpaqueRuntimeValueKind(lookalike)).toBe('executable-definition');
    expect(isOpaqueRuntimeValue(lookalike)).toBe(true);
  });

  it('recognizes imported wrappers through tagged executable defs', () => {
    const executableDef = markExecutableDefinition({
      type: 'code',
      sourceDirective: 'exec',
      language: 'js',
      paramNames: ['payload'],
      codeTemplate: [{ type: 'Text', content: 'noop' }]
    });

    const imported = {
      type: 'imported',
      value: { status: 'wrapped' },
      internal: {
        executableDef,
        capturedModuleEnv: {}
      }
    };

    expect(getOpaqueRuntimeValueKind(imported)).toBe('imported-executable');
  });
});
