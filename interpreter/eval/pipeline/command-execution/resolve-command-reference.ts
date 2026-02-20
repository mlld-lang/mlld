import type { PipelineCommand } from '@core/types';
import type { Environment } from '../../../env/Environment';

interface ParsedFieldToken {
  type: 'field' | 'stringIndex' | 'numericField' | 'arrayIndex';
  value: string | number;
}

function parseDottedIdentifier(identifier: string): {
  baseName: string;
  fields: ParsedFieldToken[];
} {
  const parts = identifier.split('.');
  const baseName = parts[0];
  const fields = parts.slice(1).map(value => ({ type: 'field' as const, value }));
  return { baseName, fields };
}

function normalizeFieldTokens(tokens: unknown[]): ParsedFieldToken[] {
  return tokens
    .filter(token => Boolean(token && typeof token === 'object' && 'type' in (token as Record<string, unknown>)))
    .map(token => token as ParsedFieldToken);
}

function traverseFieldPath(value: unknown, fields: readonly ParsedFieldToken[]): unknown {
  let current = value;
  for (const field of fields) {
    if (
      (field.type === 'field' || field.type === 'stringIndex' || field.type === 'numericField') &&
      typeof current === 'object' &&
      current !== null
    ) {
      current = (current as Record<string, unknown>)[String(field.value)];
      continue;
    }
    if (field.type === 'arrayIndex' && Array.isArray(current)) {
      current = current[Number(field.value)];
      continue;
    }
    const fieldName = String(field.value);
    throw new Error(`Cannot access field '${fieldName}' on ${typeof current}`);
  }
  return current;
}

export async function resolvePipelineCommandReference(
  command: PipelineCommand,
  env: Environment
): Promise<any> {
  if (!command.identifier || command.identifier.length === 0) {
    return null;
  }

  const varRefNode = command.identifier[0] as any;
  if (varRefNode.type !== 'VariableReference') {
    return null;
  }

  const varRef = varRefNode as {
    identifier: string;
    fields?: unknown[];
  };

  let baseVar = env.getVariable(varRef.identifier);
  let parsedFields: ParsedFieldToken[] = [];

  if (!baseVar && varRef.identifier.includes('.')) {
    const dotted = parseDottedIdentifier(varRef.identifier);
    baseVar = env.getVariable(dotted.baseName);
    if (baseVar && dotted.fields.length > 0) {
      parsedFields = dotted.fields;
    }
  }

  if (!baseVar) {
    return null;
  }

  const variantMap = (baseVar.internal?.transformerVariants as Record<string, unknown> | undefined);
  let value: unknown;
  let remainingFields =
    parsedFields.length > 0
      ? parsedFields
      : normalizeFieldTokens(Array.isArray(varRef.fields) ? [...varRef.fields] : []);

  if (variantMap && remainingFields.length > 0) {
    const firstField = remainingFields[0];
    if (
      firstField.type === 'field' ||
      firstField.type === 'stringIndex' ||
      firstField.type === 'numericField'
    ) {
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
    if (baseVar.type === 'executable') {
      return baseVar;
    }
    const { extractVariableValue } = await import('../../../utils/variable-resolution');
    value = await extractVariableValue(baseVar, env);
  }

  if (remainingFields.length > 0) {
    value = traverseFieldPath(value, remainingFields);
  }

  return value;
}
