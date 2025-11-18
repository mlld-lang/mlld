import type {
  CondensedPipe,
  FieldAccessNode,
  FileReferenceNode,
  MlldNode,
  ExecInvocation
} from '@core/types';
import type { LoadContentResult } from '@core/types/load-content';
import { normalizeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import { asText, assertStructuredValue, isStructuredValue } from '@interpreter/utils/structured-value';
import type { Environment } from '../env/Environment';
import type { VarAssignmentResult } from '../eval/var';
import type { OperationContext } from '../env/ContextManager';
import { EscapingStrategyFactory, InterpolationContext } from '../core/interpolation-context';
import { interpreterLogger as logger } from '@core/utils/logger';
import { evaluateDataValue } from '../eval/data-value-evaluator';
import { classifyShellValue } from '../utils/shell-value';
import * as shellQuote from 'shell-quote';

export interface InterpolationNode {
  type: string;
  content?: string;
  name?: string;
  identifier?: string;
  fields?: FieldAccessNode[];
  value?: string;
  commandRef?: any;
  withClause?: any;
  pipes?: CondensedPipe[];
}

export interface InterpolateOptions {
  collectSecurityDescriptor?: (descriptor: SecurityDescriptor) => void;
}

export type InterpolateFunction = (
  nodes: any,
  env: Environment,
  context?: InterpolationContext,
  options?: InterpolateOptions
) => Promise<string>;

export interface EvalResultLike {
  value: unknown;
  env: Environment;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  metadata?: Record<string, unknown>;
}

export interface EvaluationContextLike {
  isCondition?: boolean;
  isExpression?: boolean;
  extractedInputs?: readonly unknown[];
  operationContext?: OperationContext;
  precomputedVarAssignment?: VarAssignmentResult;
}

type EvaluateFn = (
  node: MlldNode | MlldNode[],
  env: Environment,
  context?: EvaluationContextLike
) => Promise<EvalResultLike>;

export interface InterpolationDependencies {
  evaluate: EvaluateFn;
}

export type Interpolator = (
  nodes: InterpolationNode[],
  env: Environment,
  context?: InterpolationContext,
  options?: InterpolateOptions
) => Promise<string>;

export function createInterpolator(getDeps: () => InterpolationDependencies): Interpolator {
  const interpolateImpl: Interpolator = async function interpolate(
    nodes,
    env,
    context: InterpolationContext = InterpolationContext.Default,
    options?: InterpolateOptions
  ): Promise<string> {
    logger.info('[INTERPOLATE] interpolate() called');
    
    // Handle non-array inputs
    if (!Array.isArray(nodes)) {
      if (typeof nodes === 'string') {
        return nodes;
      }
      if (nodes && typeof nodes === 'object' && 'content' in nodes) {
        return nodes.content || '';
      }
      return String(nodes || '');
    }
    
    const parts: string[] = [];
    let withinDoubleQuotes = false;
    let withinSingleQuotes = false;

    const updateQuoteState = (fragment: string): void => {
      if (!fragment) return;
      let backslashCount = 0;
      for (let i = 0; i < fragment.length; i++) {
        const char = fragment[i];
        if (char === '\\') {
          backslashCount++;
          continue;
        }
        if (char === '"' || char === '\'') {
          const isEscaped = backslashCount % 2 === 1;
          if (char === '"' && !withinSingleQuotes && !isEscaped) {
            withinDoubleQuotes = !withinDoubleQuotes;
          } else if (char === '\'' && !withinDoubleQuotes && !isEscaped) {
            withinSingleQuotes = !withinSingleQuotes;
          }
        }
        backslashCount = 0;
      }
    };

    const pushPart = (fragment: string): void => {
      const value = fragment ?? '';
      parts.push(value);
      if (context === InterpolationContext.ShellCommand) {
        updateQuoteState(value);
      }
    };
    const collectDescriptor = (descriptor?: SecurityDescriptor): void => {
      if (!descriptor) {
        return;
      }
      options?.collectSecurityDescriptor?.(descriptor);
    };

    const { evaluate } = getDeps();
    
    for (const node of nodes) {
      if (node.type === 'Text') {
        // Handle Text nodes - directly use string content
        pushPart(node.content || '');
      } else if (node.type === 'PathSeparator') {
        pushPart(node.value || '/');
      } else if (node.type === 'ExecInvocation') {
        // Handle function calls in templates
        const { evaluateExecInvocation } = await import('../eval/exec-invocation');
        const result = await evaluateExecInvocation(node as any, env);
        collectDescriptor(extractInterpolationDescriptor(result.value));
        pushPart(asText(result.value));
      } else if (node.type === 'InterpolationVar') {
        // Handle {{var}} style interpolation (from triple colon templates)
        const varName = node.identifier || node.name;
        if (!varName) continue;
        
        let variable = env.getVariable(varName);
        
        // Check if this is a resolver variable that needs async resolution
        if (!variable && env.hasVariable(varName)) {
          // Try to get it as a resolver variable
          const resolverVar = await env.getResolverVariable(varName);
          if (resolverVar) {
            variable = resolverVar;
          }
        }
        
        if (!variable) {
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('Variable not found during {{var}} interpolation:', { varName });
          }
          pushPart(`{{${varName}}}`); // Keep unresolved with {{}} syntax
          continue;
        }
        collectDescriptor(variable.ctx as SecurityDescriptor | undefined);
        
        /**
         * Extract Variable value for string interpolation
         * WHY: String interpolation needs raw values because template engines
         *      work with primitive types, not Variable wrapper objects
         */
        const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
        const value = await resolveVariable(variable, env, ResolutionContext.StringInterpolation);
        collectDescriptor(extractInterpolationDescriptor(value));
        
        // Convert final value to string
        let stringValue: string;
        if (value === null) {
          stringValue = 'null';
        } else if (value === undefined) {
          stringValue = '';
        } else if (isStructuredValue(value)) {
          stringValue = asText(value);
          collectDescriptor(extractInterpolationDescriptor(value));
          
          if (value.type === 'Path') {
            const classification = classifyShellValue(value.value);
            if (classification.type === 'path') {
              stringValue = classification.value;
            }
          } else if (value.type === 'CommandResult') {
            const classification = classifyShellValue(value.text);
            if (classification.type === 'path') {
              stringValue = classification.value;
            }
          } else if (value.type === 'PipelineInput') {
            assertStructuredValue(value, 'interpolate:pipeline-input');
            stringValue = asText(value);
          } else if (value.type === 'LoadContentResultArray') {
            const { isRenamedContentArray } = await import('@core/types/load-content');
            const { asData } = await import('../utils/structured-value');
            const resolved = asData(value);
            if (Array.isArray(resolved) && isRenamedContentArray(resolved)) {
              stringValue = resolved
                .map(item => (typeof item === 'string' ? item : (item as any)?.content ?? ''))
                .join('\n\n');
            } else {
              stringValue = resolved.map((item: any) => item.content).join('\n\n');
            }
          }
        } else if (typeof value === 'object') {
          stringValue = JSON.stringify(value);
          if (process.env.MLLD_DEBUG === 'true') {
          }
        } else {
          stringValue = String(value);
        }
        
        pushPart(stringValue);
        logger.debug('[INTERPOLATE] Pushed to parts:', { stringValue, partsLength: parts.length });
      } else if (node.type === 'TemplateVariable') {
        // Template variables have .internal.templateAst for value
        const varName = node.identifier || node.name;
        if (!varName) continue;
        const variable = env.getVariable(varName);
        if (!variable) {
          pushPart(`@${varName}`);
          continue;
        }
        
        collectDescriptor(variable.ctx as SecurityDescriptor | undefined);
        
        // Template variable content needs template escaping context
        if (variable.internal?.templateAst) {
          const templateContent = await interpolateImpl(variable.internal.templateAst, env, InterpolationContext.Template, options);
          pushPart(templateContent);
        } else {
          const strategy = EscapingStrategyFactory.getStrategy(context);
          const value = asText(variable.value);
          pushPart(strategy.escape(value));
        }
      } else if (node.type === 'VariableReference' || node.type === 'VariableReferenceWithTail' || node.type === 'TemplateVariable') {
        // Complex variable references (with field access, pipes, etc.)
        const varName = (node as any).identifier || (node as any).name;
        let variable = env.getVariable(varName);
        
        // Allow resolver variables (async evaluation)
        if (!variable && env.hasVariable(varName)) {
          const resolverVar = await env.getResolverVariable(varName);
          if (resolverVar) {
            variable = resolverVar;
          }
        }
        
        if (!variable) {
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('Variable not found during interpolation:', { varName, valueType: node.valueType });
          }
          // WHY: Preserve original syntax when variable is undefined for better error messages
          if (node.valueType === 'varInterpolation') {
            pushPart(`{{${varName}}}`);  // {{var}} syntax
          } else {
            pushPart(`@${varName}`);      // @var syntax
          }
          continue;
        }

        collectDescriptor(variable.ctx as SecurityDescriptor | undefined);

        // Extract value based on variable type using new type guards
        let value: unknown = '';
        
        // Import isExecutableVariable dynamically
        const { isExecutableVariable } = await import('@core/types/variable');
        
        // Special handling for executable variables
        if (isExecutableVariable(variable)) {
          const { evaluateExecInvocation } = await import('../eval/exec-invocation');
          const commandRef = (node as any).commandRef || {
            identifier: variable.name,
            args: []
          };
          const execInvocation: ExecInvocation = {
            type: 'ExecInvocation',
            commandRef: {
              identifier: commandRef.identifier || variable.name || (node as any).name || (node as any).identifier,
              args: commandRef.args || []
            },
            location: commandRef.location || (node as any).location
          };
          const result = await evaluateExecInvocation(execInvocation, env);
          collectDescriptor(extractInterpolationDescriptor(result.value));
          const execOutput = asText(result.value);
          const strategy = EscapingStrategyFactory.getStrategy(context);
          pushPart(strategy.escape(execOutput));
          continue;
        }
        
        // Handle TemplateVariable references (e.g., ::{{var}}::)
        if ((node as any).type === 'TemplateVariable') {
          if ((node as any).content) {
            value = await interpolateImpl((node as any).content as any[], env, InterpolationContext.Template, options);
          } else if (variable.internal?.templateAst) {
            value = await interpolateImpl(variable.internal.templateAst, env, InterpolationContext.Template, options);
          }
          pushPart(String(value ?? ''));
          continue;
        }
        
        const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
        // Determine context based on interpolation context
        const resolutionContext = context === InterpolationContext.ShellCommand
          ? ResolutionContext.ShellCommand
          : ResolutionContext.StringInterpolation;
        
        value = await resolveVariable(variable, env, resolutionContext);
        collectDescriptor(extractInterpolationDescriptor(value));
        
        // Special handling for lazy reserved variables like DEBUG
        if (value === null && variable.internal?.isReserved && variable.internal?.isLazy) {
          // Need to resolve this as a resolver variable
          const resolverVar = await env.getResolverVariable(varName);
          if (resolverVar && resolverVar.value !== null) {
            value = resolverVar.value;
          }
        }
        
        // Handle field access if present
        let fieldsToProcess = node.fields || [];
        if (fieldsToProcess.length > 0 && typeof value === 'object' && value !== null) {
          const { accessField } = await import('../utils/field-access');
          for (const field of fieldsToProcess) {
            // Handle variableIndex type - need to resolve the variable first
            if (field.type === 'variableIndex') {
              const indexVar = env.getVariable(field.value);
              if (!indexVar) {
                throw new Error(`Variable not found for index: ${field.value}`);
              }
              // Extract Variable value for index access - WHY: Index values must be raw strings/numbers
              const { resolveValue: resolveVal, ResolutionContext: ResCtx2 } = await import('../utils/variable-resolution');
              const indexValue = await resolveVal(indexVar, env, ResCtx2.StringInterpolation);
              // Create a new field with the resolved value
              const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
              const fieldResult = await accessField(value, resolvedField, { 
                preserveContext: true,
                env 
              });
              value = (fieldResult as any).value;
            } else {
              const fieldResult = await accessField(value, field, { 
                preserveContext: true,
                env 
              });
              value = (fieldResult as any).value;
            }
            
            // Handle null nodes from the grammar
            if (value && typeof value === 'object' && 'type' in value) {
              const nodeValue = value as Record<string, unknown>;
              if (nodeValue.type === 'Null') {
                value = null;
              } else if (nodeValue.type === 'runExec' || nodeValue.type === 'ExecInvocation' || 
                         nodeValue.type === 'command' || nodeValue.type === 'code' ||
                         nodeValue.type === 'VariableReference' || nodeValue.type === 'path') {
                // This is an unevaluated AST node from a complex object
                // We need to evaluate it
                value = await evaluateDataValue(value, env);
              }
            }
            
            if (value === undefined) break;
          }
        }
        
        // Handle pipes if present
        if (node.pipes && node.pipes.length > 0) {
          const { processPipeline } = await import('../eval/pipeline/unified-processor');
          value = await processPipeline({
            value,
            env,
            node,
            identifier: node.identifier
          });
          if (typeof value === 'string') {
            const strategy = EscapingStrategyFactory.getStrategy(context);
            pushPart(strategy.escape(value));
            continue;
          }
        }
        
        const { resolveValue, ResolutionContext: ResContext } = await import('../utils/variable-resolution');
        value = await resolveValue(value, env, ResContext.StringInterpolation);
        
        if (context === InterpolationContext.ShellCommand) {
          const classification = classifyShellValue(value);
          const strategy = EscapingStrategyFactory.getStrategy(context);

          const escapeForSingleQuotes = (text: string): string => {
            if (text === '\'') {
              return '\'';
            }
            if (!text.includes('\'')) {
              return text;
            }
            const segments = text.split('\'');
            return segments
              .map((segment, index) => {
                if (index === segments.length - 1) {
                  return segment;
                }
                return `${segment}'\\''`;
              })
              .join('');
          };
          const escapeForDoubleQuotes = (text: string): string => strategy.escape(text);

          if (classification.kind === 'simple') {
            if (withinSingleQuotes) {
              pushPart(escapeForSingleQuotes(classification.text));
            } else {
              pushPart(escapeForDoubleQuotes(classification.text));
            }
          } else if (classification.kind === 'array-simple') {
            if (withinSingleQuotes) {
              const escapedElements = classification.elements.map(elem => escapeForSingleQuotes(elem));
              pushPart(escapedElements.join(' '));
            } else {
              const escapedElements = classification.elements.map(elem => escapeForDoubleQuotes(elem));
              pushPart(escapedElements.join(' '));
            }
          } else {
            if (withinDoubleQuotes) {
              pushPart(escapeForDoubleQuotes(classification.text));
            } else if (withinSingleQuotes) {
              pushPart(escapeForSingleQuotes(classification.text));
            } else {
              pushPart(shellQuote.quote([classification.text]));
            }
          }
          continue;
        }
        
        // Convert to string
        let stringValue: string;
        
        if (value === null) {
          stringValue = 'null';
        } else if (value === undefined) {
          stringValue = '';
        } else if (isStructuredValue(value)) {
          stringValue = asText(value);
        } else if (typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray((value as any).content)) {
          // Handle wrapped strings (quotes, backticks, brackets)
          stringValue = await interpolateImpl((value as any).content, env, context, options);
        } else if (typeof value === 'object' && 'type' in (value as Record<string, unknown>)) {
          const nodeValue = value as Record<string, unknown>;
          
          if (nodeValue.type === 'array' && 'items' in nodeValue) {
            const evaluatedArray = await evaluateDataValue(value, env);
            if (Array.isArray(evaluatedArray)) {
              const { JSONFormatter } = await import('../core/json-formatter');
              stringValue = JSONFormatter.stringify(evaluatedArray);
            } else {
              stringValue = String(evaluatedArray);
            }
          } else if (nodeValue.type === 'Null') {
            stringValue = 'null';
          } else {
            const { isPipelineInput } = await import('../utils/pipeline-input');
            if (isPipelineInput(value)) {
              stringValue = asText(value);
            } else {
              stringValue = JSON.stringify(value);
            }
          }
        } else if (Array.isArray(value)) {
          const { isLoadContentResultArray, isRenamedContentArray } = await import('@core/types/load-content');
          if (isLoadContentResultArray(value)) {
            stringValue = value.content;
          } else if (isRenamedContentArray(value)) {
            if ('content' in value) {
              stringValue = value.content;
            } else if (value.toString !== Array.prototype.toString) {
              stringValue = value.toString();
            } else {
              stringValue = value.join('\n\n');
            }
          } else {
            const { JSONFormatter } = await import('../core/json-formatter');
            const printableArray = value.map(item => {
              if (isStructuredValue(item)) {
                if (item.type === 'object' || item.type === 'array' || item.type === 'json') {
                  return item.data;
                }
                return asText(item);
              }
              return item;
            });
            stringValue = JSONFormatter.stringify(printableArray);
          }
        } else if (typeof value === 'object') {
          const { isLoadContentResult, isLoadContentResultArray, isRenamedContentArray } = await import('@core/types/load-content');
          if (isLoadContentResult(value)) {
            stringValue = value.content;
          } else if (isLoadContentResultArray(value)) {
            stringValue = value.map(item => item.content).join('\n\n');
          } else if (variable && variable.internal?.isNamespace && node.fields?.length === 0) {
            const { JSONFormatter } = await import('../core/json-formatter');
            stringValue = JSONFormatter.stringifyNamespace(value);
          } else if ((value as any).__executable) {
            const params = (value as any).paramNames || [];
            stringValue = `<function(${params.join(', ')})>`;
          } else if ((value as any).type === 'path' && (value as any).values) {
            const { interpolate: pathInterpolate } = await import('../core/interpreter');
            stringValue = await pathInterpolate((value as any).values.segments || [], env, InterpolationContext.FilePath, options);
          } else {
            const { JSONFormatter } = await import('../core/json-formatter');
            stringValue = JSONFormatter.stringify(value);
          }
        } else {
          stringValue = String(value);
        }
        
        // Apply context-appropriate escaping
        const strategy = EscapingStrategyFactory.getStrategy(context);
        const escapedValue = strategy.escape(stringValue);
        pushPart(escapedValue);
        
        if (node.boundary) {
          if (node.boundary.type === 'literal') {
            pushPart(node.boundary.value);
          }
        }
      } else if (node.type === 'ExecInvocation') {
        // Handle exec invocation nodes in interpolation
        const { evaluateExecInvocation } = await import('../eval/exec-invocation');
        const result = await evaluateExecInvocation(node as ExecInvocation, env);
        collectDescriptor(extractInterpolationDescriptor(result.value));
        const stringValue = asText(result.value);
        
        // Apply context-appropriate escaping
        const strategy = EscapingStrategyFactory.getStrategy(context);
        pushPart(strategy.escape(stringValue));
      } else if (node.type === 'FileReference') {
        // Handle file reference interpolation
        const result = await interpolateFileReference(node as any, env, context, interpolateImpl);
        pushPart(result);
      } else if (node.type === 'TemplateForBlock') {
        // Inline template for-loop expansion
        // Evaluate the source collection in expression context
        const sourceEval = await evaluate(node.source, env, { isExpression: true });
        const { toIterable } = await import('../eval/for-utils');
        const iterable = toIterable(sourceEval.value);
        if (!iterable) {
          // Non-iterable: skip silently in template context
          continue;
        }
        // Variable importer for proper Variable wrapping
        const { VariableImporter } = await import('../eval/import/VariableImporter');
        const importer = new VariableImporter();
        for (const [key, value] of iterable as Iterable<[string | null, unknown]>) {
          const childEnv = env.createChildEnvironment();
          const varName = (node as any).variable?.identifier || (node as any).variable?.name || 'item';
          const iterationVar = importer.createVariableFromValue(varName, value, 'template-for', undefined, { env });
          childEnv.setVariable(varName, iterationVar);
          if (key !== null && key !== undefined) {
            const keyVar = importer.createVariableFromValue(`${varName}_key`, key, 'template-for', undefined, { env });
            childEnv.setVariable(`${varName}_key`, keyVar);
          }
          const bodyStr = await interpolateImpl((node as any).body as any[], childEnv, InterpolationContext.Template, options);
          pushPart(bodyStr);
        }
      } else if (node.type === 'TemplateInlineShow') {
        // Build a synthetic show directive and evaluate in capture mode
        const directive: any = {
          type: 'Directive',
          kind: 'show',
          subtype: undefined,
          values: {},
          raw: {},
          meta: { applyTailPipeline: !!(node as any).tail },
          location: (node as any).location
        };
        const n: any = node as any;
        switch (n.showKind) {
          case 'command':
            directive.subtype = 'showCommand';
            directive.values.command = n.content?.values?.command || n.content?.values || n.content;
            directive.meta = { ...(directive.meta || {}), ...(n.content?.meta || {}) };
            if (n.tail) directive.values.withClause = n.tail;
            break;
          case 'code':
            directive.subtype = 'showCode';
            directive.values.lang = n.lang || [];
            directive.values.code = n.code || [];
            directive.meta = { ...(directive.meta || {}), ...(n.meta || {}) };
            if (n.tail) directive.values.withClause = n.tail;
            break;
          case 'template':
            directive.subtype = 'showTemplate';
            directive.values.content = n.template?.values?.content ? [{ content: n.template.values.content }] : (n.template?.values ? [n.template.values] : []);
            directive.meta = { ...(directive.meta || {}), ...(n.template?.meta || {}), isTemplateContent: true };
            if (n.tail) directive.values.withClause = n.tail;
            break;
          case 'load':
            directive.subtype = 'showLoadContent';
            directive.values.loadContent = n.loadContent;
            if (n.tail) directive.values.withClause = n.tail;
            break;
          case 'reference':
            // Distinguish variable vs exec invocation by node type
            if (n.reference?.type === 'VariableReference' || n.reference?.type === 'VariableReferenceWithTail' || n.reference?.type === 'TemplateVariable') {
              directive.subtype = 'showVariable';
              directive.values.variable = n.reference;
            } else {
              directive.subtype = 'showExecInvocation';
              directive.values.execInvocation = n.reference;
            }
            break;
          default:
            break;
        }
        const { evaluateShow } = await import('../eval/show');
        const res = await evaluateShow(directive, env, { isExpression: true });
        pushPart(asText(res.value ?? ''));
      } else if (node.type === 'Literal') {
        // Handle literal nodes from expressions
        const { LiteralNode } = await import('@core/types');
        const literalNode = node as LiteralNode;
        const value = literalNode.value;
        let stringValue: string;
        if (value === null) {
          stringValue = 'null';
        } else if (value === undefined) {
          stringValue = '';
        } else {
          stringValue = String(value);
        }
        const strategy = EscapingStrategyFactory.getStrategy(context);
        pushPart(strategy.escape(stringValue));
      }
    }
    
    const result = parts.join('');
    
    return result;
  };
  
  return interpolateImpl;
}

