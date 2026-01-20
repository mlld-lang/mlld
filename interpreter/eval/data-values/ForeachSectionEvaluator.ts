import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';
import { createObjectVariable, createArrayVariable } from '@core/types/variable';
import { interpolate } from '../../core/interpreter';
import type { SecurityDescriptor } from '@core/types/security';
import { InterpolationContext } from '../../core/interpolation-context';
import { MlldSecurityError } from '@core/errors';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';

async function interpolateAndRecord(
  nodes: any,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
}

/**
 * Handles evaluation of foreach section expressions.
 * 
 * This evaluator processes foreach expressions that iterate over arrays
 * and extract sections from files using llmxml integration.
 * 
 * Features:
 * - File operations and section extraction
 * - Complex path resolution and variable binding
 * - llmxml integration with fallback extraction
 * - Template application and header replacement
 */
export class ForeachSectionEvaluator {
  constructor(private evaluateDataValue: (value: DataValue, env: Environment) => Promise<any>) {}

  /**
   * Checks if this evaluator can handle the given data value
   */
  canHandle(value: DataValue): boolean {
    // Handle foreach section expressions
    if (typeof value === 'object' && value !== null && value.type === 'foreachSection') {
      return true;
    }
    
    // Handle objects with type 'foreach-section' (from grammar output)
    if (value && typeof value === 'object' && value.type === 'foreach-section') {
      return true;
    }
    
    return false;
  }

  /**
   * Evaluates a foreach section expression
   */
  async evaluate(value: DataValue, env: Environment): Promise<any> {
    if (this.canHandle(value)) {
      return await this.evaluateForeachSection(value, env);
    }
    
    throw new Error(`ForeachSectionEvaluator cannot handle value type: ${typeof value}`);
  }

