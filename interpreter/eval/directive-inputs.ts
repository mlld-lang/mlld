import type { DirectiveNode, ExecInvocation } from '@core/types';
import type { Environment } from '../env/Environment';
import {
  createSimpleTextVariable,
  type Variable,
  type VariableSource,
  type SecurityDescriptor
} from '@core/types/variable';
import { VariableMetadataUtils } from '@core/types/variable/VariableMetadata';
import { interpolate, evaluate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { getTextContent } from '../utils/type-guard-helpers';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { materializeGuardInputs } from '../utils/guard-inputs';
import { replayInlineExecInvocations } from './directive-replay';
import { coerceValueForStdin } from '../utils/shell-value';
import { extractSecurityDescriptor } from '../utils/structured-value';
import { isVariable, resolveValue, ResolutionContext } from '../utils/variable-resolution';

type AstValue = Record<string, unknown> & { type?: string };

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
    case 'sign':
    case 'verify':
      return extractIdentifierInputs(directive, env);

    default:
      return [];
  }
}

async function extractShowInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  const inlineInvocations: ExecInvocation[] = [];
  const invocation = directive.values?.invocation as ExecInvocation | undefined;
  if (invocation?.type === 'ExecInvocation') {
    inlineInvocations.push(invocation);
  }
  const execInvocation = directive.values?.execInvocation as ExecInvocation | undefined;
  if (execInvocation?.type === 'ExecInvocation') {
    inlineInvocations.push(execInvocation);
  }

  if (inlineInvocations.length > 0) {
    const guardValues: Variable[] = [];
    guardValues.push(
      ...(await replayInlineExecInvocations(directive, env, inlineInvocations))
    );
    for (const inv of inlineInvocations) {
      guardValues.push(...extractExecInvocationArgs(inv, env));
    }
    if (guardValues.length > 0) {
      return materializeGuardInputs(guardValues);
    }
  }

  const inputs: Variable[] = [];
  const varName = resolveShowVariableName(directive);
  if (!varName) {
    const inlineVars = collectVariablesFromNodes([directive.values as any], env);
    return inlineVars.length > 0 ? materializeGuardInputs(inlineVars) : inputs;
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

async function extractIdentifierInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  const identifierNode = Array.isArray(directive.values?.identifier)
    ? directive.values?.identifier?.[0]
    : (directive.values as any)?.identifier;
  if (!identifierNode) {
    return [];
  }
  const name = getTextContent(identifierNode) || (identifierNode as any).identifier;
  if (!name) {
    return [];
  }
  const variable = env.getVariable(name);
  if (!variable) {
    return [];
  }
  return materializeGuardInputs([variable]);
}

