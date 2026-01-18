import type { DirectiveNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { MlldInterpreterError } from '@core/errors';
import {
  normalizeNeedsDeclaration,
  normalizeWantsDeclaration,
  selectWantsTier,
  type NeedsDeclaration,
  type CommandNeeds
} from '@core/policy/needs';
import { DefaultDependencyChecker, checkDependencies } from './dependencies';
import { spawnSync } from 'child_process';

interface SystemCapabilities {
  keychain: boolean;
  sh: boolean;
  network: boolean;
  filesystem: boolean;
}

function getSystemCapabilities(): SystemCapabilities {
  return {
    keychain: process.platform === 'darwin',
    sh: true,
    network: true,
    filesystem: true
  };
}

function validateNeedsAgainstSystem(needs: NeedsDeclaration): string[] {
  const caps = getSystemCapabilities();
  const unmet: string[] = [];

  if (needs.keychain && !caps.keychain) {
    unmet.push('keychain (requires macOS)');
  }

  if (needs.sh && !isCommandAvailable('sh')) {
    unmet.push('sh (shell executable not available)');
  }

  if (needs.cmd) {
    for (const cmd of collectCommandNames(needs.cmd)) {
      if (!isCommandAvailable(cmd)) {
        unmet.push(`cmd:${cmd} (command not found in PATH)`);
      }
    }
  }

  return unmet;
}

function collectCommandNames(cmdNeeds: CommandNeeds): string[] {
  if (cmdNeeds.type === 'all') {
    return [];
  }
  if (cmdNeeds.type === 'list') {
    return cmdNeeds.commands;
  }
  return Object.keys(cmdNeeds.entries ?? {});
}

function isCommandAvailable(command: string): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }
  const binary = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(binary, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function buildDependencyMap(needs: NeedsDeclaration): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [ecosystem, packages] of Object.entries(needs.packages || {})) {
    if (!Array.isArray(packages) || packages.length === 0) {
      continue;
    }
    const bucket: Record<string, string> = {};
    for (const pkg of packages) {
      if (!pkg.name) {
        continue;
      }
      bucket[pkg.name] = (pkg.specifier ?? '').trim();
    }
    if (Object.keys(bucket).length > 0) {
      result[ecosystem] = bucket;
    }
  }
  return result;
}

export async function evaluateNeeds(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const needsRaw = (directive.values as any)?.needs ?? {};
  const needs = normalizeNeedsDeclaration(needsRaw);

  env.recordModuleNeeds(needs);

  const unmetNeeds = validateNeedsAgainstSystem(needs);
  if (unmetNeeds.length > 0) {
    throw new MlldInterpreterError(
      `Module requires capabilities not available: ${unmetNeeds.join(', ')}`,
      { code: 'NEEDS_UNMET' }
    );
  }

  const dependencyMap = buildDependencyMap(needs);
  if (Object.keys(dependencyMap).length > 0) {
    await checkDependencies(
      dependencyMap,
      new DefaultDependencyChecker(),
      astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
    );
  }

  return {
    value: undefined,
    env,
    stdout: '',
    stderr: '',
    exitCode: 0
  };
}

export async function evaluateWants(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const wantsRaw = (directive.values as any)?.wants ?? [];
  const wants = normalizeWantsDeclaration(wantsRaw);

  env.recordModuleWants(wants);

  const policy = env.getPolicyCapabilities();
  const policyConfig = env.getPolicySummary();
  const match = selectWantsTier(wants, policy, policyConfig);

  const existingContext = env.getPolicyContext();
  const policyContext = {
    tier: match?.tier ?? null,
    configs: existingContext?.configs ?? {},
    activePolicies: existingContext?.activePolicies ?? [],
    ...(existingContext?.environment ? { environment: existingContext.environment } : {})
  };
  env.setPolicyContext(policyContext);

  return {
    value: match?.tier ?? null,
    env,
    stdout: '',
    stderr: '',
    exitCode: 0
  };
}
