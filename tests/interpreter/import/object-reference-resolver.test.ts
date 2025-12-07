import { describe, it, expect } from 'vitest';
import { ObjectReferenceResolver } from '@interpreter/eval/import/ObjectReferenceResolver';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { createObjectVariable, createSimpleTextVariable } from '@core/types/variable';
import type { VariableSource } from '@core/types/variable';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

const source: VariableSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
};

describe('ObjectReferenceResolver string resolution', () => {
  it('resolves exact @identifier strings when a matching variable exists', () => {
    const resolver = new ObjectReferenceResolver();
    const vars = new Map<string, any>([
      ['foo', createSimpleTextVariable('foo', 'bar', source)]
    ]);

    const result = resolver.resolveObjectReferences('@foo', vars);

    expect(result).toBe('bar');
  });

  it('keeps strings with extra characters literal', () => {
    const resolver = new ObjectReferenceResolver();
    const vars = new Map<string, any>([
      ['foo', createSimpleTextVariable('foo', 'bar', source)]
    ]);

    const result = resolver.resolveObjectReferences('@foo hi', vars);

    expect(result).toBe('@foo hi');
  });

  it('treats missing @identifiers as literal strings instead of throwing', () => {
    const resolver = new ObjectReferenceResolver();
    const vars = new Map<string, any>();

    const result = resolver.resolveObjectReferences('@missing', vars);

    expect(result).toBe('@missing');
  });

  it('respects resolveStrings=false to keep strings literal even when variables exist', () => {
    const resolver = new ObjectReferenceResolver();
    const vars = new Map<string, any>([
      ['foo', createSimpleTextVariable('foo', 'bar', source)]
    ]);

    const result = resolver.resolveObjectReferences('@foo', vars, { resolveStrings: false });

    expect(result).toBe('@foo');
  });

  it('skips string-to-var resolution for module exports when disabled', () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const childEnv = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const childVars = new Map<string, any>([
      ['foo', createSimpleTextVariable('foo', 'bar', source)],
      ['obj', createObjectVariable('obj', { msg: '@foo' }, false, source)]
    ]);

    const { moduleObject } = importer.processModuleExports(
      childVars,
      { frontmatter: null },
      undefined,
      null,
      childEnv,
      { resolveStrings: false }
    );

    expect(moduleObject.obj.msg).toBe('@foo');
  });
});
