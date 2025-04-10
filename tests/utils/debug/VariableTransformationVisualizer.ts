/**
 * Variable Transformation Visualizer
 * 
 * This utility helps visualize the variable resolution and transformation process,
 * making it easier to debug issues related to object property access and text formatting.
 */

import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IOutputService } from '@services/pipeline/OutputService/IOutputService.js';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import { Text, Root, DataVar, TextVar } from '@core/types.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import { injectable, inject } from 'tsyringe';
import { IStateVisualizationService } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService.js';
import fs from 'fs';
import path from 'path';

export interface TransformationTrace {
  // Input information
  input: string;
  variableReferences: string[];
  
  // Resolution process
  resolvedValues: Record<string, any>;
  resolutionSteps: Array<{
    reference: string;
    path: string[];
    value: any;
    type: string;
  }>;
  
  // Output information
  output: string;
  transformationMode: boolean;
  
  // Debug information
  warnings: string[];
  errors: string[];
}

@injectable()
export class VariableTransformationVisualizer {
  constructor(
    @inject('StateFactory') private stateFactory: StateFactory,
    @inject('IOutputService') private outputService: IOutputService,
    @inject('IStateVisualizationService') private stateVisualizer: IStateVisualizationService
  ) {}

  /**
   * Creates a trace of the variable resolution and transformation process
   */
  async traceVariableTransformation(
    input: string,
    variables: Record<string, any>,
    enableTransformation: boolean = false
  ): Promise<TransformationTrace> {
    const trace: TransformationTrace = {
      input,
      variableReferences: this.extractVariableReferences(input),
      resolvedValues: {},
      resolutionSteps: [],
      output: '',
      transformationMode: enableTransformation,
      warnings: [],
      errors: []
    };
    
    // Create state with variables
    const state = this.stateFactory.createState();
    
    // Set up variables
    for (const [key, value] of Object.entries(variables)) {
      if (typeof value === 'object') {
        state.setDataVar(key, value);
      } else {
        state.setTextVar(key, String(value));
      }
    }
    
    // Enable transformation if requested
    if (enableTransformation) {
      state.enableTransformation();
    }
    
    // Trace the resolution of each variable reference
    for (const reference of trace.variableReferences) {
      try {
        // Split reference into variable name and field path
        const parts = reference.split('.');
        const variableName = parts[0];
        const fieldPath = parts.slice(1);
        
        // Get variable value
        let value;
        value = state.getTextVar(variableName);
        
        if (value === undefined) {
          value = state.getDataVar(variableName);
        }
        
        trace.resolvedValues[variableName] = value;
        
        // Trace field access if this is a property access
        if (fieldPath.length > 0 && value !== undefined) {
          let currentValue = value;
          const currentPath = [variableName];
          
          for (const field of fieldPath) {
            currentPath.push(field);
            
            // Access the field
            if (Array.isArray(currentValue) && /^\d+$/.test(field)) {
              const index = parseInt(field, 10);
              currentValue = currentValue[index];
            } else if (currentValue && typeof currentValue === 'object') {
              currentValue = currentValue[field];
            } else {
              currentValue = undefined;
              trace.warnings.push(`Cannot access field '${field}' on value: ${JSON.stringify(currentValue)}`);
              break;
            }
            
            trace.resolutionSteps.push({
              reference,
              path: [...currentPath],
              value: currentValue,
              type: this.getValueType(currentValue)
            });
          }
          
          trace.resolvedValues[reference] = currentValue;
        }
      } catch (error) {
        trace.errors.push(`Error resolving reference '${reference}': ${error}`);
      }
    }
    
    // Create Text node for transformation
    const textNode: Text = {
      type: 'Text',
      value: input
    };
    
    // Transform the text
    try {
      trace.output = await this.outputService.nodeToMarkdown(textNode, state);
    } catch (error) {
      trace.errors.push(`Error in transformation: ${error}`);
    }
    
    return trace;
  }
  
