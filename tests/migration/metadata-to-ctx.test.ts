import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSimpleTextVariable } from '@core/types/variable/VariableFactories';
import type { Variable } from '@core/types/variable';

function buildVariable(): Variable {
  const source = {
    directive: 'var' as const,
    syntax: 'quoted' as const,
    hasInterpolation: false,
    isMultiLine: false
  };
  return createSimpleTextVariable('example', 'value', source, {
    security: {
      labels: ['secret'],
      taintLevel: 'unknown',
      sources: [],
      policyContext: null
    }
  });
}

describe('Variable metadata deprecation guard', () => {
  const originalEnv = process.env.MLLD_METADATA_GUARD;

  beforeEach(() => {
    delete process.env.MLLD_METADATA_GUARD;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MLLD_METADATA_GUARD;
    } else {
      process.env.MLLD_METADATA_GUARD = originalEnv;
    }
  });

  it('keeps metadata accessible when guard is disabled', () => {
    const variable = buildVariable();
    expect(variable.metadata).toBeDefined();
    expect(variable.metadata?.security?.labels).toEqual(['secret']);
    // Updating metadata still works
    variable.metadata = { custom: true } as any;
    expect(variable.metadata?.custom).toBe(true);
  });

  it('throws helpful error when guard mode is error', () => {
    process.env.MLLD_METADATA_GUARD = 'error';
    const variable = buildVariable();
    expect(() => {
      // Access triggers guard
      return variable.metadata;
    }).toThrowErrorMatchingInlineSnapshot(`
[Error: Variable.metadata has been replaced with .ctx (user-facing) and .internal (implementation). Update your code:
  - .metadata.security.labels → .ctx.labels
  - .metadata.loadResult.filename → .ctx.filename
  - .metadata.executableDef → .internal.executableDef]
`);
  });
});
