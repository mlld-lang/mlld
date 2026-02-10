import {
  makeSecurityDescriptor,
  mergeDescriptors,
  createCapabilityContext,
  type SecurityDescriptor,
  type CapabilityContext,
  type CapabilityKind,
  type ImportType,
  type DataLabel
} from '@core/types/security';
import { TaintTracker } from '@core/security';
import { ALLOW_ALL_POLICY, type PolicyCapabilities } from '@core/policy/needs';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';

interface SecurityScopeFrame {
  kind: CapabilityKind;
  importType?: ImportType;
  metadata?: Readonly<Record<string, unknown>>;
  operation?: Readonly<Record<string, unknown>>;
  previousDescriptor: SecurityDescriptor;
  previousPolicy?: Readonly<Record<string, unknown>>;
}

interface SecurityRuntimeState {
  tracker: TaintTracker;
  descriptor: SecurityDescriptor;
  stack: SecurityScopeFrame[];
  policy?: Readonly<Record<string, unknown>>;
}

export interface SecuritySnapshotLike {
  labels: readonly DataLabel[];
  sources: readonly string[];
  taint: readonly DataLabel[];
  policy?: Readonly<Record<string, unknown>>;
  operation?: Readonly<Record<string, unknown>>;
}

export interface SecurityContextInput {
  descriptor: SecurityDescriptor;
  kind: CapabilityKind;
  importType?: ImportType;
  metadata?: Record<string, unknown>;
  operation?: Record<string, unknown>;
  policy?: Record<string, unknown>;
}

export class SecurityPolicyRuntime {
  private securityRuntime?: SecurityRuntimeState;
  private policyCapabilities: PolicyCapabilities = ALLOW_ALL_POLICY;
  private policySummary?: PolicyConfig;
  private allowedTools?: Set<string>;

  constructor(private readonly parent?: SecurityPolicyRuntime) {}

  getPolicyCapabilities(): PolicyCapabilities {
    if (this.policyCapabilities) return this.policyCapabilities;
    if (this.parent) return this.parent.getPolicyCapabilities();
    return ALLOW_ALL_POLICY;
  }

  setPolicyCapabilities(policy: PolicyCapabilities): void {
    this.policyCapabilities = policy;
  }

  getPolicySummary(): PolicyConfig | undefined {
    if (this.policySummary) return this.policySummary;
    return this.parent?.getPolicySummary();
  }

  getAllowedTools(): Set<string> | undefined {
    if (this.allowedTools) return this.allowedTools;
    return this.parent?.getAllowedTools();
  }

  hasLocalAllowedTools(): boolean {
    return this.allowedTools !== undefined;
  }

  setAllowedTools(tools?: Iterable<string> | null): void {
    if (!tools) {
      if (this.parent?.getAllowedTools()) {
        throw new Error('Tool scope cannot widen beyond parent environment');
      }
      this.allowedTools = undefined;
      return;
    }

    const normalized = new Set<string>();
    for (const tool of tools) {
      if (typeof tool !== 'string') {
        continue;
      }
      const trimmed = tool.trim();
      if (trimmed.length > 0) {
        normalized.add(trimmed);
      }
    }

    const parentAllowed = this.parent?.getAllowedTools();
    if (parentAllowed) {
      const invalid = Array.from(normalized).filter(tool => !parentAllowed.has(tool));
      if (invalid.length > 0) {
        throw new Error(`Tool scope cannot add tools outside parent: ${invalid.join(', ')}`);
      }
    }

    this.allowedTools = normalized;
  }

  isToolAllowed(toolName: string, mcpName?: string): boolean {
    const allowed = this.getAllowedTools();
    if (!allowed) {
      return true;
    }
    if (allowed.size === 0) {
      return false;
    }
    if (allowed.has(toolName)) {
      return true;
    }
    if (mcpName && allowed.has(mcpName)) {
      return true;
    }
    return false;
  }

  setPolicyContext(policy?: Record<string, unknown> | null): void {
    const runtime = this.ensureSecurityRuntime();
    runtime.policy = policy ?? undefined;
  }