  /**
   * Visualizes the transformation trace and saves it to a file
   */
  visualizeTransformationTrace(trace: TransformationTrace, filePath: string): void {
    let output = '# Variable Transformation Visualization\n\n';
    
    // Input
    output += '## Input\n\n```\n' + trace.input + '\n```\n\n';
    
    // Transformation mode
    output += `Transformation Mode: **${trace.transformationMode ? 'Enabled' : 'Disabled'}**\n\n`;
    
    // Variable references
    output += '## Variable References Detected\n\n';
    if (trace.variableReferences.length === 0) {
      output += 'No variable references detected.\n\n';
    } else {
      output += '| Reference | Resolved Value | Type |\n';
      output += '|-----------|----------------|------|\n';
      
      for (const reference of trace.variableReferences) {
        const value = trace.resolvedValues[reference];
        const valueStr = this.formatValue(value);
        const type = this.getValueType(value);
        
        output += `| \`${reference}\` | ${valueStr} | ${type} |\n`;
      }
      
      output += '\n';
    }
    
    // Resolution steps
    output += '## Resolution Steps\n\n';
    if (trace.resolutionSteps.length === 0) {
      output += 'No property access resolution steps performed.\n\n';
    } else {
      output += '| Reference | Path | Value | Type |\n';
      output += '|-----------|------|-------|------|\n';
      
      for (const step of trace.resolutionSteps) {
        const valueStr = this.formatValue(step.value);
        
        output += `| \`${step.reference}\` | \`${step.path.join('.')}\` | ${valueStr} | ${step.type} |\n`;
      }
      
      output += '\n';
    }
    
    // Output
    output += '## Output\n\n```\n' + trace.output + '\n```\n\n';
    
    // Output analysis
    output += '## Output Analysis\n\n';
    
    // Find all variable references in the output
    const remainingRefs = this.extractVariableReferences(trace.output);
    if (remainingRefs.length > 0) {
      output += '### Unresolved Variable References\n\n';
      output += 'The following variable references were not resolved in the output:\n\n';
      output += remainingRefs.map(ref => `- \`${ref}\``).join('\n') + '\n\n';
    }
    
    // Warnings and Errors
    if (trace.warnings.length > 0) {
      output += '## Warnings\n\n';
      output += trace.warnings.map(w => `- ${w}`).join('\n') + '\n\n';
    }
    
    if (trace.errors.length > 0) {
      output += '## Errors\n\n';
      output += trace.errors.map(e => `- ${e}`).join('\n') + '\n\n';
    }
    
    // Write to file
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    
    fs.writeFileSync(filePath, output, 'utf8');
  }
  
  /**
   * Extracts variable references from text content
   */
  private extractVariableReferences(text: string): string[] {
    const regex = /\{\{([^{}]+)\}\}/g;
    const matches = Array.from(text.matchAll(regex));
    const references = matches.map(match => match[1].trim());
    
    // Remove duplicates
    return [...new Set(references)];
  }
  
  /**
   * Gets the type of a value for visualization
   */
  private getValueType(value: any): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (Array.isArray(value)) return `Array[${value.length}]`;
    return typeof value;
  }
  
  /**
   * Formats a value for display in the visualization
   */
  private formatValue(value: any): string {
    if (value === undefined) return '`undefined`';
    if (value === null) return '`null`';
    
    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value);
        if (json.length > 50) {
          return '`' + json.substring(0, 47) + '...`';
        }
        return '`' + json + '`';
      } catch (error) {
        return '`[Complex Object]`';
      }
    }
    
    if (typeof value === 'string') {
      if (value.length > 50) {
        return `"${value.substring(0, 47)}..."`;
      }
      return `"${value}"`;
    }
    
    return `\`${String(value)}\``;
  }
}

/**
 * Creates a visualization of the variable transformation process
 */
export async function visualizeVariableTransformation(
  input: string,
  variables: Record<string, any>,
  filePath: string,
  enableTransformation: boolean = false
): Promise<void> {
  const context = await import('@tests/utils/di').then(m => m.TestContextDI.createIsolated());
  
  try {
    // Register the visualizer if not already registered
    if (!context.container.isRegistered(VariableTransformationVisualizer)) {
      context.container.register(VariableTransformationVisualizer, VariableTransformationVisualizer);
    }
    
    const visualizer = await context.resolve<VariableTransformationVisualizer>(VariableTransformationVisualizer);
    
    // Create and visualize the trace
    const trace = await visualizer.traceVariableTransformation(input, variables, enableTransformation);
    visualizer.visualizeTransformationTrace(trace, filePath);
  } finally {
    // Clean up
    await context.cleanup();
  }
}