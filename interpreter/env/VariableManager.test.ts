import { describe, expect, it } from 'vitest';
import { VariableManager, type VariableManagerContext, type VariableManagerDependencies } from './VariableManager';

function createDeps(): VariableManagerDependencies {
  return {
    cacheManager: {
      getResolverVariable: () => undefined,
      setResolverVariable: () => undefined
    } as any,
    getCurrentFilePath: () => undefined,
    getReservedNames: () => new Set(),
    getParent: () => undefined,
    getCapturedModuleEnv: () => undefined,
    getResolverManager: () => undefined,
    createDebugObject: () => '',
    getEnvironmentVariables: () => ({}),
    getStdinContent: () => undefined,
    getFsService: () => undefined,
    getPathService: () => undefined,
    getSecurityManager: () => undefined,
    getBasePath: () => '/'
  };
}

function asContext(manager: VariableManager): VariableManagerContext {
  return {
    hasVariable: name => manager.hasVariable(name),
    getVariable: name => manager.getVariable(name),
    getVariableForChildLookup: name => manager.getVariableForChildLookup(name),
    getAllVariables: () => manager.getAllVariables(),
    getCurrentVariables: () => manager.getCurrentVariables()
  };
}

describe('VariableManager', () => {
  it('stops recursive parent lookup cycles for the same missing name', () => {
    const leftDeps = createDeps();
    const rightDeps = createDeps();
    const left = new VariableManager(leftDeps);
    const right = new VariableManager(rightDeps);
    const leftContext = asContext(left);
    const rightContext = asContext(right);
    leftDeps.getParent = () => rightContext;
    rightDeps.getParent = () => leftContext;

    expect(left.getVariable('missing')).toBeUndefined();
  });

  it('bounds pathological parent lookup chains before the VM stack overflows', () => {
    const depsList = Array.from({ length: 530 }, () => createDeps());
    const managers = depsList.map(deps => new VariableManager(deps));
    const contexts = managers.map(manager => asContext(manager));
    for (let index = 0; index < depsList.length - 1; index += 1) {
      depsList[index].getParent = () => contexts[index + 1];
    }

    expect(managers[0].getVariable('missing')).toBeUndefined();
  });
});
