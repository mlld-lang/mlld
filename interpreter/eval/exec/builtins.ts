import type { ExecInvocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import { asData, asText, extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';
import { StructuredValue as LegacyStructuredValue } from '@core/types/structured-value';
import { MlldInterpreterError } from '@core/errors';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';

export type StringBuiltinMethod =
  | 'toLowerCase'
  | 'toUpperCase'
  | 'trim'
  | 'slice'
  | 'substring'
  | 'substr'
  | 'replace'
  | 'replaceAll'
  | 'padStart'
  | 'padEnd'
  | 'repeat';

export type ArrayBuiltinMethod = 'slice' | 'concat' | 'reverse' | 'sort';
export type SearchBuiltinMethod = 'includes' | 'startsWith' | 'endsWith' | 'indexOf';
export type MatchBuiltinMethod = 'match';
export type TypeCheckingMethod =
  | 'isArray'
  | 'isObject'
  | 'isString'
  | 'isNumber'
  | 'isBoolean'
  | 'isNull'
  | 'isDefined';

export const TYPE_CHECKING_BUILTINS: readonly TypeCheckingMethod[] = [
  'isArray',
  'isObject',
  'isString',
  'isNumber',
  'isBoolean',
  'isNull',
  'isDefined'
];

export const BUILTIN_METHODS: readonly (
  | SearchBuiltinMethod
  | MatchBuiltinMethod
  | 'length'
  | 'join'
  | 'split'
  | StringBuiltinMethod
  | ArrayBuiltinMethod
  | TypeCheckingMethod
)[] = [
  'includes',
  'match',
  'length',
  'indexOf',
  'join',
  'split',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'slice',
  'substring',
  'substr',
  'replace',
  'replaceAll',
  'padStart',
  'padEnd',
  'repeat',
  'startsWith',
  'endsWith',
  'concat',
  'reverse',
  'sort',
  'isArray',
  'isObject',
  'isString',
  'isNumber',
  'isBoolean',
  'isNull',
  'isDefined'
];

export function isBuiltinMethod(name: string): boolean {
  return (BUILTIN_METHODS as readonly string[]).includes(name);
}

export function isTypeCheckingBuiltinMethod(name: string): boolean {
  return (TYPE_CHECKING_BUILTINS as readonly string[]).includes(name);
}

export function normalizeBuiltinTargetValue(value: unknown): unknown {
  if (isStructuredValue(value)) {
    return value.type === 'array' ? value.data : asText(value);
  }
  if (LegacyStructuredValue.isStructuredValue?.(value)) {
    return (value as any).text;
  }
  return value;
}

function ensureStringTarget(method: string, target: unknown): string {
  if (typeof target === 'string') {
    return target;
  }
  throw new MlldInterpreterError(`Cannot call .${method}() on ${typeof target}`);
}

function ensureArrayTarget(method: string, target: unknown): unknown[] {
  if (Array.isArray(target)) {
    return target;
  }
  throw new MlldInterpreterError(`Cannot call .${method}() on ${typeof target}`);
}

function handleStringBuiltin(method: StringBuiltinMethod, target: unknown, args: unknown[] = []): string {
  const value = ensureStringTarget(method, target);
  switch (method) {
    case 'toLowerCase':
      return value.toLowerCase();
    case 'toUpperCase':
      return value.toUpperCase();
    case 'trim':
      return value.trim();
    case 'slice': {
      const start = args.length > 0 ? Number(args[0]) : undefined;
      const end = args.length > 1 ? Number(args[1]) : undefined;
      return value.slice(start ?? undefined, end ?? undefined);
    }
    case 'substring': {
      const start = args.length > 0 ? Number(args[0]) : 0;
      const end = args.length > 1 ? Number(args[1]) : undefined;
      return value.substring(start, end ?? undefined);
    }
    case 'substr': {
      const start = args.length > 0 ? Number(args[0]) : 0;
      const length = args.length > 1 && args[1] !== undefined ? Number(args[1]) : undefined;
      return length !== undefined ? value.substr(start, length) : value.substr(start);
    }
    case 'replace': {
      const searchValue = args[0] instanceof RegExp ? args[0] : String(args[0] ?? '');
      const replaceValue = String(args[1] ?? '');
      return value.replace(searchValue as any, replaceValue);
    }
    case 'replaceAll': {
      const searchValue = args[0] instanceof RegExp ? args[0] : String(args[0] ?? '');
      const replaceValue = String(args[1] ?? '');
      if (searchValue instanceof RegExp && !searchValue.global) {
        return value.replace(new RegExp(searchValue.source, `${searchValue.flags}g`), replaceValue);
      }
      return value.replaceAll(searchValue as any, replaceValue);
    }
    case 'padStart': {
      const targetLength = args.length > 0 ? Number(args[0]) : value.length;
      const padStringArg = args.length > 1 ? String(args[1]) : ' ';
      return value.padStart(targetLength, padStringArg);
    }
    case 'padEnd': {
      const targetLength = args.length > 0 ? Number(args[0]) : value.length;
      const padStringArg = args.length > 1 ? String(args[1]) : ' ';
      return value.padEnd(targetLength, padStringArg);
    }
    case 'repeat': {
      const count = args.length > 0 ? Number(args[0]) : 0;
      return value.repeat(count);
    }
  }
  throw new MlldInterpreterError(`Unsupported string builtin: ${method}`);
}

function handleArrayBuiltin(method: ArrayBuiltinMethod, target: unknown, args: unknown[] = []): unknown[] {
  const array = ensureArrayTarget(method, target);
  switch (method) {
    case 'slice': {
      const start = args.length > 0 ? Number(args[0]) : undefined;
      const end = args.length > 1 ? Number(args[1]) : undefined;
      return array.slice(start ?? undefined, end ?? undefined);
    }
    case 'concat':
      return array.concat(...args);
    case 'reverse':
      return [...array].reverse();
    case 'sort': {
      const cloned = [...array];
      const comparator = args[0];
      if (typeof comparator === 'function') {
        return cloned.sort(comparator as (a: unknown, b: unknown) => number);
      }
      return cloned.sort();
    }
  }
  throw new MlldInterpreterError(`Unsupported array builtin: ${method}`);
}

function handleLengthBuiltin(target: unknown): number {
  if (typeof target === 'string' || Array.isArray(target)) {
    return target.length;
  }
  throw new MlldInterpreterError(`Cannot call .length() on ${typeof target}`);
}

function handleJoinBuiltin(target: unknown, separator: unknown): string {
  const value = ensureArrayTarget('join', target);
  const joiner = separator !== undefined ? String(separator) : ',';
  return value.join(joiner);
}

function handleSplitBuiltin(target: unknown, separator: unknown): string[] {
  const value = ensureStringTarget('split', target);
  const splitOn = separator !== undefined ? String(separator) : '';
  return value.split(splitOn);
}

function handleTypeCheckingBuiltin(method: TypeCheckingMethod, target: unknown): boolean {
  switch (method) {
    case 'isArray':
      return Array.isArray(target);
    case 'isObject':
      return typeof target === 'object' && target !== null && !Array.isArray(target);
    case 'isString':
      return typeof target === 'string';
    case 'isNumber':
      return typeof target === 'number';
    case 'isBoolean':
      return typeof target === 'boolean';
    case 'isNull':
      return target === null;
    case 'isDefined':
      return target !== null && target !== undefined;
  }
  throw new MlldInterpreterError(`Unsupported type checking builtin: ${method}`);
}

function handleSearchBuiltin(method: SearchBuiltinMethod, target: unknown, arg: unknown): boolean | number {
  if (Array.isArray(target)) {
    if (method === 'includes') {
      return target.includes(arg);
    }
    if (method === 'indexOf') {
      return target.indexOf(arg);
    }
    throw new MlldInterpreterError(`Cannot call .${method}() on array targets`);
  }

  const value = ensureStringTarget(method, target);
  const searchValue = String(arg ?? '');

  switch (method) {
    case 'includes':
      return value.includes(searchValue);
    case 'indexOf':
      return value.indexOf(searchValue);
    case 'startsWith':
      return value.startsWith(searchValue);
    case 'endsWith':
      return value.endsWith(searchValue);
  }
  throw new MlldInterpreterError(`Unsupported search builtin: ${method}`);
}

function handleMatchBuiltin(target: unknown, arg: unknown): RegExpMatchArray | null {
  const value = ensureStringTarget('match', target);
  const pattern = arg instanceof RegExp ? arg : new RegExp(String(arg ?? ''));
  return value.match(pattern);
}

export function dispatchBuiltinMethod(options: {
  commandName: string;
  objectValue: unknown;
  evaluatedArgs: unknown[];
}): { result: unknown; propagateResultDescriptor: boolean } {
  const { commandName, objectValue, evaluatedArgs } = options;
  switch (commandName) {
    case 'toLowerCase':
    case 'toUpperCase':
    case 'trim':
    case 'substring':
    case 'substr':
    case 'replace':
    case 'replaceAll':
    case 'padStart':
    case 'padEnd':
    case 'repeat':
      return {
        result: handleStringBuiltin(commandName as StringBuiltinMethod, objectValue, evaluatedArgs),
        propagateResultDescriptor: true
      };
    case 'slice':
      return {
        result: Array.isArray(objectValue)
          ? handleArrayBuiltin('slice', objectValue, evaluatedArgs)
          : handleStringBuiltin('slice', objectValue, evaluatedArgs),
        propagateResultDescriptor: true
      };
    case 'concat':
    case 'reverse':
    case 'sort':
      return {
        result: handleArrayBuiltin(commandName as ArrayBuiltinMethod, objectValue, evaluatedArgs),
        propagateResultDescriptor: true
      };
    case 'length':
      return {
        result: handleLengthBuiltin(objectValue),
        propagateResultDescriptor: false
      };
    case 'join':
      return {
        result: handleJoinBuiltin(objectValue, evaluatedArgs[0]),
        propagateResultDescriptor: true
      };
    case 'split':
      return {
        result: handleSplitBuiltin(objectValue, evaluatedArgs[0]),
        propagateResultDescriptor: true
      };
    case 'includes':
    case 'indexOf':
    case 'startsWith':
    case 'endsWith':
      return {
        result: handleSearchBuiltin(commandName as SearchBuiltinMethod, objectValue, evaluatedArgs[0]),
        propagateResultDescriptor: false
      };
    case 'match':
      return {
        result: handleMatchBuiltin(objectValue, evaluatedArgs[0]),
        propagateResultDescriptor: true
      };
    case 'isArray':
    case 'isObject':
    case 'isString':
    case 'isNumber':
    case 'isBoolean':
    case 'isNull':
    case 'isDefined':
      return {
        result: handleTypeCheckingBuiltin(commandName as TypeCheckingMethod, objectValue),
        propagateResultDescriptor: false
      };
    default:
      throw new MlldInterpreterError(`Unknown builtin method: ${commandName}`);
  }
}

export async function evaluateBuiltinArguments(args: unknown[], env: Environment): Promise<unknown[]> {
  const evaluatedArgs: unknown[] = [];
  for (const arg of args) {
    const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
    const evaluatedArg = await evaluateDataValue(arg as any, env);
    evaluatedArgs.push(evaluatedArg);
  }
  return evaluatedArgs;
}

type BuiltinObjectReference = {
  identifier: string;
  fields?: Array<{ type: string; value: any }>;
};

type BuiltinCommandRefWithObject = {
  objectReference?: BuiltinObjectReference;
  objectSource?: ExecInvocation;
};

type BuiltinObjectResolution = {
  objectValue: unknown;
  objectVar?: Variable;
  sourceDescriptor?: SecurityDescriptor;
};

export async function resolveBuiltinInvocationObject(options: {
  commandName: string;
  commandRefWithObject: BuiltinCommandRefWithObject;
  env: Environment;
  normalizeFields: (fields?: Array<{ type: string; value: any }>) => Array<{ type: string; value: any }>;
  resolveVariableIndexValue: (fieldValue: unknown, env: Environment) => Promise<unknown>;
  // Recursion seam: objectSource points back to an ExecInvocation.
  evaluateExecInvocationNode: (node: ExecInvocation, env: Environment) => Promise<EvalResult>;
}): Promise<
  { kind: 'type-check-fallback'; result: boolean } | { kind: 'resolved'; value: BuiltinObjectResolution }
> {
  const {
    commandName,
    commandRefWithObject,
    env,
    normalizeFields,
    resolveVariableIndexValue,
    evaluateExecInvocationNode
  } = options;
  const isTypeCheckingBuiltin = isTypeCheckingBuiltinMethod(commandName);

  let objectValue: unknown;
  let objectVar: Variable | undefined;
  let sourceDescriptor: SecurityDescriptor | undefined;

  if (commandRefWithObject.objectReference) {
    const objectRef = commandRefWithObject.objectReference;
    objectVar = env.getVariable(objectRef.identifier);
    if (!objectVar) {
      if (isTypeCheckingBuiltin) {
        return {
          kind: 'type-check-fallback',
          result: handleTypeCheckingBuiltin(commandName as TypeCheckingMethod, undefined)
        };
      }
      throw new MlldInterpreterError(`Object not found: ${objectRef.identifier}`);
    }

    const { extractVariableValue, isVariable } = await import('@interpreter/utils/variable-resolution');
    objectValue = await extractVariableValue(objectVar, env);
    if (isVariable(objectValue)) {
      objectValue = await extractVariableValue(objectValue, env);
    }

    if (objectRef.fields && objectRef.fields.length > 0) {
      const normalizedFields = normalizeFields(objectRef.fields);
      for (const field of normalizedFields) {
        let targetValue: any = objectValue;
        let key = field.value;

        if (field.type === 'variableIndex') {
          if (isStructuredValue(targetValue)) {
            targetValue = asData(targetValue);
          }
          key = await resolveVariableIndexValue(field.value, env);
        }

        if (isStructuredValue(targetValue) && typeof key === 'string' && key in (targetValue as any)) {
          objectValue = (targetValue as any)[key];
        } else if (typeof targetValue === 'object' && targetValue !== null) {
          objectValue = (targetValue as any)[key];
        } else {
          if (isTypeCheckingBuiltin) {
            return {
              kind: 'type-check-fallback',
              result: handleTypeCheckingBuiltin(commandName as TypeCheckingMethod, undefined)
            };
          }
          throw new MlldInterpreterError(`Cannot access field ${String(key)} on non-object`);
        }
      }
    }
  } else if (commandRefWithObject.objectSource) {
    const srcResult = await evaluateExecInvocationNode(commandRefWithObject.objectSource, env);
    if (srcResult && typeof srcResult === 'object') {
      sourceDescriptor = extractSecurityDescriptor(srcResult.value);
      if (srcResult.value !== undefined) {
        const { resolveValue, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
        objectValue = await resolveValue(srcResult.value, env, ResolutionContext.Display);
      } else if (typeof srcResult.stdout === 'string') {
        objectValue = srcResult.stdout;
      }
    }
  }

  if (typeof objectValue === 'undefined') {
    if (isTypeCheckingBuiltin) {
      return {
        kind: 'type-check-fallback',
        result: handleTypeCheckingBuiltin(commandName as TypeCheckingMethod, objectValue)
      };
    }
    throw new MlldInterpreterError('Unable to resolve object value for builtin method invocation');
  }

  return {
    kind: 'resolved',
    value: {
      objectValue,
      objectVar,
      sourceDescriptor
    }
  };
}
