import { describe, it, expect } from 'vitest';
import { ObjectReferenceResolver } from '@interpreter/eval/import/ObjectReferenceResolver';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import {
  createExecutableVariable,
  createObjectVariable,
  createSimpleTextVariable
} from '@core/types/variable';
import type { VariableSource } from '@core/types/variable';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv
} from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';

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

  it('preserves imported executable captured envs inside exported wrapper objects', () => {
    const resolver = new ObjectReferenceResolver();

    const helper = createExecutableVariable('helper', 'command', 'echo helper', [], 'sh', source);
    const importedFn = createExecutableVariable('fn', 'command', 'echo fn', [], 'sh', source, {
      metadata: {
        isImported: true,
        importPath: '/project/checkfix.mld'
      }
    });
    const wrapper = createExecutableVariable('wrapper', 'command', 'echo wrapper', [], 'sh', source);

    const fnModuleEnv = new Map<string, any>([['helper', helper]]);
    sealCapturedModuleEnv(importedFn.internal, fnModuleEnv);

    const wrapperModuleEnv = new Map<string, any>([
      ['fn', importedFn],
      ['wrapper', wrapper]
    ]);
    sealCapturedModuleEnv(wrapper.internal, wrapperModuleEnv);

    const result = resolver.resolveObjectReferences(
      { run: '@wrapper' },
      new Map<string, any>([['wrapper', wrapper]])
    );

    const serializedWrapper = result.run as { internal?: Record<string, unknown> };
    const serializedWrapperEnv = getCapturedModuleEnv(serializedWrapper.internal) as Record<string, any>;
    const serializedFn = serializedWrapperEnv.fn as { internal?: Record<string, unknown> };
    const serializedFnEnv = getCapturedModuleEnv(serializedFn.internal) as Record<string, any>;

    expect(serializedWrapperEnv.fn?.__executable).toBe(true);
    expect(serializedFnEnv.helper?.__executable).toBe(true);
  });

  it('shares one serialized captured env across executable references in arrays', () => {
    const resolver = new ObjectReferenceResolver();

    const helper = createSimpleTextVariable('helper', 'ok', source);
    const t1 = createExecutableVariable('t1', 'command', 'echo 1', [], 'sh', source);
    const t2 = createExecutableVariable('t2', 'command', 'echo 2', [], 'sh', source);
    const t3 = createExecutableVariable('t3', 'command', 'echo 3', [], 'sh', source);
    const sharedModuleEnv = new Map<string, any>([
      ['helper', helper],
      ['t1', t1],
      ['t2', t2],
      ['t3', t3]
    ]);

    for (const executable of [t1, t2, t3]) {
      sealCapturedModuleEnv(executable.internal, sharedModuleEnv);
    }

    const result = resolver.resolveObjectReferences(
      ['@t1', '@t2', '@t3'],
      new Map<string, any>([
        ['t1', t1],
        ['t2', t2],
        ['t3', t3]
      ])
    ) as Array<{ internal?: Record<string, unknown> }>;

    const env1 = getCapturedModuleEnv(result[0].internal);
    const env2 = getCapturedModuleEnv(result[1].internal);
    const env3 = getCapturedModuleEnv(result[2].internal);

    expect(env1).toBeDefined();
    expect(env1).toBe(env2);
    expect(env1).toBe(env3);
    expect((env1 as Record<string, unknown>).helper).toBe('ok');
  });
});
