import type {
  CondensedPipe,
  FieldAccessNode,
  FileReferenceNode,
  MlldNode,
  ExecInvocation
} from '@core/types';
import type { LoadContentResult } from '@core/types/load-content';
import type { SecurityDescriptor } from '@core/types/security';
import { asText, assertStructuredValue, isStructuredValue } from '@interpreter/utils/structured-value';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { Environment } from '../env/Environment';
import type { VarAssignmentResult } from '../eval/var';
import type { OperationContext } from '../env/ContextManager';
import { EscapingStrategyFactory, InterpolationContext } from '../core/interpolation-context';
import { interpreterLogger as logger } from '@core/utils/logger';
import { evaluateDataValue } from '../eval/data-value-evaluator';
import { evaluateConditionalInclusion } from '../eval/conditional-inclusion';
import { isTruthy } from '../eval/expressions';
import { classifyShellValue } from '../utils/shell-value';
import * as shellQuote from 'shell-quote';

/**
 * ASSERTION HELPER FOR PHASE 2.3 MIGRATION
 *
 * Enable runtime assertions during migration to verify array behavior changes.
 * Set MLLD_ASSERT_ARRAY_BEHAVIOR=true to enable assertion mode.
 *
 * These assertions help catch unexpected behavior changes when migrating from
 * specific array type checks to generic StructuredValue array handling.
 */
const ASSERT_MODE = process.env.MLLD_ASSERT_ARRAY_BEHAVIOR === 'true';

function assertArrayBehavior(condition: boolean, message: string, context?: Record<string, unknown>): void {
  if (ASSERT_MODE && !condition) {
    const contextStr = context ? `\nContext: ${JSON.stringify(context, null, 2)}` : '';
    throw new Error(`[ARRAY MIGRATION ASSERTION] ${message}${contextStr}`);
  }
}

function isExecutableReferenceValue(
  value: unknown
): value is { name?: unknown; paramNames?: unknown; __executable?: unknown; type?: unknown } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (
      (value as { type?: unknown }).type === 'executable' ||
      (value as { __executable?: unknown }).__executable === true
    )
  );
}

function formatExecutableReferenceValue(value: unknown): string {
  if (!isExecutableReferenceValue(value)) {
    return '[executable]';
  }

  if (typeof value.name === 'string' && value.name.trim().length > 0) {
    return `[executable: ${value.name}]`;
  }

  const params = Array.isArray(value.paramNames) ? value.paramNames.filter(param => typeof param === 'string') : [];
  return `<function(${params.join(', ')})>`;
}

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

function formatInterpolationFieldAccess(fields?: FieldAccessNode[]): string {
  if (!fields || fields.length === 0) {
    return '';
  }

  let output = '';
  for (const field of fields) {
    if (!field) {
      continue;
    }
    const optionalSuffix = field.optional ? '?' : '';
    switch (field.type) {
      case 'field':
      case 'numericField':
        output += `.${String(field.value ?? '')}${optionalSuffix}`;
        break;
      case 'stringIndex':
      case 'arrayIndex':
        output += `[${String(field.value ?? '')}]${optionalSuffix}`;
        break;
      case 'bracketAccess':
        output += `[${JSON.stringify(field.value ?? '')}]${optionalSuffix}`;
        break;
      case 'variableIndex': {
        const ref = (field as any).value;
        const identifier =
          ref && typeof ref === 'object' && typeof ref.identifier === 'string'
            ? `@${ref.identifier}${formatInterpolationFieldAccess((ref as any).fields)}`
            : String(field.value ?? '');
        output += `[${identifier}]${optionalSuffix}`;
        break;
      }
      default:
        return output;
    }
  }

  return output;
}

function serializeInterpolationReference(node: InterpolationNode): string | null {
  if (node.type !== 'VariableReference' || typeof node.identifier !== 'string') {
    return null;
  }

  return `@${node.identifier}${formatInterpolationFieldAccess(node.fields)}`;
}

