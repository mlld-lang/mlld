import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateVar } from '@interpreter/eval/var';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { ObjectReferenceResolver } from '@interpreter/eval/import/ObjectReferenceResolver';
import { VariableMetadataUtils } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { processPipeline } from '@interpreter/eval/pipeline/unified-processor';
import type { PipelineCommand } from '@core/types/run';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { evaluateShow } from '@interpreter/eval/show';
import { createSimpleTextVariable } from '@core/types/variable';

describe('Security metadata propagation', () => {
  it('attaches descriptors when evaluating /var directives', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const directive = parseSync('/var secret,untrusted @foo = "value"')[0] as DirectiveNode;

    await evaluateVar(directive, env);

    const variable = env.getVariable('foo');
    expect(variable?.metadata?.security).toBeDefined();
    expect(variable!.metadata!.security!.labels).toEqual(['secret', 'untrusted']);
  });

  it('restores serialized metadata during import reconstruction', () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const serialized = VariableMetadataUtils.serializeSecurityMetadata({
      security: makeSecurityDescriptor({ labels: ['pii'] })
    });

    const variable = importer.createVariableFromValue('foo', 'bar', '/module', undefined, {
      serializedMetadata: serialized,
      securityLabels: ['secret']
    });

    expect(variable.metadata?.security?.labels || []).toEqual(['secret']);
  });

  it('propagates descriptors through pipeline stages', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    const descriptor = makeSecurityDescriptor({ labels: ['secret'] });
    const variable = createSimpleTextVariable('input', '  hello  ', source, { security: descriptor });
    const pipelineStage: PipelineCommand = {
      rawIdentifier: '__identity__',
      identifier: [
        { type: 'VariableReference', valueType: 'varIdentifier', identifier: '__identity__' }
      ] as any,
      args: [],
      fields: [],
      rawArgs: []
    };

    const result = await processPipeline({
      value: variable,
      env,
      pipeline: [pipelineStage],
      identifier: 'input'
    });

    expect(result.metadata?.security?.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('wraps /show output and effects with capability metadata', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const handler = new TestEffectHandler();
    env.setEffectHandler(handler);

    const descriptor = makeSecurityDescriptor({ labels: ['secret'] });
    const templateSource = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    env.setVariable(
      'foo',
      createSimpleTextVariable('foo', 'value', templateSource, { security: descriptor })
    );

    const directive = parseSync('/show @foo')[0] as DirectiveNode;
    const result = await evaluateShow(directive, env);

    expect(result.value).toBeDefined();
    expect((result.value as any).metadata?.security?.labels).toEqual(expect.arrayContaining(['secret']));
    expect(handler.collected[0]?.capability?.security.labels).toEqual(expect.arrayContaining(['secret']));
  });

  it('serializes module export descriptors', () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const childEnv = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    childEnv.pushSecurityContext({
      descriptor: makeSecurityDescriptor({ labels: ['network'] }),
      kind: 'import'
    });

    const source = {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    } as const;
    const variable = createSimpleTextVariable('foo', 'bar', source, {
      security: makeSecurityDescriptor({ labels: ['secret'] })
    });
    const childVars = new Map<string, ReturnType<typeof createSimpleTextVariable>>([
      ['foo', variable]
    ]);

    const { moduleObject } = importer.processModuleExports(
      childVars,
      { frontmatter: null },
      undefined,
      null,
      childEnv
    );

    childEnv.popSecurityContext();

    const serialized = moduleObject.__metadata__?.foo?.security;
    expect(serialized?.labels).toEqual(expect.arrayContaining(['secret', 'network']));
  });
});
