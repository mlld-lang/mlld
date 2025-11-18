import type { DirectiveNode, ExecInvocation } from '@core/types';
import type { Environment } from '../env/Environment';
import {
  createSimpleTextVariable,
  type Variable,
  type VariableSource,
  type SecurityDescriptor
} from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable/VariableMetadata';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { getTextContent } from '../utils/type-guard-helpers';
import { ctxToSecurityDescriptor } from '@core/types/variable/CtxHelpers';
import { materializeGuardInputs } from '../utils/guard-inputs';

/**
 * Extract and evaluate directive inputs for hook consumption.
 * Implementation is incremental per directive; directives without
 * explicit handling currently return an empty array.
 */
export async function extractDirectiveInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  switch (directive.kind) {
    case 'show':
      return extractShowInputs(directive, env);
    case 'output':
      return extractOutputInputs(directive, env);
    case 'append':
      return extractOutputInputs(directive, env);
    case 'run':
      return extractRunInputs(directive, env);

    default:
      return [];
  }
}

async function extractShowInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  const invocation = directive.values?.invocation as ExecInvocation | undefined;
  if (invocation?.type === 'ExecInvocation') {
    const execArgs = extractExecInvocationArgs(invocation, env);
    if (execArgs.length > 0) {
      return materializeGuardInputs(execArgs);
    }
  }

  const inputs: Variable[] = [];
  const varName = resolveShowVariableName(directive);
  if (!varName) {
    return inputs;
  }
  const variable = env.getVariable(varName);
  if (variable) {
    inputs.push(variable);
  }
  return materializeGuardInputs(inputs);
}

function resolveShowVariableName(directive: DirectiveNode): string | undefined {
  const invocation = directive.values?.invocation as any;
  if (invocation) {
    if (invocation.type === 'VariableReference') {
      return invocation.identifier;
    }
    if (invocation.type === 'VariableReferenceWithTail') {
      const innerVar = invocation.variable;
      if (!innerVar) {
        return undefined;
      }
      if (innerVar.type === 'TemplateVariable') {
        return innerVar.identifier;
      }
      return innerVar.identifier;
    }
    if (invocation.type === 'TemplateVariable') {
      return invocation.identifier;
    }
  }

  const legacyVariable = directive.values?.variable as any;
  if (!legacyVariable) {
    return undefined;
  }

  const variableNode = Array.isArray(legacyVariable) ? legacyVariable[0] : legacyVariable;
  if (!variableNode) {
    return undefined;
  }

  if (variableNode.type === 'VariableReferenceWithTail') {
    const innerVar = variableNode.variable;
    if (innerVar?.type === 'TemplateVariable') {
      return innerVar.identifier;
    }
    return innerVar?.identifier;
  }

  if (variableNode.type === 'VariableReference') {
    return variableNode.identifier;
  }

  if (variableNode.type === 'TemplateVariable') {
    return variableNode.identifier;
  }

  return undefined;
}

async function extractOutputInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  const sourceNode: any = directive.values?.source;
  if (!sourceNode) {
    return [];
  }

  const hasArgs =
    Boolean(sourceNode.args && Array.isArray(sourceNode.args) && sourceNode.args.length > 0) ||
    directive.subtype === 'outputInvocation' ||
    directive.subtype === 'outputExecInvocation';

  if (hasArgs) {
    return [];
  }

  const varName = resolveOutputVariableName(sourceNode);
  if (!varName) {
    return [];
  }

  const variable = env.getVariable(varName);
  if (!variable) {
    return [];
  }

  return materializeGuardInputs([variable]);
}

function resolveOutputVariableName(sourceNode: any): string | undefined {
  if (!sourceNode) {
    return undefined;
  }

  if (Array.isArray(sourceNode)) {
    const first = sourceNode[0];
    if (first?.type === 'VariableReference') {
      return first.identifier;
    }
    if (first?.type === 'TemplateVariable') {
      return first.identifier;
    }
  }

  if (sourceNode.identifier && Array.isArray(sourceNode.identifier)) {
    const first = sourceNode.identifier[0];
    if (first?.identifier) {
      return first.identifier;
    }
  }

  if (sourceNode.variable?.identifier) {
    return sourceNode.variable.identifier;
  }

  if (typeof sourceNode.identifier === 'string') {
    return sourceNode.identifier;
  }

  return undefined;
}

