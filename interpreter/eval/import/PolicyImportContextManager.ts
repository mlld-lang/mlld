import type { DirectiveNode } from '@core/types';
import type { Environment } from '../../env/Environment';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';

export class PolicyImportContextManager {
  async withPolicyOverride<T>(
    directive: DirectiveNode,
    env: Environment,
    operation: () => Promise<T>
  ): Promise<T> {
    const overrideConfig = (directive.values as any)?.withClause?.policy as PolicyConfig | undefined;
    if (!overrideConfig) {
      return operation();
    }

    const previousContext = env.getPolicyContext();
    const mergedConfig = mergePolicyConfigs(
      previousContext?.configs as PolicyConfig | undefined,
      normalizePolicyConfig(overrideConfig)
    );
    const nextContext = {
      tier: previousContext?.tier ?? null,
      configs: mergedConfig ?? {},
      activePolicies: previousContext?.activePolicies ?? []
    };

    env.setPolicyContext(nextContext);
    try {
      return await operation();
    } finally {
      env.setPolicyContext(previousContext ?? null);
    }
  }

  applyPolicyImportContext(
    directive: DirectiveNode,
    env: Environment,
    source?: string
  ): void {
    const isPolicyImport =
      directive.subtype === 'importPolicy' ||
      (directive.meta as any)?.importType === 'policy' ||
      (directive.values as any)?.importType === 'policy';
    if (!isPolicyImport) {
      return;
    }

    const existing = (env.getPolicyContext() as any) || {};
    const activePolicies = Array.isArray(existing.activePolicies)
      ? [...existing.activePolicies]
      : [];
    const namespaceNode = (directive.values as any)?.namespace?.[0];
    const alias =
      namespaceNode?.identifier ||
      namespaceNode?.content ||
      (directive.values as any)?.imports?.[0]?.alias ||
      (directive.values as any)?.imports?.[0]?.identifier ||
      source ||
      'policy';
    if (!activePolicies.includes(alias)) {
      activePolicies.push(alias);
    }

    const nextContext = {
      tier: existing.tier ?? null,
      configs: existing.configs ?? {},
      activePolicies
    };
    env.setPolicyContext(nextContext);
  }
}
