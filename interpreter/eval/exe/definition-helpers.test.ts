import { describe, expect, it, vi } from 'vitest';
import * as parser from '@grammar/parser';
import { createSimpleTextVariable } from '@core/types/variable';
import { Environment } from '@interpreter/env/Environment';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import {
  extractParamNames,
  extractParamTypes,
  interpolateAndRecord,
  isLoopControlValue,
  parseTemplateFileNodes,
  resolveExeDescription
} from './definition-helpers';

function createEnvironment(projectRoot = '/'): { env: Environment; fileSystem: MemoryFileSystem } {
  const fileSystem = new MemoryFileSystem();
  const env = new Environment(fileSystem, new PathService(), projectRoot);
  return { env, fileSystem };
}

function createTextNode(content: string): any {
  return {
    type: 'Text',
    nodeId: `text-${content.replace(/\W+/g, '-') || 'node'}`,
    content
  };
}

function createVarRef(identifier: string): any {
  return {
    type: 'VariableReference',
    nodeId: `ref-${identifier}`,
    identifier
  };
}

const textSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
} as const;

describe('exe definition helpers', () => {
  it('keeps parameter-name extraction stable across mixed parameter node shapes', () => {
    const names = extractParamNames([
      'inline',
      { type: 'VariableReference', identifier: 'fromRef' },
      { type: 'Parameter', name: 'typed' },
      { type: 'VariableReference', identifier: 42 },
      { type: 'Parameter', name: '' },
      { type: 'Parameter', name: 7 },
      { type: 'Unknown', value: 'skip' },
      null
    ]);

    expect(names).toEqual(['inline', 'fromRef', 'typed']);
  });

  it('keeps parameter-type extraction stable and ignores invalid typed nodes', () => {
    const types = extractParamTypes([
      { type: 'Parameter', name: 'count', paramType: 'number' },
      { type: 'Parameter', name: 'title', paramType: 'string' },
      { type: 'Parameter', name: 'skipEmpty', paramType: '' },
      { type: 'Parameter', name: 'skipType', paramType: 42 },
      { type: 'Parameter', name: 99, paramType: 'boolean' },
      { type: 'VariableReference', identifier: 'ignored' },
      { type: 'Parameter', name: 'count', paramType: 'integer' }
    ]);

    expect(types).toEqual({
      count: 'integer',
      title: 'string'
    });
  });

  it('keeps description resolution stable for literal and interpolation-backed values', async () => {
    const { env } = createEnvironment();
    env.setVariable('topic', createSimpleTextVariable('topic', 'security', textSource));

    await expect(resolveExeDescription('literal description', env)).resolves.toBe('literal description');
    await expect(
      resolveExeDescription(
        {
          needsInterpolation: true,
          parts: [createTextNode('about '), createVarRef('topic')]
        },
        env
      )
    ).resolves.toBe('about security');
    await expect(resolveExeDescription({ unsupported: true }, env)).resolves.toBeUndefined();
  });

  it('keeps interpolation recording stable and records descriptors when present', async () => {
    const { env } = createEnvironment();
    env.setVariable(
      'secretValue',
      createSimpleTextVariable('secretValue', 'redacted', textSource, {
        mx: {
          labels: ['secret'],
          taint: ['secret'],
          sources: ['src:test'],
          policy: null
        }
      })
    );

    const recordSpy = vi.spyOn(env, 'recordSecurityDescriptor');
    const text = await interpolateAndRecord([createVarRef('secretValue')], env);

    expect(text).toBe('redacted');
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps loop-control detection stable for raw and structured retry/done/continue values', () => {
    expect(isLoopControlValue('done')).toBe(true);
    expect(isLoopControlValue('continue')).toBe(true);
    expect(isLoopControlValue('retry')).toBe(true);
    expect(isLoopControlValue({ __whileControl: true })).toBe(true);
    expect(isLoopControlValue({ type: 'Literal', value: 'done', valueType: 'done' })).toBe(true);
    expect(
      isLoopControlValue(
        wrapStructured({ valueType: 'retry' }, 'object', JSON.stringify({ valueType: 'retry' }))
      )
    ).toBe(true);
    expect(isLoopControlValue('not-control')).toBe(false);
  });

  it('keeps template-file parsing fallback behavior stable when parser start rules throw', async () => {
    const { env, fileSystem } = createEnvironment();
    await fileSystem.writeFile('/fallback.mtt', 'Hello {{ name }}!');

    const parseSpy = vi.spyOn(parser, 'parseSync').mockImplementation(() => {
      throw new Error('missing start rule');
    });

    try {
      const nodes = await parseTemplateFileNodes([createTextNode('fallback.mtt')], env);
      expect(nodes).toEqual([
        { type: 'Text', content: 'Hello ' },
        { type: 'VariableReference', identifier: 'name' },
        { type: 'Text', content: '!' }
      ]);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('keeps template-file extension validation stable', async () => {
    const { env } = createEnvironment();

    await expect(parseTemplateFileNodes([createTextNode('notes.txt')], env)).rejects.toThrow(
      'Unsupported template file extension for notes.txt. Use .att (@var) or .mtt ({{var}}).'
    );
  });
});