  /**
   * Evaluates a ForeachSectionExpression - iterating over arrays with section extraction
   * Usage: foreach <@array.field # section> as ::template::
   */
  async evaluateForeachSection(
    foreachExpr: any,
    env: Environment
  ): Promise<any[]> {
    const { alligator, arrayVariable, pathField, path, section, template } = foreachExpr.value || foreachExpr;
    
    // Handle the new alligator-based structure
    let actualArrayVariable = arrayVariable;
    let actualPathField = pathField;
    let actualPath = path;
    
    if (alligator && alligator.type === 'load-content') {
      // Extract from new alligator structure
      actualPath = alligator.source?.segments;
      
      // Look for a variable reference in the path segments
      if (actualPath) {
        for (const part of actualPath) {
          if (part.type === 'VariableReference' && part.fields && part.fields.length > 0) {
            actualArrayVariable = part.identifier;
            actualPathField = part.fields[0].value || part.fields[0].field;
            break;
          }
        }
      }
    } else if (!actualArrayVariable && path) {
      // Legacy support - look for a variable reference in the path
      for (const part of path) {
        if (part.type === 'VariableReference' && part.fields && part.fields.length > 0) {
          actualArrayVariable = part.identifier;
          actualPathField = part.fields[0].value || part.fields[0].field;
          break;
        }
      }
    }
    
    if (!actualArrayVariable) {
      throw new Error('Cannot determine array variable from foreach section expression');
    }
    
    // 1. Resolve the source array variable
    const arrayVar = env.getVariable(actualArrayVariable);
    if (!arrayVar) {
      throw new Error(`Array variable not found: ${actualArrayVariable}`);
    }
    
    // 2. Evaluate the array to get items
    const arrayValue = await this.evaluateDataValue(arrayVar.value, env);
    if (!Array.isArray(arrayValue)) {
      throw new Error(`Variable '${actualArrayVariable}' must be an array for foreach section extraction, got ${typeof arrayValue}`);
    }
    
    if (arrayValue.length === 0) {
      return []; // Return empty array for empty input
    }
    
    // 3. Process each item in the array
    const results: any[] = [];
    for (let i = 0; i < arrayValue.length; i++) {
      const item = arrayValue[i];
      
      try {
        // 4. Create child environment with item bound to array variable name
        const childEnv = env.createChild();
        const itemVar = Array.isArray(item) ?
          createArrayVariable(actualArrayVariable, item, {
            directive: 'var',
            syntax: 'array',
            hasInterpolation: false,
            isMultiLine: false
          }, {
            internal: {
              isParameter: true,
              isFullyEvaluated: true
            }
          }) :
          createObjectVariable(actualArrayVariable, item, {
            directive: 'var',
            syntax: 'object',
            hasInterpolation: false,
            isMultiLine: false
          }, {
            internal: {
              isParameter: true,
              isFullyEvaluated: true
            }
          });
        childEnv.setParameterVariable(actualArrayVariable, itemVar);
        
        // 5. Get the path value
        let pathValue: string;
        
        if (actualPath) {
          // For flexible path expressions, evaluate the entire path
          pathValue = await interpolateAndRecord(actualPath, childEnv);
          // Trim any trailing whitespace from path
          pathValue = pathValue.trim();
        } else if (actualPathField) {
          // For simple case, get path from item field
          if (!item || typeof item !== 'object') {
            throw new Error(`Array item ${i + 1} must be an object with '${actualPathField}' field, got ${typeof item}`);
          }
          
          pathValue = item[actualPathField];
          if (typeof pathValue !== 'string') {
            throw new Error(`Path field '${actualPathField}' in array item ${i + 1} must be a string, got ${typeof pathValue}`);
          }
        } else {
          throw new Error('No path specified for foreach section extraction');
        }
        
        // 6. Resolve section name (can be literal or variable)
        let sectionName: string;
        
        // Get section from alligator or legacy structure
        let sectionToProcess = section;
        if (alligator && alligator.type === 'load-content' && alligator.options?.section) {
          sectionToProcess = alligator.options.section.identifier;
        }
        
        // Handle section as an array of nodes
        const sectionNodes = Array.isArray(sectionToProcess) ? sectionToProcess : [sectionToProcess];
        
        if (sectionNodes.length === 1 && sectionNodes[0].type === 'Text') {
          sectionName = sectionNodes[0].content;
        } else if (sectionNodes.length === 1 && sectionNodes[0].type === 'VariableReference') {
          // Evaluate section variable in child environment (with current item bound)
          const sectionValue = await interpolateAndRecord(sectionNodes, childEnv);
          if (typeof sectionValue !== 'string') {
            throw new Error(`Section variable must resolve to a string, got ${typeof sectionValue}`);
          }
          sectionName = sectionValue;
        } else if (sectionNodes.length > 0) {
          // Multiple nodes - interpolate them all
          const sectionValue = await interpolateAndRecord(sectionNodes, childEnv);
          if (typeof sectionValue !== 'string') {
            throw new Error(`Section must resolve to a string, got ${typeof sectionValue}`);
          }
          sectionName = sectionValue;
        } else if (typeof sectionToProcess === 'string') {
          // Direct string section name
          sectionName = sectionToProcess;
        } else if (sectionToProcess && typeof sectionToProcess === 'object' && sectionToProcess.content) {
          // Object with content property
          sectionName = sectionToProcess.content;
        } else {
          throw new Error('Section name is required for foreach section extraction');
        }
        
        // 7. Read file and extract section from file
        // Resolve the path relative to the current file
        const fileContent = await readFileWithPolicy(env, pathValue);
        
        // Extract the section using llmxml
        const { llmxmlInstance } = await import('../../utils/llmxml-instance');
        let sectionContent: string;
        try {
          // getSection expects just the title without the # prefix
          const titleWithoutHash = sectionName.replace(/^#+\s*/, '');
          sectionContent = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
            includeNested: true
          });
          // Trim trailing whitespace
          sectionContent = sectionContent.trimEnd();
        } catch (error) {
          // Fallback to basic extraction if llmxml fails
          sectionContent = this.extractSectionBasic(fileContent, sectionName);
        }
        
        // 8. Apply template with current item context
        const templateResult = await interpolateAndRecord(template.values.content, childEnv);
        
        // 9. Replace the first line (header) of section content with template result
        // This mimics the behavior of the 'as' clause in @add directive
        const lines = sectionContent.split('\n');
        if (lines.length > 0 && lines[0].match(/^#+\s/)) {
          // Replace the header line with the template result
          lines[0] = templateResult;
          const result = lines.join('\n');
          results.push(result);
        } else {
          // If no header found, prepend the template result
          const result = templateResult + '\n' + sectionContent;
          results.push(result);
        }
        
      } catch (error) {
        if (error instanceof MlldSecurityError) {
          throw error;
        }
        // Include iteration context in error message
        const itemInfo = typeof item === 'object' && item !== null 
          ? Object.keys(item).slice(0, 3).map(k => `${k}: ${JSON.stringify(item[k])}`).join(', ')
          : String(item);
        
        throw new Error(
          `Error in foreach section iteration ${i + 1} (${itemInfo}): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    
    return results;
  }

  /**
   * Extract a section from markdown content.
   * Basic fallback implementation when llmxml fails.
   */
  private extractSectionBasic(content: string, sectionName: string): string {
    const lines = content.split('\n');
    const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
    
    let inSection = false;
    let sectionLevel = 0;
    const sectionLines: string[] = [];
    
    for (const line of lines) {
      // Check if this line starts our section
      if (!inSection && sectionRegex.test(line)) {
        inSection = true;
        sectionLevel = line.match(/^#+/)?.[0].length || 0;
        continue; // Skip the header itself
      }
      
      // If we're in the section
      if (inSection) {
        // Check if we've hit another header at the same or higher level
        const headerMatch = line.match(/^(#+)\s+/);
        if (headerMatch && headerMatch[1].length <= sectionLevel) {
          // We've left the section
          break;
        }
        
        sectionLines.push(line);
      }
    }
    
    return sectionLines.join('\n').trim();
  }
}
