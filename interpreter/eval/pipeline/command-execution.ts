import type { Environment } from '../../env/Environment';
import type { PipelineCommand, VariableSource } from '@core/types';
import { MlldCommandExecutionError } from '@core/errors';
import { createPipelineInputVariable, createSimpleTextVariable, createArrayVariable, createObjectVariable } from '@core/types/variable';
import { createPipelineInput } from '../../utils/pipeline-input';
import { asText, isStructuredValue, type StructuredValue } from '../../utils/structured-value';
import { wrapExecResult, isStructuredExecEnabled } from '../../utils/structured-exec';
import { normalizeTransformerResult } from '../../utils/transformer-result';
import type { Variable } from '@core/types/variable/VariableTypes';
import { logger } from '@core/utils/logger';

export type RetrySignal = { value: 'retry'; hint?: any; from?: number };
type CommandExecutionPrimitive = string | number | boolean | null | undefined;
export type CommandExecutionResult =
  | CommandExecutionPrimitive
  | StructuredValue
  | Record<string, unknown>
  | unknown[]
  | RetrySignal;

const STRUCTURED_PIPELINE_LANGUAGES = new Set([
  'mlld-for',
  'mlld-foreach',
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
    return null;
  }
  return null;
}

function unwrapStructuredDeep(value: any): any {
  if (isStructuredValue(value)) {
    return unwrapStructuredDeep(value.data);
  }

  if (Array.isArray(value)) {
    return value.map(item => unwrapStructuredDeep(item));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = unwrapStructuredDeep(val);
    }
    return result;
  }

  return value;
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
  const metadata: Record<string, any> = {
    isPipelineParameter: true,
    pipelineOriginal: originalText,
    pipelineFormat: 'json'
  };

  if (Array.isArray(parsedValue)) {
    const bridged = wrapPipelineStructuredValue(parsedValue, originalText);
    metadata.pipelineType = 'array';
    metadata.customToString = () => originalText;
    return createArrayVariable(paramName, bridged, false, pipelineSource, metadata);
  }

  if (parsedValue && typeof parsedValue === 'object') {
    const bridged = wrapPipelineStructuredValue(parsedValue, originalText);
    metadata.pipelineType = 'object';
    metadata.customToString = () => originalText;
    return createObjectVariable(paramName, bridged as Record<string, any>, false, pipelineSource, metadata);
  }

  const textSource: VariableSource = {
    directive: 'var',
    syntax: 'quoted',
    hasInterpolation: false,
    isMultiLine: false
  };
  return createSimpleTextVariable(paramName, originalText, textSource, { isPipelineParameter: true });
}

