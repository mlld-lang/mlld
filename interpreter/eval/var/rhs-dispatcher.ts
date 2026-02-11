import type { DirectiveNode, SourceLocation } from '@core/types';
import { logger } from '@core/utils/logger';
import type { Variable } from '@core/types/variable';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import {
  evaluateArrayItems,
  evaluateCollectionObject,
  hasComplexArrayItems,
  hasComplexValues
} from './collection-evaluator';
import type {
  ExecutionEvaluationResult,
  ExecutionEvaluator
} from './execution-evaluator';
import { isExecutionValueNode } from './execution-evaluator';
import type { ReferenceEvaluator } from './reference-evaluator';
import type { RhsContentEvaluator } from './rhs-content';
import {
  extractDescriptorsFromDataAst,
  extractDescriptorsFromTemplateAst,
  type DescriptorCollector
} from './security-descriptor';

export type RhsHandlerKey =
  | 'file-reference'
  | 'primitive'
  | 'literal'
  | 'array'
  | 'object'
  | 'section'
  | 'load-content'
  | 'path'
  | 'variable-reference'
  | 'template-array'
  | 'text'
  | 'variable-reference-tail'
  | 'expression'
  | 'execution'
  | 'fallback';

export type RhsEvaluationResult =
  | {
      type: 'resolved';
      handler: RhsHandlerKey;
      value: unknown;
    }
  | {
      type: 'executable-variable';
      handler: 'variable-reference';
      variable: Variable;
    }
  | {
      type: 'for-expression';
      handler: 'execution';
      variable: Variable;
    }
  | {
      type: 'return-control';
      handler: 'execution';
      value: unknown;
    };

export interface RhsDispatcherDependencies {
  context?: EvaluationContext;
  directive: DirectiveNode;
  env: Environment;
  executionEvaluator: ExecutionEvaluator;
  identifier: string;
  interpolateWithSecurity: (nodes: unknown) => Promise<string>;
  isToolsCollection: boolean;
  mergeResolvedDescriptor: DescriptorCollector;
  referenceEvaluator: ReferenceEvaluator;
  rhsContentEvaluator: RhsContentEvaluator;
  sourceLocation?: SourceLocation;
}

export interface RhsDispatcher {
  evaluate: (valueNode: unknown) => Promise<RhsEvaluationResult>;
}

function isPrimitiveValue(valueNode: unknown): boolean {
  return typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null;
}

function isExpressionNode(valueNode: unknown): boolean {
  if (!valueNode || typeof valueNode !== 'object') {
    return false;
  }

  const nodeType = (valueNode as { type?: string }).type;
  return nodeType === 'BinaryExpression'
    || nodeType === 'TernaryExpression'
    || nodeType === 'UnaryExpression';
}

async function evaluateToolCollectionObject(
  valueNode: any,
  env: Environment,
  collectDescriptor?: DescriptorCollector,
  context?: EvaluationContext,
  sourceLocation?: SourceLocation
): Promise<Record<string, unknown>> {
  return evaluateCollectionObject(
    valueNode,
    env,
    collectDescriptor,
    context,
    sourceLocation,
    true
  );
}

function toRhsResultFromExecution(
  executionResult: ExecutionEvaluationResult
): RhsEvaluationResult {
  if (executionResult.kind === 'return-control') {
    return {
      type: 'return-control',
      handler: 'execution',
      value: executionResult.value
    };
  }

  if (executionResult.kind === 'for-expression') {
    return {
      type: 'for-expression',
      handler: 'execution',
      variable: executionResult.variable
    };
  }

  return {
    type: 'resolved',
    handler: 'execution',
    value: executionResult.value
  };
}

function resolveHandlerKey(valueNode: unknown): RhsHandlerKey {
  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'FileReference') {
    return 'file-reference';
  }

  if (isPrimitiveValue(valueNode)) {
    return 'primitive';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'Literal') {
    return 'literal';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'array') {
    return 'array';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'object') {
    return 'object';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'section') {
    return 'section';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'load-content') {
    return 'load-content';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'path') {
    return 'path';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'VariableReference') {
    return 'variable-reference';
  }

  if (Array.isArray(valueNode)) {
    return 'template-array';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'Text') {
    return 'text';
  }

  if (valueNode && typeof valueNode === 'object' && (valueNode as { type?: string }).type === 'VariableReferenceWithTail') {
    return 'variable-reference-tail';
  }

  if (isExpressionNode(valueNode)) {
    return 'expression';
  }

  if (isExecutionValueNode(valueNode)) {
    return 'execution';
  }

  return 'fallback';
}

