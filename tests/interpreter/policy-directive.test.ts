import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import type { PolicyDirectiveNode } from '@core/types/policy';
import { Environment } from '@interpreter/env/Environment';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { createObjectVariable, type VariableSource } from '@core/types/variable';
import { evaluateDirective } from '@interpreter/eval/directive';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';

const objectSource: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

describe('/policy directive', () => {
  it('merges referenced policy configs and records context', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    env.setCurrentFilePath('/policy.mld');

    env.setVariable(
      'p1',
      createObjectVariable(
        'p1',
        { allow: { cmd: ['echo', 'ls'] }, deny: { cmd: ['rm'] }, limits: { timeout: 1000 } },
        false,
        objectSource
      )
    );
    env.setVariable(
      'p2',
      createObjectVariable(
        'p2',
        { allow: { cmd: ['echo'] }, deny: { cmd: ['mv'] }, limits: { timeout: 500 } },
        false,
        objectSource
      )
    );

    const directive = parseSync('/policy @merged = union(@p1, @p2)')[0] as PolicyDirectiveNode;
    await evaluateDirective(directive, env);

    const mergedVar = env.getVariable('merged');
    const mergedValue = mergedVar ? await extractVariableValue(mergedVar, env) : null;

    expect(mergedValue?.allow?.cmd).toEqual(['echo']);
    expect(mergedValue?.deny?.cmd).toEqual(expect.arrayContaining(['rm', 'mv']));
    expect(mergedValue?.limits?.timeout).toBe(500);

    const policyContext = env.getPolicyContext();
    expect(policyContext?.configs?.allow?.cmd).toEqual(['echo']);
    expect(policyContext?.activePolicies).toContain('merged');
  });

  it('scopes with-clause policy overrides to import execution', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const pathContext = {
      projectRoot: '/project',
      fileDirectory: '/project',
      executionDirectory: '/project',
      invocationDirectory: '/project',
      filePath: '/project/main.mld'
    };
    await fileSystem.writeFile(
      '/project/policy-target.mld',
      '/var @policyConfig = @mx.policy.configs\n/export { @policyConfig }'
    );

    const env = new Environment(fileSystem, pathService, pathContext);
    env.setApproveAllImports(true);
    env.setCurrentFilePath('/project/main.mld');

    const baseContext = {
      tier: 'base',
      configs: { allow: { cmd: ['echo'] } },
      activePolicies: ['base']
    };
    env.setPolicyContext({ ...baseContext });

    const importDirective = parseSync(
      '/import { @policyConfig } from "./policy-target.mld" with { policy: { allow: { cmd: ["curl"] } } }'
    )[0] as DirectiveNode;

    await evaluateDirective(importDirective, env);

    const imported = env.getVariable('policyConfig');
    const importedValue = imported ? await extractVariableValue(imported, env) : null;

    expect(importedValue?.allow?.cmd ?? []).toEqual([]);
    expect(env.getPolicyContext()).toEqual(baseContext);
  });
});
