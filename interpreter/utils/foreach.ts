import type { Environment } from '../env/Environment';
import { evaluateForeachCommand, evaluateForeachSection } from '../eval/foreach';
import { interpolate } from '../core/interpreter';
import type { SecurityDescriptor } from '@core/types/security';
import { isStructuredValue } from './structured-value';

/**
 * Configuration options for foreach output formatting
 */
export interface ForeachOptions {
  /** Separator between foreach results (default: "\n==========\n") */
  separator?: string;
  /** Template for formatting each result */
  template?: string;
}

/**
 * Default options for foreach text formatting
 */
export const DEFAULT_FOREACH_OPTIONS: ForeachOptions = {
  separator: '\n\n---\n\n'
};

/**
 * Evaluate a foreach expression and format the results as text
 * 
 * @param foreachExpression - The foreach expression from the AST
 * @param env - The evaluation environment
 * @param options - Formatting options
 * @returns Formatted text string
 */
export async function evaluateForeachAsText(
  foreachExpression: any,
  env: Environment,
  options: ForeachOptions = {}
): Promise<string> {
  // Check if it's a section expression or command expression
  let results: any;
  
  if (foreachExpression.type === 'foreach-section' || 
      (foreachExpression.value && foreachExpression.value.type === 'foreach-section')) {
    // Handle foreach section expression
    results = await evaluateForeachSection(foreachExpression, env);
  } else {
    // Handle foreach command expression
    results = await evaluateForeachCommand(foreachExpression, env);
  }
  
  // If no results, return empty string
  const normalizedResults = Array.isArray(results)
    ? results
    : isStructuredValue(results) && Array.isArray(results.data)
      ? results.data
      : [results];

  if (normalizedResults.length === 0) {
    return '';
  }
  
  // Apply default options
  const finalOptions = { ...DEFAULT_FOREACH_OPTIONS, ...options };
  
  // Convert results to strings
  const stringResults = normalizedResults.map(result => {
    const normalized = normalizeForeachResultValue(result);
    if (typeof normalized === 'string') {
      return normalized;
    }
    if (typeof normalized === 'object') {
      return JSON.stringify(normalized, null, 2);
    }
    return String(normalized);
  });
  
  // Apply template if provided
  if (finalOptions.template) {
    const templatedResults = await Promise.all(
      stringResults.map(async (result, index) => {
        // Create a child environment with special variables
        const childEnv = env.createChild();
        
        // Import variable creation functions
        const { createSimpleTextVariable, createObjectVariable } = await import('@core/types/variable');
        const { VariableSource } = await import('@core/types/variable');
        
        // Create default source for template variables
        const templateSource: VariableSource = {
          directive: 'var',
          syntax: 'quoted',
          hasInterpolation: false,
          isMultiLine: false
        };
        
        // Add template variables using new Variable types
        childEnv.setVariable('result', createSimpleTextVariable('result', result, templateSource, { mx: templateSource }));
        childEnv.setVariable('index', createObjectVariable('index', index, false, templateSource, { mx: templateSource }));
        childEnv.setVariable('item', createSimpleTextVariable('item', result, templateSource, { mx: templateSource }));
        
        // Parse and interpolate the template
        const templateNodes = parseTemplateString(finalOptions.template!);
        const descriptors: SecurityDescriptor[] = [];
        const interpolated = await interpolate(templateNodes, childEnv, undefined, {
          collectSecurityDescriptor: descriptor => {
            if (descriptor) {
              descriptors.push(descriptor);
            }
          }
        });
        if (descriptors.length > 0) {
          const merged =
            descriptors.length === 1
              ? descriptors[0]
              : childEnv.mergeSecurityDescriptors(...descriptors);
          childEnv.recordSecurityDescriptor(merged);
        }
        return interpolated;
      })
    );
    
    return templatedResults.join(finalOptions.separator);
  }
  
  // No template, just join with separator
  return stringResults.join(finalOptions.separator);
}

/**
 * Parse a template string into interpolation nodes
 * This is a simple parser for templates like "Q: {{item}}\nA: {{result}}"
 */
function parseTemplateString(template: string): any[] {
  const nodes = [];
  let current = '';
  let i = 0;
  
  while (i < template.length) {
    if (template[i] === '{' && template[i + 1] === '{') {
      // Found start of variable reference
      if (current) {
        nodes.push({
          type: 'Text',
          nodeId: '',
          content: current,
          location: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } }
        });
        current = '';
      }
      
      // Find the end of the variable reference
      i += 2; // Skip {{
      let varName = '';
      while (i < template.length && !(template[i] === '}' && template[i + 1] === '}')) {
        varName += template[i];
        i++;
      }
      
      if (i < template.length) {
        // Add variable reference node
        nodes.push({
          type: 'VariableReference',
          nodeId: '',
          valueType: 'varIdentifier',
          identifier: varName.trim(),
          location: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } }
        });
        i += 2; // Skip }}
      }
    } else {
      current += template[i];
      i++;
    }
  }
  
  // Add any remaining text
  if (current) {
    nodes.push({
      type: 'Text',
      nodeId: '',
      content: current,
      location: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } }
    });
  }
  
  return nodes;
}

/**
 * Parse foreach options from a with clause
 * 
 * @param withClause - The with clause from the AST
 * @returns Parsed options object
 */
export function parseForeachOptions(withClause: any): ForeachOptions {
  const options: ForeachOptions = {};
  
  if (!withClause) {
    return options;
  }
  
  // Parse separator option
  if (withClause.separator !== undefined) {
    if (typeof withClause.separator === 'string') {
      options.separator = processEscapeSequences(withClause.separator);
    } else if (withClause.separator && withClause.separator.type === 'Text') {
      options.separator = processEscapeSequences(withClause.separator.content);
    }
  }
  
  // Parse template option
  if (withClause.template !== undefined) {
    if (typeof withClause.template === 'string') {
      options.template = processEscapeSequences(withClause.template);
    } else if (withClause.template && withClause.template.type === 'Text') {
      options.template = processEscapeSequences(withClause.template.content);
    }
  }
  
  return options;
}

function normalizeForeachResultValue(value: unknown): unknown {
  if (isStructuredValue(value)) {
    return normalizeForeachResultValue(value.data);
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeForeachResultValue(item));
  }
  if (value && typeof value === 'object') {
    if (isStructuredValueLike(value)) {
      return normalizeForeachResultValue((value as any).data);
    }
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      normalizeForeachResultValue(entryValue)
    ]);
    return Object.fromEntries(entries);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch {
      return value;
    }
  }
  return value;
}

function isStructuredValueLike(value: unknown): value is { data?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'data' in (value as Record<string, unknown>) && 'text' in (value as Record<string, unknown>);
}

/**
 * Process escape sequences in a string
 * Converts \n to newline, \t to tab, etc.
 */
function processEscapeSequences(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, '\'');
}
