import type { Environment } from '../../env/Environment';
import type { CommandExecutionContext } from '../../env/ErrorUtils';
import type { PipelineCommand, VariableSource } from '@core/types';
import { MlldCommandExecutionError, MlldInterpreterError } from '@core/errors';
import { createPipelineInputVariable, createSimpleTextVariable, createArrayVariable, createObjectVariable } from '@core/types/variable';
import type { SecurityDescriptor } from '@core/types/security';
import { createPipelineParameterVariable } from '../../utils/parameter-factory';
import { buildPipelineStructuredValue } from '../../utils/pipeline-input';
import {
  asText,
  isStructuredValue,
  wrapStructured,
  looksLikeJsonString,
  normalizeWhenShowEffect,
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  type StructuredValue,
  type StructuredValueType
} from '../../utils/structured-value';
import { wrapExecResult } from '../../utils/structured-exec';
import { normalizeTransformerResult } from '../../utils/transformer-result';
import type { Variable } from '@core/types/variable/VariableTypes';
import { logger } from '@core/utils/logger';
import { getOperationLabels, parseCommand } from '@core/policy/operation-labels';
import { isEventEmitter, isLegacyStream, toJsValue, wrapNodeValue } from '../../utils/node-interop';
import type { HookableNode } from '@core/types/hooks';
import type { HookDecision } from '../../hooks/HookManager';
import type { OperationContext } from '../../env/ContextManager';
import { materializeGuardInputs } from '../../utils/guard-inputs';
import { handleGuardDecision } from '../../hooks/hook-decision-handler';
import { handleExecGuardDenial } from '../guard-denial-handler';
import type { WhenExpressionNode } from '@core/types/when';
import { resolveWorkingDirectory } from '../../utils/working-directory';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { collectInputDescriptor, descriptorToInputTaint, mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { resolveUsingEnvParts } from '@interpreter/utils/auth-injection';
import {
  applyEnvironmentDefaults,
  buildEnvironmentOutputDescriptor,
  executeProviderCommand,
  extractEnvironmentConfig,
  resolveEnvironmentAuthSecrets
} from '@interpreter/env/environment-provider';

export type RetrySignal = { value: 'retry'; hint?: any; from?: number };
type CommandExecutionPrimitive = string | number | boolean | null | undefined;
export type CommandExecutionResult =
  | CommandExecutionPrimitive
  | StructuredValue
  | Record<string, unknown>
  | unknown[]
  | RetrySignal;

export interface CommandExecutionHookOptions {
  operationContext?: OperationContext;
  hookNode?: HookableNode;
  stageInputs?: readonly unknown[];
  executionContext?: CommandExecutionContext;
}

const STRUCTURED_PIPELINE_LANGUAGES = new Set([
  'mlld-for',
  'mlld-foreach',
  'mlld-loop',
  'js',
  'javascript',
  'node',
  'nodejs',
  'python'
]);

function shouldAutoParsePipelineInput(language?: string | null): boolean {
  if (!language) return false;
  return STRUCTURED_PIPELINE_LANGUAGES.has(language.toLowerCase());
}

function parseStructuredJson(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const firstChar = trimmed[0];
  if (firstChar !== '{' && firstChar !== '[') {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    const sanitized = sanitizeJsonStringControlChars(trimmed);
    if (sanitized !== trimmed) {
      try {
        const reparsed = JSON.parse(sanitized);
        if (reparsed && typeof reparsed === 'object') {
          return reparsed;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sanitizeJsonStringControlChars(input: string): string {
  let inString = false;
  let escaping = false;
  let changed = false;
  let result = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString) {
      const code = char.charCodeAt(0);
      if (code >= 0 && code < 0x20) {
        changed = true;
        switch (char) {
          case '\n':
            result += '\\n';
            continue;
          case '\r':
            result += '\\r';
            continue;
          case '\t':
            result += '\\t';
            continue;
          case '\f':
            result += '\\f';
            continue;
          case '\b':
            result += '\\b';
            continue;
          case '\v':
            result += '\\u000b';
            continue;
          default:
            result += `\\u${code.toString(16).padStart(4, '0')}`;
            continue;
        }
      }
    }

    result += char;
  }

  return changed ? result : input;
}

/**
 * Maintain text/data duality on parsed pipeline values.
 * WHY: Pipelines auto-parse JSON for native stages but downstream
 *      string-based transformers still expect the original text view.
 * CONTEXT: Hooks stay non-enumerable to avoid leaking helper props
 *          into user iteration or JSON serialization.
 */
function attachOriginalTextHooks(target: any, original: string): void {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
    return;
  }
  try {
    Object.defineProperty(target, 'text', {
      value: original,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, 'raw', {
      value: original,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, 'data', {
      get: () => target,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, 'toString', {
      value: () => original,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, 'valueOf', {
      value: () => original,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, Symbol.toPrimitive, {
      value: (hint: string) => {
        if (hint === 'number') {
          const coerced = Number(original);
          return Number.isNaN(coerced) ? original : coerced;
        }
        return original;
      },
      enumerable: false,
      configurable: true
    });
  } catch {}
}

/**
 * Provide string fallbacks for structured pipeline data via Proxy.
 * WHY: Stage chaining mixes native mlld (object/array access) with
 *      transformers that call string helpers like `.trim()`.
 * CONTEXT: Delegates unknown properties to String.prototype so the
 *          proxy behaves like the original text when requested.
 */
function wrapPipelineStructuredValue<T extends object>(parsedValue: T, original: string): T {
  if (!parsedValue || typeof parsedValue !== 'object') {
    return parsedValue;
  }

  attachOriginalTextHooks(parsedValue, original);

  const stringPrototype = String.prototype as Record<PropertyKey, any>;

  const proxy = new Proxy(parsedValue as Record<PropertyKey, any>, {
    get(target, prop, receiver) {
      if (prop === 'text' || prop === 'raw' || prop === 'data') {
        return Reflect.get(target, prop, receiver);
      }
      if (prop === Symbol.toPrimitive) {
        const primitive = Reflect.get(target, prop, receiver);
        if (typeof primitive === 'function') {
          return primitive;
        }
        return (hint: string) => {
          if (hint === 'number') {
            const numeric = Number(original);
            return Number.isNaN(numeric) ? original : numeric;
          }
          return original;
        };
      }

      if (prop === 'toString' || prop === 'valueOf') {
        return Reflect.get(target, prop, receiver);
      }

      if (prop === 'length' && !Reflect.has(target, prop) && typeof original === 'string') {
        return original.length;
      }

      if (Reflect.has(target, prop)) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }

      if (typeof original === 'string') {
        if (prop in stringPrototype) {
          const candidate = stringPrototype[prop];
          if (typeof candidate === 'function') {
            return candidate.bind(original);
          }
          return candidate;
        }
        if (prop === Symbol.iterator) {
          const iterator = stringPrototype[Symbol.iterator];
          if (typeof iterator === 'function') {
            return iterator.bind(original);
          }
        }
      }

      return undefined;
    },
    has(target, prop) {
      if (prop === 'text' || prop === 'raw' || prop === 'data') {
        return true;
      }
      if (typeof original === 'string' && (prop in stringPrototype)) {
        return true;
      }
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      const keys = new Set<PropertyKey>(Reflect.ownKeys(target));
      keys.add('text');
      keys.add('raw');
      keys.add('data');
      return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === 'text' || prop === 'raw') {
        return {
          configurable: true,
          enumerable: false,
          value: original
        };
      }
      if (prop === 'data') {
        return {
          configurable: true,
          enumerable: false,
          value: target
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    set(target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver);
    }
  });

  return proxy as T;
}

function wrapJsonLikeString(text: string): StructuredValue | null {
  if (typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const firstChar = trimmed[0];
  if (firstChar !== '{' && firstChar !== '[') {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return wrapStructured(parsed, 'array', text);
    }
    if (parsed !== null && typeof parsed === 'object') {
      return wrapStructured(parsed, 'object', text);
    }
  } catch (error) {
    if (process.env.MLLD_DEBUG === 'true') {
      try {
        const codes = Array.from(trimmed).map(ch => ch.charCodeAt(0));
        const details = error instanceof Error ? error.stack || error.message : String(error);
        console.error('[wrapJsonLikeString] Failed to parse JSON-like text:', JSON.stringify(text), codes, details);
      } catch {}
    }
    return null;
  }

  return null;
}

function createTypedPipelineVariable(
  paramName: string,
  parsedValue: any,
  originalText: string
): Variable {
  const pipelineSource: VariableSource = {
    directive: 'var',
    syntax: 'pipeline',
    hasInterpolation: false,
    isMultiLine: false
  };
  const internal: Record<string, any> = {
    isPipelineParameter: true,
    pipelineOriginal: originalText,
    pipelineFormat: 'json'
  };

  if (Array.isArray(parsedValue)) {
    const bridged = wrapPipelineStructuredValue(parsedValue, originalText);
    internal.pipelineType = 'array';
    internal.customToString = () => originalText;
    return createArrayVariable(paramName, bridged, false, pipelineSource, { internal });
  }

  if (parsedValue && typeof parsedValue === 'object') {
    const bridged = wrapPipelineStructuredValue(parsedValue, originalText);
    internal.pipelineType = 'object';
    internal.customToString = () => originalText;
    return createObjectVariable(paramName, bridged as Record<string, any>, false, pipelineSource, { internal });
  }

  const textSource: VariableSource = {
    directive: 'var',
    syntax: 'quoted',
    hasInterpolation: false,
    isMultiLine: false
  };
  return createSimpleTextVariable(paramName, originalText, textSource, { internal: { isPipelineParameter: true } });
}

interface AssignPipelineParameterOptions {
  name: string;
  value: unknown;
  originalVariable?: Variable;
  pipelineStage?: number;
  isPipelineInput?: boolean;
  markPipelineContext?: boolean;
}

function assignPipelineParameter(
  targetEnv: Environment,
  options: AssignPipelineParameterOptions
): void {
  const variable = createPipelineParameterVariable({
    name: options.name,
    value: options.value,
    origin: 'pipeline',
    originalVariable: options.originalVariable,
    allowOriginalReuse: Boolean(options.originalVariable),
    pipelineStage: options.pipelineStage,
    isPipelineInput: options.isPipelineInput
  });

  if (!variable) {
    return;
  }

  if (options.markPipelineContext) {
    variable.internal = {
      ...(variable.internal ?? {}),
      isPipelineContext: true
    };
  }

  targetEnv.setParameterVariable(options.name, variable);
}

function normalizePipelineParameterValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return '';
  }
  if (isStructuredValue(value)) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'object') {
    const candidate = value as { type?: string; content?: unknown };
    if (candidate && candidate.type === 'Text' && candidate.content !== undefined) {
      return candidate.content;
    }
    if (candidate && candidate.content !== undefined) {
      return candidate.content;
    }
    return value;
  }
  return String(value);
}

function isPipelineContextCandidate(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'stage' in (value as Record<string, unknown>));
}

function resolveExecutableLanguage(commandVar: any, execDef: any): string | undefined {
  if (execDef?.language) return String(execDef.language);
  if (execDef?.type === 'nodeFunction' || execDef?.type === 'nodeClass') {
    return 'node';
  }
  const metadataDef = commandVar?.internal?.executableDef;
  if (metadataDef?.language) {
    return String(metadataDef.language);
  }
  if (commandVar?.value?.language) {
    return String(commandVar.value.language);
  }
  if (commandVar?.language) {
    return String(commandVar.language);
  }
  return undefined;
}

function resolveOpTypeFromLanguage(
  language?: string
): 'sh' | 'node' | 'js' | 'py' | 'prose' | null {
  if (!language) {
    return null;
  }
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'bash' || normalized === 'sh' || normalized === 'shell') {
    return 'sh';
  }
  if (normalized === 'node' || normalized === 'nodejs') {
    return 'node';
  }
  if (normalized === 'js' || normalized === 'javascript') {
    return 'js';
  }
  if (normalized === 'py' || normalized === 'python') {
    return 'py';
  }
  if (normalized === 'prose') {
    return 'prose';
  }
  return null;
}

/**
 * Resolve a command reference to an executable variable
 */
/**
 * Resolve a pipeline command reference to an executable or value.
 * WHY: Commands may be object methods, executables, or values with field access.
 * CONTEXT: Used by pipeline execution to resolve identifiers from the stage env.
 */
export async function resolveCommandReference(
  command: PipelineCommand,
  env: Environment
): Promise<any> {
  // The command.identifier is already an array of nodes from the parser
  if (!command.identifier || command.identifier.length === 0) {
    return null;
  }

  // Use the first node (should be a VariableReference node)
  const varRefNode = command.identifier[0];

  // Check if this is a variable reference with field access
  if (varRefNode.type === 'VariableReference') {
    const varRef = varRefNode as any;

    let baseVar = env.getVariable(varRef.identifier);
    let parsedFields: any[] = [];

    // If not found and identifier contains a dot, try splitting for transformer variants
    // This handles cases where the grammar outputs dotted names like "json.fromlist"
    if (!baseVar && varRef.identifier.includes('.')) {
      const parts = varRef.identifier.split('.');
      const baseName = parts[0];
      const fieldPath = parts.slice(1);

      baseVar = env.getVariable(baseName);
      if (baseVar && fieldPath.length > 0) {
        // Store the parsed fields for processing below
        parsedFields = fieldPath.map(value => ({ type: 'field', value }));
      }
    }

    if (!baseVar) {
      return null;
    }

    const variantMap =
      (baseVar.internal?.transformerVariants as Record<string, unknown> | undefined);
    let value: any;
    let remainingFields = parsedFields.length > 0 ? parsedFields : (Array.isArray(varRef.fields) ? [...varRef.fields] : []);

    if (variantMap && remainingFields.length > 0) {
      const firstField = remainingFields[0];
      if (firstField.type === 'field' || firstField.type === 'stringIndex' || firstField.type === 'numericField') {
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
      // Extract value for non-executable variables
      const { extractVariableValue } = await import('../../utils/variable-resolution');
      value = await extractVariableValue(baseVar, env);
    }
    
    if (remainingFields.length > 0) {
      for (const field of remainingFields) {
        if ((field.type === 'field' || field.type === 'stringIndex' || field.type === 'numericField') && typeof value === 'object' && value !== null) {
          value = (value as Record<string, unknown>)[String(field.value)];
        } else if (field.type === 'arrayIndex' && Array.isArray(value)) {
          value = value[Number(field.value)];
        } else {
          const fieldName = String(field.value);
          throw new Error(`Cannot access field '${fieldName}' on ${typeof value}`);
        }
      }
    }
    
    // Return the resolved value
    return value;
  }
  
  return null;
}

/**
 * Execute a command variable with arguments
 */
/**
 * Execute a resolved command variable with arguments in a stage environment.
 * WHY: Handle built-in transformers, code/command/template execs, and when-expressions.
 * CONTEXT: First parameter in pipeline gets @input (format-aware), other params bind explicitly.
 */
export async function executeCommandVariable(
  commandVar: any,
  args: any[],
  env: Environment,
  stdinInput?: string,
  structuredInput?: StructuredValue,
  hookOptions?: CommandExecutionHookOptions
): Promise<CommandExecutionResult> {
  const finalizeResult = (
    value: unknown,
    options?: { type?: string; text?: string }
  ): CommandExecutionResult => {
    if (
      typeof value === 'string' &&
      (!options || !options.type || options.type === 'text') &&
      looksLikeJsonString(value)
    ) {
      try {
        const parsed = JSON.parse(value.trim());
        const typeHint = Array.isArray(parsed) ? 'array' : 'object';
        return wrapExecResult(parsed, { type: typeHint, text: options?.text ?? value });
      } catch {
        // Fall through to default wrapping when JSON.parse fails
      }
    }
    return wrapExecResult(value, options);
  };

  // Built-in transformer handling
  if (commandVar && commandVar.internal?.isBuiltinTransformer && commandVar.internal?.transformerImplementation) {
    try {
      const result = await commandVar.internal.transformerImplementation(stdinInput || '');
      const normalized = normalizeTransformerResult(commandVar?.name, result);
      return finalizeResult(normalized.value, normalized.options);
    } catch (error) {
      throw new MlldCommandExecutionError(
        `Transformer ${commandVar.name} failed: ${error.message}`,
        undefined,
        {
          command: commandVar.name,
          exitCode: 1,
          duration: 0,
          workingDirectory: env.getExecutionDirectory()
        }
      );
    }
  }
  
  // Handle both wrapped executable variables and direct definitions
  let execDef: any;
  
  if (commandVar && commandVar.type === 'executable' && commandVar.value) {
    // Check if we have the full ExecutableDefinition in internal
    const storedDef = commandVar.internal?.executableDef;
    if (storedDef) {
      execDef = storedDef;
      
      // Also copy paramNames from the variable if not in execDef
      if (!execDef.paramNames && commandVar.paramNames) {
        execDef.paramNames = commandVar.paramNames;
      }
    } else {
      // Fall back to the simplified value structure
      const simplifiedValue = commandVar.value;
      if (simplifiedValue.type === 'code') {
        execDef = {
          type: 'code',
          codeTemplate: simplifiedValue.template,
          language: simplifiedValue.language || 'javascript',
          paramNames: commandVar.paramNames || []
        };
      } else if (simplifiedValue.type === 'command') {
        execDef = {
          type: 'command',
          commandTemplate: simplifiedValue.template,
          paramNames: commandVar.paramNames || []
        };
      } else {
        execDef = simplifiedValue;
      }
    }
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      logger.debug('Executable definition extracted:', {
        type: execDef?.type,
        hasParamNames: !!execDef?.paramNames,
        hasCommandTemplate: !!execDef?.commandTemplate,
        hasCodeTemplate: !!execDef?.codeTemplate,
        hasTemplateContent: !!execDef?.templateContent,
        hasTemplate: !!execDef?.template,
        language: execDef?.language,
        fromMetadata: !!commandVar.internal?.executableDef
      });
    }
  } else if (commandVar && (commandVar.type === 'command' || commandVar.type === 'code' || commandVar.type === 'template') && (commandVar.commandTemplate || commandVar.codeTemplate || commandVar.templateContent)) {
    // This is a direct executable definition
    execDef = commandVar;
  } else {
    // Enhanced error message with more detail
    const varInfo = {
      type: commandVar?.type,
      hasValue: !!commandVar?.value,
      valueType: commandVar?.value?.type,
      valueKeys: commandVar?.value ? Object.keys(commandVar.value) : [],
      hasCommandTemplate: !!(commandVar?.commandTemplate),
      hasCodeTemplate: !!(commandVar?.codeTemplate),
      hasTemplateContent: !!(commandVar?.templateContent),
      hasTemplate: !!(commandVar?.template),
      keys: commandVar ? Object.keys(commandVar) : [],
      valueStructure: commandVar?.value ? {
        type: commandVar.value.type,
        hasTemplate: !!(commandVar.value.template),
        hasCodeTemplate: !!(commandVar.value.codeTemplate),
        hasCommandTemplate: !!(commandVar.value.commandTemplate),
        language: commandVar.value.language,
        paramNames: commandVar.value.paramNames
      } : null
    };
    throw new Error(`Cannot execute non-executable variable in pipeline: ${JSON.stringify(varInfo, null, 2)}`);
  }

  let boundArgs: unknown[] = [];
  let baseParamNames: string[] = [];
  let paramNames: string[] = [];

  if (execDef?.type === 'partial') {
    boundArgs = Array.isArray(execDef.boundArgs) ? execDef.boundArgs : [];
    baseParamNames = Array.isArray(execDef.base?.paramNames) ? execDef.base.paramNames : [];
    paramNames = Array.isArray(execDef.paramNames)
      ? execDef.paramNames
      : baseParamNames.slice(boundArgs.length);
    execDef = execDef.base;
  } else {
    baseParamNames = Array.isArray(execDef?.paramNames) ? execDef.paramNames : [];
    paramNames = baseParamNames;
  }
  
  let whenExprNode: WhenExpressionNode | null = null;
  if (execDef?.language === 'mlld-when' && Array.isArray(execDef.codeTemplate) && execDef.codeTemplate.length > 0) {
    const candidate = execDef.codeTemplate[0];
    if (candidate && candidate.type === 'WhenExpression') {
      whenExprNode = candidate as WhenExpressionNode;
    }
  }

  // Create environment with parameter bindings
  const execEnv = env.createChild();
  
  // Get the format from the pipeline context
  const pipelineCtx = env.getPipelineContext();
  const format = pipelineCtx?.format;
  const stageLanguage = resolveExecutableLanguage(commandVar, execDef);
  
  // Parameter binding for executable functions
  if (paramNames.length > 0) {
    for (let i = 0; i < paramNames.length; i++) {
      const paramName = paramNames[i];
      // In pipelines, explicit args bind starting from the SECOND parameter
      // First parameter always gets @input (stdinInput) implicitly
      const argIndex = pipelineCtx !== undefined && stdinInput !== undefined ? i - 1 : i;
      const argValue = argIndex >= 0 && argIndex < args.length ? args[argIndex] : null;
      
      // First parameter in pipeline context ALWAYS gets @input
      const isPipelineParam = i === 0 && pipelineCtx !== undefined && stdinInput !== undefined;
      
      if (isPipelineParam) {
        const { AutoUnwrapManager } = await import('../auto-unwrap-manager');
        const textValue = structuredInput ? structuredInput.text : (stdinInput ?? '');
        const unwrapSource = structuredInput ?? textValue;
        const unwrappedStdin = AutoUnwrapManager.unwrap(unwrapSource);

        const hasNativeStructuredInput =
          structuredInput && structuredInput.type && structuredInput.type !== 'text';

        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[DEBUG isPipelineParam]:', {
            paramName,
            structuredInputType: structuredInput?.type,
            hasNative: hasNativeStructuredInput,
            textValuePreview: textValue?.substring(0, 50)
          });
        }

        if (hasNativeStructuredInput) {
          const typedVar = createTypedPipelineVariable(paramName, structuredInput.data, textValue);
          assignPipelineParameter(execEnv, {
            name: paramName,
            value: typedVar.value,
            originalVariable: typedVar,
            pipelineStage: pipelineCtx?.stage,
            isPipelineInput: true
          });
          continue;
        }

        if (!format) {
          const shouldParse = shouldAutoParsePipelineInput(stageLanguage);
          if (shouldParse) {
            const candidate = typeof unwrappedStdin === 'string' ? unwrappedStdin : textValue;
            const parsed = parseStructuredJson(candidate);
            if (parsed !== null) {
              const typedVar = createTypedPipelineVariable(paramName, parsed, candidate);
              assignPipelineParameter(execEnv, {
                name: paramName,
                value: typedVar.value,
                originalVariable: typedVar,
                pipelineStage: pipelineCtx?.stage,
                isPipelineInput: true
              });
              continue;
            }
          }
          const resolvedText = typeof unwrappedStdin === 'string' ? unwrappedStdin : textValue;
          const textSource: VariableSource = {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          };

          const textVar = createSimpleTextVariable(
            paramName,
            resolvedText,
            textSource,
            { internal: { isPipelineParameter: true } }
          );

          assignPipelineParameter(execEnv, {
            name: paramName,
            value: textVar.value,
            originalVariable: textVar,
            pipelineStage: pipelineCtx?.stage,
            isPipelineInput: true
          });
          continue;
        } else {
          const resolvedText = typeof unwrappedStdin === 'string' ? unwrappedStdin : textValue;
          const wrappedInput = buildPipelineStructuredValue(resolvedText, format as StructuredValueType);

          const pipelineSource: VariableSource = {
            directive: 'var',
            syntax: 'template',
            hasInterpolation: false,
            isMultiLine: false
          };

          const pipelineVar = createPipelineInputVariable(
            paramName,
            wrappedInput,
            format as 'json' | 'csv' | 'xml' | 'text',
            resolvedText,
            pipelineSource,
            { internal: { pipelineStage: pipelineCtx?.stage } }
          );

          assignPipelineParameter(execEnv, {
            name: paramName,
            value: pipelineVar.value,
            originalVariable: pipelineVar,
            pipelineStage: pipelineCtx?.stage,
            isPipelineInput: true
          });
          continue;
        }
      } else {
        const normalizedValue = normalizePipelineParameterValue(argValue);
        assignPipelineParameter(execEnv, {
          name: paramName,
          value: normalizedValue,
          pipelineStage: pipelineCtx?.stage,
          markPipelineContext: isPipelineContextCandidate(normalizedValue)
        });
      }
    }
  }

  if (boundArgs.length > 0 && baseParamNames.length > 0) {
    for (let i = 0; i < boundArgs.length && i < baseParamNames.length; i++) {
      const paramName = baseParamNames[i];
      const normalizedValue = normalizePipelineParameterValue(boundArgs[i]);
      assignPipelineParameter(execEnv, {
        name: paramName,
        value: normalizedValue,
        pipelineStage: pipelineCtx?.stage,
        markPipelineContext: isPipelineContextCandidate(normalizedValue)
      });
    }
  }

  const hookNode = hookOptions?.hookNode;
  const operationContext = hookOptions?.operationContext;
  let preDecision: HookDecision | undefined;
  const stageInputs = hookOptions?.stageInputs ?? [];
  const guardInputCandidates: unknown[] = [];
  const stageInputVar = env.getVariable?.('input');
  if (stageInputVar) {
    guardInputCandidates.push(stageInputVar);
  }
  if (stageInputs.length > 0) {
    guardInputCandidates.push(...stageInputs);
  }
  if (baseParamNames.length > 0) {
    for (const paramName of baseParamNames) {
      const paramVar = execEnv.getVariable(paramName);
      if (paramVar) {
        guardInputCandidates.push(paramVar);
      }
    }
  }
  const guardInputs = materializeGuardInputs(guardInputCandidates, { nameHint: '__pipeline_stage_input__' });

  const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
  const execDescriptor = commandVar?.mx ? varMxToSecurityDescriptor(commandVar.mx) : undefined;
  const exeLabels = execDescriptor?.labels ? Array.from(execDescriptor.labels) : [];
  const guardDescriptor = collectInputDescriptor(guardInputs);
  const policyLocation = operationContext?.location ?? hookOptions?.executionContext?.sourceLocation;

  if (execDef.type === 'command' && execDef.commandTemplate) {
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    const commandDescriptors: SecurityDescriptor[] = [];
    const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand, {
      collectSecurityDescriptor: descriptor => {
        if (descriptor) {
          commandDescriptors.push(descriptor);
        }
      }
    });
    const parsedCommand = parseCommand(command);
    const opLabels = getOperationLabels({
      type: 'cmd',
      command: parsedCommand.command,
      subcommand: parsedCommand.subcommand
    });
    if (operationContext) {
      operationContext.command = command;
      operationContext.opLabels = opLabels;
      const metadata = { ...(operationContext.metadata ?? {}) } as Record<string, unknown>;
      metadata.commandPreview = command;
      operationContext.metadata = metadata;
    }
    env.updateOpContext({ command, opLabels });
    const commandDescriptor =
      commandDescriptors.length > 1
        ? env.mergeSecurityDescriptors(...commandDescriptors)
        : commandDescriptors[0];
    const inputDescriptor = mergeInputDescriptors(guardDescriptor, commandDescriptor);
    const inputTaint = descriptorToInputTaint(inputDescriptor);
    if (inputTaint.length > 0) {
      const flowChannel = execDef.withClause?.auth || execDef.withClause?.using
        ? 'using'
        : stdinInput !== undefined
          ? 'stdin'
          : 'arg';
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel,
          command: parsedCommand.command
        },
        { env, sourceLocation: policyLocation }
      );
    }
  } else if (execDef.type === 'code' && execDef.codeTemplate) {
    const opType = resolveOpTypeFromLanguage(stageLanguage);
    const opLabels = opType ? getOperationLabels({ type: opType }) : [];
    const inputTaint = descriptorToInputTaint(guardDescriptor);
    if (opType && inputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel: 'arg'
        },
        { env, sourceLocation: policyLocation }
      );
    }
  } else if (execDef.type === 'nodeFunction') {
    const opLabels = getOperationLabels({ type: 'node' });
    const inputTaint = descriptorToInputTaint(guardDescriptor);
    if (inputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel: 'arg'
        },
        { env, sourceLocation: policyLocation }
      );
    }
  }

  if (hookNode && operationContext) {
    const hookManager = env.getHookManager();
    preDecision = await hookManager.runPre(hookNode, guardInputs, env, operationContext);
    const guardInputVariable =
      preDecision && preDecision.metadata && (preDecision.metadata as Record<string, unknown>).guardInput;
    try {
      await handleGuardDecision(preDecision, hookNode, env, operationContext);
    } catch (error) {
      if (guardInputVariable) {
        const existingInput = execEnv.getVariable('input');
        if (!existingInput) {
          const clonedInput: Variable = {
            ...(guardInputVariable as Variable),
            name: 'input',
            mx: { ...(guardInputVariable as Variable).mx },
            internal: {
              ...((guardInputVariable as Variable).internal ?? {}),
              isSystem: true,
              isParameter: true
            }
          };
          execEnv.setParameterVariable('input', clonedInput);
        }
      }
      if (whenExprNode) {
        const handled = await handleExecGuardDenial(error, {
          execEnv,
          env,
          whenExprNode
        });
        if (handled) {
          return finalizeResult(handled.value ?? handled.stdout ?? '');
        }
      }
      throw error;
    }
  }
  // Execute based on type
  let workingDirectory: string | undefined;
  if (execDef?.workingDir) {
    workingDirectory = await resolveWorkingDirectory(execDef.workingDir as any, execEnv, {
      sourceLocation: commandVar?.mx?.definedAt,
      directiveType: hookOptions?.executionContext?.directiveType || 'exec'
    });
  }
  const executionContext = hookOptions?.executionContext
    ? { ...hookOptions?.executionContext, workingDirectory: workingDirectory ?? hookOptions.executionContext?.workingDirectory }
    : (workingDirectory ? { workingDirectory } : hookOptions?.executionContext);

  if (execDef.type === 'command' && execDef.commandTemplate) {
    // Interpolate command template with parameters
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand);
    const guardEnvConfig = extractEnvironmentConfig(preDecision?.metadata);
    const resolvedEnvConfig = applyEnvironmentDefaults(guardEnvConfig, execEnv.getPolicySummary());
    const outputDescriptor = buildEnvironmentOutputDescriptor(command, resolvedEnvConfig);

    const applyOutputDescriptor = (value: CommandExecutionResult): CommandExecutionResult => {
      if (!outputDescriptor) {
        return value;
      }
      if (value && typeof value === 'object' && isStructuredValue(value)) {
        const existing = extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true });
        const merged = existing ? env.mergeSecurityDescriptors(existing, outputDescriptor) : outputDescriptor;
        applySecurityDescriptorToStructuredValue(value, merged);
        return value;
      }
      const wrapped = wrapExecResult(value);
      applySecurityDescriptorToStructuredValue(wrapped, outputDescriptor);
      return wrapped;
    };

    // Always pass pipeline input as stdin when available
    const usingParts = await resolveUsingEnvParts(execEnv, execDef.withClause);
    const envAuthSecrets = await resolveEnvironmentAuthSecrets(execEnv, resolvedEnvConfig);
    let commandOutput: unknown;
    if (resolvedEnvConfig?.provider) {
      const providerResult = await executeProviderCommand({
        env: execEnv,
        providerRef: resolvedEnvConfig.provider,
        config: resolvedEnvConfig,
        command,
        workingDirectory,
        stdin: stdinInput,
        vars: usingParts.vars,
        secrets: {
          ...envAuthSecrets,
          ...usingParts.secrets
        },
        executionContext,
        sourceLocation: commandVar?.mx?.definedAt ?? null,
        directiveType: executionContext?.directiveType ?? 'exec'
      });
      commandOutput = providerResult.stdout ?? '';
    } else {
      const injectedEnv = {
        ...envAuthSecrets,
        ...usingParts.merged
      };
      const commandOptions =
        stdinInput !== undefined || workingDirectory || Object.keys(injectedEnv).length > 0
          ? {
              ...(stdinInput !== undefined ? { input: stdinInput } : {}),
              ...(workingDirectory ? { workingDirectory } : {}),
              ...(Object.keys(injectedEnv).length > 0 ? { env: injectedEnv } : {})
            }
          : undefined;
      commandOutput = await env.executeCommand(
        command,
        commandOptions as any,
        executionContext
      );
    }

    const withClause = execDef.withClause;
    if (withClause) {
      if (withClause.pipeline && withClause.pipeline.length > 0) {
        const { processPipeline } = await import('./unified-processor');
        const processed = await processPipeline({
          value: commandOutput,
          env,
          pipeline: withClause.pipeline,
          format: withClause.format as string | undefined,
          isRetryable: false,
          identifier: commandVar?.name,
          location: commandVar.mx?.definedAt,
          descriptorHint: outputDescriptor
        });
        if (processed === 'retry') {
          return 'retry';
        }
        if (processed && typeof processed === 'object' && (processed as any).value === 'retry') {
          return processed as RetrySignal;
        }
        commandOutput = processed;
      }
    }

    return applyOutputDescriptor(finalizeResult(commandOutput));
  } else if (execDef.type === 'code' && execDef.codeTemplate) {
    // Special handling for mlld-when expressions
    if (execDef.language === 'mlld-when') {
      // The codeTemplate contains the WhenExpression node
      const whenExprNode = execDef.codeTemplate[0];
      if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
        throw new Error('mlld-when executable missing WhenExpression node');
      }
      
      // Evaluate the when expression with the parameter environment
      const { evaluateWhenExpression } = await import('../when-expression');
      const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
      
      // Check if this is a retry signal
      let resultValue = whenResult.value;
      if (resultValue && typeof resultValue === 'object' && resultValue.value === 'retry') {
        // This is a retry signal - return it as-is for the pipeline to handle
        return resultValue;
      }
      if (resultValue === 'retry') {
        return 'retry';
      }
      
      const normalized = normalizeWhenShowEffect(resultValue);
      resultValue = normalized.normalized;

      const inPipeline = !!env.getPipelineContext();
      if (inPipeline && normalized.hadShowEffect) {
        // If this is the last stage, suppress echo to avoid showing seed text.
        // If there are more stages, propagate input forward to keep pipeline alive.
        const pmx = env.getPipelineContext?.();
        const isLastStage = pmx && typeof pmx.stage === 'number' && typeof pmx.totalStages === 'number'
          ? pmx.stage >= pmx.totalStages
          : false;
        return finalizeResult(isLastStage ? '' : (stdinInput || ''));
      }

      // Check if the result needs interpolation (wrapped template)
      if (resultValue && typeof resultValue === 'object' && 'wrapperType' in resultValue && Array.isArray(resultValue.content)) {
        // This is a wrapped template that needs interpolation
        const { interpolate } = await import('../../core/interpreter');
        try {
          resultValue = await interpolate(resultValue.content, execEnv);
        } catch (e) {
          resultValue = String(resultValue);
        }
      }
      // Return the result in the configured format
      return finalizeResult(resultValue ?? '');
    } else if (execDef.language === 'mlld-foreach') {
      const foreachNode = execDef.codeTemplate[0];
      const { evaluateForeachCommand } = await import('../foreach');
      const results = await evaluateForeachCommand(foreachNode, execEnv);
      const normalized = results.map(item => {
        if (isStructuredValue(item)) {
          return item.data ?? item.text;
        }
        if (typeof item === 'string' || item instanceof String) {
          const strValue = item instanceof String ? item.valueOf() : item;
          try {
            return JSON.parse(strValue as string);
          } catch {
            return strValue;
          }
        }
        return item;
      });
      const text = (() => {
        try {
          return JSON.stringify(normalized);
        } catch {
          return String(normalized);
        }
      })();
      return finalizeResult(normalized, { type: 'array', text });
    } else if (execDef.language === 'mlld-for') {
      const forNode = execDef.codeTemplate[0];
      const { evaluateForExpression } = await import('../for');
      const arrayVar = await evaluateForExpression(forNode, execEnv);
      const { extractVariableValue } = await import('../../utils/variable-resolution');
      const value = await extractVariableValue(arrayVar, execEnv);
      const text = (() => {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })();
      return finalizeResult(value, { type: 'array', text });
    } else if (execDef.language === 'mlld-loop') {
      const loopNode = execDef.codeTemplate[0];
      if (!loopNode || loopNode.type !== 'LoopExpression') {
        throw new Error('mlld-loop executable missing LoopExpression node');
      }
      const { evaluateLoopExpression } = await import('../loop');
      const value = await evaluateLoopExpression(loopNode, execEnv);
      const text = (() => {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })();
      const type = Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'text';
      return finalizeResult(value, { type, text });
    }
    
    // Regular JavaScript/code execution
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    
    const code = await interpolate(execDef.codeTemplate, execEnv, InterpolationContext.Default);
    
    // Build parameters object from bound variables
    const params: Record<string, any> = {};
    if (execDef.paramNames) {
      for (const paramName of execDef.paramNames) {
        const paramVar = execEnv.getVariable(paramName);
        if (paramVar) {
          if (paramVar.type === 'pipeline-input') {
            params[paramName] = paramVar.value;
          } else if (
            (paramVar.internal?.isPipelineInput && paramVar.internal?.pipelineInput)
          ) {
            params[paramName] =
              paramVar.internal?.pipelineInput;
          } else {
            params[paramName] = paramVar.value;
          }
        }
      }
    }

    const result = await env.executeCode(
      code,
      execDef.language || 'javascript',
      params,
      undefined,
      workingDirectory ? { workingDirectory } : undefined,
      executionContext
    );

    // If the function returns a StructuredValue-like object, preserve it directly
    if (result && typeof result === 'object' && 'text' in result && 'type' in result) {
      const text =
        typeof (result as any).text === 'string'
          ? (result as any).text
          : String((result as any).text ?? '');
      const type =
        typeof (result as any).type === 'string' ? (result as any).type : undefined;
      return finalizeResult(result, { type, text });
    }

    // Auto-parse JSON-like strings in pipeline context
    if (
      typeof result === 'string' &&
      pipelineCtx !== undefined &&
      !format &&
      shouldAutoParsePipelineInput(stageLanguage)
    ) {
      const wrapped = wrapJsonLikeString(result);
      if (wrapped) {
        return finalizeResult(wrapped);
      }
    }

    return finalizeResult(result);
  } else if (execDef.type === 'nodeFunction') {
    const errorLocation = hookOptions?.executionContext?.sourceLocation ?? commandVar?.mx?.definedAt;
    let callArgs: unknown[];
    if (baseParamNames.length > 0) {
      callArgs = baseParamNames.map(paramName => execEnv.getVariable(paramName)?.value);
    } else {
      callArgs = [...boundArgs];
      if (pipelineCtx !== undefined && stdinInput !== undefined) {
        callArgs.push(structuredInput ?? stdinInput);
      }
      callArgs.push(...args.map(arg => normalizePipelineParameterValue(arg)));
    }
    const jsArgs = callArgs.map(arg => toJsValue(arg));
    let output = execDef.fn.apply(execDef.thisArg ?? undefined, jsArgs);
    if (output && typeof output === 'object' && typeof (output as any).then === 'function') {
      output = await output;
    }

    if (isEventEmitter(output) && !(output && typeof (output as any).then === 'function')) {
      throw new MlldInterpreterError(
        `Node function '${commandVar?.name ?? 'anonymous'}' returns an EventEmitter and requires subscriptions`,
        'exec',
        errorLocation
      );
    }
    if (isLegacyStream(output)) {
      throw new MlldInterpreterError(
        `Node function '${commandVar?.name ?? 'anonymous'}' returns a legacy stream without async iterator support`,
        'exec',
        errorLocation
      );
    }

    const wrapped = wrapNodeValue(output, { moduleName: execDef.moduleName });
    return finalizeResult(wrapped);
  } else if (execDef.type === 'nodeClass') {
    throw new MlldInterpreterError(
      `Node class '${commandVar?.name ?? 'anonymous'}' requires new`,
      'exec',
      hookOptions?.executionContext?.sourceLocation ?? commandVar?.mx?.definedAt
    );
  } else if (execDef.type === 'template' && execDef.template) {
    // Interpolate template
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    
    const result = await interpolate(execDef.template, execEnv, InterpolationContext.Default);
    return result;
  } else if (execDef.type === 'commandRef') {
    /**
     * Handle command references
     * WHY: The reference might be an executable or a parameter/value in the execution scope.
     * CONTEXT: Prefer the execution parameter scope so pipeline parameters (e.g., input) are visible.
     */
    const refRaw = execDef.commandRef || '';
    // Use the provided identifier as-is; evaluateExe should have normalized it from AST
    const refName = String(refRaw);

    // Prefer resolving in the execution parameter scope first (execEnv)
    const fromParamScope = (execEnv as Environment).getVariable(refName);

    if (fromParamScope) {
      // If this is an executable, recursively execute it in the same param scope
      if ((fromParamScope as any).type === 'executable') {
        return await executeCommandVariable(fromParamScope as any, execDef.commandArgs ?? [], execEnv, stdinInput, structuredInput, hookOptions);
      }
      // Non-executable reference in exec scope: this is most likely a mistake now that
      // identity bodies compile to template executables.
      const t = (fromParamScope as any).type;
      throw new Error(`Referenced symbol '${refName}' is not executable (type: ${t}). Use a template executable (e.g., \`@${refName}\`) or refactor the definition.`);
    }

    // Fallback to stage environment lookup for global executables/variables
    const refVar = env.getVariable(refName);
    if (!refVar) {
      throw new Error(`Referenced executable not found: ${execDef.commandRef}`);
    }

    if ( (refVar as any).type === 'executable') {
      return await executeCommandVariable(refVar as any, execDef.commandArgs ?? [], env, stdinInput, structuredInput, hookOptions);
    }
    // Non-executable reference in stage env: surface clear guidance
    const t = (refVar as any).type;
    throw new Error(`Referenced symbol '${refName}' is not executable (type: ${t}). Use a template executable or a function.`);
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}
