import type {
  Environment,
  FieldAccessNode,
  SourceLocation,
  Variable,
  VariableReferenceNode
} from '@core/types';
import { FieldAccessError, MlldDirectiveError } from '@core/errors';
import { createArrayVariable, createObjectVariable, createPrimitiveVariable, createSimpleTextVariable } from '@core/types/variable';
import { isLoadContentResult } from '@core/types/load-content';
import { isFileLoadedValue } from '@interpreter/utils/load-content-structured';
import { VariableImporter } from '@interpreter/eval/import/VariableImporter';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { isStructuredValue, type StructuredValue } from '@interpreter/utils/structured-value';

function looksLikeFileData(value: unknown): value is Record<string, unknown> & { content: string; filename?: string; relative?: string; absolute?: string } {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.content !== 'string') return false;
  return typeof obj.filename === 'string' || typeof obj.relative === 'string' || typeof obj.absolute === 'string';
}

export function shouldKeepStructuredForForExpression(value: StructuredValue): boolean {
  if (value.internal && (value.internal as any).keepStructured) {
    return true;
  }
  return isFileLoadedValue(value);
}

export function ensureVariable(name: string, value: unknown, env: Environment): Variable {
  if (isVariable(value)) {
    return value;
  }

  if (isLoadContentResult(value)) {
    const variable = createObjectVariable(
      name,
      value,
      false,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        isLoadContentResult: true,
        source: 'for-loop'
      }
    );
    const absLastSlash = value.absolute.lastIndexOf('/');
    const absoluteDir = absLastSlash === 0 ? '/' : absLastSlash > 0 ? value.absolute.substring(0, absLastSlash) : value.absolute;
    const relLastSlash = value.relative.lastIndexOf('/');
    const relativeDir = relLastSlash === 0 ? '/' : relLastSlash > 0 ? value.relative.substring(0, relLastSlash) : '.';
    let dirname: string;
    if (absoluteDir === '/') {
      dirname = '/';
    } else {
      const dirLastSlash = absoluteDir.lastIndexOf('/');
      dirname = dirLastSlash >= 0 ? absoluteDir.substring(dirLastSlash + 1) : absoluteDir;
    }
    variable.mx = {
      ...(variable.mx ?? {}),
      filename: value.filename,
      relative: value.relative,
      absolute: value.absolute,
      dirname,
      relativeDir,
      absoluteDir,
      ext: (value as any).ext ?? (value as any)._extension,
      tokest: (value as any).tokest ?? (value as any)._metrics?.tokest,
      tokens: (value as any).tokens ?? (value as any)._metrics?.tokens
    };
    return variable;
  }

  if (isStructuredValue(value)) {
    const variable = createObjectVariable(
      name,
      value,
      false,
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        arrayType: value.type === 'array' ? 'structured-value-array' : undefined,
        source: 'for-loop'
      }
    );
    if (value.mx) {
      variable.mx = { ...value.mx };
    }
    return variable;
  }

  if (looksLikeFileData(value)) {
    const forSource = { directive: 'var' as const, syntax: 'object' as const, hasInterpolation: false, isMultiLine: false };
    const variable = createObjectVariable(name, value, false, forSource, { source: 'for-loop' });
    const absLastSlash = value.absolute?.lastIndexOf('/') ?? -1;
    const absoluteDir = absLastSlash === 0 ? '/' : absLastSlash > 0 ? value.absolute!.substring(0, absLastSlash) : value.absolute;
    const relLastSlash = value.relative?.lastIndexOf('/') ?? -1;
    const relativeDir = relLastSlash === 0 ? '/' : relLastSlash > 0 ? value.relative!.substring(0, relLastSlash) : '.';
    let dirname: string | undefined;
    if (absoluteDir === '/') {
      dirname = '/';
    } else if (absoluteDir) {
      const dirLastSlash = absoluteDir.lastIndexOf('/');
      dirname = dirLastSlash >= 0 ? absoluteDir.substring(dirLastSlash + 1) : absoluteDir;
    }
    variable.mx = {
      ...(variable.mx ?? {}),
      filename: value.filename,
      relative: value.relative,
      absolute: value.absolute,
      dirname,
      relativeDir,
      absoluteDir,
      ext: (value as any).ext,
      tokest: (value as any).tokest,
      tokens: (value as any).tokens
    };
    return variable;
  }

  const forSource = { directive: 'var' as const, syntax: 'object' as const, hasInterpolation: false, isMultiLine: false };
  if (Array.isArray(value)) {
    return createArrayVariable(name, value, false, { ...forSource, syntax: 'array' as const }, { source: 'for-loop' });
  }
  if (value && typeof value === 'object') {
    return createObjectVariable(name, value as Record<string, unknown>, false, forSource, { source: 'for-loop' });
  }
  if (typeof value === 'string') {
    return createSimpleTextVariable(name, value, forSource, { source: 'for-loop' });
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return createPrimitiveVariable(name, value, forSource, { source: 'for-loop' });
  }

  const importer = new VariableImporter();
  return importer.createVariableFromValue(name, value, 'for-loop', undefined, { env });
}

