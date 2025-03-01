import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, TextNode, DirectiveNode } from 'meld-spec';
import { resolutionLogger as logger } from '@core/utils/logger.js';

/**
 * Handles resolution of variable references ({{var}})
 * Previously used ${var} for text and #{var} for data, now unified as {{var}}
 */
export class VariableReferenceResolver {
  private readonly MAX_RESOLUTION_DEPTH = 10;
  private readonly MAX_ITERATIONS = 100;

  constructor(
    private readonly stateService: IStateService,
    private readonly resolutionService?: IResolutionService,
    private readonly parserService?: IParserService
  ) {}

  /**
   * Resolves all variable references in the given text
   * @param text Text containing variable references like {{varName}}
   * @param context Resolution context
   * @returns Resolved text with all variables replaced with their values
   */
  async resolve(text: string, context: ResolutionContext): Promise<string> {
    // Ensure context state is properly accessed
    const stateTextVars = this.getSafeTextVars(context);
    const stateDataVars = this.getSafeDataVars(context);
    
    console.log('*** VariableReferenceResolver.resolve: ', {
      text,
      stateTextVars,
      stateDataVars
    });

    // Skip the resolution if there are no variable references
    if (!text.includes('{{')) {
      console.log('*** No variables detected in text, returning original');
      return text;
    }

    try {
      console.log('*** Attempting to parse text for AST-based resolution');
      return await this.resolveWithAst(text, context);
    } catch (error) {
      console.log('*** Error during AST parsing:', error);
      console.log('*** Falling back to simple variable resolution');
      return this.resolveSimpleVariables(text, context);
    }
  }
  
