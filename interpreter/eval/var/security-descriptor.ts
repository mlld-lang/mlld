import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { interpolate } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';

export type DescriptorCollector = (descriptor?: SecurityDescriptor) => void;

export interface DescriptorState {
  descriptorFromVariable: (variable?: Variable) => SecurityDescriptor | undefined;
  extractSecurityFromValue: (value: unknown) => SecurityDescriptor | undefined;
  getResolvedDescriptor: () => SecurityDescriptor | undefined;
  interpolateWithSecurity: (
    nodes: unknown,
    interpolationContext?: InterpolationContext
  ) => Promise<string>;
  mergePipelineDescriptor: (
    ...descriptors: (SecurityDescriptor | undefined)[]
  ) => SecurityDescriptor | undefined;
  mergeResolvedDescriptor: DescriptorCollector;
}

/**
 * Extract security descriptors from template AST nodes without performing interpolation.
 * This keeps labels attached to lazy template values.
 */
export function extractDescriptorsFromTemplateAst(
  nodes: unknown,
  env: Environment
): SecurityDescriptor | undefined {
  if (!nodes || !Array.isArray(nodes)) {
    return undefined;
  }

  const descriptors: SecurityDescriptor[] = [];

  const collectFromNode = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const n = node as Record<string, unknown>;
    const nodeType = n.type as string | undefined;

    if (nodeType === 'InterpolationVar' || nodeType === 'VariableReference' || nodeType === 'TemplateVariable') {
      const varName = (n.identifier || n.name) as string | undefined;
      if (varName) {
        const variable = env.getVariable(varName);
        if (variable?.mx) {
          const descriptor = varMxToSecurityDescriptor(variable.mx);
          if (descriptor && (descriptor.labels.length > 0 || descriptor.taint.length > 0 || descriptor.sources.length > 0)) {
            descriptors.push(descriptor);
          }
        }
      }
    }

    if (nodeType === 'VariableReferenceWithTail') {
      const innerVar = n.variable as Record<string, unknown> | undefined;
      if (innerVar) {
        collectFromNode(innerVar);
      }
    }

    if (nodeType === 'ConditionalVarOmission' || nodeType === 'NullCoalescingTight') {
      const innerVar = n.variable as Record<string, unknown> | undefined;
      if (innerVar) {
        collectFromNode(innerVar);
      }
    }

    if (nodeType === 'ConditionalTemplateSnippet' || nodeType === 'ConditionalStringFragment') {
      const content = n.content as unknown[];
      if (Array.isArray(content)) {
        for (const child of content) {
          collectFromNode(child);
        }
      }
    }

    if (nodeType === 'TemplateForBlock') {
      const body = n.body as unknown[];
      if (Array.isArray(body)) {
        for (const child of body) {
          collectFromNode(child);
        }
      }
      if (n.source) {
        collectFromNode(n.source);
      }
    }
  };

  for (const node of nodes) {
    collectFromNode(node);
  }

  if (descriptors.length === 0) {
    return undefined;
  }
  if (descriptors.length === 1) {
    return descriptors[0];
  }
  return mergeDescriptors(...descriptors);
}

/**
 * Extract descriptors from object/array AST nodes without evaluating values.
 */
