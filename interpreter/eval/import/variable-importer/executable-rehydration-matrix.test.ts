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
    const outerEnv = importer.deserializeModuleEnv((restored as any).internal?.capturedModuleEnv, env);
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
    const moduleEnv = importer.deserializeModuleEnv((restored as any).internal?.capturedModuleEnv, env);
    const helper = moduleEnv.get('helper');

    expect(shadow?.js instanceof Map).toBe(true);
    expect(typeof shadow?.js.get('shadowHelper')).toBe('function');
    expect(moduleEnv instanceof Map).toBe(true);
    expect(moduleEnv.get('dep')?.value).toBe('dep-value');
    expect(helper.internal?.capturedModuleEnv).toBe(moduleEnv);
  });

  it('preserves nested helper captured envs when rehydrating an outer imported executable env', () => {
    const importer = createImporter();
    const env = createEnv();

    const restoredOuterEnv = importer.deserializeModuleEnv(
      {
        agentflowLike: {
          ...createExecutablePayload('outer'),
          internal: {
            capturedModuleEnv: {
              normalizeLoopState: {
                ...createExecutablePayload('inner')
              }
            }
          }
        },
        workspaceState: 'outer-state'
      },
      env
    );

    const restoredAgentflowLike = restoredOuterEnv.get('agentflowLike') as any;
    const restoredInnerEnv = restoredAgentflowLike.internal?.capturedModuleEnv as Map<string, any>;
    const restoredNormalize = restoredInnerEnv.get('normalizeLoopState');

    expect(restoredOuterEnv.get('workspaceState')?.value).toBe('outer-state');
    expect(restoredInnerEnv instanceof Map).toBe(true);
    expect(restoredInnerEnv).not.toBe(restoredOuterEnv);
    expect(restoredNormalize?.type).toBe('executable');
  });

  it('rehydrates repeated circular captured-env payloads without flattening them', () => {
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

    const restored = importer.createVariableFromValue('top', payload, '/project/module.mld', undefined, { env });
    const restoredCapturedEnv = importer.deserializeModuleEnv((restored as any).internal?.capturedModuleEnv, env);
    const restoredSelfExec = restoredCapturedEnv.get('selfExec') as any;
    const restoredNestedEnv = restoredSelfExec.internal?.capturedModuleEnv as Map<string, any>;

    expect(restoredNestedEnv instanceof Map).toBe(true);
    expect(restoredNestedEnv.get('selfExec')).toBeDefined();
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
    const restoredWithCapturedEnv = importer.deserializeModuleEnv(
      (restoredWith as any).internal?.capturedModuleEnv,
      env
    );
    expect(restoredWithCapturedEnv instanceof Map).toBe(true);
    expect(restoredWithCapturedEnv.get('dep')?.value).toBe('value');
    expect((restoredWithout as any).internal?.executableDef).toEqual((restoredWith as any).internal?.executableDef);
    expect((restoredWithout as any).paramNames).toEqual((restoredWith as any).paramNames);
  });

  it('preserves recursive labels for captured module executables during import rehydration', () => {
    const importer = createImporter();
    const env = createEnv();
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
    const capturedEnv = importer.deserializeModuleEnv((restored as any).internal?.capturedModuleEnv, env);
    const restoredFact = capturedEnv.get('fact');

    expect(capturedEnv instanceof Map).toBe(true);
    expect(restoredFact?.type).toBe('executable');
    expect(restoredFact?.mx?.labels).toEqual(expect.arrayContaining(['recursive']));
  });
});
