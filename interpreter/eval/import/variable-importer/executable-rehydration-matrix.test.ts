import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ObjectReferenceResolver } from '../ObjectReferenceResolver';
import { VariableImporter } from '../VariableImporter';
import { createExecutableVariable } from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable';
import { PythonPackageManagerFactory } from '@core/registry/python/PythonPackageManager';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

function createImporter(): VariableImporter {
  return new VariableImporter(new ObjectReferenceResolver());
}

const SOURCE = {
  directive: 'var' as const,
  syntax: 'literal' as const,
  hasInterpolation: false,
  isMultiLine: false
};

const FAKE_PYTHON_MANAGER = {
  name: 'pip',
  isAvailable: async () => true,
  install: async () => ({ package: 'stub', status: 'already-installed' as const }),
  list: async () => [],
  checkAvailable: async () => true,
  getDependencies: async () => ({}),
  resolveVersion: async (spec: string) => ({
    name: spec,
    version: '0.0.0',
    requires: []
  })
};

function createExecutablePayload(template: string) {
  return {
    __executable: true,
    value: { type: 'command', template, language: 'sh' },
    executableDef: {
      type: 'command',
      template,
      language: 'sh',
      paramNames: ['name']
    },
    internal: {}
  };
}

describe('Executable rehydration matrix', () => {
  beforeEach(() => {
    PythonPackageManagerFactory.reset();
    vi.spyOn(PythonPackageManagerFactory, 'getDefault').mockResolvedValue(FAKE_PYTHON_MANAGER as any);
  });

  afterEach(() => {
    PythonPackageManagerFactory.reset();
    vi.restoreAllMocks();
  });

  it('keeps nested captured-env stack restoration order stable', () => {
    const importer = createImporter();
    const env = createEnv();
    const payload = createExecutablePayload('top');
    (payload as any).internal = {
      capturedModuleEnv: {
        helper: {
          ...createExecutablePayload('helper'),
          internal: {
            capturedModuleEnv: {
              leaf: 'inner-value'
            }
          }
        },
        shared: 'outer-value'
      }
    };

    const restored = importer.createVariableFromValue('top', payload, '/project/module.mld', undefined, { env });
    const outerEnv = (restored as any).internal?.capturedModuleEnv as Map<string, any>;
    const helper = outerEnv.get('helper');
    const nestedEnv = helper.internal?.capturedModuleEnv as Map<string, any>;

    expect(outerEnv instanceof Map).toBe(true);
    expect(helper.type).toBe('executable');
    expect(nestedEnv instanceof Map).toBe(true);
    expect(nestedEnv).not.toBe(outerEnv);
    expect(nestedEnv.get('leaf')?.value).toBe('inner-value');
    expect(outerEnv.get('shared')?.value).toBe('outer-value');
  });

  it('keeps mixed shadow-env and module-env recovery scope chain behavior stable', () => {
    const importer = createImporter();
    const env = createEnv();
    const payload = createExecutablePayload('top');
    (payload as any).internal = {
      capturedShadowEnvs: {
        js: {
          shadowHelper: () => 'ok'
        }
      },
      capturedModuleEnv: {
        dep: 'dep-value',
        helper: {
          ...createExecutablePayload('helper'),
          internal: {}
        }
      }
    };

    const restored = importer.createVariableFromValue('top', payload, '/project/module.mld', undefined, { env });
    const shadow = (restored as any).internal?.capturedShadowEnvs;
    const moduleEnv = (restored as any).internal?.capturedModuleEnv as Map<string, any>;
    const helper = moduleEnv.get('helper');

    expect(shadow?.js instanceof Map).toBe(true);
    expect(typeof shadow?.js.get('shadowHelper')).toBe('function');
    expect(moduleEnv instanceof Map).toBe(true);
    expect(moduleEnv.get('dep')?.value).toBe('dep-value');
    expect(helper.internal?.capturedModuleEnv).toBe(moduleEnv);
  });

  it('keeps circular captured-env guardrail failure behavior stable', () => {
    const importer = createImporter();
    const env = createEnv();
    const circularEnv: Record<string, any> = {};
    circularEnv.selfExec = {
      ...createExecutablePayload('self'),
      internal: {
        capturedModuleEnv: circularEnv
      }
    };
    const payload = createExecutablePayload('top');
    (payload as any).internal = {
      capturedModuleEnv: circularEnv
    };

    expect(() =>
      importer.createVariableFromValue('top', payload, '/project/module.mld', undefined, { env })
    ).toThrow(/Maximum call stack size exceeded|call stack|applySecurityMetadata/i);
  });

  it('keeps executable import baseline behavior stable with and without captured env', () => {
    const importer = createImporter();
    const env = createEnv();
    const withoutCaptured = createExecutablePayload('baseline');
    const withCaptured = createExecutablePayload('baseline');
    (withCaptured as any).internal = {
      capturedModuleEnv: {
        dep: 'value'
      }
    };

    const restoredWithout = importer.createVariableFromValue(
      'run',
      withoutCaptured,
      '/project/module.mld',
      undefined,
      { env }
    );
    const restoredWith = importer.createVariableFromValue(
      'run',
      withCaptured,
      '/project/module.mld',
      undefined,
      { env }
    );

    expect(restoredWithout.type).toBe('executable');
    expect(restoredWith.type).toBe('executable');
    expect((restoredWithout as any).internal?.capturedModuleEnv).toBeUndefined();
    expect((restoredWith as any).internal?.capturedModuleEnv instanceof Map).toBe(true);
    expect((restoredWithout as any).internal?.executableDef).toEqual((restoredWith as any).internal?.executableDef);
    expect((restoredWithout as any).paramNames).toEqual((restoredWith as any).paramNames);
  });

  it('preserves recursive labels for captured module executables during import rehydration', () => {
    const importer = createImporter();
    const childVars = new Map<string, any>();
    childVars.set(
      'fact',
      createExecutableVariable('fact', 'command', '', ['n'], 'sh', SOURCE, {
        metadata: VariableMetadataUtils.applySecurityMetadata(undefined, {
          labels: ['recursive']
        })
      })
    );
    childVars.set(
      'wrapper',
      createExecutableVariable('wrapper', 'command', '', ['n'], 'sh', SOURCE)
    );

    const { moduleObject } = importer.processModuleExports(childVars, {}, false, null);
    const restored = importer.createVariableFromValue('wrapper', moduleObject.wrapper, '/project/module.mld');
    const capturedEnv = (restored as any).internal?.capturedModuleEnv as Map<string, any>;
    const restoredFact = capturedEnv.get('fact');

    expect(capturedEnv instanceof Map).toBe(true);
    expect(restoredFact?.type).toBe('executable');
    expect(restoredFact?.mx?.labels).toEqual(expect.arrayContaining(['recursive']));
  });
});