export function extractInterpolationDescriptor(value: unknown): SecurityDescriptor | undefined {
  if (!value) {
    return undefined;
  }
  if (isStructuredValue(value)) {
    return normalizeSecurityDescriptor(value.ctx as SecurityDescriptor | undefined);
  }
  if (typeof value === 'object') {
    const ctx = (value as { ctx?: SecurityDescriptor }).ctx;
    return normalizeSecurityDescriptor(ctx as SecurityDescriptor | undefined);
  }
  return undefined;
}

/**
 * Interpolate file reference nodes (<file.md>) with optional field access and pipes
 */
export async function interpolateFileReference(
  node: FileReferenceNode,
  env: Environment,
  context: InterpolationContext,
  interpolateFn: InterpolateFunction
): Promise<string> {
  const { FileReferenceNode } = await import('@core/types');
  
  // Special handling for <> placeholder in 'as' contexts
  if (node.meta?.isPlaceholder) {
    // Get current file from iteration context
    const currentFile = env.getCurrentIterationFile?.();
    if (!currentFile) {
      throw new Error('<> can only be used in "as" template contexts');
    }
    return processFileFields(currentFile, node.fields, node.pipes, env);
  }
  
  // Process the path (may contain variables)
  let resolvedPath: string;
  if (typeof node.source === 'string') {
    resolvedPath = node.source;
  } else if (node.source.raw) {
    resolvedPath = node.source.raw;
  } else if (node.source.segments) {
    resolvedPath = await interpolateFn(node.source.segments, env);
  } else {
    resolvedPath = await interpolateFn([node.source], env);
  }
  
  // Check if file interpolation is enabled
  if (!env.isFileInterpolationEnabled()) {
    throw new Error('File interpolation disabled by security policy');
  }
  
  // Check circular reference
  if (env.isInInterpolationStack(resolvedPath)) {
    console.error(`Warning: Circular reference detected - '${resolvedPath}' references itself, skipping`);
    return '';  // Return empty string and continue
  }
  
  // Add to stack
  env.pushInterpolationStack(resolvedPath);
  
  try {
    // Use existing content loader
    const { processContentLoader } = await import('../eval/content-loader');
    const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
    
    let loadResult: any;
    try {
      // If we already have a resolved path (from variable interpolation), create a simple path source
      const sourceToUse = resolvedPath !== node.source?.raw ? 
        { type: 'path', raw: resolvedPath, segments: [{ type: 'Text', content: resolvedPath }] } : 
        node.source;
      
      loadResult = await processContentLoader({
        type: 'load-content',
        source: sourceToUse
      }, env);
    } catch (error: any) {
      // Handle file not found or access errors gracefully by returning empty string
      if (error.code === 'ENOENT') {
        console.error(`Warning: File not found - '${resolvedPath}'`);

        // Check for failed variable interpolation
        if (resolvedPath.includes('@')) {
          const varMatches = resolvedPath.match(/@(\w+)/g);
          if (varMatches && varMatches.length > 0) {
            console.error('');
            for (const match of varMatches) {
              const varName = match.substring(1);
              try {
                const actualValue = env.getVariable(varName);
                const valueType = actualValue?.type || typeof actualValue;
                const valuePreview = JSON.stringify(actualValue, null, 2).substring(0, 200);
                console.error(`Variable @${varName} is a ${valueType} containing:`);
                console.error(valuePreview);
              } catch {
                console.error(`Variable @${varName} is not in scope or failed to retrieve.`);
              }
            }
            console.error(`\nContent loaders like <path> need a string path or array of paths.`);
            console.error(`Did you mean to use the variable directly (without angle brackets)?`);
            console.error('');
          }
        } else if (!resolvedPath.startsWith('/') && !resolvedPath.startsWith('@')) {
          // Check if the path looks like it might be relative
          console.error(`Hint: Paths are relative to mlld files. You can make them relative to your project root with the \`@base/\` prefix`);
        }
        return '';
      } else if (error.code === 'EACCES') {
        console.error(`Warning: Permission denied - '${resolvedPath}'`);
        return '';
      } else {
        console.error(`Warning: Failed to load file '${resolvedPath}': ${error.message}`);

        // Check for failed variable interpolation
        if (resolvedPath.includes('@')) {
          const varMatches = resolvedPath.match(/@(\w+)/g);
          if (varMatches && varMatches.length > 0) {
            console.error('');
            for (const match of varMatches) {
              const varName = match.substring(1);
              try {
                const actualValue = env.getVariable(varName);
                const valueType = actualValue?.type || typeof actualValue;
                const valuePreview = JSON.stringify(actualValue, null, 2).substring(0, 200);
                console.error(`Variable @${varName} is a ${valueType} containing:`);
                console.error(valuePreview);
              } catch {
                console.error(`Variable @${varName} is not in scope or failed to retrieve.`);
              }
            }
            console.error(`\nContent loaders like <path> need a string path or array of paths.`);
            console.error(`Did you mean to use the variable directly (without angle brackets)?`);
            console.error('');
          }
        }

        // Check if the path looks like it might be relative
        if (!resolvedPath.startsWith('/') && !resolvedPath.startsWith('@')) {
          console.error(`Hint: Paths are relative to mlld files. You can make them relative to your project root with the \`@base/\` prefix`);
        }
        return '';
      }
    }
    
    // Handle glob results (array of files)
    if (isLoadContentResultArray(loadResult)) {
      // For glob patterns, join all file contents
      const contents = await Promise.all(
        loadResult.map(file => processFileFields(file, node.fields, node.pipes, env))
      );
      return contents.join('\n\n');
    }
    
    // Process field access and pipes
    return processFileFields(loadResult, node.fields, node.pipes, env);
  } finally {
    // Remove from stack
    env.popInterpolationStack(resolvedPath);
  }
}

