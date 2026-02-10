import { generatePolicyGuards } from '@core/policy/guards';
import type { DirectiveNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';

export class PolicyImportHandler {
  applyNamespacePolicyImport(
    directive: DirectiveNode,
    namespaceObject: unknown,
    alias: string,
    targetEnv: Environment
  ): void {
    if (directive.subtype !== 'importPolicy') {
      return;
    }

    const policyConfig = this.resolveImportedPolicyConfig(namespaceObject, alias);
    targetEnv.recordPolicyConfig(alias, policyConfig);
    const guards = generatePolicyGuards(policyConfig as any, alias);
    const registry = targetEnv.getGuardRegistry();
    for (const guard of guards) {
      registry.registerPolicyGuard(guard);
    }
  }

  private resolveImportedPolicyConfig(namespaceObject: unknown, alias: string): unknown {
    if (!namespaceObject || typeof namespaceObject !== 'object' || Array.isArray(namespaceObject)) {
      return namespaceObject;
    }

    const candidate = namespaceObject as Record<string, unknown>;
    if (alias && Object.prototype.hasOwnProperty.call(candidate, alias)) {
      return candidate[alias];
    }
    if (candidate.config !== undefined && candidate.config !== null) {
      return candidate.config;
    }
    return namespaceObject;
  }
}