export function extractDescriptorsFromDataAst(
  valueNode: unknown,
  env: Environment
): SecurityDescriptor | undefined {
  if (!valueNode || typeof valueNode !== 'object') {
    return undefined;
  }

  const descriptors: SecurityDescriptor[] = [];
  const seen = new WeakSet<object>();

  const collectFromNode = (node: any): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    if (
      (node.type === 'VariableReference' || node.type === 'InterpolationVar' || node.type === 'TemplateVariable')
      && (node.identifier || node.name)
    ) {
      const identifier = node.identifier || node.name;
      const variable = env.getVariable(identifier);
      if (variable?.mx) {
        const descriptor = varMxToSecurityDescriptor(variable.mx);
        if (descriptor && (descriptor.labels.length > 0 || descriptor.taint.length > 0)) {
          descriptors.push(descriptor);
        }
      }
      return;
    }

    if (node.type === 'VariableReferenceWithTail' && node.variable) {
      collectFromNode(node.variable);
      return;
    }

    if (Array.isArray(node.entries)) {
      for (const entry of node.entries) {
        if (entry.type === 'pair' && entry.value) {
          collectFromNode(entry.value);
        } else if (entry.type === 'spread') {
          if (entry.value) {
            collectFromNode(entry.value);
          }
          if (entry.variable) {
            collectFromNode(entry.variable);
          }
        } else if (entry.type === 'conditionalPair' && entry.value) {
          collectFromNode(entry.value);
        }
      }
    }

    if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
      for (const value of Object.values(node.properties)) {
        collectFromNode(value);
      }
    }

    if (Array.isArray(node.items)) {
      for (const item of node.items) {
        collectFromNode(item);
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        collectFromNode(child);
      }
    }

    if (Array.isArray(node.parts)) {
      for (const part of node.parts) {
        collectFromNode(part);
      }
    }

    // Fallback traversal for expression node shapes and future AST additions.
    // This ensures labels are discovered from nested fields like
    // condition/trueBranch/falseBranch, left/right, operand, etc.
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'location' || key === 'nodeId' || key === 'type') {
        continue;
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          collectFromNode(entry);
        }
        continue;
      }
      collectFromNode(value);
    }
  };

  collectFromNode(valueNode);

  if (descriptors.length === 0) {
    return undefined;
  }
  if (descriptors.length === 1) {
    return descriptors[0];
  }
  return mergeDescriptors(...descriptors);
}

export async function interpolateAndCollect(
  nodes: unknown,
  env: Environment,
  mergeDescriptor?: DescriptorCollector,
  interpolationContext: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  if (!mergeDescriptor) {
    return interpolate(nodes, env, interpolationContext);
  }

  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, interpolationContext, {
    collectSecurityDescriptor: collected => {
      if (collected) {
        descriptors.push(collected);
      }
    }
  });

  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1
        ? descriptors[0]
        : env.mergeSecurityDescriptors(...descriptors);
    mergeDescriptor(merged);
  }

  return text;
}

export function createDescriptorState(env: Environment): DescriptorState {
  let resolvedDescriptor: SecurityDescriptor | undefined;

  const mergeResolvedDescriptor = (descriptor?: SecurityDescriptor): void => {
    if (!descriptor) {
      return;
    }
    resolvedDescriptor = resolvedDescriptor
      ? env.mergeSecurityDescriptors(resolvedDescriptor, descriptor)
      : descriptor;
  };

  const mergePipelineDescriptor = (
    ...descriptors: (SecurityDescriptor | undefined)[]
  ): SecurityDescriptor | undefined => {
    const resolved = descriptors.filter(Boolean) as SecurityDescriptor[];
    if (resolved.length === 0) {
      return undefined;
    }
    if (resolved.length === 1) {
      return resolved[0];
    }
    return env.mergeSecurityDescriptors(...resolved);
  };

  const descriptorFromVariable = (variable?: Variable): SecurityDescriptor | undefined => {
    if (!variable?.mx) {
      return undefined;
    }
    return varMxToSecurityDescriptor(variable.mx);
  };

  const extractSecurityFromValue = (value: unknown): SecurityDescriptor | undefined => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    if (!('mx' in value) || !(value as { mx?: unknown }).mx) {
      return undefined;
    }

    const mx = (value as { mx?: any }).mx;
    const hasLabels = Array.isArray(mx.labels) && mx.labels.length > 0;
    const hasTaint = Array.isArray(mx.taint) && mx.taint.length > 0;
    if (!hasLabels && !hasTaint) {
      return undefined;
    }

    return {
      labels: mx.labels,
      taint: mx.taint,
      sources: mx.sources,
      policyContext: mx.policy ?? undefined
    } as SecurityDescriptor;
  };

  const interpolateWithSecurity = (
    nodes: unknown,
    interpolationContext: InterpolationContext = InterpolationContext.Default
  ): Promise<string> => {
    return interpolateAndCollect(nodes, env, mergeResolvedDescriptor, interpolationContext);
  };

  return {
    descriptorFromVariable,
    extractSecurityFromValue,
    getResolvedDescriptor: () => resolvedDescriptor,
    interpolateWithSecurity,
    mergePipelineDescriptor,
    mergeResolvedDescriptor
  };
}
