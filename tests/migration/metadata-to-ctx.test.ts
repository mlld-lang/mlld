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
    ctx: {
      labels: ['secret']
    },
    internal: {}
  });
}

describe('Variable ctx/internal API', () => {
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

  it('keeps ctx and internal accessible when guard is disabled', () => {
    const variable = buildVariable();
    expect(variable.ctx).toBeDefined();
    expect(variable.internal).toBeDefined();
    expect(variable.ctx?.labels).toEqual(['secret']);
    // Updating ctx still works
    variable.ctx = { ...variable.ctx, labels: ['public'] };
    expect(variable.ctx?.labels).toEqual(['public']);
  });

  it('throws helpful error when accessing deprecated metadata when guard mode is error', () => {
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
