import type { DirectiveNode } from '@core/types';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import {
  createSimpleTextVariable,
  isArray,
  isExecutable as isExecutableVariable,
  isObject,
  isTextLike
} from '@core/types/variable';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import { interpolate } from '@interpreter/core/interpreter';
import { JSONFormatter } from '@interpreter/core/json-formatter';
import type { Environment } from '@interpreter/env/Environment';
import { formatForDisplay } from '@interpreter/utils/display-formatter';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { resolveDirectiveExecInvocation } from '@interpreter/eval/directive-replay';

export interface ShowInvocationHandlerParams {
  directive: DirectiveNode;
  env: Environment;
  context?: EvaluationContext;
  collectInterpolatedDescriptor: (descriptor?: SecurityDescriptor) => void;
  securityLabels?: DataLabel[];
}

export interface ShowInvocationResult {
  content: string;
  resultValue: unknown;
  isStreamingShow?: boolean;
  skipJsonFormatting?: boolean;
}

function getExtractedVariable(
  context: EvaluationContext | undefined,
  name: string
): any | undefined {
  if (!context?.extractedInputs || context.extractedInputs.length === 0) {
    return undefined;
  }
  for (const candidate of context.extractedInputs) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'name' in candidate &&
      (candidate as any).name === name
    ) {
      return candidate;
    }
  }
  return undefined;
}

