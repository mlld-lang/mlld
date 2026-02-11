import { describe, expect, it } from 'vitest';
import type { DirectiveNode, ExeBlockNode } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { evaluateExe, evaluateExeBlock } from './exe';
import { isExeReturnControl } from './exe-return';

function createEnvironment(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createVarRef(identifier: string): any {
  return {
    type: 'VariableReference',
    nodeId: `ref-${identifier}`,
    identifier
  };
}

function createText(content: string): any {
  return {
    type: 'Text',
    nodeId: `text-${content.replace(/\W+/g, '-') || 'node'}`,
    content
  };
}

function createDirective(
  identifier: string,
  subtype: string,
  values: Record<string, unknown>,
  meta: Record<string, unknown> = {}
): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'exe',
    subtype,
    nodeId: `exe-${identifier}-${subtype}`,
    values: {
      identifier: [createVarRef(identifier)],
      params: [],
      ...values
    } as any,
    raw: {},
    meta: {
      parameterCount: 0,
      ...meta
    } as any,
    location: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 }
    }
  } as DirectiveNode;
}

function getExecutableDef(env: Environment, identifier: string): any {
  const variable = env.getVariable(identifier) as any;
  expect(variable).toBeDefined();
  expect(variable.type).toBe('executable');
  expect(variable.internal?.executableDef).toBeDefined();
  return variable.internal.executableDef;
}

