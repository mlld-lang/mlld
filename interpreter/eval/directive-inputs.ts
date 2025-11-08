import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import {
  createSimpleTextVariable,
  type Variable,
  type VariableSource
} from '@core/types/variable';
import { interpolate } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { getTextContent } from '../utils/type-guard-helpers';

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
  const inputs: Variable[] = [];
  const varName = resolveShowVariableName(directive);
  if (!varName) {
    return inputs;
  }
  const variable = env.getVariable(varName);
  if (variable) {
    inputs.push(variable);
  }
  return inputs;
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

  return [variable];
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
    const commandText = await interpolate(
      Array.isArray(commandNodes) ? commandNodes : [commandNodes],
      env,
      InterpolationContext.ShellCommand
    );
    const source: VariableSource = {
      directive: 'run',
      syntax: 'command',
      hasInterpolation: true,
      isMultiLine: Array.isArray(commandNodes) &&
        commandNodes.some((node: any) => node?.type === 'Newline')
    };
    const variable = createSimpleTextVariable('__run_command__', commandText, source, {
      isSystem: true
    });
    return [variable];
  }

  if (directive.subtype === 'runExec') {
    const execNode = directive.values?.identifier?.[0];
    const execName = execNode ? getTextContent(execNode) : undefined;
    if (!execName) {
      return [];
    }
    const execVar = env.getVariable(execName);
    return execVar ? [execVar] : [];
  }

  return [];
}
