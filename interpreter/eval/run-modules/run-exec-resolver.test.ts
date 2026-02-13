import { describe, expect, it } from 'vitest';
import type { DirectiveNode } from '@core/types';
import type { ExecutableDefinition, ExecutableVariable } from '@core/types/executable';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { resolveRunExecutableReference } from './run-exec-resolver';

type FieldAccess = {
  type: 'field' | 'stringIndex' | 'numericField' | 'arrayIndex';
  value: string | number;
};

function createEnv(basePath: string = process.cwd()): Environment {
  const env = new Environment(new NodeFileSystem(), new PathService(), basePath);
  env.setEffectHandler(new TestEffectHandler());
  return env;
}

function createCodeDefinition(template: string = 'return "ok";'): ExecutableDefinition {
  return {
    type: 'code',
    template,
    language: 'js',
    paramNames: [],
    sourceDirective: 'exec'
  } as ExecutableDefinition;
}

function createExecutable(name: string, definition: ExecutableDefinition = createCodeDefinition()): ExecutableVariable {
  return {
    type: 'executable',
    name,
    value: definition,
    source: {
      directive: 'var',
      syntax: 'code',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    mx: {},
    internal: {
      executableDef: definition
    }
  } as ExecutableVariable;
}

function createObjectVariable(name: string, value: Record<string, unknown>): unknown {
  return {
    type: 'object',
    name,
    value,
    source: {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    mx: {},
    internal: {}
  };
}

function createRunExecDirective(identifier: string, fields: FieldAccess[] = []): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'run',
    subtype: 'runExec',
    source: 'exec',
    values: {
      identifier: [
        {
          type: 'VariableReference',
          valueType: 'varIdentifier',
          identifier,
          ...(fields.length > 0 ? { fields } : {})
        }
      ],
      args: []
    },
    meta: {}
  } as unknown as DirectiveNode;
}

describe('run exec resolver', () => {
  it('resolves simple executable references and appends call-stack entries once', async () => {
    const env = createEnv();
    const executable = createExecutable('tool');
    env.setVariable('tool', executable as any);
    const directive = createRunExecDirective('tool');

    const firstResolution = await resolveRunExecutableReference({
      directive,
      env,
      callStack: []
    });
    expect(firstResolution.execVar).toBe(executable);
    expect(firstResolution.definition).toBe(executable.internal?.executableDef);
    expect(firstResolution.commandName).toBe('tool');
    expect(firstResolution.fullPath).toBe('tool');
    expect(firstResolution.callStack).toEqual(['tool']);

    const secondResolution = await resolveRunExecutableReference({
      directive,
      env,
      callStack: ['tool']
    });
    expect(secondResolution.callStack).toEqual(['tool']);
  });

  it('resolves field-access references via transformer variants', async () => {
    const env = createEnv();
    const strictExec = createExecutable('parse.strict');
    env.setVariable(
      'parserExec',
      {
        ...createObjectVariable('parserExec', {}),
        internal: {
          transformerVariants: {
            strict: strictExec
          }
        }
      } as any
    );
    const directive = createRunExecDirective('parserExec', [{ type: 'field', value: 'strict' }]);

    const resolution = await resolveRunExecutableReference({
      directive,
      env,
      callStack: []
    });

    expect(resolution.execVar).toBe(strictExec);
    expect(resolution.definition).toBe(strictExec.internal?.executableDef);
    expect(resolution.fullPath).toBe('parserExec.strict');
  });

  it('rehydrates serialized executable objects and preserves captured shadow env maps', async () => {
    const env = createEnv();
    const definition = createCodeDefinition('return helper();');
    const serializedExecutable = {
      __executable: true,
      value: definition,
      paramNames: ['value'],
      mx: { labels: ['secret'], taint: ['secret'], sources: ['import'] },
      internal: {
        capturedShadowEnvs: {
          js: {
            helper: () => 'shadow'
          }
        }
      },
      executableDef: definition
    };
    env.setVariable(
      'holder',
      createObjectVariable('holder', {
        nested: serializedExecutable
      }) as any
    );
    const directive = createRunExecDirective('holder', [{ type: 'field', value: 'nested' }]);

    const resolution = await resolveRunExecutableReference({
      directive,
      env,
      callStack: []
    });

    const captured = (resolution.execVar.internal as any)?.capturedShadowEnvs;
    expect(captured?.js).toBeInstanceOf(Map);
    expect(captured.js.get('helper')).toBeTypeOf('function');
    expect(resolution.definition).toBe(definition);
    expect(resolution.fullPath).toBe('holder.nested');
  });

  it('resolves string references from field-access lookups and preserves resolution errors', async () => {
    const env = createEnv();
    const targetExec = createExecutable('target');
    env.setVariable('target', targetExec as any);
    env.setVariable(
      'holder',
      createObjectVariable('holder', {
        targetRef: 'target',
        valueOnly: 3
      }) as any
    );

    const resolved = await resolveRunExecutableReference({
      directive: createRunExecDirective('holder', [{ type: 'field', value: 'targetRef' }]),
      env,
      callStack: []
    });
    expect(resolved.execVar).toBe(targetExec);

    await expect(
      resolveRunExecutableReference({
        directive: createRunExecDirective('holder', [{ type: 'field', value: 'valueOnly' }]),
        env,
        callStack: []
      })
    ).rejects.toThrow('Field access did not resolve to an executable: number, got: 3');
  });

  it('keeps missing-variant and missing-definition errors stable', async () => {
    const env = createEnv();
    const strictExec = createExecutable('parse.strict');
    env.setVariable(
      'parserExec',
      {
        ...createObjectVariable('parserExec', {}),
        internal: {
          transformerVariants: {
            strict: strictExec
          }
        }
      } as any
    );

    await expect(
      resolveRunExecutableReference({
        directive: createRunExecDirective('parserExec', [{ type: 'field', value: 'missing' }]),
        env,
        callStack: []
      })
    ).rejects.toThrow("Pipeline function '@parserExec.missing' is not defined");

    const noDefinitionExecutable = createExecutable('tool');
    (noDefinitionExecutable.internal as any).executableDef = undefined;
    env.setVariable('tool', noDefinitionExecutable as any);

    await expect(
      resolveRunExecutableReference({
        directive: createRunExecDirective('tool'),
        env,
        callStack: []
      })
    ).rejects.toThrow('Executable tool has no definition (missing executableDef)');
  });
});