describe('exe evaluator characterization', () => {
  it('keeps subtype-to-definition mapping stable across representative exec forms', async () => {
    const env = createEnvironment();
    await env.getFileSystemService().writeFile('/snippet.att', 'Hello @name');

    const cases = [
      {
        identifier: 'cmdExec',
        directive: createDirective('cmdExec', 'exeCommand', {
          command: [createText('echo hi')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('command');
          expect(def.sourceDirective).toBe('exec');
        }
      },
      {
        identifier: 'cmdRefExec',
        directive: createDirective('cmdRefExec', 'exeCommand', {
          commandRef: [createVarRef('sourceCmd')],
          params: [createVarRef('x')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('commandRef');
          expect(def.commandRef).toBe('sourceCmd');
        }
      },
      {
        identifier: 'dataExec',
        directive: createDirective('dataExec', 'exeData', {
          data: [createText('{"x": 1}')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('data');
          expect(def.dataTemplate).toBeDefined();
        }
      },
      {
        identifier: 'codeExec',
        directive: createDirective(
          'codeExec',
          'exeCode',
          {
            code: [createText('return 42;')]
          },
          { language: 'js' }
        ),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('js');
        }
      },
      {
        identifier: 'templateExec',
        directive: createDirective('templateExec', 'exeTemplate', {
          template: [createText('Hello @name')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('template');
        }
      },
      {
        identifier: 'templateFileExec',
        directive: createDirective('templateFileExec', 'exeTemplateFile', {
          path: [createText('/snippet.att')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('template');
          expect(Array.isArray(def.template)).toBe(true);
          expect(def.template.length).toBeGreaterThan(0);
        }
      },
      {
        identifier: 'sectionExec',
        directive: createDirective('sectionExec', 'exeSection', {
          path: [createText('README.md')],
          section: [createText('Overview')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('section');
          expect(def.pathTemplate).toBeDefined();
          expect(def.sectionTemplate).toBeDefined();
        }
      },
      {
        identifier: 'resolverExec',
        directive: createDirective('resolverExec', 'exeResolver', {
          resolver: [createText('github/openai/repo')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('resolver');
          expect(def.resolverPath).toBe('github/openai/repo');
        }
      },
      {
        identifier: 'proseExec',
        directive: createDirective('proseExec', 'exeProse', {
          configRef: [createVarRef('proseConfig')],
          contentType: 'inline',
          content: [createText('session "Summarize @topic"')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('prose');
          expect(def.contentType).toBe('inline');
        }
      },
      {
        identifier: 'proseFileExec',
        directive: createDirective('proseFileExec', 'exeProseFile', {
          configRef: [createVarRef('proseConfig')],
          contentType: 'file',
          path: [createText('/prompt.prose')]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('prose');
          expect(def.contentType).toBe('file');
          expect(def.pathTemplate).toBeDefined();
        }
      },
      {
        identifier: 'whenExec',
        directive: createDirective('whenExec', 'exeWhen', {
          content: [
            {
              type: 'WhenExpression',
              nodeId: 'when-expr',
              conditions: []
            }
          ]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-when');
        }
      },
      {
        identifier: 'foreachExec',
        directive: createDirective('foreachExec', 'exeForeach', {
          content: [
            {
              type: 'foreach-command',
              nodeId: 'foreach-expr',
              rawText: 'foreach @do(@items)'
            }
          ]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-foreach');
        }
      },
      {
        identifier: 'forExec',
        directive: createDirective('forExec', 'exeFor', {
          content: [
            {
              type: 'ForExpression',
              nodeId: 'for-expr',
              variable: { identifier: 'item' }
            }
          ]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-for');
        }
      },
      {
        identifier: 'loopExec',
        directive: createDirective('loopExec', 'exeLoop', {
          content: [
            {
              type: 'LoopExpression',
              nodeId: 'loop-expr'
            }
          ]
        }),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-loop');
        }
      },
      {
        identifier: 'blockExec',
        directive: createDirective(
          'blockExec',
          'exeBlock',
          {
            statements: [createText('noop')]
          },
          { statementCount: 1, hasReturn: false }
        ),
        assertDef: (def: any) => {
          expect(def.type).toBe('code');
          expect(def.language).toBe('mlld-exe-block');
          expect(def.codeTemplate?.[0]?.type).toBe('ExeBlock');
        }
      }
    ] as const;

    for (const entry of cases) {
      const result = await evaluateExe(entry.directive, env);
      expect(result.env).toBe(env);
      entry.assertDef(getExecutableDef(env, entry.identifier));
    }
  });

  it('keeps exeValue behavior stable as immediate variable materialization', async () => {
    const env = createEnvironment();
    const directive = createDirective('valueExec', 'exeValue', {
      value: createText('literal-value')
    });

    const result = await evaluateExe(directive, env);
    expect(result.value).toBe('literal-value');

    const variable = env.getVariable('valueExec') as any;
    expect(variable).toBeDefined();
    expect(variable.type).not.toBe('executable');
  });

  it('keeps command security metadata assembly stable for labeled exec definitions', async () => {
    const env = createEnvironment();
    const directive = createDirective(
      'secureCommand',
      'exeCommand',
      {
        command: [createText('echo secure')],
        securityLabels: ['secret']
      }
    );

    await evaluateExe(directive, env);

    const variable = env.getVariable('secureCommand') as any;
    expect(variable?.mx?.labels ?? []).toEqual(expect.arrayContaining(['secret']));
    expect(variable?.mx?.taint ?? []).toEqual(expect.arrayContaining(['secret', 'src:exec']));
  });

  it('keeps shadow environment wrapper registration behavior stable', async () => {
    const env = createEnvironment();

    await evaluateExe(
      createDirective(
        'double',
        'exeCode',
        {
          code: [createText('x * 2')],
          params: [createVarRef('x')]
        },
        { language: 'js', parameterCount: 1 }
      ),
      env
    );

    const envDirective = {
      type: 'Directive',
      kind: 'exe',
      subtype: 'environment',
      nodeId: 'exe-env-js',
      values: {
        identifier: [createVarRef('js')],
        environment: [createVarRef('double')]
      },
      raw: {},
      meta: {},
      location: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 }
      }
    } as DirectiveNode;

    await evaluateExe(envDirective, env);

    const shadowEnv = env.getShadowEnv('js');
    expect(shadowEnv).toBeDefined();
    expect(shadowEnv?.has('double')).toBe(true);

    const wrapper = shadowEnv?.get('double');
    expect(typeof wrapper).toBe('function');

    const value = await wrapper?.(3);
    expect(Number(value)).toBe(6);
  });

  it('keeps cross-function capture stable across declarations in a shared JS shadow environment', async () => {
    const env = createEnvironment();

    await evaluateExe(
      createDirective(
        'double',
        'exeCode',
        {
          code: [createText('x * 2')],
          params: [createVarRef('x')]
        },
        { language: 'js', parameterCount: 1 }
      ),
      env
    );

    await evaluateExe(
      createDirective(
        'plusOneAfterDouble',
        'exeCode',
        {
          code: [createText('double(x) + 1')],
          params: [createVarRef('x')]
        },
        { language: 'js', parameterCount: 1 }
      ),
      env
    );

    const envDirective = {
      type: 'Directive',
      kind: 'exe',
      subtype: 'environment',
      nodeId: 'exe-env-js-shared',
      values: {
        identifier: [createVarRef('js')],
        environment: [createVarRef('double'), createVarRef('plusOneAfterDouble')]
      },
      raw: {},
      meta: {},
      location: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 }
      }
    } as DirectiveNode;

    await evaluateExe(envDirective, env);

    const shadowEnv = env.getShadowEnv('js');
    expect(shadowEnv?.has('double')).toBe(true);
    expect(shadowEnv?.has('plusOneAfterDouble')).toBe(true);

    const composed = shadowEnv?.get('plusOneAfterDouble');
    const value = await composed?.(3);
    expect(Number(value)).toBe(7);
  });

  it('keeps python environment declaration wiring stable for language-specific shadow registration', async () => {
    const env = createEnvironment();

    await evaluateExe(
      createDirective(
        'pyDouble',
        'exeCode',
        {
          code: [createText('return x * 2')],
          params: [createVarRef('x')]
        },
        { language: 'py', parameterCount: 1 }
      ),
      env
    );

    const envDirective = {
      type: 'Directive',
      kind: 'exe',
      subtype: 'environment',
      nodeId: 'exe-env-py',
      values: {
        identifier: [createVarRef('py')],
        environment: [createVarRef('pyDouble')]
      },
      raw: {},
      meta: {},
      location: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 }
      }
    } as DirectiveNode;

    await evaluateExe(envDirective, env);

    const shadowEnv = env.getShadowEnv('py');
    expect(shadowEnv?.has('pyDouble')).toBe(true);

    const pythonShadowEnv = env.getOrCreatePythonShadowEnv();
    expect(pythonShadowEnv.hasFunction('pyDouble')).toBe(true);
  });

  it('keeps exe block return behavior stable for function and nested block scopes', async () => {
    const env = createEnvironment();

    const blockNode: ExeBlockNode = {
      type: 'ExeBlock',
      nodeId: 'exec-block',
      values: {
        statements: [
          {
            type: 'ExeReturn',
            nodeId: 'exe-return',
            values: [createText('done')],
            meta: { hasValue: true }
          } as any
        ]
      },
      meta: {
        statementCount: 1,
        hasReturn: false
      }
    } as ExeBlockNode;

    const functionScopeResult = await evaluateExeBlock(blockNode, env, { input: 'x' }, { scope: 'function' });
    expect(functionScopeResult.value).toBe('done');

    env.pushExecutionContext('exe', { allowReturn: true, scope: 'function', hasFunctionBoundary: true });
    try {
      const nestedBlockResult = await evaluateExeBlock(blockNode, env, {}, { scope: 'block' });
      expect(isExeReturnControl(nestedBlockResult.value)).toBe(true);
      expect((nestedBlockResult.value as any).value).toBe('done');
    } finally {
      env.popExecutionContext('exe');
    }
  });
});
