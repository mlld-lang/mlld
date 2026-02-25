import * as fs from 'fs';
import type { SourceLocation } from '@core/types';
import { logger } from '@core/utils/logger';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
import { isFileLoadedValue } from '@interpreter/utils/load-content-structured';
import { extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';
import type { DescriptorCollector } from './security-descriptor';
import { interpolateAndCollect } from './security-descriptor';

const COMPLEX_OBJECT_TYPES = new Set([
  'code',
  'command',
  'VariableReference',
  'path',
  'section',
  'runExec',
  'ExecInvocation',
  'load-content'
]);

const COMPLEX_ARRAY_ITEM_TYPES = new Set([
  'code',
  'command',
  'VariableReference',
  'array',
  'object',
  'path',
  'section',
  'load-content',
  'ExecInvocation'
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getArrayItems(node: any): any[] {
  if (!node || typeof node !== 'object') {
    return [];
  }
  return node.items || node.elements || [];
}

export function hasComplexValues(objOrProperties: any): boolean {
  if (!objOrProperties) {
    return false;
  }

  if (Array.isArray(objOrProperties)) {
    for (const entry of objOrProperties) {
      if (entry.type === 'spread' || entry.type === 'conditionalPair') {
        return true;
      }
      if (entry.type !== 'pair') {
        continue;
      }

      const value = entry.value;
      if (!value || typeof value !== 'object') {
        continue;
      }

      if ('type' in value && COMPLEX_OBJECT_TYPES.has(value.type)) {
        return true;
      }
      if (value.type === 'object' && hasComplexValues(value.entries || value.properties)) {
        return true;
      }
      if (value.type === 'array' && hasComplexArrayItems(getArrayItems(value))) {
        return true;
      }
      if (!value.type && isPlainObject(value) && hasComplexValues(value)) {
        return true;
      }
    }
    return false;
  }

  for (const value of Object.values(objOrProperties)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    if ('type' in value && COMPLEX_OBJECT_TYPES.has(value.type)) {
      return true;
    }
    if (value.type === 'object' && hasComplexValues(value.entries || value.properties)) {
      return true;
    }
    if (value.type === 'array' && hasComplexArrayItems(getArrayItems(value))) {
      return true;
    }
    if (!value.type && isPlainObject(value) && hasComplexValues(value)) {
      return true;
    }
  }

  return false;
}

export function hasComplexArrayItems(items: any[]): boolean {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    if ('type' in item && COMPLEX_ARRAY_ITEM_TYPES.has(item.type)) {
      return true;
    }

    if (Array.isArray(item) && hasComplexArrayItems(item)) {
      return true;
    }

    if (item.constructor === Object && hasComplexValues(item)) {
      return true;
    }
  }

  return false;
}

export async function evaluateArrayItems(
  items: any[],
  env: Environment,
  collectDescriptor?: DescriptorCollector,
  context?: EvaluationContext,
  sourceLocation?: SourceLocation
): Promise<any[]> {
  const result: any[] = [];
  for (const item of items ?? []) {
    result.push(
      await evaluateArrayItem(
        item,
        env,
        collectDescriptor,
        context,
        sourceLocation
      )
    );
  }
  return result;
}

export async function evaluateCollectionObject(
  valueNode: any,
  env: Environment,
  collectDescriptor?: DescriptorCollector,
  context?: EvaluationContext,
  sourceLocation?: SourceLocation,
  requirePairs = false
): Promise<Record<string, unknown>> {
  const entries = valueNode?.entries ?? null;
  const properties = valueNode?.properties ?? null;
  const result: Record<string, unknown> = {};

  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (entry.type !== 'pair') {
        if (requirePairs) {
          throw new Error('Tool definitions must be plain object entries');
        }
        continue;
      }

      result[entry.key] = await evaluateArrayItem(
        entry.value,
        env,
        collectDescriptor,
        context,
        sourceLocation
      );
    }
    return result;
  }

  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties)) {
      result[key] = await evaluateArrayItem(
        value,
        env,
        collectDescriptor,
        context,
        sourceLocation
      );
    }
  }

  return result;
}

async function evaluatePlainObject(
  item: Record<string, unknown>,
  env: Environment,
  collectDescriptor?: DescriptorCollector,
  context?: EvaluationContext,
  sourceLocation?: SourceLocation
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(item)) {
    if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
      continue;
    }
    result[key] = await evaluateArrayItem(
      value,
      env,
      collectDescriptor,
      context,
      sourceLocation
    );
  }

  return result;
}

/**
 * Evaluate a collection item based on its type.
 * This preserves Variable wrappers so metadata stays attached inside arrays and objects.
 */