async function extractRunInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  if (directive.subtype === 'runCommand') {
    const commandNodes = directive.values?.identifier || directive.values?.command;
    if (!commandNodes) {
      return [];
    }
    const commandArray = Array.isArray(commandNodes) ? commandNodes : [commandNodes];
    const commandText = await interpolate(commandArray, env, InterpolationContext.ShellCommand);
    const referencedVariables = extractVariableReferences(commandArray);
    const descriptors = referencedVariables
      .map(name => {
        const variable = env.getVariable(name);
        return variable ? ctxToSecurityDescriptor(variable.ctx) : undefined;
      })
      .filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));
    const mergedDescriptor = descriptors.length > 0 ? env.mergeSecurityDescriptors(...descriptors) : undefined;
    const source: VariableSource = {
      directive: 'run',
      syntax: 'command',
      hasInterpolation: true,
      isMultiLine: Array.isArray(commandNodes) &&
        commandNodes.some((node: any) => node?.type === 'Newline')
    };
    const variable = createSimpleTextVariable('__run_command__', commandText, source, {
      ctx: mergedDescriptor || {},
      internal: { isSystem: true }
    });
    if (mergedDescriptor) {
      env.recordSecurityDescriptor(mergedDescriptor);
    }
    return [variable];
  }

  if (
    directive.subtype === 'runExec' ||
    directive.subtype === 'runExecInvocation' ||
    directive.subtype === 'runExecReference'
  ) {
    const execInvocation = (directive.values?.execInvocation ??
      directive.values?.execRef) as ExecInvocation | undefined;
    if (execInvocation?.type === 'ExecInvocation') {
      const execArgs = extractExecInvocationArgs(execInvocation, env);
      if (execArgs.length > 0) {
        return materializeGuardInputs(execArgs);
      }
    }
    const execName = resolveRunExecName(directive);
    if (!execName) {
      return [];
    }
    const execVar = env.getVariable(execName);
    return execVar ? materializeGuardInputs([execVar]) : [];
  }

  return [];
}

function resolveRunExecName(directive: DirectiveNode): string | undefined {
  const identifierNodes = directive.values?.identifier;
  if (identifierNodes && Array.isArray(identifierNodes) && identifierNodes[0]) {
    const identifier = identifierNodes[0];
    if (identifier && typeof identifier === 'object' && 'identifier' in identifier) {
      return identifier.identifier as string;
    }
  }

  const execInvocation = directive.values?.execInvocation;
  if (execInvocation?.commandRef?.identifier) {
    return execInvocation.commandRef.identifier;
  }

  const execRef = (directive.values as any)?.execRef;
  if (execRef?.commandRef?.identifier) {
    return execRef.commandRef.identifier;
  }

  return undefined;
}

function extractVariableReferences(nodes: any[], refs: string[] = []): string[] {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (node.type === 'VariableReference' && typeof node.identifier === 'string') {
      refs.push(node.identifier);
      continue;
    }
    if (node.type === 'VariableReferenceWithTail' && node.variable) {
      const identifier = node.variable?.identifier;
      if (typeof identifier === 'string') {
        refs.push(identifier);
      }
      continue;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        extractVariableReferences(value, refs);
      }
    }
  }
  return Array.from(new Set(refs));
}

function extractExecInvocationArgs(invocation: ExecInvocation, env: Environment): Variable[] {
  const args = invocation.commandRef?.args ?? [];
  const variables: Variable[] = [];
  for (const arg of args) {
    const identifier = resolveVariableIdentifier(arg);
    if (!identifier) {
      continue;
    }
    const variable = env.getVariable(identifier);
    if (variable) {
      VariableMetadataUtils.attachContext(variable);
      variables.push(variable);
    }
  }
  return variables;
}

function resolveVariableIdentifier(node: any): string | undefined {
  if (!node) {
    return undefined;
  }
  if (node.type === 'VariableReference') {
    return node.identifier;
  }
  if (node.type === 'VariableReferenceWithTail') {
    const inner = node.variable;
    if (inner?.type === 'VariableReference') {
      return inner.identifier;
    }
    return inner?.identifier;
  }
  return undefined;
}
