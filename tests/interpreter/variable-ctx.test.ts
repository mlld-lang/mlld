import { describe, it, expect } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { evaluateDirective } from '@interpreter/eval/directive';
import {
  createPipelineInputVariable,
  createSimpleTextVariable,
  createArrayVariable
} from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable/VariableMetadata';
import { createPipelineInput } from '@interpreter/utils/pipeline-input';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('variable .ctx namespace', () => {
  it('exposes token metrics for simple text variables', async () => {
    const env = createEnv();
    const directive = parseSync('/var @foo = "hello world"')[0] as DirectiveNode;
    await evaluateDirective(directive, env);

    const foo = env.getVariable('foo');
    expect(foo).toBeDefined();
    expect(foo?.metadata?.metrics?.tokest).toBeGreaterThan(0);
    expect(foo?.ctx?.tokest).toBeGreaterThan(0);
    expect(foo?.ctx?.length).toBe(11);
  });

  it('attaches metrics to pipeline input variables', () => {
    const source = VariableMetadataUtils.createSource('template', false, false);
    const pipelineValue = createPipelineInput('{"foo":"bar"}', 'json');
    const variable = createPipelineInputVariable(
      'input',
      pipelineValue,
      'json',
      '{"foo":"bar"}',
      source,
      1
    );

    expect(variable.metadata?.metrics?.tokest).toBeGreaterThan(0);
    expect(variable.ctx?.tokest).toBeGreaterThan(0);
  });

  it('preserves ctx on derived variables', () => {
    const source = VariableMetadataUtils.createSource('array', false, false);
    const arrVar = createArrayVariable('items', ['alpha', 'beta'], false, source);
    const textVar = createSimpleTextVariable('message', 'alpha beta', source);

    expect(arrVar.ctx).toBeDefined();
    expect(textVar.ctx?.length).toBe(10);
  });
});
