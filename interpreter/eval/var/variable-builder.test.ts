import { describe, expect, it, vi } from 'vitest';
import type { DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import { createSimpleTextVariable } from '@core/types/variable';
import { createVariableBuilder } from './variable-builder';

const baseSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
} as const;

function createDirective(meta: Record<string, unknown> = {}): DirectiveNode {
  return {
    type: 'Directive',
    kind: 'var',
    location: {
      filePath: '/test/module.mld'
    },
    meta
  } as unknown as DirectiveNode;
}

function descriptor(labels: string[]): SecurityDescriptor {
  return {
    labels,
    taint: labels,
    sources: []
  };
}

describe('variable builder', () => {
  it('preserves existing Variable wrappers while updating assignment identity', async () => {
    const original = createSimpleTextVariable('source', 'hello', baseSource);
    original.mx = {
      labels: ['origin'],
      taint: ['origin'],
      sources: []
    };

    const builder = createVariableBuilder({
      directive: createDirective(),
      extractSecurityFromValue: value => (value === original ? descriptor(['origin']) : undefined),
      identifier: 'copied',
      interpolateWithSecurity: vi.fn().mockResolvedValue('unused'),
      location: { filePath: '/test/module.mld' },
      resolvedValueDescriptor: descriptor(['resolved']),
      securityLabels: ['assigned'],
      source: baseSource,
      valueNode: { type: 'VariableReference', identifier: 'source' }
    });

    const result = await builder.build({ resolvedValue: original });

    expect(result.name).toBe('copied');
    expect(result.type).toBe('simple-text');
    expect(result.mx?.definedAt).toEqual({ filePath: '/test/module.mld' });
    expect(result.mx?.labels).toEqual(expect.arrayContaining(['assigned']));
  });

  it('preserves triple-colon template AST values', async () => {
    const templateAst = [{ type: 'Text', content: 'Hello {{name}}' }];

    const builder = createVariableBuilder({
      directive: createDirective({
        wrapperType: 'tripleColon',
        isTemplateContent: true
      }),
      extractSecurityFromValue: () => undefined,
      identifier: 'template',
      interpolateWithSecurity: vi.fn().mockResolvedValue('unused'),
      location: { filePath: '/test/module.mld' },
      resolvedValueDescriptor: descriptor(['template']),
      securityLabels: ['template'],
      source: {
        ...baseSource,
        syntax: 'template',
        wrapperType: 'tripleColon'
      },
      valueNode: templateAst
    });

    const result = await builder.build({ resolvedValue: templateAst });

    expect(result.type).toBe('template');
    expect(result.value).toBe(templateAst);
  });

  it('marks command/code/exec values as retryable with sourceFunction metadata', async () => {
    const commandNode = {
      type: 'command',
      command: 'echo hello'
    };

    const builder = createVariableBuilder({
      directive: createDirective(),
      extractSecurityFromValue: () => undefined,
      identifier: 'output',
      interpolateWithSecurity: vi.fn().mockResolvedValue('unused'),
      location: { filePath: '/test/module.mld' },
      resolvedValueDescriptor: descriptor(['cmd']),
      securityLabels: ['cmd'],
      source: {
        ...baseSource,
        syntax: 'command'
      },
      valueNode: commandNode
    });

    const result = await builder.build({ resolvedValue: 'hello' });

    expect(result.internal?.isRetryable).toBe(true);
    expect(result.internal?.sourceFunction).toBe(commandNode);
  });

  it('attaches tool collection metadata for object strategies', async () => {
    const toolCollection = {
      build: { mlld: 'build-tool' }
    };

    const builder = createVariableBuilder({
      directive: createDirective(),
      extractSecurityFromValue: () => undefined,
      identifier: 'tools',
      interpolateWithSecurity: vi.fn().mockResolvedValue('unused'),
      location: { filePath: '/test/module.mld' },
      resolvedValueDescriptor: descriptor(['tools']),
      securityLabels: ['tools'],
      source: {
        ...baseSource,
        syntax: 'object'
      },
      valueNode: {
        type: 'object',
        entries: [{ type: 'pair', key: 'build', value: { type: 'Literal', value: true } }]
      }
    });

    const result = await builder.build({
      resolvedValue: { build: true },
      toolCollection: toolCollection as any
    });

    expect(result.type).toBe('object');
    expect(result.internal?.isToolsCollection).toBe(true);
    expect(result.internal?.toolCollection).toEqual(toolCollection);
  });
});