/**
 * Process field access and pipes on file content
 */
export async function processFileFields(
  content: LoadContentResult | LoadContentResult[],
  fields: FieldAccessNode[] | undefined,
  pipes: CondensedPipe[] | undefined,
  env: Environment
): Promise<string> {
  const { isLoadContentResult } = await import('@core/types/load-content');
  let result: any = content;
  
  // Keep LoadContentResult intact for field access, only extract content if no fields to access
  if (isLoadContentResult(result)) {
    if (!fields || fields.length === 0) {
      // No field access needed, extract content
      result = result.content;
    }
    // If we have fields to access, keep the full LoadContentResult object so we can access .fm, .json, etc.
  }
  
  // Process field access
  if (fields && fields.length > 0) {
    // Use enhanced field access for better error messages
    const { accessField } = await import('../utils/field-access');
    for (const field of fields) {
      try {
        const fieldResult = await accessField(result, field, { 
          preserveContext: true,
          env 
        });
        result = (fieldResult as any).value;
        if (result === undefined) {
          // Warning to stderr
          console.error(`Warning: field '${field.value}' not found`);
          return '';
        }
      } catch (error) {
        // Field not found - log warning and return empty string for backward compatibility
        console.error(`Warning: field '${field.value}' not found`);
        return '';
      }
    }
  }
  
  // Apply pipes
  if (pipes && pipes.length > 0) {
    // Use unified pipeline processor instead of applyCondensedPipes
    const { processPipeline } = await import('../eval/pipeline/unified-processor');
    // Create a node object with the pipes for the processor
    const nodeWithPipes = { pipes };
    result = await processPipeline({
      value: result,
      env,
      node: nodeWithPipes
    });
    // Pipes already handle conversion to string format, so return as-is
    return asText(result);
  }
  
  // Convert to string only if no pipes were applied
  if (isStructuredValue(result)) {
    return asText(result);
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}