export function createRhsDispatcher(dependencies: RhsDispatcherDependencies): RhsDispatcher {
  const {
    context,
    directive,
    env,
    executionEvaluator,
    identifier,
    interpolateWithSecurity,
    isToolsCollection,
    mergeResolvedDescriptor,
    referenceEvaluator,
    rhsContentEvaluator,
    sourceLocation
  } = dependencies;

  const evaluate = async (valueNode: unknown): Promise<RhsEvaluationResult> => {
    const handlerKey = resolveHandlerKey(valueNode);

    switch (handlerKey) {
      case 'file-reference': {
        const value = await rhsContentEvaluator.evaluateFileReference(valueNode);
        return { type: 'resolved', handler: handlerKey, value };
      }

      case 'primitive': {
        return { type: 'resolved', handler: handlerKey, value: valueNode };
      }

      case 'literal': {
        return {
          type: 'resolved',
          handler: handlerKey,
          value: (valueNode as { value: unknown }).value
        };
      }

      case 'array': {
        const arrayNode = valueNode as any;
        const items = arrayNode.items || arrayNode.elements || [];
        const isComplex = hasComplexArrayItems(items);

        if (isComplex) {
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('var.ts: Storing complex array AST for lazy evaluation:', {
              identifier,
              valueNode: arrayNode
            });
          }

          const dataDescriptor = extractDescriptorsFromDataAst(arrayNode, env);
          if (dataDescriptor) {
            mergeResolvedDescriptor(dataDescriptor);
          }

          return { type: 'resolved', handler: handlerKey, value: arrayNode };
        }

        const value = await evaluateArrayItems(
          items,
          env,
          mergeResolvedDescriptor,
          context,
          sourceLocation
        );
        return { type: 'resolved', handler: handlerKey, value };
      }

      case 'object': {
        const objectNode = valueNode as any;
        if (isToolsCollection) {
          const value = await evaluateToolCollectionObject(
            objectNode,
            env,
            mergeResolvedDescriptor,
            context,
            sourceLocation
          );
          return { type: 'resolved', handler: handlerKey, value };
        }

        const isComplex = hasComplexValues(objectNode.entries || objectNode.properties);
        if (isComplex) {
          const dataDescriptor = extractDescriptorsFromDataAst(objectNode, env);
          if (dataDescriptor) {
            mergeResolvedDescriptor(dataDescriptor);
          }
          return { type: 'resolved', handler: handlerKey, value: objectNode };
        }

        const value = await evaluateCollectionObject(
          objectNode,
          env,
          mergeResolvedDescriptor,
          context,
          sourceLocation
        );
        return { type: 'resolved', handler: handlerKey, value };
      }

      case 'section': {
        const value = await rhsContentEvaluator.evaluateSection(valueNode);
        return { type: 'resolved', handler: handlerKey, value };
      }

      case 'load-content': {
        const value = await rhsContentEvaluator.evaluateLoadContent(valueNode);
        return { type: 'resolved', handler: handlerKey, value };
      }

      case 'path': {
        const value = await rhsContentEvaluator.evaluatePath(valueNode);
        return { type: 'resolved', handler: handlerKey, value };
      }

      case 'variable-reference': {
        const varRefNode = valueNode as any;
        if (process.env.MLLD_DEBUG === 'true') {
          console.log('Processing VariableReference in var.ts:', {
            identifier,
            varIdentifier: varRefNode.identifier,
            hasFields: !!(varRefNode.fields && varRefNode.fields.length > 0),
            fields: varRefNode.fields?.map((field: any) => field.value)
          });
        }

        const referenceResult = await referenceEvaluator.evaluateVariableReference(
          varRefNode,
          identifier
        );
        if (referenceResult.executableVariable) {
          return {
            type: 'executable-variable',
            handler: handlerKey,
            variable: referenceResult.executableVariable
          };
        }
        return {
          type: 'resolved',
          handler: handlerKey,
          value: referenceResult.resolvedValue
        };
      }

      case 'template-array': {
        const templateNodes = valueNode as any[];

        if (
          templateNodes.length === 1
          && templateNodes[0].type === 'Text'
          && directive.meta?.wrapperType === 'backtick'
        ) {
          return {
            type: 'resolved',
            handler: handlerKey,
            value: templateNodes[0].content
          };
        }

        if (directive.meta?.wrapperType === 'doubleColon' || directive.meta?.wrapperType === 'tripleColon') {
          if (directive.meta?.wrapperType === 'tripleColon') {
            const astDescriptor = extractDescriptorsFromTemplateAst(templateNodes, env);
            if (astDescriptor) {
              mergeResolvedDescriptor(astDescriptor);
            }

            logger.debug('Storing template AST for triple-colon template', {
              identifier,
              ast: templateNodes,
              extractedLabels: astDescriptor?.labels
            });

            return {
              type: 'resolved',
              handler: handlerKey,
              value: templateNodes
            };
          }

          const value = await interpolateWithSecurity(templateNodes);
          return { type: 'resolved', handler: handlerKey, value };
        }

        const value = await interpolateWithSecurity(templateNodes);
        return { type: 'resolved', handler: handlerKey, value };
      }

      case 'text': {
        const textNode = valueNode as { content: string };
        return {
          type: 'resolved',
          handler: handlerKey,
          value: textNode.content
        };
      }

      case 'variable-reference-tail': {
        if (process.env.MLLD_DEBUG === 'true') {
          console.log('Processing VariableReferenceWithTail in var.ts');
        }

        const referenceResult = await referenceEvaluator.evaluateVariableReferenceWithTail(
          valueNode,
          identifier
        );
        return {
          type: 'resolved',
          handler: handlerKey,
          value: referenceResult.resolvedValue
        };
      }

      case 'expression': {
        const { evaluateUnifiedExpression } = await import('../expressions');
        const expressionResult = await evaluateUnifiedExpression(valueNode, env);
        return {
          type: 'resolved',
          handler: handlerKey,
          value: expressionResult.value
        };
      }

      case 'execution': {
        const executionResult = await executionEvaluator.evaluateExecutionBranch(
          valueNode,
          identifier
        );
        if (!executionResult) {
          throw new Error(`Execution evaluator returned no result for @${identifier}`);
        }

        return toRhsResultFromExecution(executionResult);
      }

      case 'fallback':
      default: {
        if (process.env.MLLD_DEBUG === 'true') {
          logger.debug('var.ts: Default case for valueNode:', { valueNode });
        }

        const value = await interpolateWithSecurity([valueNode]);
        return {
          type: 'resolved',
          handler: handlerKey,
          value
        };
      }
    }
  };

  return { evaluate };
}