  /**
   * Resolves a list of nodes, handling variable references
   * @param nodes The nodes to resolve
   * @param context The resolution context
   * @returns The resolved content
   */
  async resolveNodes(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    let result = '';
    
    // Track the resolution path to detect circular references
    const resolutionPath: string[] = [];
    
    for (const node of nodes) {
      console.log('*** Processing node:', {
        type: node.type,
        details: JSON.stringify(node, null, 2)
      });
      
      if (node.type === 'Text') {
        const textNode = node as TextNode;
        // If the text contains variable references, resolve them
        if (textNode.content.includes('{{')) {
          const resolved = await this.resolveText(textNode.content, context, resolutionPath);
          console.log('*** Resolved text node content:', {
            original: textNode.content,
            resolved
          });
          result += resolved;
        } else {
          result += textNode.content;
        }
      } else if (node.type === 'TextVar' || node.type === 'DataVar') {
        // Handle text/data variable nodes (new meld-ast format)
        const varNode = node as any;
        
        // Extract variable reference - different formats depending on node type
        let varRef = varNode.reference || varNode.variable || varNode.identifier;
        
        // For DataVar nodes, handle field access
        if (node.type === 'DataVar' && varNode.fields && varNode.fields.length > 0) {
          // Build the field access path, handling both identifier and index field types
          const fieldParts = varNode.fields.map((field: any) => {
            // Check if this is an index field (numeric array index)
            if (field.type === 'index') {
              // For index type, convert numeric value to string
              return String(field.value);
            } else {
              // For identifier type, use the value directly
              return field.value;
            }
          });
          
          // Join with dots to create the field reference path
          varRef = `${varNode.identifier}.${fieldParts.join('.')}`;
          
          console.log('*** Processing DataVar with fields:', {
            identifier: varNode.identifier,
            fields: varNode.fields,
            processedFields: fieldParts,
            varRef
          });
        }
        
        // Resolve the variable reference
        try {
          const resolved = await this.resolveVariable(varRef, context, resolutionPath);
          console.log('*** Resolved variable reference:', {
            varRef,
            resolved
          });
          
          // If we're in transformation mode, we need to replace the variable node with its resolved value
          if (context.state?.isTransformationEnabled()) {
            // For DataVar nodes, we might need to stringify the result if it's not a string
            if (node.type === 'DataVar' && typeof resolved !== 'string') {
              // For arrays and objects, we want to stringify them nicely
              if (Array.isArray(resolved) || (typeof resolved === 'object' && resolved !== null)) {
                try {
                  // For simple values within arrays/objects, we want to extract them directly
                  // This handles cases like items.0 or users.0.name
                  if (typeof resolved === 'string' || 
                      typeof resolved === 'number' || 
                      typeof resolved === 'boolean') {
                    result += String(resolved);
                  } else {
                    // Only stringify if it's a complex object
                    result += String(resolved);
                  }
                } catch (e) {
                  // If stringification fails, use the raw value
                  result += String(resolved);
                }
              } else {
                // For primitive values, just convert to string
                result += String(resolved);
              }
            } else {
              // For TextVar nodes or string DataVar values, use the resolved value directly
              result += resolved;
            }
          } else {
            // If transformation is not enabled, keep the variable reference
            result += `{{${varRef}}}`;
          }
        } catch (error) {
          console.error('*** Failed to resolve variable reference:', {
            varRef,
            error: error instanceof Error ? error.message : String(error)
          });
          
          // If we're in strict mode, rethrow the error
          if (context.strict !== false) {
            throw error;
          }
          
          // In permissive mode, keep the variable reference
          result += `{{${varRef}}}`;
        }
      } else if (node.type === 'PathVar') {
        // Handle path variable nodes
        const pathVarNode = node as any;
        let pathValue: string;
        
        // For structured path variables with fields
        if (pathVarNode.value && typeof pathVarNode.value === 'object') {
          const structPath = pathVarNode.value;
          
          try {
            // Let the ResolutionService handle structured path resolution
            const resolvedPath = await this.resolutionService?.resolveInContext(structPath, context);
            pathValue = resolvedPath || structPath.raw || '';
          } catch (error) {
            console.error('*** Failed to resolve structured path:', {
              raw: structPath.raw,
              error: (error as Error).message
            });
            
            // For recoverable errors, use the raw path
            pathValue = structPath.raw || '';
          }
        } else {
          // For simple path variables
          const identifier = pathVarNode.identifier || pathVarNode.name;
          
          // Let the ResolutionService handle path variable resolution
          try {
            // Create a simple path structure for resolution
            const pathStr = `$${identifier}`;
            
            // Parse this through the parser to get a structured path
            const nodes = await this.parserService?.parse(pathStr);
            const parsedPathNode = nodes?.find(n => n.type === 'PathVar');
            
            if (parsedPathNode && (parsedPathNode as any).value) {
              // Get the structured path from the parsed node
              const structPath = (parsedPathNode as any).value;
              
              // Let ResolutionService resolve it
              const resolvedPath = await this.resolutionService?.resolveInContext(structPath, context);
              pathValue = resolvedPath || structPath.raw || '';
            } else {
              // Fallback to direct state access if parsing fails
              if (identifier === 'HOMEPATH' || identifier === '~') {
                pathValue = context.state?.getPathVar('HOMEPATH') || 
                          this.stateService.getPathVar('HOMEPATH') || '';
              } else if (identifier === 'PROJECTPATH' || identifier === '.') {
                pathValue = context.state?.getPathVar('PROJECTPATH') || 
                          this.stateService.getPathVar('PROJECTPATH') || '';
              } else {
                // For regular path variables
                pathValue = context.state?.getPathVar(identifier) || 
                          this.stateService.getPathVar(identifier) || '';
                  
                if (pathValue === undefined) {
                  throw new MeldResolutionError(
                    `Undefined path variable: ${identifier}`,
                    {
                      code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                      details: { variableName: identifier, variableType: 'path' },
                      severity: ErrorSeverity.Recoverable
                    }
                  );
                }
              }
            }
          } catch (error) {
            console.error('*** Failed to resolve path variable:', {
              identifier,
              error: (error as Error).message
            });
            
            // For recoverable errors, use the variable reference
            if (context.strict !== false) {
              throw error;
            }
            
            // In permissive mode, keep the path reference
            pathValue = `$${identifier}`;
          }
        }
        
        // If we're in transformation mode, replace the path variable with its resolved value
        if (context.state?.isTransformationEnabled()) {
          result += pathValue;
        } else {
          // If transformation is not enabled, keep the path reference
          result += `$${pathVarNode.identifier || pathVarNode.name}`;
        }
      } else {
        // For other node types, just add them to the result
        // This is a fallback for node types we don't explicitly handle
        console.warn('*** Unhandled node type:', node.type);
        
        // Try to extract text content if possible
        if ('content' in node) {
          result += (node as any).content;
        } else if ('text' in node) {
          result += (node as any).text;
        } else if ('value' in node && typeof (node as any).value === 'string') {
          result += (node as any).value;
        } else {
          // If we can't extract text, just add a placeholder
          result += `[${node.type}]`;
        }
      }
    }
    
    return result;
  }
  