function toInvocationDisplayValue(value: unknown): string {
  if (isStructuredValue(value)) {
    if (value.type === 'array' && Array.isArray(value.data)) {
      const cleaned = value.data.map(item => (isStructuredValue(item) ? asText(item) : item));
      return JSONFormatter.stringify(cleaned, { pretty: true });
    }
    return asText(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSONFormatter.stringify(value, { pretty: false });
  }
  return String(value);
}

function hasErrorMetadata(value: unknown): boolean {
  return (
    isStructuredValue(value) &&
    Array.isArray((value as any).metadata?.errors) &&
    (value as any).metadata?.errors?.length > 0
  );
}

function variableToString(variable: any): string {
  if (isTextLike(variable)) {
    return variable.value;
  }
  if (isObject(variable) || isArray(variable)) {
    return JSONFormatter.stringify(variable.value, { pretty: false });
  }
  return String(variable.value);
}

async function resolveTemplateArgument(argValue: unknown, env: Environment): Promise<string> {
  if (typeof argValue === 'object' && argValue !== null && (argValue as any).type === 'Text') {
    return (argValue as any).content || '';
  }

  if (typeof argValue === 'object' && argValue !== null && (argValue as any).type === 'VariableReference') {
    const variable = env.getVariable((argValue as any).identifier);
    if (!variable) {
      throw new Error(`Variable not found: ${(argValue as any).identifier}`);
    }
    return variableToString(variable);
  }

  if (typeof argValue === 'object' && argValue !== null && (argValue as any).type === 'string') {
    return (argValue as any).value;
  }

  if (typeof argValue === 'object' && argValue !== null && (argValue as any).type === 'variable') {
    const varName = (argValue as any).value?.identifier;
    const variable = env.getVariable(varName);
    if (!variable) {
      throw new Error(`Variable not found: ${varName}`);
    }
    return variableToString(variable);
  }

  return String(argValue);
}

export async function evaluateShowInvocation({
  directive,
  env,
  context,
  collectInterpolatedDescriptor,
  securityLabels
}: ShowInvocationHandlerParams): Promise<ShowInvocationResult> {
  const baseInvocation = directive.values?.invocation;
  if (!baseInvocation) {
    throw new Error('Show invocation directive missing invocation');
  }

  const isStreamingShow = Boolean(securityLabels?.includes('stream'));
  const invocation = isStreamingShow
    ? {
        ...baseInvocation,
        withClause: {
          ...(baseInvocation.withClause || {}),
          stream: true
        }
      }
    : baseInvocation;

  const commandRef = (invocation as any).commandRef;
  if (commandRef && (commandRef.objectReference || commandRef.objectSource)) {
    const invocationResult = await resolveDirectiveExecInvocation(directive, env, invocation);
    return {
      content: toInvocationDisplayValue(invocationResult.value),
      resultValue: invocationResult.value,
      isStreamingShow
    };
  }

  const name = commandRef?.name || commandRef?.identifier?.[0]?.content;
  if (!name) {
    throw new Error('Add invocation missing name');
  }

  const extracted = getExtractedVariable(context, name);
  const variable = extracted ?? env.getVariable(name);
  if (!variable) {
    throw new Error(`Variable not found: ${name}`);
  }

  if (!isExecutableVariable(variable)) {
    throw new Error(`Variable ${name} is not executable (type: ${variable.type})`);
  }

  const invocationResult = await resolveDirectiveExecInvocation(directive, env, invocation);
  return {
    content: toInvocationDisplayValue(invocationResult.value),
    resultValue: invocationResult.value,
    isStreamingShow
  };
}

export async function evaluateLegacyTemplateInvocation({
  directive,
  env,
  collectInterpolatedDescriptor
}: ShowInvocationHandlerParams): Promise<ShowInvocationResult> {
  const templateNameNodes = directive.values?.templateName;
  if (!templateNameNodes || templateNameNodes.length === 0) {
    throw new Error('Add template invocation missing template name');
  }

  const templateName = await interpolate(templateNameNodes, env, undefined, {
    collectSecurityDescriptor: collectInterpolatedDescriptor
  });
  const template = env.getVariable(templateName);
  if (!template || template.type !== 'executable') {
    throw new Error(`Template not found: ${templateName}`);
  }

  const definition = template.value;
  if (definition.type !== 'template') {
    throw new Error(`Variable ${templateName} is not a template`);
  }

  const args = directive.values?.arguments || [];
  if (args.length !== definition.paramNames.length) {
    throw new Error(`Template ${templateName} expects ${definition.paramNames.length} parameters, got ${args.length}`);
  }

  const childEnv = env.createChild();
  for (let i = 0; i < definition.paramNames.length; i++) {
    const paramName = definition.paramNames[i];
    const value = await resolveTemplateArgument(args[i], env);
    const source = {
      directive: 'var' as const,
      syntax: 'quoted' as const,
      hasInterpolation: false,
      isMultiLine: false
    };
    childEnv.setParameterVariable(paramName, createSimpleTextVariable(paramName, value, source));
  }

  const templateNodes = definition.template || definition.templateContent;
  if (!templateNodes) {
    throw new Error(`Template ${templateName} has no template content`);
  }

  const content = await interpolate(templateNodes, childEnv, undefined, {
    collectSecurityDescriptor: collectInterpolatedDescriptor
  });
  return { content, resultValue: content };
}

export async function evaluateShowExecInvocation({
  directive,
  env
}: ShowInvocationHandlerParams): Promise<ShowInvocationResult> {
  const execInvocation = directive.values?.execInvocation;
  if (!execInvocation) {
    throw new Error('Show exec invocation directive missing exec invocation');
  }

  const invocationResult = await resolveDirectiveExecInvocation(directive, env, execInvocation);
  const value = invocationResult.value;

  if (isStructuredValue(value)) {
    if (hasErrorMetadata(value)) {
      return { content: asText(value), resultValue: value, skipJsonFormatting: true };
    }
    return { content: formatForDisplay(value, { pretty: false }), resultValue: value };
  }
  if (typeof value === 'string') {
    return { content: value, resultValue: value };
  }
  if (value === null || value === undefined) {
    return { content: '', resultValue: value };
  }
  if (typeof value === 'object') {
    return { content: JSONFormatter.stringify(value, { pretty: false }), resultValue: value };
  }
  return { content: String(value), resultValue: value };
}
