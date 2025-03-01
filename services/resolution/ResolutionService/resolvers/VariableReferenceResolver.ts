import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode, type ResolutionErrorDetails } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, TextNode, DirectiveNode, TextVarNode, DataVarNode } from 'meld-spec';
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
      } else if (node.type === 'TextVar') {
        // Handle text variable nodes
        try {
          const textVarNode = node as TextVarNode;
          const identifier = textVarNode.identifier;
          
          // If transformation is enabled with variables option, resolve the variable
          if (context.state?.isTransformationEnabled() && 
              (context.state?.shouldTransform?.('variables') ?? true)) {
            const value = await this.getVariable(identifier, context);
            
            if (value !== undefined) {
              result += String(value);
            } else if (context.strict !== false) {
              throw new MeldResolutionError(
                `Undefined variable: ${identifier}`,
                {
                  code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                  details: { variableName: identifier },
                  severity: ErrorSeverity.Recoverable
                }
              );
            } else {
              // Keep the variable reference if in permissive mode and value not found
              result += `{{${identifier}}}`;
            }
          } else {
            // If transformation is not enabled for variables, keep the reference
            result += `{{${identifier}}}`;
          }
        } catch (error) {
          console.error('*** Failed to resolve TextVar node:', error);
          
          // If we're in strict mode, rethrow the error
          if (context.strict !== false) {
            throw error;
          }
          
          // In permissive mode, keep the variable reference
          result += `{{${(node as TextVarNode).identifier}}}`;
        }
      } else if (node.type === 'DataVar') {
        // Handle data variable nodes
        try {
          const dataVarNode = node as DataVarNode;
          const identifier = dataVarNode.identifier;
          const fields = dataVarNode.fields || [];
          
          // Build the reference string for debugging and fallback
          let refString = identifier;
          for (const field of fields) {
            if (field.type === 'field') {
              refString += `.${field.value}`;
            } else if (field.type === 'index') {
              refString += `[${field.value}]`;
            }
          }
          
          // If transformation is enabled with variables option, resolve the variable
          if (context.state?.isTransformationEnabled() && 
              (context.state?.shouldTransform?.('variables') ?? true)) {
            // Get the base variable value
            let value = await this.getVariable(identifier, context);
            
            if (value !== undefined) {
              // Process fields if present
              try {
                for (const field of fields) {
                  if (value === undefined) break;
                  
                  if (field.type === 'field' || field.type === 'index') {
                    value = value[field.value];
                  }
                }
                
                // Convert the final value to a string
                if (value !== undefined) {
                  if (typeof value === 'object' && value !== null) {
                    result += JSON.stringify(value);
                  } else {
                    result += String(value);
                  }
                } else if (context.strict !== false) {
                  throw new MeldResolutionError(
                    `Invalid field access in variable: ${refString}`,
                    {
                      code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
                      details: { 
                        variableName: identifier,
                        fieldPath: fields.map(f => String(f.value)).join('.')
                      },
                      severity: ErrorSeverity.Recoverable
                    }
                  );
                } else {
                  // Keep the variable reference if in permissive mode and field access failed
                  result += `{{${refString}}}`;
                }
              } catch (e) {
                if (context.strict !== false) {
                  throw new MeldResolutionError(
                    `Error accessing fields in variable: ${refString}`,
                    {
                      code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
                      details: { 
                        variableName: identifier,
                        fieldPath: fields.map(f => String(f.value)).join('.')
                      },
                      severity: ErrorSeverity.Recoverable
                    }
                  );
                } else {
                  // Keep the variable reference if in permissive mode and field access failed
                  result += `{{${refString}}}`;
                }
              }
            } else if (context.strict !== false) {
              throw new MeldResolutionError(
                `Undefined variable: ${identifier}`,
                {
                  code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                  details: { variableName: identifier },
                  severity: ErrorSeverity.Recoverable
                }
              );
            } else {
              // Keep the variable reference if in permissive mode and value not found
              result += `{{${refString}}}`;
            }
          } else {
            // If transformation is not enabled for variables, keep the reference
            result += `{{${refString}}}`;
          }
        } catch (error) {
          console.error('*** Failed to resolve DataVar node:', error);
          
          // If we're in strict mode, rethrow the error
          if (context.strict !== false) {
            throw error;
          }
          
          // In permissive mode, keep the variable reference
          const dataVarNode = node as DataVarNode;
          const identifier = dataVarNode.identifier;
          const fields = dataVarNode.fields || [];
          
          let refString = identifier;
          for (const field of fields) {
            if (field.type === 'field') {
              refString += `.${field.value}`;
            } else if (field.type === 'index') {
              refString += `[${field.value}]`;
            }
          }
          
          result += `{{${refString}}}`;
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
    if (node.type === 'TextVar') {
      const textVarNode = node as TextVarNode;
      return `{{${textVarNode.identifier}}}`;
    } else if (node.type === 'DataVar') {
      const dataVarNode = node as DataVarNode;
      let result = dataVarNode.identifier;
      
      // Append fields/indices if present
      if (dataVarNode.fields && dataVarNode.fields.length > 0) {
        for (const field of dataVarNode.fields) {
          if (field.type === 'field') {
            result += `.${field.value}`;
          } else if (field.type === 'index') {
            result += `[${field.value}]`;
          }
        }
      }
      
      return `{{${result}}}`;
    }
    
    return '';
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
   * Resolves a variable node (TextVar or DataVar)
   * @param node The variable node to resolve
   * @param context The resolution context
   * @param resolutionPath Path to detect circular references
   * @returns The resolved value
   */
  private async resolveVarNode(
    node: MeldNode, 
    context: ResolutionContext,
    resolutionPath: string[] = []
  ): Promise<any> {
    // Normalize the variable node structure
    const normalized = this.normalizeVarNode(node);
    if (!normalized) {
      throw new MeldResolutionError(
        `Unsupported variable node type: ${node.type}`,
        {
          code: ResolutionErrorCode.INVALID_SYNTAX,
          details: { message: `Unsupported variable node type: ${node.type}` } as ResolutionErrorDetails,
          severity: ErrorSeverity.Recoverable
        }
      );
    }

    // Get the base variable value
    let value = await this.getVariable(normalized.identifier, context);
    if (value === undefined) {
      if (context.strict !== false) {
        throw new MeldResolutionError(
          `Undefined variable: ${normalized.identifier}`,
          {
            code: ResolutionErrorCode.UNDEFINED_VARIABLE,
            details: { variableName: normalized.identifier },
            severity: ErrorSeverity.Recoverable
          }
        );
      }
      return undefined;
    }

    // Process fields/indices if present
    if (normalized.fields.length > 0) {
      try {
        for (const field of normalized.fields) {
          if (value === undefined) break;
          
          // Handle array index or object property access
          if (field.type === 'index') {
            // For numeric indices
            value = value[field.value];
          } else {
            // For named properties
            value = value[field.value];
          }
        }
      } catch (error: any) {
        throw new MeldResolutionError(
          `Invalid field access for variable ${normalized.identifier}: ${error?.message || 'Unknown error'}`,
          {
            code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
            details: { 
              variableName: normalized.identifier, 
              fieldPath: normalized.fields.map(f => f.value).join('.'),
              error: error?.message || 'Unknown error' 
            } as ResolutionErrorDetails,
            severity: ErrorSeverity.Recoverable
          }
        );
      }
    }

    return value;
  }

  /**
   * Normalizes a variable node to a common format regardless of node type
   */
  private normalizeVarNode(node: MeldNode): { 
    identifier: string;
    varType: 'text' | 'data';
    fields: Array<{ type: 'field' | 'index', value: string | number }>;
  } | null {
    if (!node) return null;
    
    if (node.type === 'TextVar') {
      const textVarNode = node as TextVarNode;
      return {
        identifier: textVarNode.identifier,
        varType: 'text',
        fields: []
      };
    } 
    
    if (node.type === 'DataVar') {
      const dataVarNode = node as DataVarNode;
      return {
        identifier: dataVarNode.identifier,
        varType: 'data',
        fields: dataVarNode.fields?.map(field => {
          if (typeof field === 'object' && field !== null) {
            if (field.type === 'index') {
              return {
                type: 'index' as const,
                value: typeof field.value === 'number' ? field.value : parseInt(field.value, 10)
              };
            } else if (field.type === 'field') {
              return {
                type: 'field' as const,
                value: field.value
              };
            }
          }
          // Default case for unexpected field format
          return {
            type: 'field' as const,
            value: String(field)
          };
        }) || []
      };
    }
    
    return null;
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