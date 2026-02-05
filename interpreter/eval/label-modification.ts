import type { LabelModificationNode, LabelModifierToken } from '@core/types/label-modification';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import type { PolicyConfig } from '@core/policy/union';
import {
  isProtectedLabel,
  makeSecurityDescriptor,
  type DataLabel,
  type SecurityDescriptor
} from '@core/types/security';
import { MlldSecurityError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { appendAuditEvent } from '@core/security/AuditLogger';
import {
  extractSecurityDescriptor,
  ensureStructuredValue,
  isStructuredValue,
  wrapStructured
} from '../utils/structured-value';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';

type LabelModificationContext = {
  privileged: boolean;
  location?: LabelModificationNode['location'];
  env?: Environment;
  policy?: PolicyConfig;
  varName?: string;
};

function isFactualLabel(label: string): boolean {
  return label.startsWith('src:');
}

function requirePrivilege(
  operation: string,
  labels: DataLabel[] | undefined,
  context: LabelModificationContext
): void {
  if (context.privileged) {
    return;
  }
  const protectedLabel = labels?.find(label => isProtectedLabel(label));
  if (protectedLabel) {
    throw new MlldSecurityError(
      `Cannot remove protected label '${protectedLabel}' without privilege`,
      {
        code: 'PROTECTED_LABEL_REMOVAL',
        details: { operation, label: protectedLabel },
        sourceLocation: context.location,
        env: context.env
      }
    );
  }
  throw new MlldSecurityError(
    `Label modification '${operation}' requires privilege`,
    {
      code: 'LABEL_PRIVILEGE_REQUIRED',
      details: { operation, labels },
      sourceLocation: context.location,
      env: context.env
    }
  );
}

function collectVariableIdentifiers(nodes: LabelModificationNode['value']): string[] {
  const identifiers = new Set<string>();
  const seen = new WeakSet<object>();

  const visit = (node: unknown): void => {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(item => visit(item));
      return;
    }
    if (typeof node !== 'object') {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    const typed = node as {
      type?: string;
      identifier?: string;
      variable?: { identifier?: string };
    };

    if (typed.type === 'VariableReference' && typeof typed.identifier === 'string') {
      identifiers.add(typed.identifier);
      return;
    }

    if (typed.type === 'VariableReferenceWithTail' && typed.variable?.identifier) {
      identifiers.add(typed.variable.identifier);
      return;
    }

    Object.values(node).forEach(value => visit(value));
  };

  visit(nodes);
  return Array.from(identifiers);
}

function formatAuditVarName(identifiers: string[]): string | undefined {
  if (identifiers.length === 0) {
    return undefined;
  }
  return identifiers.map(identifier => `@${identifier}`).join(', ');
}

function diffLabels(
  before: readonly DataLabel[] | undefined,
  after: readonly DataLabel[] | undefined
): { add: DataLabel[]; remove: DataLabel[] } {
  const beforeSet = new Set(before ?? []);
  const afterSet = new Set(after ?? []);
  const add: DataLabel[] = [];
  const remove: DataLabel[] = [];

  for (const label of afterSet) {
    if (!beforeSet.has(label)) {
      add.push(label);
    }
  }

  for (const label of beforeSet) {
    if (!afterSet.has(label)) {
      remove.push(label);
    }
  }

  return { add, remove };
}

function hasBlessingModifier(modifiers: LabelModifierToken[]): boolean {
  return modifiers.some(modifier =>
    modifier.kind === 'bless' ||
    modifier.kind === 'clear' ||
    modifier.kind === 'remove'
  );
}

async function warnTrustConflict(
  varName: string | undefined,
  policy: PolicyConfig | undefined,
  context: { location?: LabelModificationNode['location']; env?: Environment }
): Promise<void> {
  const mode = policy?.defaults?.trustconflict ?? 'warn';
  const target = varName ?? 'value';
  const auditEnv = context.env;

  if (auditEnv) {
    await appendAuditEvent(auditEnv.getFileSystemService(), auditEnv.getProjectRoot(), {
      event: 'conflict',
      var: varName,
      labels: ['trusted', 'untrusted'],
      resolved: 'untrusted'
    });
  }

  if (mode === 'error') {
    throw new MlldSecurityError(
      `Trust conflict: Cannot add 'trusted' to already untrusted ${target}`,
      {
        code: 'TRUST_CONFLICT',
        sourceLocation: context.location,
        env: context.env,
        details: {
          var: varName,
          mode
        }
      }
    );
  }

  if (mode === 'warn') {
    logger.warn(`Trust conflict on ${target}: both trusted and untrusted`, {
      location: context.location
    });
  }
}

async function applyLabelModifiers(
  descriptor: SecurityDescriptor,
  modifiers: LabelModifierToken[],
  context: LabelModificationContext
): Promise<SecurityDescriptor> {
  const labelSet = new Set<DataLabel>(descriptor.labels ?? []);
  const taintSet = new Set<DataLabel>(descriptor.taint ?? []);

  for (const modifier of modifiers) {
    switch (modifier.kind) {
      case 'clear': {
        const labelsToClear = Array.from(labelSet).filter(label => !isFactualLabel(label));
        requirePrivilege('clear', labelsToClear, context);
        for (const label of labelsToClear) {
          labelSet.delete(label);
          taintSet.delete(label);
        }
        break;
      }
      case 'remove': {
        const label = modifier.label;
        if (label) {
          requirePrivilege('remove', [label], context);
          labelSet.delete(label);
          taintSet.delete(label);
        }
        break;
      }
      case 'add': {
        const label = modifier.label;
        if (label) {
          labelSet.add(label);
          taintSet.add(label);
        }
        break;
      }
      case 'untrusted': {
        labelSet.delete('trusted');
        taintSet.delete('trusted');
        labelSet.add('untrusted');
        taintSet.add('untrusted');
        break;
      }
      case 'trusted': {
        if (labelSet.has('untrusted') || taintSet.has('untrusted')) {
          await warnTrustConflict(context.varName, context.policy, {
            location: context.location,
            env: context.env
          });
        }
        labelSet.add('trusted');
        taintSet.add('trusted');
        break;
      }
      case 'bless': {
        requirePrivilege('trusted!', ['untrusted'], context);
        labelSet.delete('untrusted');
        taintSet.delete('untrusted');
        labelSet.add('trusted');
        taintSet.add('trusted');
        break;
      }
      default:
        break;
    }
  }

  return makeSecurityDescriptor({
    labels: Array.from(labelSet),
    taint: Array.from(taintSet),
    sources: descriptor.sources ?? [],
    capability: descriptor.capability,
    policyContext: descriptor.policyContext ? { ...descriptor.policyContext } : undefined
  });
}

function applyDescriptorToValue(
  value: unknown,
  descriptor: SecurityDescriptor
): unknown {
  if (isStructuredValue(value)) {
    const updated = wrapStructured(value, value.type, value.text, {
      ...(value.metadata ?? {}),
      security: descriptor
    });
    if (value.internal && typeof value.internal === 'object') {
      updated.internal = { ...value.internal };
    }
    return updated;
  }

  if (value && typeof value === 'object') {
    setExpressionProvenance(value, descriptor);
    return value;
  }

  return ensureStructuredValue(value, undefined, undefined, { security: descriptor });
}

function extractDescriptorFromNodes(
  nodes: LabelModificationNode['value'],
  env: Environment
): SecurityDescriptor | undefined {
  const descriptors: SecurityDescriptor[] = [];
  const seen = new WeakSet<object>();

  const visit = (node: unknown): void => {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(item => visit(item));
      return;
    }
    if (typeof node !== 'object') {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    const typed = node as {
      type?: string;
      identifier?: string;
      variable?: { identifier?: string };
    };

    if (typed.type === 'VariableReference' && typeof typed.identifier === 'string') {
      const variable = env.getVariable(typed.identifier);
      const descriptor = extractSecurityDescriptor(variable, {
        recursive: true,
        mergeArrayElements: true
      });
      if (descriptor) {
        descriptors.push(descriptor);
      }
      return;
    }

    if (typed.type === 'VariableReferenceWithTail' && typed.variable?.identifier) {
      const variable = env.getVariable(typed.variable.identifier);
      const descriptor = extractSecurityDescriptor(variable, {
        recursive: true,
        mergeArrayElements: true
      });
      if (descriptor) {
        descriptors.push(descriptor);
      }
      return;
    }

    Object.values(node).forEach(value => visit(value));
  };

  visit(nodes);

  if (descriptors.length === 0) {
    return undefined;
  }
  if (descriptors.length === 1) {
    return descriptors[0];
  }
  return env.mergeSecurityDescriptors(...descriptors);
}

export async function evaluateLabelModification(
  node: LabelModificationNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  const { evaluate } = await import('../core/interpreter');
  const valueResult = await evaluate(node.value, env, { ...context, isExpression: true });
  const nextEnv = valueResult.env ?? env;
  let value = valueResult.value;

  const { isVariable, extractVariableValue } = await import('../utils/variable-resolution');
  const initialDescriptor = extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true });
  if (isVariable(value)) {
    value = await extractVariableValue(value, nextEnv);
  }

  const valueDescriptor =
    initialDescriptor ??
    extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true });
  const nodeDescriptor = extractDescriptorFromNodes(node.value, nextEnv);
  const baseDescriptor = valueDescriptor ?? nodeDescriptor ?? makeSecurityDescriptor();

  const auditVarName = formatAuditVarName(collectVariableIdentifiers(node.value));
  const modifiedDescriptor = await applyLabelModifiers(baseDescriptor, node.modifiers, {
    privileged: Boolean(context?.privileged),
    location: node.location,
    env: nextEnv,
    policy: nextEnv.getPolicySummary(),
    varName: auditVarName
  });
  const auditEnv = nextEnv;
  if (auditEnv) {
    const changes = diffLabels(baseDescriptor.labels, modifiedDescriptor.labels);
    if (changes.add.length > 0 || changes.remove.length > 0) {
      const isBlessing = Boolean(context?.privileged) && hasBlessingModifier(node.modifiers);
      const event = isBlessing ? 'bless' : 'label';
      const payload = {
        event,
        var: auditVarName,
        by: 'directive:label',
        ...(changes.add.length > 0 ? { add: changes.add } : {}),
        ...(isBlessing && changes.remove.length > 0 ? { remove: changes.remove } : {})
      };
      await appendAuditEvent(
        auditEnv.getFileSystemService(),
        auditEnv.getProjectRoot(),
        payload
      );
    }
  }

  const modifiedValue = applyDescriptorToValue(value, modifiedDescriptor);
  return { value: modifiedValue, env: nextEnv };
}
