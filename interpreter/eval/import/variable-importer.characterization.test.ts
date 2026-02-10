import { describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { VariableImporter } from './VariableImporter';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import {
  createExecutableVariable,
  createSimpleTextVariable,
  isExecutableVariable
} from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { VariableMetadataUtils } from '@core/types/variable';

const SOURCE = {
  directive: 'var' as const,
  syntax: 'literal' as const,
  hasInterpolation: false,
  isMultiLine: false
};

const LOCATION = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 }
};

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

function createDirective(
  subtype: 'importSelected' | 'importNamespace' | 'importPolicy',
  values: any,
  rawPath = '"./module.mld"'
): any {
  return {
    subtype,
    values,
    raw: { path: rawPath },
    location: LOCATION,
    meta: {}
  };
}

describe('VariableImporter characterization', () => {
  it('keeps selected import behavior stable for binding source and metadata propagation', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const targetEnv = createEnv();
    const childEnv = targetEnv.createChild('/project/module.mld');
    childEnv.setCurrentFilePath('/project/module.mld');
    const serializedMetadata = VariableMetadataUtils.serializeSecurityMetadata({
      security: makeSecurityDescriptor({ labels: ['sensitive'] })
    });
    const directive = createDirective('importSelected', {
      imports: [{ identifier: 'value', location: LOCATION }]
    });

    await importer.importVariables(
      {
        moduleObject: {
          value: 'hello',
          __metadata__: {
            value: serializedMetadata
          }
        },
        frontmatter: null,
        childEnvironment: childEnv,
        guardDefinitions: []
      },
      directive,
      targetEnv
    );

    expect(targetEnv.getVariable('value')?.value).toBe('hello');
    expect(targetEnv.getImportBinding('value')?.source).toBe('./module.mld');
    expect(targetEnv.getVariable('value')?.mx?.labels).toEqual(
      expect.arrayContaining(['sensitive'])
    );
  });

  it('keeps namespace import behavior stable for object creation and import binding', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const targetEnv = createEnv();
    const childEnv = targetEnv.createChild('/project/module.mld');
    childEnv.setCurrentFilePath('/project/module.mld');
    const directive = createDirective('importNamespace', {
      namespace: [{ identifier: 'mod', location: LOCATION }]
    });

    await importer.importVariables(
      {
        moduleObject: { value: 'hello' },
        frontmatter: null,
        childEnvironment: childEnv,
        guardDefinitions: []
      },
      directive,
      targetEnv
    );

    expect(targetEnv.getVariable('mod')?.type).toBe('object');
    expect((targetEnv.getVariable('mod')?.value as any).value).toBe('hello');
    expect(targetEnv.getImportBinding('mod')?.source).toBe('./module.mld');
  });

  it('keeps namespace aliasing behavior stable for content-based namespace nodes', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const targetEnv = createEnv();
    const childEnv = targetEnv.createChild('/project/module.mld');
    childEnv.setCurrentFilePath('/project/module.mld');
    const directive = createDirective('importNamespace', {
      namespace: [{ content: 'config', location: LOCATION }]
    });

    await importer.importVariables(
      {
        moduleObject: { value: 'hello' },
        frontmatter: null,
        childEnvironment: childEnv,
        guardDefinitions: []
      },
      directive,
      targetEnv
    );

    expect(targetEnv.getVariable('config')?.type).toBe('object');
    expect((targetEnv.getVariable('config')?.value as any).value).toBe('hello');
    expect(targetEnv.getImportBinding('config')?.source).toBe('./module.mld');
  });

  it('keeps import binding collision behavior stable for selected imports', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const targetEnv = createEnv();
    const childEnv = targetEnv.createChild('/project/module.mld');
    childEnv.setCurrentFilePath('/project/module.mld');
    targetEnv.setImportBinding('value', {
      source: './existing.mld',
      location: { filePath: '/project/main.mld', line: 1, column: 1 }
    });
    const directive = createDirective('importSelected', {
      imports: [{ identifier: 'value', location: LOCATION }]
    });

    await expect(
      importer.importVariables(
        {
          moduleObject: { value: 'hello' },
          frontmatter: null,
          childEnvironment: childEnv,
          guardDefinitions: []
        },
        directive,
        targetEnv
      )
    ).rejects.toMatchObject({
      code: 'IMPORT_NAME_CONFLICT',
      details: {
        variableName: 'value'
      }
    });
  });

  it('keeps @payload/@state missing-field behavior stable for selected imports', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const cases = [
      { rawPath: '@payload', name: 'topic' },
      { rawPath: '@state', name: 'count' }
    ];

    for (const testCase of cases) {
      const targetEnv = createEnv();
      const childEnv = targetEnv.createChild('/project/dynamic.mld');
      childEnv.setCurrentFilePath('/project/dynamic.mld');
      const directive = createDirective(
        'importSelected',
        {
          imports: [{ identifier: testCase.name, location: LOCATION }]
        },
        testCase.rawPath
      );

      await importer.importVariables(
        {
          moduleObject: {},
          frontmatter: null,
          childEnvironment: childEnv,
          guardDefinitions: []
        },
        directive,
        targetEnv
      );

      expect(targetEnv.getVariable(testCase.name)?.value).toBeNull();
      expect(targetEnv.getImportBinding(testCase.name)?.source).toBe(testCase.rawPath);
    }
  });

  it('keeps executable export serialization and rehydration behavior stable', () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const childVars = new Map();
    childVars.set('dep', createSimpleTextVariable('dep', 'ok', SOURCE));
    childVars.set(
      'run',
      createExecutableVariable('run', 'command', 'echo hi', [], 'sh', SOURCE, {
        internal: {
          capturedShadowEnvs: {
            js: new Map([['helper', () => 'ok']])
          },
          capturedModuleEnv: new Map([['dep', createSimpleTextVariable('dep', 'ok', SOURCE)]])
        }
      })
    );

    const exportsResult = importer.processModuleExports(childVars, {}, false, null);
    const exportedExecutable = exportsResult.moduleObject.run;
    expect(exportedExecutable.__executable).toBe(true);

    const restored = importer.createVariableFromValue('run', exportedExecutable, '/project/module.mld');
    expect(isExecutableVariable(restored)).toBe(true);
    expect((restored as any).internal?.capturedShadowEnvs?.js instanceof Map).toBe(true);
    expect((restored as any).internal?.capturedModuleEnv instanceof Map).toBe(true);
    expect((restored as any).internal?.capturedModuleEnv.get('dep')?.value).toBe('ok');
  });

  it('keeps variable factory routing behavior stable for array/object/primitive imports', () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());

    const arr = importer.createVariableFromValue('arr', [1, 2, 3], '/project/module.mld');
    const obj = importer.createVariableFromValue('obj', { value: 1 }, '/project/module.mld');
    const num = importer.createVariableFromValue('num', 42, '/project/module.mld');

    expect(arr.type).toBe('array');
    expect(obj.type).toBe('object');
    expect(num.type).toBe('imported');
  });

  it('keeps policy namespace import behavior stable for policy config recording', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const targetEnv = createEnv();
    const childEnv = targetEnv.createChild('/project/policy.mld');
    childEnv.setCurrentFilePath('/project/policy.mld');
    const recordPolicyConfigSpy = vi.spyOn(targetEnv, 'recordPolicyConfig');
    const registerPolicyGuardSpy = vi.spyOn(targetEnv.getGuardRegistry(), 'registerPolicyGuard');
    const directive = createDirective('importPolicy', {
      namespace: [{ identifier: 'security', location: LOCATION }]
    });
    const policyObject = {
      security: {
        allow: {
          network: true
        }
      }
    };

    await importer.importVariables(
      {
        moduleObject: policyObject,
        frontmatter: null,
        childEnvironment: childEnv,
        guardDefinitions: []
      },
      directive,
      targetEnv
    );

    expect(targetEnv.getVariable('security')?.type).toBe('object');
    expect(recordPolicyConfigSpy).toHaveBeenCalledWith('security', policyObject.security);
    expect(registerPolicyGuardSpy).toHaveBeenCalled();
  });
});