export function formatFieldPath(fields?: FieldAccessNode[]): string | null {
  if (!fields || fields.length === 0) {
    return null;
  }
  const parts: string[] = [];
  for (const field of fields) {
    const value = field.value;
    switch (field.type) {
      case 'field':
      case 'stringIndex':
      case 'bracketAccess':
      case 'numericField':
        parts.push(typeof value === 'number' ? String(value) : String(value ?? ''));
        break;
      case 'arrayIndex':
      case 'variableIndex':
        parts.push(`[${typeof value === 'number' ? value : String(value ?? '')}]`);
        break;
      case 'arraySlice':
        parts.push(`[${field.start ?? ''}:${field.end ?? ''}]`);
        break;
      case 'arrayFilter':
        parts.push('[?]');
        break;
      default:
        parts.push(String(value ?? ''));
        break;
    }
  }

  return parts
    .map((part, index) => (part.startsWith('[') || index === 0 ? part : `.${part}`))
    .join('');
}

export function isFieldAccessResultLike(
  value: unknown
): value is { value: unknown; accessPath?: string[] } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'value' in (value as Record<string, unknown>)
  );
}

export function formatFieldNodeForError(field: FieldAccessNode | undefined): string {
  if (!field) return 'field';
  if (field.type === 'arrayFilter') return '?';
  if (field.type === 'arraySlice') {
    return `${field.start ?? ''}:${field.end ?? ''}`;
  }
  if (typeof field.value === 'number') {
    return String(field.value);
  }
  if (typeof field.value === 'string' && field.value.length > 0) {
    return field.value;
  }
  return 'field';
}

function formatKeyField(fields?: FieldAccessNode[]): string {
  if (!fields || fields.length === 0) return '@field';
  const field = fields[0] as any;
  let name = '';
  if (typeof field?.value === 'string' || typeof field?.value === 'number') {
    name = String(field.value);
  } else if (typeof field?.name === 'string') {
    name = field.name;
  }
  return `@${name || 'field'}`;
}

export function assertKeyVariableHasNoFields(
  keyNode: VariableReferenceNode | undefined,
  sourceLocation?: SourceLocation
): void {
  if (!keyNode?.fields || keyNode.fields.length === 0) return;
  const renderedField = formatKeyField(keyNode.fields);
  throw new MlldDirectiveError(
    `Cannot access field "${renderedField}" on loop key "@${keyNode.identifier}" - keys are primitive values (strings)`,
    'for',
    { location: sourceLocation ?? keyNode.location }
  );
}

export function enhanceFieldAccessError(
  error: unknown,
  options: { fieldPath?: string | null; varName: string; index: number; key: string | null; sourceLocation?: SourceLocation }
): unknown {
  if (!(error instanceof FieldAccessError)) {
    return error;
  }
  const pathSuffix = options.fieldPath ? `.${options.fieldPath}` : '';
  const contextParts: string[] = [];
  if (options.key !== null && options.key !== undefined) {
    contextParts.push(`key ${String(options.key)}`);
  } else if (options.index >= 0) {
    contextParts.push(`index ${options.index}`);
  }
  const context = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
  const message = `${error.message} in for binding @${options.varName}${pathSuffix}${context}`;
  const enhancedDetails = {
    ...(error.details || {}),
    iterationIndex: options.index,
    iterationKey: options.key
  };
  return new FieldAccessError(message, enhancedDetails, {
    cause: error,
    sourceLocation: (error as any).sourceLocation ?? options.sourceLocation
  });
}

export function withIterationMxKey(variable: Variable, key: unknown): Variable {
  if (key === null || typeof key === 'undefined') {
    return variable;
  }
  if (typeof key !== 'string' && typeof key !== 'number') {
    return variable;
  }
  return {
    ...variable,
    mx: { ...(variable.mx ?? {}), key }
  };
}
