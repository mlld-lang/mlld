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
import { buildPipelineStructuredValue } from '@interpreter/utils/pipeline-input';
import { makeSecurityDescriptor } from '@core/types/security';
import { createGuardInputHelper } from '@core/types/variable/ArrayHelpers';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

describe('variable .mx namespace', () => {
  it('exposes token metrics for simple text variables', async () => {
    const env = createEnv();
    const directive = parseSync('/var @foo = "hello world"')[0] as DirectiveNode;
    await evaluateDirective(directive, env);

    const foo = env.getVariable('foo');
    expect(foo).toBeDefined();
    expect(foo?.mx?.tokest).toBeGreaterThan(0);
    expect(foo?.mx?.tokens).toBe(foo?.mx?.tokest);
    expect(foo?.mx?.length).toBe(11);
  });

  it('attaches metrics to pipeline input variables', () => {
    const source = VariableMetadataUtils.createSource('template', false, false);
    const pipelineValue = buildPipelineStructuredValue('{"foo":"bar"}', 'json');
    const variable = createPipelineInputVariable(
      'input',
      pipelineValue,
      'json',
      '{"foo":"bar"}',
      source,
      1
    );

    expect(variable.mx?.tokest).toBeGreaterThan(0);
  });

  it('preserves mx on derived variables', () => {
    const source = VariableMetadataUtils.createSource('array', false, false);
    const arrVar = createArrayVariable('items', ['alpha', 'beta'], false, source);
    const textVar = createSimpleTextVariable('message', 'alpha beta', source);

    expect(arrVar.mx).toBeDefined();
    expect(textVar.mx?.length).toBe(10);
  });
});

describe('guard input helper', () => {
  it('aggregates labels and tokens across inputs', () => {
    const source = VariableMetadataUtils.createSource('quoted', false, false);
    const secretVar = createSimpleTextVariable('a', 'secret text', source, {
      security: makeSecurityDescriptor({ labels: ['secret'] })
    });
    const piiVar = createSimpleTextVariable('b', 'pii text', source, {
      security: makeSecurityDescriptor({ labels: ['pii'] })
    });

    const helper = createGuardInputHelper([secretVar, piiVar]);
    expect(helper.mx.labels).toEqual(['secret', 'pii']);
    expect(helper.totalTokens()).toBeGreaterThan(0);
    expect(helper.any.mx.labels.includes('secret')).toBe(true);
    expect(helper.all.mx.labels.includes('secret')).toBe(false);
    expect(helper.none.mx.labels.includes('public')).toBe(true);
    expect(helper.any.text.includes('secret')).toBe(true);
    expect(helper.all.text.includes('text')).toBe(true);
    expect(helper.none.text.includes('<script')).toBe(true);
  });

  it('prefers exact token counts when available', () => {
    const source = VariableMetadataUtils.createSource('quoted', false, false);
    const variable = createSimpleTextVariable('exact', '12345', source);
    VariableMetadataUtils.assignMetrics(variable, {
      length: 5,
      tokest: 5,
      tokens: 3,
      source: 'exact'
    });

    const helper = createGuardInputHelper([variable]);
    expect(helper.mx.tokens[0]).toBe(3);
    expect(helper.totalTokens()).toBe(3);
    expect(helper.maxTokens()).toBe(3);
  });
});
