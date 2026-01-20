import type { LabelModificationNode, LabelModifierToken } from '@core/types/label-modification';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import {
  isProtectedLabel,
  makeSecurityDescriptor,
  type DataLabel,
  type SecurityDescriptor
} from '@core/types/security';
import { MlldSecurityError } from '@core/errors';
import { logger } from '@core/utils/logger';
import {
  extractSecurityDescriptor,
  ensureStructuredValue,
  isStructuredValue,
  wrapStructured
} from '../utils/structured-value';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';

type PrivilegeContext = {
  privileged: boolean;
  location?: LabelModificationNode['location'];
  env?: Environment;
};

function isFactualLabel(label: string): boolean {
  return label.startsWith('src:');
}

function requirePrivilege(
  operation: string,
  labels: DataLabel[] | undefined,
  context: PrivilegeContext
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

function warnTrustConflict(modifier: LabelModifierToken, location?: LabelModificationNode['location']): void {
  if (modifier.kind !== 'trusted') {
    return;
  }
  logger.warn('Trusted label conflicts with untrusted; both labels remain', {
    location
  });
}

function applyLabelModifiers(
  descriptor: SecurityDescriptor,
  modifiers: LabelModifierToken[],
  context: PrivilegeContext
): SecurityDescriptor {
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
          warnTrustConflict(modifier, context.location);
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

  const modifiedDescriptor = applyLabelModifiers(baseDescriptor, node.modifiers, {
    privileged: Boolean(context?.privileged),
    location: node.location,
    env: nextEnv
  });

  const modifiedValue = applyDescriptorToValue(value, modifiedDescriptor);
  return { value: modifiedValue, env: nextEnv };
}