function resolveExecutableLanguage(commandVar: any, execDef: any): string | undefined {
  if (execDef?.language) return String(execDef.language);
  if (commandVar?.metadata?.executableDef?.language) {
    return String(commandVar.metadata.executableDef.language);
  }
  if (commandVar?.value?.language) {
    return String(commandVar.value.language);
  }
  if (commandVar?.language) {
    return String(commandVar.language);
  }
  return undefined;
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
    const baseVar = env.getVariable(varRef.identifier);
    
    if (!baseVar) {
      return null;
    }
    
    // For executable variables (like transformers), return the variable itself
    // For other types, we might need to resolve field access
    if (baseVar.type === 'executable') {
      return baseVar;
    }
    
    // Extract value for non-executable variables
    const { extractVariableValue } = await import('../../utils/variable-resolution');
    let value = await extractVariableValue(baseVar, env);
    
    // Navigate through field access if present
    if (varRef.fields && varRef.fields.length > 0) {
      for (const field of varRef.fields) {
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
  stdinInput?: string
): Promise<CommandExecutionResult> {
  const structuredExecEnabled = isStructuredExecEnabled();
  const finalizeResult = (
    value: unknown,
    options?: { type?: string; text?: string }
  ): CommandExecutionResult => {
    if (structuredExecEnabled) {
      return wrapExecResult(value, options);
    }
    if (options?.text !== undefined) {
      return options.text;
    }
    if (value && typeof value === 'object') {
      const maybeText = (value as { text?: unknown }).text;
      if (typeof maybeText === 'string') {
        return maybeText;
      }
    }
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  };

  // Built-in transformer handling
  if (commandVar && commandVar.metadata?.isBuiltinTransformer && commandVar.metadata?.transformerImplementation) {
    try {
      const result = await commandVar.metadata.transformerImplementation(stdinInput || '');
      if (structuredExecEnabled) {
        const normalized = normalizeTransformerResult(commandVar?.name, result);
        return finalizeResult(normalized.value, normalized.options);
      }
      return finalizeResult(result);
    } catch (error) {
      throw new MlldCommandExecutionError(
        `Transformer ${commandVar.name} failed: ${error.message}`,
        undefined,
        {
          command: commandVar.name,
          exitCode: 1,
          duration: 0,
          workingDirectory: process.cwd()
        }
      );
    }
  }
  
  // Handle both wrapped executable variables and direct definitions
  let execDef: any;
  
  if (commandVar && commandVar.type === 'executable' && commandVar.value) {
    // Check if we have the full ExecutableDefinition in metadata
    if (commandVar.metadata?.executableDef) {
      execDef = commandVar.metadata.executableDef;
      
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
        fromMetadata: !!commandVar.metadata?.executableDef
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
  
  // Create environment with parameter bindings
  const execEnv = env.createChild();
  
  // Get the format from the pipeline context
  const pipelineCtx = env.getPipelineContext();
  const format = pipelineCtx?.format;
  const stageLanguage = resolveExecutableLanguage(commandVar, execDef);
  
  // Parameter binding for executable functions
  if (execDef.paramNames) {
    for (let i = 0; i < execDef.paramNames.length; i++) {
      const paramName = execDef.paramNames[i];
      // In pipelines, explicit args bind starting from the SECOND parameter
      // First parameter always gets @input (stdinInput) implicitly
      const argIndex = pipelineCtx !== undefined && stdinInput !== undefined ? i - 1 : i;
      const argValue = argIndex >= 0 && argIndex < args.length ? args[argIndex] : null;
      
      // First parameter in pipeline context ALWAYS gets @input
      const isPipelineParam = i === 0 && pipelineCtx !== undefined && stdinInput !== undefined;
      
      if (isPipelineParam) {
        // First parameter ALWAYS gets the pipeline input (stdinInput)
        const { AutoUnwrapManager } = await import('../auto-unwrap-manager');
        const stdinForUnwrap = isStructuredValue(stdinInput) ? asText(stdinInput) : (stdinInput || '');
        const unwrappedStdin = AutoUnwrapManager.unwrap(stdinForUnwrap);
        const textValue = typeof unwrappedStdin === 'string' ? unwrappedStdin : String(unwrappedStdin ?? '');
        
        if (!format) {
          const shouldParse = shouldAutoParsePipelineInput(stageLanguage);
          if (shouldParse) {
            const parsed = parseStructuredJson(textValue);
            if (parsed !== null) {
              const typedVar = createTypedPipelineVariable(paramName, parsed, textValue);
              execEnv.setParameterVariable(paramName, typedVar);
              continue;
            }
          }
          // Create a simple text variable instead of PipelineInput
          const textSource: VariableSource = {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          };
          
          const textVar = createSimpleTextVariable(
            paramName,
            textValue,
            textSource,
            { isPipelineParameter: true }
          );
          
          execEnv.setParameterVariable(paramName, textVar);
        } else {
          // Create wrapped input with format
          const wrappedInput = createPipelineInput(textValue, format);
          
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
            textValue,
            pipelineSource,
            pipelineCtx?.stage
          );
          
          execEnv.setParameterVariable(paramName, pipelineVar);
        }
      } else {
        // Regular parameter handling
        let paramValue: any;
        
        if (argValue === null) {
          paramValue = '';
        } else if (typeof argValue === 'string') {
          paramValue = argValue;
        } else if (typeof argValue === 'object' && !argValue.type && !argValue.content) {
          // Raw object (like pipeline context passed as @p)
          paramValue = argValue;
        } else if (argValue.type === 'Text' && argValue.content !== undefined) {
          paramValue = argValue.content;
        } else if (argValue.content !== undefined) {
          paramValue = argValue.content;
        } else {
          paramValue = String(argValue);
        }
        
        // Check if we're passing an object (like @p pipeline context)
        if (typeof paramValue === 'object' && paramValue !== null) {
          // For objects, create an object variable that preserves the actual object
          const paramVar = {
            type: 'object',
            name: paramName,
            value: paramValue,
            metadata: { 
              isParameter: true,
              isPipelineContext: paramValue.stage !== undefined
            }
          };
          
          execEnv.setParameterVariable(paramName, paramVar);
        } else {
          // For non-objects, create a text variable as before
          const paramSource: VariableSource = {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          };
          
          const paramVar = createSimpleTextVariable(
            paramName,
            String(paramValue),
            paramSource,
            { isParameter: true }
          );
          
          execEnv.setParameterVariable(paramName, paramVar);
        }
      }
    }
  }
  
  // Execute based on type
  if (execDef.type === 'command' && execDef.commandTemplate) {
    // Interpolate command template with parameters
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    
    const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand);

    // Always pass pipeline input as stdin when available
    let commandOutput: unknown = await env.executeCommand(command, { input: stdinInput } as any);

    const withClause = execDef.withClause;
    if (withClause) {
      if (withClause.needs) {
        const { checkDependencies, DefaultDependencyChecker } = await import('../dependencies');
        const checker = new DefaultDependencyChecker();
        await checkDependencies(withClause.needs, checker, commandVar.metadata?.definedAt);
      }

      if (withClause.pipeline && withClause.pipeline.length > 0) {
        const { processPipeline } = await import('./unified-processor');
        const processed = await processPipeline({
          value: commandOutput,
          env,
          pipeline: withClause.pipeline,
          format: withClause.format as string | undefined,
          isRetryable: false,
          identifier: commandVar?.name,
          location: commandVar.metadata?.definedAt
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

    return finalizeResult(commandOutput);
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
      
      // If when-expression produced a side-effect show inside a pipeline,
      // propagate the input forward (so the stage doesn't terminate) while
      // still letting the effect line be emitted by the action itself.
      const inPipeline = !!env.getPipelineContext();
      const showEffect =
        resultValue &&
        typeof resultValue === 'object' &&
        (resultValue as any).__whenEffect === 'show';
      const structuredShowEffect =
        isStructuredValue(resultValue) &&
        resultValue.data &&
        typeof resultValue.data === 'object' &&
        (resultValue.data as any).__whenEffect === 'show';

      if (inPipeline && (showEffect || structuredShowEffect)) {
        // If this is the last stage, suppress echo to avoid showing seed text.
        // If there are more stages, propagate input forward to keep pipeline alive.
        const pctx = env.getPipelineContext?.();
        const isLastStage = pctx && typeof pctx.stage === 'number' && typeof pctx.totalStages === 'number'
          ? pctx.stage >= pctx.totalStages
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
      // Unwrap tagged show effects for non-pipeline contexts
      if (showEffect) {
        resultValue = (resultValue as any).text ?? '';
      } else if (structuredShowEffect) {
        const data = (resultValue as any).data;
        resultValue = (data as any)?.text ?? asText(resultValue);
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
          // Check if this is a pipeline input variable
          if (paramVar.type === 'pipeline-input') {
            // PipelineInputVariable stores the PipelineInput object in value
            params[paramName] = paramVar.value;
          } else if (paramVar.metadata?.isPipelineInput && paramVar.metadata?.pipelineInput) {
            // Legacy: Use the wrapped pipeline input from metadata
            params[paramName] = paramVar.metadata.pipelineInput;
          } else {
            // Regular variable - use the value directly
            params[paramName] = paramVar.value;
          }
        }
      }
    }
    
    const result = await env.executeCode(code, execDef.language || 'javascript', params);
    
    // If the function returns a PipelineInput object, extract the text
    if (result && typeof result === 'object' && 'text' in result && 'type' in result) {
      const text =
        typeof (result as any).text === 'string'
          ? (result as any).text
          : String((result as any).text ?? '');
      const type =
        typeof (result as any).type === 'string' ? (result as any).type : undefined;
      return finalizeResult(result, { type, text });
    }
    
    return finalizeResult(result);
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
        return await executeCommandVariable(fromParamScope as any, execDef.commandArgs ?? [], execEnv, stdinInput);
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
      return await executeCommandVariable(refVar as any, execDef.commandArgs ?? [], env, stdinInput);
    }
    // Non-executable reference in stage env: surface clear guidance
    const t = (refVar as any).type;
    throw new Error(`Referenced symbol '${refName}' is not executable (type: ${t}). Use a template executable or a function.`);
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}