  setPolicyEnvironment(environment?: string | null): void {
    const existing = (this.getPolicyContext() as Record<string, unknown> | undefined) ?? {};
    const nextContext = {
      tier: (existing as any).tier ?? null,
      configs: (existing as any).configs ?? {},
      activePolicies: (existing as any).activePolicies ?? [],
      environment: environment ?? null
    };
    this.setPolicyContext(nextContext);
  }

  getPolicyContext(): Record<string, unknown> | undefined {
    if (this.securityRuntime?.policy) {
      return this.securityRuntime.policy;
    }
    return this.parent?.getPolicyContext();
  }

  recordPolicyConfig(alias: string, config: unknown): void {
    const normalizedConfig = normalizePolicyConfig(config);
    this.policySummary = mergePolicyConfigs(this.policySummary, normalizedConfig);

    const existing = (this.getPolicyContext() as Record<string, unknown> | undefined) ?? {};
    const existingPolicies = (existing as any).activePolicies;
    const activePolicies = Array.isArray(existingPolicies) ? [...existingPolicies] : [];
    if (!activePolicies.includes(alias)) {
      activePolicies.push(alias);
    }

    const nextContext = {
      tier: (existing as any).tier ?? null,
      configs: this.policySummary ?? {},
      activePolicies,
      ...((existing as any).environment ? { environment: (existing as any).environment } : {})
    };
    this.setPolicyContext(nextContext);
  }

  getSecuritySnapshot(): SecuritySnapshotLike | undefined {
    if (this.securityRuntime) {
      const top = this.securityRuntime.stack[this.securityRuntime.stack.length - 1];
      return {
        labels: this.securityRuntime.descriptor.labels,
        sources: this.securityRuntime.descriptor.sources,
        taint: this.securityRuntime.descriptor.taint,
        policy: this.securityRuntime.policy,
        operation: top?.operation
      };
    }
    return this.parent?.getSecuritySnapshot();
  }

  snapshotToDescriptor(snapshot?: SecuritySnapshotLike): SecurityDescriptor | undefined {
    if (!snapshot) {
      return undefined;
    }
    return makeSecurityDescriptor({
      labels: snapshot.labels,
      taint: snapshot.taint,
      sources: snapshot.sources,
      policyContext: snapshot.policy
    });
  }

  pushSecurityContext(input: SecurityContextInput): void {
    const runtime = this.ensureSecurityRuntime();
    const previousDescriptor = runtime.descriptor;
    const merged = mergeDescriptors(previousDescriptor, input.descriptor);
    const policy = input.policy ?? runtime.policy;
    runtime.stack.push({
      kind: input.kind,
      importType: input.importType,
      metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined,
      operation: input.operation ? Object.freeze({ ...input.operation }) : undefined,
      previousDescriptor,
      previousPolicy: runtime.policy
    });
    runtime.descriptor = merged;
    runtime.policy = policy;
  }

  popSecurityContext(): CapabilityContext | undefined {
    const runtime = this.securityRuntime;
    if (!runtime) {
      return undefined;
    }
    const frame = runtime.stack.pop();
    if (!frame) {
      return undefined;
    }
    const descriptor = runtime.descriptor;
    const context = createCapabilityContext({
      kind: frame.kind,
      importType: frame.importType,
      descriptor,
      metadata: frame.metadata,
      policy: runtime.policy,
      operation: frame.operation
    });
    runtime.descriptor = frame.previousDescriptor;
    runtime.policy = frame.previousPolicy;
    return context;
  }

  mergeSecurityDescriptors(...descriptors: Array<SecurityDescriptor | undefined>): SecurityDescriptor {
    return mergeDescriptors(...descriptors);
  }

  recordSecurityDescriptor(descriptor: SecurityDescriptor | undefined): void {
    if (!descriptor) {
      return;
    }
    const runtime = this.ensureSecurityRuntime();
    runtime.descriptor = mergeDescriptors(runtime.descriptor, descriptor);
  }

  private ensureSecurityRuntime(): SecurityRuntimeState {
    if (!this.securityRuntime) {
      this.securityRuntime = {
        tracker: new TaintTracker(),
        descriptor: makeSecurityDescriptor(),
        stack: [],
        policy: undefined
      };
    }
    return this.securityRuntime;
  }
}
