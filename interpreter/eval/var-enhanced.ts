/**
 * Enhanced version of var.ts functions that preserve Variables
 * Part of Phase 3: Making Variables flow through the system
 */

import { Environment } from '@interpreter/env/Environment';
import { interpolate } from '@interpreter/core/interpreter';
import { ResolutionContext, resolveVariable, isVariable } from '@interpreter/utils/variable-resolution';
import type { Variable } from '@core/types/variable/VariableTypes';

/**
 * Enhanced version of evaluateArrayItem that preserves Variables when stored in arrays
 * 
 * This function evaluates items that will be stored in arrays, preserving Variables
 * instead of extracting their values immediately.
 */
export async function evaluateArrayItemEnhanced(item: any, env: Environment): Promise<any> {
  if (!item || typeof item !== 'object') {
    return item;
  }

  // Handle wrapped content first (e.g., quoted strings in arrays)
  if ('content' in item && Array.isArray(item.content) && 'wrapperType' in item) {
    return await interpolate(item.content, env);
  }

  // Also handle the case where we just have content array without wrapperType
  if ('content' in item && Array.isArray(item.content)) {
    return await interpolate(item.content, env);
  }
  
  // Handle raw Text nodes that may appear in objects
  if (item.type === 'Text' && 'content' in item) {
    return item.content;
  }

  // Handle objects without explicit type property (plain objects from parser)
  if (!item.type && typeof item === 'object' && item.constructor === Object) {
    const nestedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(item)) {
      // Skip internal properties
      if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
        continue;
      }
      // Recursively evaluate nested items, preserving Variables in object properties
      nestedObj[key] = await evaluateArrayItemEnhanced(value, env);
    }
    return nestedObj;
  }

  switch (item.type) {
    case 'array':
      // Nested array
      const nestedItems = [];
      for (const nestedItem of (item.items || [])) {
        nestedItems.push(await evaluateArrayItemEnhanced(nestedItem, env));
      }
      return nestedItems;

    case 'object':
      // Object in array
      const processedObject: Record<string, any> = {};
      if (item.properties) {
        for (const [key, propValue] of Object.entries(item.properties)) {
          processedObject[key] = await evaluateArrayItemEnhanced(propValue, env);
        }
      }
      return processedObject;

    case 'VariableReference':
      // Variable reference in array - PRESERVE THE VARIABLE!
      const variable = env.getVariable(item.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${item.identifier}`);
      }
      
      // Use our enhanced resolution that preserves Variables in array context
      return await resolveVariable(variable, env, ResolutionContext.ArrayElement);

    case 'path':
      // Path node in array - read the file content
      const { interpolate: pathInterpolate } = await import('../core/interpreter');
      const filePath = await pathInterpolate(item.segments || [item], env);
      const fileContent = await env.readFile(filePath);
      return fileContent;

    case 'SectionExtraction':
      // Section extraction in array
      const sectionName = await interpolate(item.section, env);
      const sectionFilePath = await interpolate(item.path.segments || [item.path], env);
      const sectionFileContent = await env.readFile(sectionFilePath);
      
      try {
        const { extractSection } = await import('./show');
        const { extractEnhancedSection } = await import('../utils/markdown-enhanced');
        
        return await extractEnhancedSection(sectionFileContent, sectionName, {
          includeSubsections: true,
          includeNested: true,
          includeTitle: true
        });
      } catch (error) {
        // Fallback to basic extraction
        const { extractSection } = await import('./show');
        return extractSection(sectionFileContent, sectionName);
      }

    case 'load-content':
      // Load content node in array - use the content loader
      const { processContentLoader } = await import('./content-loader');
      const loadResult = await processContentLoader(item, env);
      
      // Check if this is a LoadContentResult and return its content
      const { isLoadContentResult } = await import('@core/types/load-content');
      if (isLoadContentResult(loadResult)) {
        return loadResult.content;
      }
      
      return loadResult;

    default:
      // Handle plain objects without type property
      if (!item.type && typeof item === 'object' && item.constructor === Object) {
        const plainObj: Record<string, any> = {};
        for (const [key, value] of Object.entries(item)) {
          // Skip internal properties
          if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
            continue;
          }
          plainObj[key] = await evaluateArrayItemEnhanced(value, env);
        }
        return plainObj;
      }
      
      // Try to interpolate as a node array
      return await interpolate([item], env);
  }
}

/**
 * Helper to create an array Variable that preserves Variable elements
 * 
 * This is an enhanced version that keeps Variables in the array instead of extracting values
 */
export async function createArrayVariableEnhanced(
  identifier: string,
  arrayNode: any,
  env: Environment,
  source: any,
  metadata?: any
): Promise<Variable> {
  const { createArrayVariable } = await import('@core/types/variable/VariableFactories');
  
  // Evaluate array items, preserving Variables
  const evaluatedItems = [];
  for (const item of (arrayNode.items || [])) {
    const evaluated = await evaluateArrayItemEnhanced(item, env);
    evaluatedItems.push(evaluated);
  }
  
  // Create the array Variable
  const isComplex = evaluatedItems.some(item => 
    isVariable(item) || 
    (typeof item === 'object' && item !== null)
  );
  
  return createArrayVariable(
    identifier,
    evaluatedItems,
    isComplex,
    source,
    metadata
  );
}