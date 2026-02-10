import { describe, expect, it, vi } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import {
  executeCommandVariable,
  resolveCommandReference
} from '../command-execution';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

async function evaluateSource(source: string, env: Environment): Promise<void> {
  const { ast } = await parse(source);
  await evaluate(ast, env);
}

function getExecutableVariable(env: Environment, name: string): any {
  const variable = env.getVariable(name);
  expect(variable).toBeTruthy();
  expect(variable?.type).toBe('executable');
  return variable as any;
}

function setPipelineContext(env: Environment): void {
  env.setPipelineContext({
    stage: 1,
    totalStages: 1,
    currentCommand: 'stage',
    input: 'seed',
    previousOutputs: [],
    attemptCount: 1,
    attemptHistory: [],
    hint: null,
    hintHistory: [],
    sourceRetryable: true,
    guards: []
  });
}

async function runCommand(
  commandVar: any,
  args: any[],
  env: Environment,
  stdinInput?: string
) {
  return AutoUnwrapManager.executeWithPreservation(() =>
    executeCommandVariable(commandVar, args, env, stdinInput)
  );
}

function registerProvider(env: Environment): string {
  const providerRef = '@mock/provider-contracts';
  const moduleSource = `
/exe @create(opts) = node {
  return { envName: opts?.name || 'env-default' };
}

/exe @execute(envName, command) = node {
  return {
    stdout: 'provider:' + String(envName) + ':' + (command?.argv || []).join(' '),
    stderr: '',
    exitCode: 0
  };
}

/exe @release(envName) = node {
  return '';
}

/export { @create, @execute, @release }
`;
  env.registerDynamicModules({ [providerRef]: moduleSource }, { source: 'test' });
  return providerRef;
}

describe('command-execution contracts', () => {
  it('keeps public entrypoint signatures stable', () => {
    expect(typeof resolveCommandReference).toBe('function');
    expect(typeof executeCommandVariable).toBe('function');
    expect(resolveCommandReference.length).toBe(2);
    expect(executeCommandVariable.length).toBe(6);
  });

  it('keeps parity behavior across command/provider/code/node/template/ref branches', async () => {
    const commandEnv = createEnv();
    await evaluateSource('/exe @run(input) = cmd { printf "%s" "@input" }', commandEnv);
    setPipelineContext(commandEnv);
    vi.spyOn(commandEnv, 'executeCommand').mockResolvedValue('cmd:PIPE');
    const commandResult = await runCommand(getExecutableVariable(commandEnv, 'run'), [], commandEnv, 'PIPE');
    expect(asText(commandResult as any)).toContain('cmd:PIPE');

    const providerEnv = createEnv();
    await evaluateSource('/exe @run(input) = cmd { printf "%s" "@input" }', providerEnv);
    setPipelineContext(providerEnv);
    providerEnv.setScopedEnvironmentConfig({
      provider: registerProvider(providerEnv),
      name: 'suite-env'
    });
    const providerResult = await runCommand(getExecutableVariable(providerEnv, 'run'), [], providerEnv, 'PIPE');
    expect(asText(providerResult as any)).toContain('provider:suite-env:sh -lc');

    const codeEnv = createEnv();
    await evaluateSource('/exe @run(input) = js { return "code:" + input }', codeEnv);
    setPipelineContext(codeEnv);
    const codeResult = await runCommand(getExecutableVariable(codeEnv, 'run'), [], codeEnv, 'PIPE');
    expect(asText(codeResult as any)).toBe('code:PIPE');
    expect(isStructuredValue(codeResult)).toBe(true);

    const nodeEnv = createEnv();
    setPipelineContext(nodeEnv);
    const nodeResult = await runCommand(
      {
        type: 'executable',
        name: 'nodeRun',
        value: { type: 'code', template: '' },
        paramNames: ['input'],
        internal: {
          executableDef: {
            type: 'nodeFunction',
            fn: (input: unknown) => ({ source: 'node', input }),
            paramNames: ['input'],
            sourceDirective: 'exec'
          }
        }
      },
      [],
      nodeEnv,
      'PIPE'
    );
    expect(isStructuredValue(nodeResult)).toBe(true);
    expect((nodeResult as any).data).toMatchObject({ source: 'node', input: 'PIPE' });

    const templateEnv = createEnv();
    setPipelineContext(templateEnv);
    const templateResult = await runCommand(
      {
        type: 'executable',
        name: 'templateRun',
        value: { type: 'data', template: '' },
        paramNames: ['input'],
        internal: {
          executableDef: {
            type: 'template',
            paramNames: ['input'],
            template: [
              { type: 'Text', content: 'template:' },
              { type: 'VariableReference', identifier: 'input', fields: [] }
            ]
          }
        }
      },
      [],
      templateEnv,
      'PIPE'
    );
    expect(templateResult).toBe('template:PIPE');

    const refEnv = createEnv();
    setPipelineContext(refEnv);
    const inner = {
      type: 'executable',
      name: 'innerExec',
      value: { type: 'data', template: '' },
      paramNames: ['input'],
      internal: {
        executableDef: {
          type: 'template',
          paramNames: ['input'],
          template: [
            { type: 'Text', content: 'inner:' },
            { type: 'VariableReference', identifier: 'input', fields: [] }
          ]
        }
      }
    };
    refEnv.setVariable('innerExec', inner as any);
    const refResult = await runCommand(
      {
        type: 'executable',
        name: 'outerExec',
        value: { type: 'data', template: '' },
        paramNames: ['input'],
        internal: {
          executableDef: {
            type: 'commandRef',
            commandRef: 'innerExec',
            commandArgs: []
          }
        }
      },
      [],
      refEnv,
      'PIPE'
    );
    expect(refResult).toBe('inner:PIPE');
  });
});
