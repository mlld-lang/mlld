import type { DirectiveNode, VariableReference } from '@core/types';
import type { ExecutableDefinition, ExecutableVariable } from '@core/types/executable';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { isExecutableVariable } from '@core/types/variable';
import { getPreExtractedExec } from './run-pre-extracted-inputs';

type FieldAccess = {
  type: string;
  value: unknown;
};

export type RunExecResolutionParams = {
  directive: DirectiveNode;
  env: Environment;
  context?: EvaluationContext;
  callStack: string[];
};

export type RunExecResolutionResult = {
  commandName: string;
  callStack: string[];
  execVar: ExecutableVariable;
  definition: ExecutableDefinition;
  fullPath: string;
};

function isNamedFieldAccess(field: FieldAccess): boolean {
  return field.type === 'field' || field.type === 'stringIndex' || field.type === 'numericField';
}

function buildFieldPath(varRef: VariableReference): string {
  const fieldPath = Array.isArray(varRef.fields) ? varRef.fields.map(field => field.value).join('.') : '';
  return fieldPath ? `${varRef.identifier}.${fieldPath}` : varRef.identifier;
}

function deserializeCapturedShadowEnvs(rawValue: unknown): unknown {
  if (!rawValue || typeof rawValue !== 'object') {
    return rawValue;
  }

  const deserialized: Record<string, unknown> = {};
  for (const [lang, shadowObj] of Object.entries(rawValue as Record<string, unknown>)) {
    if (!shadowObj || typeof shadowObj !== 'object') {
      continue;
    }
    const map = new Map<string, unknown>();
    for (const [name, func] of Object.entries(shadowObj as Record<string, unknown>)) {
      map.set(name, func);
    }
    deserialized[lang] = map;
  }
  return deserialized;
}

function rehydrateSerializedExecutable(
  value: Record<string, any>,
  varRef: VariableReference
): ExecutableVariable {
  const fullName = buildFieldPath(varRef);
  const capturedShadowEnvs = deserializeCapturedShadowEnvs(value.internal?.capturedShadowEnvs);

  return {
    type: 'executable',
    name: fullName,
    value: value.value || { type: 'code', template: '', language: 'js' },
    paramNames: value.paramNames || [],
    source: {
      directive: 'import',
      syntax: 'code',
      hasInterpolation: false,
      isMultiLine: false
    },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    mx: {
      ...(value.mx || {})
    },
    internal: {
      ...(value.internal || {}),
      executableDef: value.executableDef,
      capturedShadowEnvs
    }
  } as ExecutableVariable;
}

function resolveExecutableFromFieldValue(
  value: unknown,
  varRef: VariableReference,
  env: Environment
): ExecutableVariable {
  if (typeof value === 'object' && value !== null && 'type' in value && (value as any).type === 'executable') {
    return value as ExecutableVariable;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    '__executable' in value &&
    Boolean((value as Record<string, unknown>).__executable)
  ) {
    return rehydrateSerializedExecutable(value as Record<string, any>, varRef);
  }

  if (typeof value === 'string') {
    const variable = env.getVariable(value);
    if (!variable || !isExecutableVariable(variable)) {
      throw new Error(`Executable variable not found: ${value}`);
    }
    return variable as ExecutableVariable;
  }

  throw new Error(`Field access did not resolve to an executable: ${typeof value}, got: ${JSON.stringify(value)}`);
}

async function resolveFieldAccessExecutable(
  varRef: VariableReference,
  env: Environment
): Promise<ExecutableVariable> {
  const baseVar = env.getVariable(varRef.identifier);
  if (!baseVar) {
    throw new Error(`Base variable not found: ${varRef.identifier}`);
  }

  const variantMap = baseVar.internal?.transformerVariants as Record<string, unknown> | undefined;
  let value: unknown;
  let remainingFields = Array.isArray(varRef.fields) ? [...varRef.fields] : [];

  if (variantMap && remainingFields.length > 0) {
    const firstField = remainingFields[0] as FieldAccess;
    if (isNamedFieldAccess(firstField)) {
      const variantName = String(firstField.value);
      const variant = variantMap[variantName];
      if (!variant) {
        throw new Error(`Pipeline function '@${varRef.identifier}.${variantName}' is not defined`);
      }
      value = variant;
      remainingFields = remainingFields.slice(1);
    }
  }

  if (typeof value === 'undefined') {
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    value = await extractVariableValue(baseVar, env);
  }

  for (const field of remainingFields as FieldAccess[]) {
    if (isNamedFieldAccess(field) && typeof value === 'object' && value !== null) {
      value = (value as Record<string, unknown>)[String(field.value)];
      continue;
    }
    if (field.type === 'arrayIndex' && Array.isArray(value)) {
      value = value[Number(field.value)];
      continue;
    }

    const fieldName = String(field.value);
    throw new Error(`Cannot access field '${fieldName}' on ${typeof value}`);
  }

  return resolveExecutableFromFieldValue(value, varRef, env);
}

async function resolveExecutableVariable(params: {
  identifierNode: unknown;
  commandName: string;
  env: Environment;
  context?: EvaluationContext;
}): Promise<ExecutableVariable> {
  const { identifierNode, commandName, env, context } = params;

  if (
    identifierNode &&
    typeof identifierNode === 'object' &&
    (identifierNode as VariableReference).type === 'VariableReference' &&
    Array.isArray((identifierNode as VariableReference).fields) &&
    ((identifierNode as VariableReference).fields?.length ?? 0) > 0
  ) {
    return resolveFieldAccessExecutable(identifierNode as VariableReference, env);
  }

  if (!commandName) {
    throw new Error('Run exec directive identifier must be a command reference');
  }

  const variable = getPreExtractedExec(context, commandName) ?? env.getVariable(commandName);
  if (!variable || !isExecutableVariable(variable)) {
    throw new Error(`Executable variable not found: ${commandName}`);
  }

  return variable as ExecutableVariable;
}

export async function resolveRunExecutableReference(
  params: RunExecResolutionParams
): Promise<RunExecResolutionResult> {
  const { directive, env, context, callStack } = params;
  const identifierNodes = directive.values?.identifier;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Run exec directive missing exec reference');
  }

  const identifierNode = identifierNodes[0];
  const commandName =
    identifierNode &&
    typeof identifierNode === 'object' &&
    (identifierNode as VariableReference).type === 'VariableReference' &&
    typeof (identifierNode as VariableReference).identifier === 'string'
      ? (identifierNode as VariableReference).identifier
      : '';
  const nextCallStack = commandName && !callStack.includes(commandName)
    ? [...callStack, commandName]
    : callStack;

  const execVar = await resolveExecutableVariable({
    identifierNode,
    commandName,
    env,
    context
  });
  const fullPath =
    identifierNode &&
    typeof identifierNode === 'object' &&
    (identifierNode as VariableReference).type === 'VariableReference'
      ? buildFieldPath(identifierNode as VariableReference)
      : commandName;
  const definition = execVar.internal?.executableDef as ExecutableDefinition | undefined;
  if (!definition) {
    throw new Error(`Executable ${fullPath} has no definition (missing executableDef)`);
  }

  return {
    commandName,
    callStack: nextCallStack,
    execVar,
    definition,
    fullPath
  };
}