function hasComplexInterpolationBase(fields?: FieldAccessNode[]): boolean {
  if (!Array.isArray(fields) || fields.length === 0) {
    return false;
  }

  return fields.some(field => {
    if (!field) {
      return false;
    }
    return field.type !== 'field' && field.type !== 'numericField';
  });
}

function shouldReparseSyntheticInterpolationTail(
  node: InterpolationNode,
  tail: string
): boolean {
  if (typeof tail !== 'string' || tail.length === 0) {
    return false;
  }

  if (tail.startsWith('[')) {
    return true;
  }

  if (!hasComplexInterpolationBase(node.fields)) {
    return false;
  }

  if (/^\.[A-Za-z_]/.test(tail)) {
    return true;
  }

  if (tail.startsWith('(')) {
    return true;
  }

  return false;
}

function extractSyntheticShowNode(directive: any): InterpolationNode | null {
  return (
    directive?.values?.invocation ??
    directive?.values?.variable ??
    directive?.values?.execInvocation ??
    null
  );
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
      return String(nodes ?? '');
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

    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      let node = nodes[nodeIndex];

      // Some nested template contexts split bracket/dot tails into a following Text node.
      // Reparse the combined reference so @mx.args["name"] and chained forms work uniformly.
      if (node.type === 'VariableReference') {
        const nextNode = nodes[nodeIndex + 1];
        const serialized = serializeInterpolationReference(node);
        const tail = nextNode?.type === 'Text' ? nextNode.content ?? '' : '';
        const startsWithTail = shouldReparseSyntheticInterpolationTail(node, tail);

        if (serialized && startsWithTail) {
          try {
            const { parseSync } = await import('@grammar/parser');
            const syntheticDirective = parseSync(`/show ${serialized}${tail}`)[0] as any;
            const syntheticNode = extractSyntheticShowNode(syntheticDirective);
            if (syntheticNode) {
              node = syntheticNode;
              nodeIndex += 1;
            }
          } catch {
            // Fall back to normal interpolation when the tail is ordinary text.
          }
        }
      }

      if (node.type === 'Text') {
        // Handle Text nodes - directly use string content
        pushPart(node.content || '');
      } else if (node.type === 'PathSeparator') {
        pushPart(node.value || '/');
      } else if (node.type === 'ConditionalTemplateSnippet' || node.type === 'ConditionalStringFragment') {
        const conditionNode = (node as any).condition;
        const contentNodes = (node as any).content;
        const { shouldInclude } = await evaluateConditionalInclusion(conditionNode, env);
        if (!shouldInclude) {
          continue;
        }
        const snippet = await interpolateImpl(Array.isArray(contentNodes) ? contentNodes : [], env, context, options);
        pushPart(snippet);
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
        collectDescriptor(variable.mx ? varMxToSecurityDescriptor(variable.mx) : undefined);
        
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
        } else if (isExecutableReferenceValue(value)) {
          stringValue = formatExecutableReferenceValue(value);
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
          } else if (isStructuredValue(value) && value.type === 'array') {
            // StructuredValue arrays already have proper .text
            stringValue = value.text;
          }
        } else if (typeof value === 'object') {
          const { JSONFormatter } = await import('../core/json-formatter');
          stringValue = JSONFormatter.stringify(value);
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
        
        collectDescriptor(variable.mx ? varMxToSecurityDescriptor(variable.mx) : undefined);
        
        // Template variable content needs template escaping context
        if (variable.internal?.templateAst) {
          const templateContent = await interpolateImpl(variable.internal.templateAst, env, InterpolationContext.Template, options);
          pushPart(templateContent);
        } else {
          const strategy = EscapingStrategyFactory.getStrategy(context);
          const value = asText(variable.value);
          pushPart(strategy.escape(value));
        }
      } else if (node.type === 'EscapedAngleBracketExpression') {
        const innerNodes = Array.isArray((node as any).content) ? (node as any).content : [];
        const inner = await interpolateImpl(innerNodes as any[], env, context, options);
        pushPart(`<${inner}>`);
      } else if (
        node.type === 'VariableReference' ||
        node.type === 'VariableReferenceWithTail' ||
        node.type === 'TemplateVariable' ||
        node.type === 'ConditionalVarOmission' ||
        node.type === 'NullCoalescingTight'
      ) {
        // Complex variable references (with field access, pipes, etc.)
        const isConditionalOmission = node.type === 'ConditionalVarOmission';
        const isNullCoalescingTight = node.type === 'NullCoalescingTight';
        const baseNode =
          isConditionalOmission || isNullCoalescingTight
            ? (node as any).variable
            : (node as any).type === 'VariableReferenceWithTail' && (node as any).variable
              ? (node as any).variable
              : node;
        const varName = (baseNode as any).identifier || (baseNode as any).name;
        const fallbackValue = isNullCoalescingTight ? (node as any).default?.value ?? '' : '';
        let variable = env.getVariable(varName);
        
        // Allow resolver variables (async evaluation)
        if (!variable && env.hasVariable(varName)) {
          const resolverVar = await env.getResolverVariable(varName);
          if (resolverVar) {
            variable = resolverVar;
          }
        }
        
        let value: unknown = '';
        let resolvedValueReady = false;

        if (!variable) {
          if (isConditionalOmission) {
            continue;
          }
          if (isNullCoalescingTight) {
            value = fallbackValue;
            resolvedValueReady = true;
          } else {
            if (process.env.MLLD_DEBUG === 'true') {
              logger.debug('Variable not found during interpolation:', { varName, valueType: (baseNode as any).valueType });
            }
            // WHY: Preserve original syntax when variable is undefined for better error messages
            // Must include any field access chain to reconstruct the full original text (e.g., @example.com)
            const fields = (baseNode as any).fields as FieldAccessNode[] | undefined;
            const fieldSuffix = fields?.map(f => {
              if (f.type === 'field' && typeof f.value === 'string') {
                return `.${f.value}`;
              }
              return '';
            }).join('') ?? '';
            if ((baseNode as any).valueType === 'varInterpolation') {
              pushPart(`{{${varName}${fieldSuffix}}}`);  // {{var}} syntax
            } else {
              pushPart(`@${varName}${fieldSuffix}`);      // @var syntax
            }
            continue;
          }
        }

        if (!resolvedValueReady) {
          collectDescriptor(variable.mx ? varMxToSecurityDescriptor(variable.mx) : undefined);

          // Handle TemplateVariable references (e.g., ::{{var}}::)
          if ((baseNode as any).type === 'TemplateVariable') {
            if ((baseNode as any).content) {
              value = await interpolateImpl((baseNode as any).content as any[], env, InterpolationContext.Template, options);
            } else if (variable.internal?.templateAst) {
              value = await interpolateImpl(variable.internal.templateAst, env, InterpolationContext.Template, options);
            }
            pushPart(String(value ?? ''));
            continue;
          }

          const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
          const fields = (baseNode as any).fields as any[] | undefined;
          const hasMxField =
            Array.isArray(fields) &&
            fields.length > 0 &&
            fields[0]?.type === 'field' &&
            String(fields[0]?.value ?? '') === 'mx';
          const isMxVariable = variable.name === 'mx';
          const resolutionContext =
            hasMxField || isMxVariable
              ? ResolutionContext.FieldAccess
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
          let fieldsToProcess = (baseNode as any).fields || [];
          if (fieldsToProcess.length > 0 && (typeof value === 'object' || typeof value === 'string') && value !== null) {
            const { accessField, accessFields } = await import('../utils/field-access');
            const { isStructuredValue, asData } = await import('./structured-value');
            let fieldPath: string[] = [];
            for (let fi = 0; fi < fieldsToProcess.length; fi++) {
              const field = fieldsToProcess[fi];

              // Handle wildcardIndex: project remaining fields over array elements
              if (field.type === 'wildcardIndex') {
                const arrayData = isStructuredValue(value) ? asData(value) : value;
                if (!Array.isArray(arrayData)) {
                  const { FieldAccessError } = await import('@core/errors');
                  throw new FieldAccessError('Cannot use [*] on non-array value', {
                    baseValue: value,
                    fieldAccessChain: fieldPath,
                    failedAtIndex: fieldPath.length,
                    failedKey: '*'
                  });
                }
                const remaining = fieldsToProcess.slice(fi + 1);
                if (remaining.length > 0) {
                  value = await Promise.all(
                    arrayData.map((element: any) =>
                      accessFields(element, remaining, {
                        preserveContext: false,
                        env,
                        parentPath: [...fieldPath, '*'],
                        baseIdentifier: varName
                      })
                    )
                  );
                }
                break;
              }

              let fieldToAccess = field;

              // Handle variableIndex type - need to resolve the variable first
              if (field.type === 'variableIndex') {
                const { evaluateDataValue } = await import('../eval/data-value-evaluator');
                const indexNode =
                  typeof field.value === 'object'
                    ? (field.value as any)
                    : {
                        type: 'VariableReference',
                        valueType: 'varIdentifier',
                        identifier: String(field.value)
                      };
                const indexValue = await evaluateDataValue(indexNode as any, env);
                fieldToAccess = { type: 'bracketAccess' as const, value: indexValue };
              }

              const fieldResult = await accessField(value, fieldToAccess, {
                preserveContext: true,
                env,
                parentPath: fieldPath,
                baseIdentifier: varName
              });
              value = (fieldResult as any).value;
              fieldPath = (fieldResult as any).accessPath || fieldPath;

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

              if (value === undefined || value === null) break;
            }
          }

          // Handle pipes if present
          if ((baseNode as any).pipes && (baseNode as any).pipes.length > 0) {
            const { processPipeline } = await import('../eval/pipeline/unified-processor');
            value = await processPipeline({
              value,
              env,
              node: baseNode,
              identifier: (baseNode as any).identifier,
              descriptorHint: variable?.mx ? varMxToSecurityDescriptor(variable.mx) : undefined
            });
            if (typeof value === 'string') {
              const strategy = EscapingStrategyFactory.getStrategy(context);
              pushPart(strategy.escape(value));
              continue;
            }
          }
        }
        const { resolveValue, ResolutionContext: ResContext } = await import('../utils/variable-resolution');
        value = await resolveValue(value, env, ResContext.StringInterpolation);

        if (value && typeof value === 'object' && (value as any).type === 'Null') {
          value = null;
        }

        if (isConditionalOmission && !isTruthy(value)) {
          continue;
        }
        if (isNullCoalescingTight && (value === null || value === undefined)) {
          value = fallbackValue;
        }
        
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
        } else if (isExecutableReferenceValue(value)) {
          stringValue = formatExecutableReferenceValue(value);
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
            const { isPipelineInput } = await import('@core/types/variable/TypeGuards');
            const { isLoadContentResult } = await import('@core/types/load-content');
            if (isPipelineInput(value)) {
              stringValue = asText(value);
            } else if (isLoadContentResult(value)) {
              stringValue = asText(value);
            } else {
              const { JSONFormatter } = await import('../core/json-formatter');
              stringValue = JSONFormatter.stringify(value);
            }
          }
        } else if (Array.isArray(value)) {
          if (isStructuredValue(value) && value.type === 'array') {
            // MIGRATION: This branch handles StructuredValue arrays (glob patterns)
            // Expected behavior: Join array items with \n\n separator (already in .text)
            stringValue = value.text;
            assertArrayBehavior(
              typeof stringValue === 'string',
              'StructuredValue array should have .text property',
              { arrayLength: Array.isArray(value.data) ? value.data.length : 0, resultType: typeof stringValue }
            );
          } else {
            // MIGRATION: Generic array handling
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
          const { isLoadContentResult } = await import('@core/types/load-content');
          if (isLoadContentResult(value)) {
            stringValue = asText(value);
          } else if (isExecutableReferenceValue(value)) {
            stringValue = formatExecutableReferenceValue(value);
          } else if (isStructuredValue(value) && value.type === 'array') {
            // StructuredValue arrays already have concatenated text
            stringValue = value.text;
          } else if (variable && variable.internal?.isNamespace && (baseNode as any).fields?.length === 0) {
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
        
        if ((baseNode as any).boundary) {
          if ((baseNode as any).boundary.type === 'literal') {
            pushPart((baseNode as any).boundary.value);
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
          const keyVarName = (node as any).keyVariable?.identifier;
          const iterationVar = importer.createVariableFromValue(varName, value, 'template-for', undefined, { env });
          childEnv.setVariable(varName, iterationVar);
          if (key !== null && key !== undefined) {
            if (keyVarName) {
              const keyVar = importer.createVariableFromValue(keyVarName, key, 'template-for', undefined, { env });
              childEnv.setVariable(keyVarName, keyVar);
            } else {
              const keyVar = importer.createVariableFromValue(`${varName}_key`, key, 'template-for', undefined, { env });
              childEnv.setVariable(`${varName}_key`, keyVar);
            }
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
          case 'code':
            throw new Error('Inline show does not execute commands or code. Use run instead.');
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
            throw new Error('Inline show only supports templates, references, and load content.');
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
      } else if (node.type === 'UnaryExpression') {
        // Handle unary expressions (e.g., !@var, !@arr.includes("x"))
        const { evaluateUnifiedExpression } = await import('../eval/expressions');
        const result = await evaluateUnifiedExpression(node as any, env, { isExpression: true });
        const stringValue = String(result.value);
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
    return varMxToSecurityDescriptor(value.mx as any);
  }
  if (typeof value === 'object') {
    const mx = (value as { mx?: Record<string, unknown> }).mx;
    return mx ? varMxToSecurityDescriptor(mx as any) : undefined;
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
    const { isLoadContentResult } = await import('@core/types/load-content');
    
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
          console.error(`Hint: Paths are relative to mlld files. You can make them relative to your project root with the \`@root/\` prefix`);
        }
        return '';
      } else if (error.code === 'EACCES') {
        console.error(`Warning: Permission denied - '${resolvedPath}'`);
        return '';
      } else {
        console.error(`Warning: Failed to load file '${resolvedPath}': ${error.message}`);

        // Check for angle bracket in path (likely XML/HTML context)
        const hasAngleBracket = resolvedPath.includes('<') || resolvedPath.includes('>');
        if (hasAngleBracket) {
          console.error('');
          console.error('This looks like you tried to use alligator field access inside XML/HTML tags.');
          console.error('Due to grammar ambiguity with nested angle brackets, this pattern is not supported.');
          console.error('');
          console.error('Workaround: Use a variable instead:');
          console.error('  var @file = <file.md>.keep');
          console.error('  show `<@file.mx.filename>@file</@file.mx.filename>`');
          console.error('');
          return '';
        }

        // Check for failed variable interpolation
        let hasVariableHint = false;
        if (resolvedPath.includes('@')) {
          const varMatches = resolvedPath.match(/@(\w+)/g);
          if (varMatches && varMatches.length > 0) {
            hasVariableHint = true;
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

        // Check if the path looks like it might be relative (only if no other hint shown)
        if (!hasVariableHint && !resolvedPath.startsWith('/') && !resolvedPath.startsWith('@')) {
          console.error(`Hint: Paths are relative to mlld files. You can make them relative to your project root with the \`@root/\` prefix`);
        }
        return '';
      }
    }
    
    // Handle glob results (array of files)
    if (isStructuredValue(loadResult) && loadResult.type === 'array') {
      // For glob patterns, process each file and join all file contents
      const items = loadResult.data as LoadContentResult[];
      const contents = await Promise.all(
        items.map(file => processFileFields(file, node.fields, node.pipes, env))
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
      result = asText(result);
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
  if (typeof result === 'string') {
    return result;
  }
  const { JSONFormatter } = await import('../core/json-formatter');
  return JSONFormatter.stringify(result);
}