  /**
   * Extract the actual value from a node, not just its string representation
   */
  private getNodeValue(node: MeldNode, context: ResolutionContext): string {
    // Different handling based on node type
    switch (node.type) {
      case 'Text':
        return (node as TextNode).content;
        
      case 'TextVar':
        const textVarNode = node as any;
        const textVar = textVarNode.identifier;
        const value = context.state?.getTextVar(textVar) || this.stateService.getTextVar(textVar);
        return value !== undefined ? String(value) : '';
        
      case 'DataVar':
        const dataVarNode = node as any;
        const dataVar = dataVarNode.identifier;
        const dataValue = context.state?.getDataVar(dataVar) || this.stateService.getDataVar(dataVar);
        // For data variables, return JSON string for objects
        return dataValue !== undefined 
          ? (typeof dataValue === 'object' ? JSON.stringify(dataValue) : String(dataValue))
          : '';
          
      case 'PathVar':
        const pathVarNode = node as any;
        const pathVar = pathVarNode.identifier;
        const stateToUse = context.state || this.stateService;
        
        // Handle special path variables
        if (pathVar === 'PROJECTPATH' || pathVar === '.') {
          return stateToUse.getPathVar('PROJECTPATH') || '';
        } else if (pathVar === 'HOMEPATH' || pathVar === '~') {
          return stateToUse.getPathVar('HOMEPATH') || '';
        } 
        // Regular path variable
        return stateToUse.getPathVar(pathVar) || '';
        
      case 'CodeFence':
        const codeFence = node as any;
        return codeFence.content || '';
        
      default:
        // For unsupported node types, return empty string
        return '';
    }
  }
  
  /**
   * Convert a node to string representation
   * @deprecated Use getNodeValue instead for actual variable values
   */
  private nodeToString(node: MeldNode): string {
    switch (node.type) {
      case 'Text':
        return (node as TextNode).content;
      case 'Directive':
        const directive = node as DirectiveNode;
        return `@${directive.directive.kind} ${directive.directive.identifier || ''} = "${directive.directive.value || ''}"`;
      default:
        return '';
    }
  }
  
  /**
   * Resolve text with variable references
   */
  private async resolveText(
    text: string, 
    context: ResolutionContext, 
    resolutionPath: string[] = []
  ): Promise<string> {
    // Debug the incoming context state
    console.log('*** resolveText context state:', {
      stateExists: !!context.state,
      stateMethods: context.state ? Object.keys(context.state) : 'undefined',
      text
    });
    
    if (!text) {
      return '';
    }
    
    let result = text;
    
    try {
      // Parse the text to find variable nodes
      const nodes = await this.parserService?.parse(text);
      const hasVariables = nodes?.some(node => 
        node.type === 'TextVar' || 
        node.type === 'DataVar' || 
        node.type === 'PathVar'
      );
      
      if (!hasVariables) {
        return result;
      }
      
      // Process each variable node
      return await this.resolveWithAst(result, context);
    } catch (error) {
      // If parsing fails, return the original text
      console.warn('Failed to parse text for variable resolution:', error);
      return result;
    }
  }
  
