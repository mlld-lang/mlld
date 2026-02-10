import { describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  createExecutableVariable,
  createSimpleTextVariable,
  type VariableSource
} from '@core/types/variable';
import type { SerializedGuardDefinition } from '@interpreter/guards';
import { ObjectReferenceResolver } from '../ObjectReferenceResolver';
import { VariableImporter } from '../VariableImporter';

const SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'literal',
  hasInterpolation: false,
  isMultiLine: false
};

const LOCATION = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 }
};

function createEnv(path = '/project/main.mld'): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath(path);
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

function createExecutable(
  name: string,
  template: string,
  internal: Record<string, unknown> = {},
  imported = false
) {
  return createExecutableVariable(name, 'command', template, [], 'sh', SOURCE, {
    metadata: imported
      ? {
          isImported: true,
          importPath: '/project/upstream.mld'
        }
      : undefined,
    internal
  });
}

describe('VariableImporter final composition parity', () => {
  it('keeps roundtrip parity for exported executables with nested captured-env stacks', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const childVars = new Map();

    const nestedEnv = new Map([
      ['leafValue', createSimpleTextVariable('leafValue', 'inner', SOURCE)]
    ]);
    const helper = createExecutable(
      'helper',
      'echo helper',
      {
        capturedModuleEnv: nestedEnv
      },
      true
    );
    const outerEnv = new Map([
      ['helper', helper],
      ['shared', createSimpleTextVariable('shared', 'outer', SOURCE)]
    ]);
    const run = createExecutable(
      'run',
      'echo run',
      {
        capturedModuleEnv: outerEnv
      },
      true
    );

    childVars.set('run', run);
    childVars.set('shared', createSimpleTextVariable('shared', 'outer', SOURCE));

    const exportsResult = importer.processModuleExports(childVars, {}, false, null);

    const targetEnv = createEnv('/project/consumer.mld');
    const childEnv = targetEnv.createChild('/project/module.mld');
    childEnv.setCurrentFilePath('/project/module.mld');
    const directive = createDirective('importSelected', {
      imports: [{ identifier: 'run', location: LOCATION }]
    });

    await importer.importVariables(
      {
        moduleObject: exportsResult.moduleObject,
        frontmatter: null,
        childEnvironment: childEnv,
        guardDefinitions: exportsResult.guards
      },
      directive,
      targetEnv
    );

    const restored = targetEnv.getVariable('run') as any;
    const restoredOuterEnv = restored.internal?.capturedModuleEnv as Map<string, any>;
    const restoredHelper = restoredOuterEnv.get('helper');
    const restoredNestedEnv = restoredHelper.internal?.capturedModuleEnv as Map<string, any>;

    expect(restored.type).toBe('executable');
    expect(restoredOuterEnv instanceof Map).toBe(true);
    expect(restoredOuterEnv.get('shared')?.value).toBe('outer');
    expect(restoredHelper.type).toBe('executable');
    expect(restoredNestedEnv instanceof Map).toBe(true);
    expect(restoredNestedEnv.get('leafValue')?.value).toBe('inner');
  });

  it('keeps mixed namespace + selected + policy import behavior stable for bindings and guard registration', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const targetEnv = createEnv();
    const registerPolicyGuardSpy = vi.spyOn(targetEnv.getGuardRegistry(), 'registerPolicyGuard');
    const recordPolicyConfigSpy = vi.spyOn(targetEnv, 'recordPolicyConfig');

    const childEnv = targetEnv.createChild('/project/module.mld');
    childEnv.setCurrentFilePath('/project/module.mld');
    const policyEnv = targetEnv.createChild('/project/policy.mld');
    policyEnv.setCurrentFilePath('/project/policy.mld');

    await importer.importVariables(
      {
        moduleObject: { value: 'hello', region: 'us' },
        frontmatter: null,
        childEnvironment: childEnv,
        guardDefinitions: []
      },
      createDirective('importNamespace', {
        namespace: [{ identifier: 'mod', location: LOCATION }]
      }),
      targetEnv
    );

    await importer.importVariables(
      {
        moduleObject: { value: 'hello', region: 'us' },
        frontmatter: null,
        childEnvironment: childEnv,
        guardDefinitions: []
      },
      createDirective('importSelected', {
        imports: [{ identifier: 'value', alias: 'msg', location: LOCATION }]
      }),
      targetEnv
    );

    await importer.importVariables(
      {
        moduleObject: {
          security: {
            allow: { network: true }
          }
        },
        frontmatter: null,
        childEnvironment: policyEnv,
        guardDefinitions: []
      },
      createDirective(
        'importPolicy',
        { namespace: [{ identifier: 'security', location: LOCATION }] },
        '"./policy.mld"'
      ),
      targetEnv
    );

    expect((targetEnv.getVariable('mod')?.value as any).value).toBe('hello');
    expect(targetEnv.getVariable('msg')?.value).toBe('hello');
    expect(targetEnv.getImportBinding('mod')?.source).toBe('./module.mld');
    expect(targetEnv.getImportBinding('msg')?.source).toBe('./module.mld');
    expect(targetEnv.getImportBinding('security')?.source).toBe('./policy.mld');
    expect(recordPolicyConfigSpy).toHaveBeenCalledWith(
      'security',
      expect.objectContaining({ allow: { network: true } })
    );
    expect(registerPolicyGuardSpy).toHaveBeenCalled();
  });

  it('keeps metadata and security descriptor compatibility across export/import roundtrips', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const childVars = new Map();
    const descriptor = makeSecurityDescriptor({
      labels: ['secret'],
      taint: ['secret'],
      sources: ['source:module']
    });

    childVars.set(
      'token',
      createSimpleTextVariable('token', 'abc123', SOURCE, {
        metadata: {
          security: descriptor,
          category: 'credential'
        }
      })
    );

    const exportsResult = importer.processModuleExports(childVars, {}, false, null);
    const serializedMetadata = (exportsResult.moduleObject as any).__metadata__;

    const targetEnv = createEnv('/project/consumer.mld');
    const childEnv = targetEnv.createChild('/project/module.mld');
    childEnv.setCurrentFilePath('/project/module.mld');
    const directive = createDirective('importSelected', {
      imports: [{ identifier: 'token', location: LOCATION }]
    });

    await importer.importVariables(
      {
        moduleObject: exportsResult.moduleObject,
        frontmatter: null,
        childEnvironment: childEnv,
        guardDefinitions: exportsResult.guards
      },
      directive,
      targetEnv
    );

    const importedToken = targetEnv.getVariable('token');

    expect(serializedMetadata?.token?.security?.labels).toContain('secret');
    expect(serializedMetadata?.token?.security?.taint).toContain('secret');
    expect(serializedMetadata?.token?.security?.sources).toContain('source:module');
    expect(importedToken?.mx?.labels).toEqual(expect.arrayContaining(['secret']));
    expect(importedToken?.mx?.taint).toEqual(expect.arrayContaining(['secret']));
    expect(importedToken?.mx?.sources).toEqual(expect.arrayContaining(['source:module']));
  });

  it('keeps collision and policy-needs edge-case precedence stable in mixed batches', async () => {
    const importer = new VariableImporter(new ObjectReferenceResolver());
    const targetEnv = createEnv();
    targetEnv.setImportBinding('security', {
      source: './existing.mld',
      location: { filePath: '/project/main.mld', line: 1, column: 1 }
    });

    const recordPolicyConfigSpy = vi.spyOn(targetEnv, 'recordPolicyConfig');
    const registerPolicyGuardSpy = vi.spyOn(targetEnv.getGuardRegistry(), 'registerPolicyGuard');

    const childEnv = targetEnv.createChild('/project/module.mld');
    childEnv.setCurrentFilePath('/project/module.mld');
    const guardOnlyDefinition: SerializedGuardDefinition = {
      name: 'policyNeed',
      filterKind: 'operation',
      filterValue: 'run',
      scope: 'perOperation',
      modifier: 'default',
      block: {} as any,
      location: null
    };

    await expect(
      importer.importVariables(
        {
          moduleObject: {},
          frontmatter: null,
          childEnvironment: childEnv,
          guardDefinitions: [guardOnlyDefinition]
        },
        createDirective('importSelected', {
          imports: [{ identifier: 'policyNeed', alias: 'security', location: LOCATION }]
        }),
        targetEnv
      )
    ).resolves.toBeUndefined();

    await expect(
      importer.importVariables(
        {
          moduleObject: {
            security: { allow: { network: true } }
          },
          frontmatter: null,
          childEnvironment: childEnv,
          guardDefinitions: []
        },
        createDirective('importPolicy', {
          namespace: [{ identifier: 'security', location: LOCATION }]
        }),
        targetEnv
      )
    ).rejects.toMatchObject({
      code: 'IMPORT_NAME_CONFLICT',
      details: {
        variableName: 'security'
      }
    });

    expect(recordPolicyConfigSpy).not.toHaveBeenCalled();
    expect(registerPolicyGuardSpy).not.toHaveBeenCalled();
    expect(targetEnv.getImportBinding('security')?.source).toBe('./existing.mld');
  });
});