async function extractOutputInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  const sourceNode: any = directive.values?.source;
  if (!sourceNode) {
    return [];
  }

  const execInvocation = findExecInvocation(sourceNode);
  if (execInvocation) {
    const guardValues = [
      ...(await replayInlineExecInvocations(directive, env, [execInvocation])),
      ...extractExecInvocationArgs(execInvocation, env)
    ];
    if (guardValues.length > 0) {
      return materializeGuardInputs(guardValues);
    }
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
    const inlineVars = collectVariablesFromNodes([sourceNode], env);
    return inlineVars.length > 0 ? materializeGuardInputs(inlineVars) : [];
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
    const interpolatedDescriptors: SecurityDescriptor[] = [];
    const commandText = await interpolate(commandArray, env, InterpolationContext.ShellCommand, {
      collectSecurityDescriptor: descriptor => {
        if (descriptor) {
          interpolatedDescriptors.push(descriptor);
        }
      }
    });
    const referencedVariables = collectVariablesFromNodes(commandArray, env);
    const referencedDescriptors = referencedVariables
      .map(variable => (variable.mx ? varMxToSecurityDescriptor(variable.mx) : undefined))
      .filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));
    const interpolationDescriptor =
      interpolatedDescriptors.length === 1
        ? interpolatedDescriptors[0]
        : interpolatedDescriptors.length > 1
          ? env.mergeSecurityDescriptors(...interpolatedDescriptors)
          : undefined;
    let mergedDescriptor =
      referencedDescriptors.length > 0 ? env.mergeSecurityDescriptors(...referencedDescriptors) : undefined;
    if (interpolationDescriptor) {
      mergedDescriptor = mergedDescriptor
        ? env.mergeSecurityDescriptors(mergedDescriptor, interpolationDescriptor)
        : interpolationDescriptor;
    }
    const source: VariableSource = {
      directive: 'run',
      syntax: 'command',
      hasInterpolation: true,
      isMultiLine: Array.isArray(commandNodes) &&
        commandNodes.some((node: any) => node?.type === 'Newline')
    };
    const variable = createSimpleTextVariable('__run_command__', commandText, source, {
      mx: mergedDescriptor || {},
      internal: { isSystem: true }
    });
    if (mergedDescriptor) {
      env.recordSecurityDescriptor(mergedDescriptor);
    }
    const inputs: Variable[] = [variable];
    const stdinVariable = await extractRunStdinVariable(directive, env);
    if (stdinVariable) {
      inputs.push(stdinVariable);
    }
    return inputs;
  }

  if (directive.subtype === 'runCode') {
    const args = Array.isArray(directive.values?.args) ? directive.values?.args : [];
    const argVariables = collectVariablesFromNodes(args, env);
    return materializeGuardInputs(argVariables);
  }

  if (
    directive.subtype === 'runExec' ||
    directive.subtype === 'runExecInvocation' ||
    directive.subtype === 'runExecReference'
  ) {
    const execInvocation = (directive.values?.execInvocation ??
      directive.values?.execRef) as ExecInvocation | undefined;
    if (execInvocation?.type === 'ExecInvocation') {
      const guardValues = [
        ...(await replayInlineExecInvocations(directive, env, [execInvocation])),
        ...extractExecInvocationArgs(execInvocation, env)
      ];
      if (guardValues.length > 0) {
        return materializeGuardInputs(guardValues);
      }
    }
    const execName = resolveRunExecName(directive);
    if (!execName) {
      return [];
    }
    const execVar = env.getVariable(execName);
    const args = Array.isArray(directive.values?.args) ? directive.values?.args : [];
    const argVariables = collectVariablesFromNodes(args, env);
    const inputs = execVar ? [execVar, ...argVariables] : argVariables;
    return materializeGuardInputs(inputs);
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

async function extractRunStdinVariable(
  directive: DirectiveNode,
  env: Environment
): Promise<Variable | null> {
  const withClause = (directive.meta?.withClause || directive.values?.withClause) as {
    stdin?: unknown;
  } | undefined;
  if (!withClause || !('stdin' in withClause)) {
    return null;
  }
  const result = await evaluate(withClause.stdin as any, env, { isExpression: true });
  let value = result.value;
  const descriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.CommandExecution);
  }
  const stdinText = coerceValueForStdin(value);
  const source: VariableSource = {
    directive: 'run',
    syntax: 'stdin',
    hasInterpolation: true,
    isMultiLine: typeof stdinText === 'string' && stdinText.includes('\n')
  };
  const stdinVar = createSimpleTextVariable('__run_stdin__', stdinText, source, {
    mx: descriptor || {},
    internal: { isSystem: true }
  });
  if (descriptor) {
    env.recordSecurityDescriptor(descriptor);
  }
  return stdinVar;
}

function extractExecInvocationArgs(invocation: ExecInvocation, env: Environment): Variable[] {
  const args = invocation.commandRef?.args ?? [];
  return collectVariablesFromNodes(args, env);
}

function collectVariablesFromNodes(nodes: readonly unknown[], env: Environment): Variable[] {
  const bucket = new Map<string, Variable>();
  const seen = new WeakSet<object>();
  for (const node of nodes) {
    visitNodeForVariables(node as AstValue, env, bucket, seen);
  }
  return Array.from(bucket.values());
}

function findExecInvocation(candidate: unknown): ExecInvocation | undefined {
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }
  const typed = candidate as AstValue;
  if (typed.type === 'ExecInvocation') {
    return typed as ExecInvocation;
  }
  for (const value of Object.values(typed)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = findExecInvocation(entry);
        if (found) {
          return found;
        }
      }
      continue;
    }
    if (value && typeof value === 'object') {
      const found = findExecInvocation(value);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function visitNodeForVariables(
  node: AstValue | undefined,
  env: Environment,
  bucket: Map<string, Variable>,
  seen: WeakSet<object>
): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (seen.has(node)) {
    return;
  }
  seen.add(node);

  switch (node.type) {
    case 'VariableReference':
      addVariableByIdentifier(node.identifier, env, bucket);
      break;
    case 'VariableReferenceWithTail':
      visitNodeForVariables(node.variable as AstValue, env, bucket, seen);
      break;
    case 'TemplateVariable':
      addVariableByIdentifier(node.identifier, env, bucket);
      break;
    case 'ExecInvocation': {
      const commandRef = (node as { commandRef?: AstValue & { args?: unknown[]; objectReference?: AstValue } }).commandRef;
      if (commandRef?.objectReference) {
        visitNodeForVariables(commandRef.objectReference as AstValue, env, bucket, seen);
      }
      const execArgs = commandRef?.args ?? [];
      for (const arg of execArgs) {
        visitNodeForVariables(arg as AstValue, env, bucket, seen);
      }
      break;
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        visitNodeForVariables(entry as AstValue, env, bucket, seen);
      }
      continue;
    }
    if (value && typeof value === 'object') {
      visitNodeForVariables(value as AstValue, env, bucket, seen);
    }
  }
}

function addVariableByIdentifier(
  identifier: unknown,
  env: Environment,
  bucket: Map<string, Variable>
): void {
  if (typeof identifier !== 'string' || bucket.has(identifier)) {
    return;
  }
  const variable = env.getVariable(identifier);
  if (!variable) {
    return;
  }
  VariableMetadataUtils.attachContext(variable);
  bucket.set(identifier, variable);
}
