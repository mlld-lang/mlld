import { describe, expect, it } from 'vitest';
import type { DirectiveNode } from '@core/types';
import { parseSync } from '@grammar/parser';
import {
  createExecutableVariable,
  createObjectVariable,
  createSimpleTextVariable,
  createStructuredValueVariable
} from '@core/types/variable/VariableFactories';
import { makeSecurityDescriptor } from '@core/types/security';
import { getCapturedModuleEnv } from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { Environment } from '@interpreter/env/Environment';
import { ENVIRONMENT_SERIALIZE_PLACEHOLDER } from '@interpreter/env/EnvironmentIdentity';
import { wrapStructured } from './structured-value';
import { boundary, BoundaryViolation } from './boundary';

const SOURCE = {
  directive: 'var' as const,
  syntax: 'object' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('boundary helpers', () => {
  it('plainData recursively unwraps nested structured values', () => {
    const nested = wrapStructured(
      {
        child: wrapStructured(['a', 'b'], 'array')
      },
      'object'
    );

    expect(boundary.plainData(nested)).toEqual({
      child: ['a', 'b']
    });
  });

  it('config throws in strict boundary mode when AST-like values remain', async () => {
    const original = process.env.MLLD_STRICT_BOUNDARIES;
    process.env.MLLD_STRICT_BOUNDARIES = '1';
    try {
      const env = createEnv();
      await expect(
        boundary.config(
          {
            type: 'object',
            entries: []
          },
          env,
          { allowAstEvaluation: false }
        )
      ).rejects.toThrow(BoundaryViolation);
    } finally {
      if (original === undefined) {
        delete process.env.MLLD_STRICT_BOUNDARIES;
      } else {
        process.env.MLLD_STRICT_BOUNDARIES = original;
      }
    }
  });

  it('config evaluates AST-like object inputs and extracts nested variable values', async () => {
    const env = createEnv();
    env.setVariable(
      'basePolicy',
      createObjectVariable(
        'basePolicy',
        {
          defaults: {
            rules: ['no-send-to-unknown']
          }
        },
        true,
        SOURCE
      )
    );

    const ast = parseSync('/var @tmp = { basePolicy: @basePolicy }') as DirectiveNode[];
    const source = ast[0]?.values?.value?.[0];

    await expect(boundary.config(source, env)).resolves.toEqual({
      basePolicy: {
        defaults: {
          rules: ['no-send-to-unknown']
        }
      }
    });
  });

  it('field accepts string paths and preserves nested wrapper metadata', async () => {
    const env = createEnv();
    const structured = wrapStructured(
      {
        nested: wrapStructured(
          {
            value: 'ada@example.com'
          },
          'object',
          undefined,
          {
            security: makeSecurityDescriptor({
              labels: ['fact:@contact.email']
            })
          }
        )
      },
      'object'
    );
    const variable = createStructuredValueVariable('contact', structured, SOURCE);

    const result = await boundary.field(variable, 'nested.value', env, {
      preserveContext: false
    });
    expect((result as { mx?: { labels?: string[] } }).mx?.labels ?? []).toContain('fact:@contact.email');
  });

  it('identity recovers tool collections from parameter-like variables', () => {
    const collection = {
      send_email: {
        mlld: 'sendEmail'
      }
    };
    const variable = createObjectVariable('tools', {}, false, SOURCE, {
      internal: {
        isToolsCollection: true,
        toolCollection: collection
      }
    });

    expect(boundary.identity(variable)).toBe(collection);
  });

  it('display and interpolate keep distinct rendering contracts', () => {
    const structured = wrapStructured(
      {
        text: 'hello world'
      },
      'object'
    );

    expect(boundary.display(structured).text).toContain('hello world');
    expect(boundary.interpolate('hello world', 'shell')).toBe("'hello world'");
    expect(boundary.interpolate(structured, 'plain')).toBe('{"text":"hello world"}');
  });

  it('serialize preserves structured values across AST variable references', () => {
    const structured = wrapStructured(
      {
        answer: 42
      },
      'json'
    );
    const ast = parseSync('/var @tmp = { payload: @payload }') as DirectiveNode[];
    const source = ast[0]?.values?.value?.[0];
    const variableMap = new Map([
      ['payload', createStructuredValueVariable('payload', structured, SOURCE)]
    ]);

    const result = boundary.serialize<{ payload: typeof structured }>(source, { variableMap });

    expect(result.payload).toBe(structured);
  });

  it('serialize converts executable references into sealed module-boundary payloads', () => {
    const ast = parseSync('/var @tmp = { run: @run }') as DirectiveNode[];
    const source = ast[0]?.values?.value?.[0];
    const variableMap = new Map([
      ['dep', createSimpleTextVariable('dep', 'ok', SOURCE)],
      [
        'run',
        createExecutableVariable('run', 'command', 'echo hi', [], 'sh', SOURCE, {
          internal: {
            capturedShadowEnvs: {
              js: new Map([['helper', () => 'ok']])
            },
            capturedModuleEnv: new Map([['dep', createSimpleTextVariable('dep', 'ok', SOURCE)]])
          }
        })
      ]
    ]);

    const result = boundary.serialize<{ run: { internal: Record<string, unknown>; __executable: boolean } }>(
      source,
      { variableMap }
    );
    const capturedModuleEnv = getCapturedModuleEnv(result.run.internal);

    expect(result.run.__executable).toBe(true);
    expect(Object.keys(result.run.internal)).not.toContain('capturedModuleEnv');
    expect(capturedModuleEnv).toEqual({ dep: 'ok' });
  });

  it('serialize replaces Environment instances with the stable placeholder', () => {
    const env = createEnv();

    expect(boundary.serialize({ env })).toEqual({
      env: ENVIRONMENT_SERIALIZE_PLACEHOLDER
    });
  });
});