export async function evaluateArrayItem(
  item: any,
  env: Environment,
  collectDescriptor?: DescriptorCollector,
  context?: EvaluationContext,
  sourceLocation?: SourceLocation
): Promise<any> {
  if (!item || typeof item !== 'object') {
    return item;
  }

  if (process.env.MLLD_DEBUG === 'true' && item.type === 'object') {
    logger.debug('evaluateArrayItem processing object:', {
      hasProperties: !!item.properties,
      propertyKeys: item.properties ? Object.keys(item.properties) : [],
      sampleProperty: item.properties?.name
    });
  }

  if ('content' in item && Array.isArray(item.content) && 'wrapperType' in item) {
    const hasOnlyLiteralsOrText = item.content.every(
      (node: any) =>
        node &&
        typeof node === 'object' &&
        ((node.type === 'Literal' && 'value' in node) || (node.type === 'Text' && 'content' in node))
    );

    if (hasOnlyLiteralsOrText) {
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        console.error('[evaluateArrayItem] literal/text wrapper', {
          wrapperType: item.wrapperType,
          items: item.content.map((node: any) => node.type)
        });
      }
      const joined = item.content
        .map((node: any) => (node.type === 'Literal' ? node.value : node.content))
        .join('');
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        try {
          fs.appendFileSync(
            '/tmp/mlld-debug.log',
            JSON.stringify({
              source: 'evaluateArrayItem',
              wrapperType: item.wrapperType,
              joined
            }) + '\n'
          );
        } catch {}
      }
      return joined;
    }

    if (process.env.MLLD_DEBUG_FIX === 'true') {
      console.error('[evaluateArrayItem] interpolating wrapper', {
        wrapperType: item.wrapperType,
        itemTypes: item.content.map((node: any) => node?.type)
      });
    }
    return interpolateAndCollect(item.content, env, collectDescriptor);
  }

  if ('content' in item && Array.isArray(item.content)) {
    return interpolateAndCollect(item.content, env, collectDescriptor);
  }

  if (item.type === 'Text' && 'content' in item) {
    return item.content;
  }

  if (item.type === 'Literal' && 'value' in item) {
    return item.value;
  }

  if ('needsInterpolation' in item && Array.isArray(item.parts)) {
    return interpolateAndCollect(item.parts, env, collectDescriptor);
  }

  if (!item.type && isPlainObject(item)) {
    return evaluatePlainObject(item, env, collectDescriptor, context, sourceLocation);
  }

  switch (item.type) {
    case 'WhenExpression': {
      const { evaluateWhenExpression } = await import('../when-expression');
      const result = await evaluateWhenExpression(item as any, env, context);
      if (collectDescriptor) {
        const descriptor = extractSecurityDescriptor(result.value, {
          recursive: true,
          mergeArrayElements: true
        });
        if (descriptor) {
          collectDescriptor(descriptor);
        }
      }
      return result.value;
    }
    case 'TernaryExpression':
    case 'BinaryExpression':
    case 'UnaryExpression': {
      const { evaluateUnifiedExpression } = await import('../expressions');
      const result = await evaluateUnifiedExpression(item as any, env, context);
      if (collectDescriptor) {
        const descriptor =
          result.descriptor
          ?? extractSecurityDescriptor(result.value, {
            recursive: true,
            mergeArrayElements: true
          });
        if (descriptor) {
          collectDescriptor(descriptor);
        }
      }
      return result.value;
    }
    case 'array':
      return evaluateArrayItems(
        getArrayItems(item),
        env,
        collectDescriptor,
        context,
        sourceLocation
      );

    case 'object':
      return evaluateCollectionObject(
        item,
        env,
        collectDescriptor,
        context,
        sourceLocation
      );

    case 'VariableReference': {
      const variable = env.getVariable(item.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${item.identifier}`);
      }

      if (collectDescriptor && variable.mx) {
        const varDescriptor = varMxToSecurityDescriptor(variable.mx);
        if (varDescriptor) {
          collectDescriptor(varDescriptor);
        }
      }

      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      return resolveVariable(variable, env, ResolutionContext.ArrayElement);
    }

    case 'path': {
      const filePath = await interpolateAndCollect(item.segments || [item], env, collectDescriptor);
      return readFileWithPolicy(env, filePath, sourceLocation);
    }

    case 'SectionExtraction': {
      const sectionName = await interpolateAndCollect(item.section, env, collectDescriptor);
      const sectionFilePath = await interpolateAndCollect(
        item.path.segments || [item.path],
        env,
        collectDescriptor
      );
      const sectionFileContent = await readFileWithPolicy(env, sectionFilePath, sourceLocation);
      const { extractSection } = await import('../show');
      return extractSection(sectionFileContent, sectionName);
    }

    case 'load-content': {
      const { processContentLoader } = await import('../content-loader');
      const loadResult = await processContentLoader(item, env);

      if (isFileLoadedValue(loadResult)) {
        return isStructuredValue(loadResult) ? loadResult : loadResult.content;
      }

      return loadResult;
    }

    default:
      return interpolateAndCollect([item], env, collectDescriptor);
  }
}