  /**
   * Resolves a variable reference to its value
   * @param varRef The variable reference (e.g., "user" or "user.name")
   * @param context The resolution context
   * @returns The resolved value as a string
   */
  private async resolveVariable(varRef: string, context: ResolutionContext, resolutionPath: string[] = []): Promise<string> {
    try {
      // Split by dot for field access
      const parts = varRef.split('.');
      const baseVar = parts[0];
      
      try {
        // Try to get variable from state
        let value = await this.getVariable(baseVar, context);
        
        // If the variable is undefined and we're in strict mode, throw an error
        if (value === undefined) {
          const errorDetails = {
            code: ResolutionErrorCode.UNDEFINED_VARIABLE,
            details: { 
              variableName: baseVar,
              variableType: parts.length > 1 ? 'data' as const : 'text' as const
            },
            severity: ErrorSeverity.Recoverable
          };
          
          // In strict mode, throw the error
          if (context.strict !== false) {
            throw new MeldResolutionError(
              `Undefined variable: ${baseVar}`,
              errorDetails
            );
          }
          
          // In permissive mode, return the variable reference as is
          return `{{${varRef}}}`;
        }
        
        // Handle field access (e.g., user.name)
        if (parts.length > 1 && typeof value === 'object' && value !== null) {
          try {
            // Resolve field access
            value = this.resolveFieldAccess(value, parts.slice(1), context);
          } catch (error) {
            logger.warn(`Error accessing field ${parts.slice(1).join('.')} of ${baseVar}`, {
              error: error instanceof Error ? error.message : String(error)
            });
            
            // In strict mode, rethrow the error
            if (context.strict !== false) {
              throw new MeldResolutionError(
                `Failed to access field ${parts.slice(1).join('.')} in ${baseVar}`,
                {
                  code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
                  details: { 
                    fieldPath: parts.slice(1).join('.'),
                    variableName: baseVar
                  },
                  severity: ErrorSeverity.Recoverable
                }
              );
            }
            
            // In permissive mode, return an error message
            return `Error accessing ${parts.slice(1).join('.')}: ${(error as Error).message}`;
          }
        }
        
        // Stringification logic - IMPORTANT for avoiding output conversion errors
        if (value === undefined || value === null) {
          return '';
        } else if (typeof value === 'object') {
          // Pretty-print JSON objects for readability
          return JSON.stringify(value, null, 2);
        } else {
          return String(value);
        }
      } catch (error) {
        // If we're in strict mode, rethrow the error
        if (context.strict !== false && error instanceof MeldResolutionError) {
          throw error;
        }
        
        logger.warn(`Error resolving variable ${varRef}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        
        // In permissive mode, return the variable reference as is
        return `{{${varRef}}}`; 
      }
    } catch (error) {
      // Always rethrow fatal errors
      if (error instanceof MeldResolutionError && error.severity === ErrorSeverity.Fatal) {
        throw error;
      }
      
      // If we're in strict mode, rethrow the error
      if (context.strict !== false) {
        throw error;
      }
      
      logger.warn(`Unexpected error in resolveVariable for ${varRef}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // In permissive mode, return the variable reference as is
      return `{{${varRef}}}`;
    }
  }
  
  /**
   * Resolves field access for an object
   * @param obj The object to access fields from
   * @param fieldPath The path to the field (e.g., ["name"] or ["contact", "email"])
   * @param context The resolution context
   * @returns The field value
   */
  private resolveFieldAccess(obj: any, fieldPath: string[], context: ResolutionContext): any {
    if (!obj || !fieldPath.length) {
      return obj;
    }
    
    let current = obj;
    
    for (const part of fieldPath) {
      if (current === null || current === undefined) {
        throw new Error(`Cannot access ${part} of undefined or null`);
      }
      
      // Handle array access with numeric field access: items.0 (Ruby-style dot notation)
      const numericMatch = /^\d+$/.test(part);
      if (numericMatch && Array.isArray(current)) {
        const index = parseInt(part, 10);
        
        if (index < 0 || index >= current.length) {
          throw new Error(`Array index ${index} out of bounds for array of length ${current.length}`);
        }
        
        current = current[index];
        // Continue to the next part after handling the numeric index
        continue;
      }
      
      // Handle array access with bracket notation: items[0]
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [_, arrayName, indexStr] = arrayMatch;
        const index = parseInt(indexStr, 10);
        
        if (!current[arrayName] || !Array.isArray(current[arrayName])) {
          throw new Error(`${arrayName} is not an array or does not exist`);
        }
        
        if (index < 0 || index >= current[arrayName].length) {
          throw new Error(`Array index ${index} out of bounds for ${arrayName}`);
        }
        
        current = current[arrayName][index];
      } else {
        // Standard property access
        if (!(part in current)) {
          throw new Error(`Field ${part} does not exist on object`);
        }
        
        current = current[part];
      }
    }
    
    return current;
  }
  
  /**
   * Handles the resolution of standard text variables using a simpler approach
   * @param text Text containing variable references
   * @param context Resolution context
   * @returns Text with variables resolved
   */
  private resolveSimpleVariables(text: string, context: ResolutionContext): string {
    // Choose state service - prefer context.state if available
    const stateToUse = context.state || this.stateService;

    // If no ParserService available, throw an error
    if (!this.parserService) {
      throw new MeldResolutionError(
        'ParserService is required for variable resolution',
        {
          code: ResolutionErrorCode.RESOLUTION_FAILED,
          severity: ErrorSeverity.Fatal,
          details: { value: 'ParserService not available' }
        }
      );
    }

    try {
      // Since this method is synchronous, we use a simpler regex-based approach until refactored
      const textVars = this.getSafeTextVars(context);
      const dataVars = this.getSafeDataVars(context);
      
      // Simple variable replacement without using AST
      let result = text;
      
      // Skip if no variable references found
      if (!text.includes('{{')) {
        return text;
      }
      
      // Replace variable references in format {{varName}}
      const variableRegex = /\{\{([^{}]+?)\}\}/g;
      let match;
      
      while ((match = variableRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const varRef = match[1];
        
        // Handle field access in variable names (e.g., "data.user.name")
        const parts = varRef.split('.');
        const baseVar = parts[0];
        
        let value: any;
        
        // First, try to find the variable in the text variables
        value = stateToUse?.getTextVar?.(baseVar);
        
        // If not found in text variables, try data variables
        if (value === undefined) {
          value = stateToUse?.getDataVar?.(baseVar);
        }
        
        // If variable is not found, throw an error
        if (value === undefined) {
          if (baseVar.startsWith('ENV_')) {
            throw new MeldResolutionError(
              `Environment variable not set: ${baseVar}`,
              {
                code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                severity: ErrorSeverity.Recoverable,
                details: { 
                  variableName: baseVar,
                  variableType: 'text'
                }
              }
            );
          } else {
            throw new MeldResolutionError(
              `Undefined variable: ${baseVar}`,
              {
                code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                severity: ErrorSeverity.Recoverable,
                details: { 
                  variableName: baseVar,
                  variableType: parts.length > 1 ? 'data' as const : 'text' as const
                }
              }
            );
          }
        }
        
        // For data variables with field access, resolve fields
        if (parts.length > 1 && typeof value === 'object' && value !== null) {
          try {
            // Store the original object for comparison
            const originalObject = value;
            
            // Direct implementation of field access
            let current = value;
            
            // Enhanced debug logging for field access
            console.log('FIELD ACCESS - Initial object:', JSON.stringify(value, null, 2));
            console.log('FIELD ACCESS - Field path:', parts.slice(1));
            
            // Process each field in the path
            for (const field of parts.slice(1)) {
              console.log(`FIELD ACCESS - Accessing field: ${field}`);
              
              // Check if we can access this field
              if (current === null || current === undefined) {
                console.log('FIELD ACCESS - Cannot access field of null/undefined');
                throw new Error(`Cannot access field ${field} of undefined or null`);
              }
              
              // Check if the current value is an object and has the field
              if (typeof current !== 'object' || !(field in current)) {
                console.log(`FIELD ACCESS - Field ${field} not found in object:`, current);
                throw new Error(`Cannot access field ${field} of ${typeof current}`);
              }
              
              // Access the field
              current = current[field];
              console.log(`FIELD ACCESS - Field value:`, current);
            }
            
            // Update the value with the field access result
            value = current;
            
            // Check if the field access actually changed the value
            if (value === originalObject) {
              console.warn(`Field access may not have worked correctly for ${parts.join('.')}`);
            }
            
            console.log('FIELD ACCESS - Final result:', value);
          } catch (error) {
            if (error instanceof MeldResolutionError) {
              throw error;
            }
            throw new MeldResolutionError(
              `Failed to access field ${parts.slice(1).join('.')} in ${baseVar}`,
              {
                code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
                severity: ErrorSeverity.Recoverable,
                details: { 
                  variableName: baseVar,
                  value: `Error accessing ${parts.slice(1).join('.')}: ${(error as Error).message}`
                }
              }
            );
          }
        }
        
        // Stringification logic - key part of the fix
        let stringValue: string;
        
        if (typeof value === 'object' && value !== null) {
          if (parts.length === 1) {
            // We're not doing field access, stringify the whole object
            // Use pretty-printed JSON for better readability
            stringValue = JSON.stringify(value, null, 2);
          } else {
            // We were doing field access - only stringify if the result is still an object
            stringValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
          }
        } else {
          // For primitive values, just convert to string
          stringValue = String(value);
        }
        
        // Convert any undefined values to empty strings
        if (value === undefined) {
          stringValue = '';
        }
        
        // Replace the variable in the text
        result = result.replace(fullMatch, stringValue);
      }
      
      return result;
      
    } catch (error) {
      console.error('*** Error during variable resolution:', error);
      throw error;
    }
  }

  /**
   * Extract variable nodes from the AST
   * @param nodes AST nodes
   * @returns Array of variable reference nodes
   */
  private extractVariableNodesFromAst(nodes: MeldNode[]): MeldNode[] {
    if (!nodes) {
      return [];
    }
    
    const variableNodes: MeldNode[] = [];
    
    // Process each node
    for (const node of nodes) {
      if (node.type === 'TextVar' || node.type === 'DataVar' || 
          (node.type === 'Directive' && 
           ((node as any).directive?.kind === 'text' || (node as any).directive?.kind === 'data'))) {
        variableNodes.push(node);
      } else if (node.type === 'Text') {
        // For text nodes, check if they contain variable references
        const textContent = (node as TextNode).content;
        if (textContent.includes('{{')) {
          // Parse the text content to extract variable references
          try {
            const subNodes = this.parserService?.parse(textContent);
            if (subNodes && Array.isArray(subNodes)) {
              const subVarNodes = this.extractVariableNodesFromAst(subNodes);
              variableNodes.push(...subVarNodes);
            }
          } catch (error) {
            // If parsing fails, just continue
            console.log('*** Failed to parse variable references from text node:', textContent);
          }
        }
      }
    }
    
    return variableNodes;
  }

  /**
   * Extract references using AST - now properly handles async
   */
  private async extractReferencesAst(text: string): Promise<string[]> {
    try {
      // Check if parser service is available
      if (!this.parserService) {
        throw new Error('ParserService is required for variable resolution');
      }
      
      // Use the parser to get AST nodes
      const nodes = await this.parserService.parse(text);
      
      // Extract variable names from nodes
      if (!nodes) {
        return [];
      }
      
      return this.extractReferencesFromNodes(nodes);
    } catch (error) {
      console.error('*** Error during AST-based variable extraction:', error);
      // Don't fall back to regex - just return empty array
      return [];
    }
  }

  /**
   * Extract references from AST nodes
   */
  private extractReferencesFromNodes(nodes: MeldNode[]): string[] {
    if (!nodes) {
      return [];
    }
    
    const references = new Set<string>();
    
    for (const node of nodes) {
      if (node.type === 'Text') {
        // Extract from text content
        const textNode = node as TextNode;
        const extracted = this.extractReferencesFromText(textNode.content);
        if (Array.isArray(extracted)) {
          extracted.forEach(ref => references.add(ref));
        }
      } else if (node.type === 'TextVar' || node.type === 'DataVar' || node.type === 'PathVar' || 
                (node.type === 'Directive' && 
                 ((node as any).directive?.kind === 'text' || (node as any).directive?.kind === 'data'))) {
        // Extract from variable nodes
        const varNode = node as any;
        const varName = varNode.identifier || varNode.variable || 
                        (varNode.directive?.identifier) || 
                        (varNode.directive?.variable);
        if (varName) {
          references.add(varName);
        }
      }
    }
    
    return Array.from(references);
  }
  
  /**
   * Extract references from text content (helper method)
   */
  private extractReferencesFromText(text: string): string[] {
    // Use regex pattern matching instead of trying to call async method
    const references = new Set<string>();
    
    // Match {{varName}} pattern without using the parser
    const matches = text.match(/\{\{([^{}]+)\}\}/g) || [];
    
    for (const match of matches) {
      // Extract variable name without braces
      const varName = match.substring(2, match.length - 2);
      
      // For field access (data.field.subfield), only include the base variable
      const baseVar = varName.split('.')[0];
      references.add(baseVar);
    }
    
    return Array.from(references);
  }

  /**
   * Extract references using regex pattern matching - now delegates to async method
   * This is kept for backward compatibility
   */
  private extractReferencesRegex(text: string): string[] {
    // We can't directly use the async method in a sync context,
    // so we'll implement a simpler version
    const references = new Set<string>();
    
    // Match {{varName}} pattern without using the parser
    const matches = text.match(/\{\{([^{}]+)\}\}/g) || [];
    
    for (const match of matches) {
      // Extract variable name without braces
      const varName = match.substring(2, match.length - 2);
      
      // For field access (data.field.subfield), only include the base variable
      const baseVar = varName.split('.')[0];
      references.add(baseVar);
    }
    
    return Array.from(references);
  }

  // Safe accessor methods to handle different context shapes
  private getSafeTextVars(context: ResolutionContext): Record<string, string> {
    if (!context || !context.state) {
      return {};
    }
    
    try {
      // Convert Map to plain object if needed
      const textVars = context.state.getAllTextVars();
      if (textVars instanceof Map) {
        return Object.fromEntries(textVars);
      }
      
      return textVars || {};
    } catch (error) {
      console.error('Error accessing text variables:', error);
      return {};
    }
  }
  
  private getSafeDataVars(context: ResolutionContext): Record<string, any> {
    if (!context || !context.state) {
      return {};
    }
    
    try {
      // Get data variables from state
      const dataVars = context.state.getAllDataVars();
      
      // Convert to plain object if needed
      if (dataVars instanceof Map) {
        return Object.fromEntries(dataVars);
      }
      
      return dataVars || {};
    } catch (error) {
      console.error('Error accessing data variables:', error);
      return {};
    }
  }

  private async resolveWithAst(text: string, context: ResolutionContext): Promise<string> {
    // Check if parser service is available
    if (!this.parserService) {
      throw new Error('Parser service not available');
    }
    
    // Parse the text to get AST nodes
    const nodes = await this.parserService.parse(text);
    
    console.log('*** Parser result:', {
      hasNodes: !!nodes,
      nodeCount: nodes?.length || 0,
      nodeTypes: nodes?.map(n => n.type) || []
    });
    
    // If parsing failed or returned empty, return original text
    if (!nodes || nodes.length === 0) {
      console.log('*** No AST nodes, falling back to simple variables');
      return this.resolveSimpleVariables(text, context);
    }
    
    // Process nodes to resolve variables
    console.log('*** Processing AST nodes');
    const result = await this.resolveNodes(nodes, context);
    console.log('*** AST processing result:', result);
    return result;
  }

  /**
   * Check if text contains variable references
   */
  private async hasVariableReferences(text: string): Promise<boolean> {
    try {
      // Parse the text to find variable nodes
      const nodes = await this.parserService?.parse(text);
      const hasVariables = nodes?.some(node => 
        node.type === 'TextVar' || 
        node.type === 'DataVar' || 
        node.type === 'PathVar' ||
        (node.type === 'Directive' && 
         ((node as any).directive?.kind === 'text' || 
          (node as any).directive?.kind === 'data' || 
          (node as any).directive?.kind === 'command'))
      );
      
      return hasVariables || false;
    } catch (error) {
      // If parsing fails, fall back to simple check
      return text.includes('{{');
    }
  }

  /**
   * Extract variable references from a string - now properly uses parser when available
   * @param text The text to search for references
   * @returns Array of unique variable names
   */
  extractReferences(text: string): string[] {
    // Use regex-based extraction for sync method
    // This method should later be refactored to use the async version
    return this.extractReferencesRegex(text);
  }

  /**
   * Extract variable references from text (async version)
   * Note: This is needed for proper async handling with the parser.
   * @param text Text to extract references from
   * @returns Promise resolving to array of variable names
   */
  async extractReferencesAsync(text: string): Promise<string[]> {
    try {
      // Check if parser service is available
      if (!this.parserService) {
        return this.extractReferencesRegex(text);
      }
      
      // Parse the text into nodes
      const nodes = await this.parserService.parse(text);
      if (!nodes) {
        return [];
      }
      
      // Extract references from the nodes
      return this.extractReferencesFromNodes(nodes);
    } catch (error) {
      console.error('*** Error during variable reference extraction:', error);
      // Fall back to regex extraction
      return this.extractReferencesRegex(text);
    }
  }

  /**
   * Debug helper to trace field access resolution
   * @param obj The object to access fields on
   * @param fields Array of field names to access
   * @param context Resolution context
   * @returns Detailed debug information about field access
   */
  private debugFieldAccess(obj: any, fields: string[], context: ResolutionContext): { 
    result: any; 
    steps: Array<{ field: string; type: string; value: any; }>; 
  } {
    if (!obj) {
      return { 
        result: undefined, 
        steps: [{ field: 'initial', type: typeof obj, value: obj }] 
      };
    }
    
    let current = obj;
    const steps: Array<{ field: string; type: string; value: any; }> = [
      { field: 'initial', type: Array.isArray(obj) ? 'array' : typeof obj, value: obj }
    ];
    
    for (const field of fields) {
      // For arrays, check if the field is a valid numeric index
      if (Array.isArray(current) && /^\d+$/.test(field)) {
        const index = parseInt(field, 10);
        if (index < 0 || index >= current.length) {
          steps.push({ field, type: 'error', value: `Array index out of bounds: ${index} (array length: ${current.length})` });
          return { result: undefined, steps };
        }
        current = current[index];
        steps.push({ field, type: Array.isArray(current) ? 'array' : typeof current, value: current });
      }
      // For objects, check if the field exists
      else if (typeof current === 'object' && current !== null) {
        if (!(field in current)) {
          steps.push({ field, type: 'error', value: `Field not found on object: ${field}` });
          return { result: undefined, steps };
        }
        current = current[field];
        steps.push({ field, type: Array.isArray(current) ? 'array' : typeof current, value: current });
      }
      // Handle primitive values
      else {
        steps.push({ field, type: 'error', value: `Cannot access field ${field} on primitive value: ${current}` });
        return { result: undefined, steps };
      }
    }
    
    return { result: current, steps };
  }

  /**
   * Gets a variable from the state service
   * @param name The variable name
   * @param context The resolution context
   * @returns The variable value
   */
  private async getVariable(name: string, context: ResolutionContext): Promise<any> {
    const { state, allowedVariableTypes = { text: true, data: true } } = context;
    
    if (!state) {
      throw new Error('State service not available');
    }
    
    // Try to get a text variable first
    let value: any;
    if (allowedVariableTypes.text) {
      value = state.getTextVar(name);
    }
    
    // If no text variable found, try data variable
    if (value === undefined && allowedVariableTypes.data) {
      value = state.getDataVar(name);
    }
    
    // Handle environment variables if relevant
    // Note: We check if 'env' property exists before using it
    if (value === undefined && allowedVariableTypes && 'env' in allowedVariableTypes && allowedVariableTypes.env) {
      value = process.env[name];
    }
    
    return value;
  }
} 