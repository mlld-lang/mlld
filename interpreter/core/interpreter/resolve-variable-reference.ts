import type { MlldNode, VariableReferenceNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { InterpolationNode } from '@interpreter/utils/interpolation';

export interface ResolveVariableReferenceContext {
  isCondition?: boolean;
  isExpression?: boolean;
}

export interface ResolveVariableReferenceResult {
  value: unknown;
  env: Environment;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  metadata?: Record<string, unknown>;
}

interface ResolveVariableReferenceOptions {
  node: VariableReferenceNode;
  env: Environment;
  context?: ResolveVariableReferenceContext;
  interpolateWithSecurityRecording: (
    nodes: InterpolationNode[],
    env: Environment
  ) => Promise<string>;
}

interface LocationWithOffset {
  start?: { offset?: number };
  end?: { offset?: number };
}

function hasValidLocation(loc: unknown): loc is LocationWithOffset {
  return typeof loc === 'object' && loc !== null && 'start' in loc && 'end' in loc;
}

function isCommandVariable(variable: unknown): boolean {
  if (!variable || typeof variable !== 'object') {
    return false;
  }
  const candidate = variable as {
    type?: string;
    value?: unknown;
    definition?: unknown;
  };
  if (candidate.type === 'command') {
    return true;
  }
  const definition = candidate.definition ?? candidate.value;
  if (!definition || typeof definition !== 'object') {
    return false;
  }
  if (!('type' in definition)) {
    return false;
  }
  const definitionType = (definition as { type?: string }).type;
  return definitionType === 'command' || definitionType === 'code';
}

export async function resolveVariableReference({
  node,
  env,
  context,
  interpolateWithSecurityRecording
}: ResolveVariableReferenceOptions): Promise<ResolveVariableReferenceResult> {
  const location: unknown = node.location;
  const hasZeroOffset = hasValidLocation(location) &&
    location.start?.offset === 0 &&
    location.end?.offset === 0;
  if (hasZeroOffset &&
      node.valueType !== 'commandRef' &&
      node.valueType !== 'varIdentifier' &&
      node.identifier !== 'mx') {
    return { value: '', env };
  }

  let variable = env.getVariable(node.identifier);

  if (!variable && env.hasVariable(node.identifier)) {
    const resolverVar = await env.getResolverVariable(node.identifier);
    if (resolverVar) {
      variable = resolverVar;
    }
  }

  if (!variable) {
    if (context?.isExpression) {
      return { value: undefined, env };
    }
    throw new Error(`Variable not found: ${node.identifier}`);
  }

  if (node.valueType === 'commandRef' && isCommandVariable(variable)) {
    const args: unknown[] = (node as { args?: unknown[] }).args || [];
    const definition = (variable as { definition?: unknown; value?: unknown }).definition || variable.value;

    if (!definition) {
      throw new Error(`Command variable ${node.identifier} has no definition`);
    }

    if (typeof definition === 'object' && definition !== null && 'type' in definition) {
      const typedDef = definition as {
        type: string;
        commandTemplate?: MlldNode[];
        codeTemplate?: MlldNode[];
        language?: string;
        command?: MlldNode[];
        code?: MlldNode[];
      };

      if (typedDef.type === 'command') {
        const commandTemplate = typedDef.commandTemplate || typedDef.command;
        if (!commandTemplate) {
          throw new Error(`Command ${node.identifier} has no command template`);
        }

        const command = await interpolateWithSecurityRecording(commandTemplate as InterpolationNode[], env);

        if (args.length > 0) {
          // Argument interpolation is unchanged and currently no-ops.
        }

        const stdout = await env.executeCommand(command);
        return {
          value: stdout,
          env,
          stdout,
          stderr: '',
          exitCode: 0
        };
      }

      if (typedDef.type === 'code') {
        const codeTemplate = typedDef.codeTemplate || typedDef.code;
        if (!codeTemplate) {
          throw new Error(`Code command ${node.identifier} has no code template`);
        }

        const code = await interpolateWithSecurityRecording(codeTemplate as InterpolationNode[], env);

        const result = await env.executeCode(
          code,
          typedDef.language || 'javascript'
        );
        return {
          value: result,
          env,
          stdout: result,
          stderr: '',
          exitCode: 0
        };
      }
    }
  }

  const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');

  const isInExpression = context && context.isExpression;
  const hasFieldAccess = Array.isArray(node.fields) && node.fields.length > 0;
  const resolutionContext =
    hasFieldAccess ? ResolutionContext.FieldAccess
    : isInExpression ? ResolutionContext.Equality
    : ResolutionContext.FieldAccess;

  let resolvedValue = await resolveVariable(variable, env, resolutionContext);

  if (node.fields && node.fields.length > 0) {
    const { accessField } = await import('@interpreter/utils/field-access');
    const fieldAccessLocation = astLocationToSourceLocation(node.location, env.getCurrentFilePath());

    for (const field of node.fields) {
      const fieldResult = await accessField(resolvedValue, field, {
        preserveContext: true,
        returnUndefinedForMissing: context?.isCondition,
        env,
        sourceLocation: fieldAccessLocation
      });
      resolvedValue = (fieldResult as any).value;
      if (resolvedValue === undefined || resolvedValue === null) {
        break;
      }
    }
  }

  if (node.pipes && node.pipes.length > 0) {
    const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
    resolvedValue = await processPipeline({
      value: resolvedValue,
      env,
      node,
      identifier: node.identifier
    });
  }

  return { value: resolvedValue, env };
}
