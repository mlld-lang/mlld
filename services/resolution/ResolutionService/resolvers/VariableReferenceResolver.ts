import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, TextNode, DirectiveNode } from 'meld-spec';

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
   * Process AST nodes to resolve variables
   */
  private async processNodes(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    let result = '';
    console.log('*** processNodes called with nodes:', {
      count: nodes.length,
      types: nodes.map(n => n.type),
      full: JSON.stringify(nodes, null, 2)
    });
    
    // Track variables being resolved to prevent circular references
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
          varRef = `${varNode.identifier}.${varNode.fields.join('.')}`;
        }
        
        // Resolve the variable reference
        const resolvedValue = await this.resolveVariable(varRef, context);
        console.log('*** Resolved variable node:', {
          varRef,
          resolvedValue
        });
        result += resolvedValue;
      } else if (node.type === 'PathVar') {
        // Handle path variable nodes
        const pathVarNode = node as any;
        
        // Get the path variable value
        let pathValue: string | unknown;
        
        // First check if it's a structured path
        if (pathVarNode.value && typeof pathVarNode.value === 'object' && 'raw' in pathVarNode.value) {
          // Get the structured path
          const structPath = pathVarNode.value;
          
          // Use the resolutionService to resolve the structured path
          try {
            // We'll let the ResolutionService handle the structured path
            pathValue = await this.resolutionService?.resolveInContext(structPath, context);
            console.log('*** Resolved structured path:', {
              raw: structPath.raw,
              resolved: pathValue
            });
          } catch (error) {
            console.error('*** Failed to resolve structured path:', {
              raw: structPath.raw,
              error: (error as Error).message
            });
            
            // For recoverable errors, use the raw path
            pathValue = structPath.raw;
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
              pathValue = await this.resolutionService?.resolveInContext(structPath, context);
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
                          this.stateService.getPathVar(identifier);
                  
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
            
            // For recoverable errors, return the unresolved reference
            pathValue = `$${identifier}`;
          }
        }
        
        // Add the resolved path value to the result
        result += pathValue;
      } else if (node.type === 'Directive') {
        // Handle directive nodes (including run, path)
        const directiveNode = node as any;
        
        // For 'path' directives, handle path resolution
        if (directiveNode.directive.kind === 'path') {
          try {
            // Use the resolutionService's pathResolver
            const pathValue = await this.resolutionService?.resolvePath(
              directiveNode.directive.value || directiveNode.directive.identifier,
              context
            );
            console.log('*** Resolved path directive:', {
              original: directiveNode.directive.value || directiveNode.directive.identifier,
              resolved: pathValue
            });
            result += pathValue;
          } catch (error) {
            console.error('*** Failed to resolve path directive:', {
              error: (error as Error).message
            });
            
            // In permissive mode, use the original value
            if (!context.hasOwnProperty('strict') || !context.strict) {
              result += directiveNode.directive.value || directiveNode.directive.identifier;
            } else {
              // In strict mode, rethrow the error
              throw error;
            }
          }
        } else if (directiveNode.directive.kind === 'run') {
          // For 'run' directives, use commandResolver
          try {
            // Build args array
            const args = directiveNode.directive.args || [];
            
            // Use the resolutionService's commandResolver
            const cmdResult = await this.resolutionService?.resolveCommand(
              directiveNode.directive.identifier,
              args,
              context
            );
            console.log('*** Resolved command directive:', {
              command: directiveNode.directive.identifier,
              args,
              result: cmdResult
            });
            result += cmdResult;
          } catch (error) {
            console.error('*** Failed to resolve command directive:', {
              error: (error as Error).message
            });
            
            // In permissive mode, return a placeholder
            if (!context.hasOwnProperty('strict') || !context.strict) {
              result += `[command ${directiveNode.directive.identifier} failed]`;
            } else {
              // In strict mode, rethrow the error
              throw error;
            }
          }
        } else if (directiveNode.directive.kind === 'text') {
          // Handle text directives
          const id = directiveNode.directive.identifier;
          
          if (id) {
            // Get the value from state
            const value = context.state?.getTextVar(id) || 
                        this.stateService.getTextVar(id);
            
            if (value !== undefined) {
              console.log('*** Resolved text directive:', {
                identifier: id,
                value
              });
              result += value;
            } else if (id.startsWith('ENV_')) {
              // Handle environment variables
              const envVar = process.env[id];
              console.log('*** Environment variable lookup:', {
                variable: id,
                value: envVar
              });
              
              if (envVar === undefined) {
                throw new MeldResolutionError(
                  'Environment variable not set: ' + id,
                  {
                    code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                    details: { 
                      variableName: id,
                      variableType: 'text'
                    },
                    severity: ErrorSeverity.Recoverable
                  }
                );
              }
              result += envVar;
            } else {
              // If not found in state and not an environment variable, throw error
              console.log('*** Text variable not found:', id);
              
              // Check if we have a directive value before throwing
              const directiveValue = directiveNode.directive.value;
              if (directiveValue !== undefined) {
                console.log('*** Using directive value:', directiveValue);
                result += String(directiveValue);
              } else {
                throw new MeldResolutionError(
                  'Undefined variable: ' + id,
                  {
                    code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                    details: { 
                      variableName: id,
                      variableType: 'text'
                    },
                    severity: ErrorSeverity.Recoverable
                  }
                );
              }
            }
          }
        } else if (directiveNode.directive.kind === 'data') {
          // Handle data directives
          const id = directiveNode.directive.identifier;
          
          if (id) {
            // First check if there's a text variable with this name
            // This is to match the expected behavior in the tests
            const textValue = context.state?.getTextVar(id) || 
                           this.stateService.getTextVar(id);
            
            // Then get the data value
            const value = context.state?.getDataVar(id) || 
                       this.stateService.getDataVar(id);
            
            if (value !== undefined) {
              console.log('*** Resolved data directive:', {
                identifier: id,
                value
              });
              
              // Handle field access if fields are specified
              if (directiveNode.directive.fields && directiveNode.directive.fields.length > 0) {
                try {
                  // Access nested fields
                  let fieldValue = value;
                  for (const field of directiveNode.directive.fields) {
                    if (fieldValue === null || fieldValue === undefined) {
                      throw new Error(`Cannot access field ${field} of undefined or null`);
                    }
                    
                    // Check if fieldValue is an object and has the property
                    if (typeof fieldValue === 'object' && field in fieldValue) {
                      fieldValue = fieldValue[field as keyof typeof fieldValue];
                    } else {
                      throw new Error(`Cannot access field ${field} of ${typeof fieldValue}`);
                    }
                  }
                  
                  // Convert to string representation
                  result += typeof fieldValue === 'object' && fieldValue !== null 
                    ? JSON.stringify(fieldValue) 
                    : String(fieldValue);
                } catch (error) {
                  console.error('*** Field access error:', String(error));
                  throw new MeldResolutionError(
                    'Invalid field access: ' + directiveNode.directive.fields.join('.'),
                    {
                      code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
                      details: { 
                        fieldPath: directiveNode.directive.fields.join('.')
                      },
                      severity: ErrorSeverity.Fatal
                    }
                  );
                }
              } else {
                // Convert to string representation
                result += typeof value === 'object' ? JSON.stringify(value) : String(value);
              }
            } else {
              // If not found in state, use the value from the directive
              const directiveValue = directiveNode.directive.value;
              console.log('*** Data variable not found in state, using directive value:', {
                identifier: id,
                directiveValue
              });
              
              if (directiveValue !== undefined) {
                try {
                  // Try to parse if it's a JSON string
                  if (typeof directiveValue === 'string' && 
                      (directiveValue.startsWith('{') || directiveValue.startsWith('['))) {
                    const parsed = JSON.parse(directiveValue);
                    result += JSON.stringify(parsed);
                  } else {
                    result += String(directiveValue);
                  }
                } catch (error) {
                  // If parsing fails, use the raw value
                  result += String(directiveValue);
                }
              } else {
                throw new MeldResolutionError(
                  'Undefined variable: ' + id,
                  {
                    code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                    details: { 
                      variableName: id,
                      variableType: 'data'
                    },
                    severity: ErrorSeverity.Recoverable
                  }
                );
              }
            }
          }
        } else {
          // For other directive types, use the default node toString
          console.warn('*** Unhandled directive type:', directiveNode.directive.kind);
          result += this.nodeToString(node);
        }
      } else {
        // For other node types, convert to string but avoid directive syntax
        console.log('*** Converting other node type to string:', node.type);
        const str = this.getNodeValue(node, context);
        console.log('*** Converted to:', str);
        result += str;
      }
    }
    
    console.log('*** processNodes final result:', result);
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
   * Resolve a variable reference (with possible field access)
   */
  private async resolveVariable(
    varRef: string, 
    context: ResolutionContext
  ): Promise<string> {
    console.log('*** Resolving variable reference:', {
      varRef,
      contextState: context.state ? 'available' : 'missing',
      allowedTypes: context.allowedVariableTypes
    });
    
    // Handle field access (e.g., user.name)
    const parts = varRef.split('.');
    const baseVar = parts[0];
    
    console.log('*** Variable parts:', {
      parts,
      baseVar
    });
    
    // Choose state service - prefer context.state if available
    const stateToUse = context.state || this.stateService;
    
    // Print all variables in state for debugging
    console.log('*** State variables available:', {
      textVars: typeof stateToUse.getAllTextVars === 'function' ? '[state service available]' : 'not available',
      dataVars: typeof stateToUse.getAllDataVars === 'function' ? '[state service available]' : 'not available',
      pathVars: typeof stateToUse.getAllPathVars === 'function' ? '[state service available]' : 'not available'
    });
    
    // Try text variable first
    let value = stateToUse.getTextVar(baseVar);
    console.log('*** Text variable lookup result:', {
      variable: baseVar,
      value: value
    });
    
    // If not found in text vars, try data vars
    if (value === undefined && context.allowedVariableTypes.data) {
      const dataValue = stateToUse.getDataVar(baseVar);
      value = dataValue as string | undefined;
      console.log('*** Data variable lookup result:', {
        variable: baseVar,
        value: value
      });
    }
    
    // Handle environment variables
    if (value === undefined && baseVar.startsWith('ENV_')) {
      const envVar = process.env[baseVar];
      console.log('*** Environment variable lookup:', {
        variable: baseVar,
        value: envVar
      });
      
      if (envVar === undefined) {
        throw new MeldResolutionError(
          'Environment variable not set: ' + baseVar,
          {
            code: ResolutionErrorCode.UNDEFINED_VARIABLE,
            details: { 
              variableName: baseVar,
              variableType: 'text'
            },
            severity: ErrorSeverity.Recoverable
          }
        );
      }
      return envVar;
    }
    
    // Handle undefined variables
    if (value === undefined) {
      console.log('*** Variable not found:', baseVar);
      
      throw new MeldResolutionError(
        'Undefined variable: ' + baseVar,
        {
          code: ResolutionErrorCode.UNDEFINED_VARIABLE,
          details: { 
            variableName: baseVar,
            variableType: 'text'
          },
          severity: ErrorSeverity.Recoverable
        }
      );
    }
    
    // Handle field access for data variables
    if (parts.length > 1 && typeof value === 'object') {
      console.log('*** Resolving field access:', {
        baseVar,
        fields: parts.slice(1),
        baseValue: typeof value === 'object' ? JSON.stringify(value) : value
      });
      
      try {
        // Store the original value for comparison
        const originalValue = value;
        
        // Attempt to resolve field access
        value = this.resolveFieldAccess(value, parts.slice(1), context);
        
        // If field access didn't change the value, it might have failed
        if (value === originalValue) {
          console.warn(`Field access may not have worked correctly for ${parts.join('.')}`);
        }
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
    
    // Only stringify if it's an object AND we weren't doing field access,
    // or if the result of field access is still an object
    if (typeof value === 'object' && value !== null) {
      if (parts.length === 1) {
        // We're not doing field access, stringify the whole object
        value = JSON.stringify(value);
      } else {
        // We were doing field access - only stringify if the result is still an object
        value = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }
    
    const result = String(value);
    console.log('*** Final resolved value:', result);
    return result;
  }
  
  /**
   * Resolve field access for object properties
   */
  private resolveFieldAccess(
    obj: any, 
    fieldPath: string[], 
    context: ResolutionContext
  ): any {
    // Enhanced logging to debug field access issues
    console.log('FIELD ACCESS DEBUG - Initial object:', typeof obj === 'object' ? JSON.stringify(obj, null, 2) : obj);
    console.log('FIELD ACCESS DEBUG - Field path:', fieldPath);
    
    // Handle empty field path
    if (!fieldPath || fieldPath.length === 0) {
      console.log('FIELD ACCESS DEBUG - Empty field path, returning original object');
      return obj;
    }
    
    // Traverse the object via the field path
    let current = obj;
    for (const field of fieldPath) {
      console.log(`FIELD ACCESS DEBUG - Accessing field: ${field}`);
      
      if (current === null || current === undefined) {
        console.log('FIELD ACCESS DEBUG - Cannot access field of null/undefined');
        throw new Error(`Cannot access field ${field} of undefined or null`);
      }
      
      // Handle array access with [] notation
      if (field.includes('[') && field.includes(']')) {
        const [arrayName, indexExpr] = field.split('[');
        const index = indexExpr.slice(0, -1); // Remove closing bracket
        
        // If index is a variable reference, resolve it
        if (index.startsWith('{{') && index.endsWith('}}')) {
          const indexVar = index.slice(2, -2);
          const indexValue = this.stateService.getTextVar(indexVar);
          if (indexValue === undefined) {
            throw new MeldResolutionError(
              'Undefined index variable: ' + indexVar,
              {
                code: ResolutionErrorCode.UNDEFINED_VARIABLE,
                details: { 
                  variableName: indexVar,
                  variableType: 'text'
                },
                severity: ErrorSeverity.Recoverable
              }
            );
          }
          current = current[indexValue];
        } else {
          current = current[index];
        }
      } else {
        // Normal property access
        console.log(`FIELD ACCESS DEBUG - Current object type: ${typeof current}`);
        if (typeof current === 'object' && current !== null) {
          console.log(`FIELD ACCESS DEBUG - Current object keys:`, Object.keys(current));
        }
        console.log(`FIELD ACCESS DEBUG - Field ${field} exists:`, field in current);
        
        if (typeof current !== 'object' || !(field in current)) {
          console.log(`FIELD ACCESS DEBUG - Field ${field} not found in object:`, current);
          throw new Error(`Cannot access field ${field} of ${typeof current}`);
        }
        
        current = current[field];
        console.log(`FIELD ACCESS DEBUG - Field value:`, current);
        console.log(`FIELD ACCESS DEBUG - Field value type:`, typeof current);
      }
    }
    
    console.log('FIELD ACCESS DEBUG - Final result:', current);
    console.log('FIELD ACCESS DEBUG - Final result type:', typeof current);
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
                  variableType: parts.length > 1 ? 'data' : 'text'
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
    const result = await this.processNodes(nodes, context);
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
   * Test debugging method to directly test field access
   */
  debugFieldAccess(
    obj: any, 
    fieldPath: string[], 
    context: ResolutionContext
  ): { originalObj: any; result: any; } {
    console.log('=== DEBUG TEST - debugFieldAccess ===');
    console.log('Input:', { obj, fieldPath });
    
    const result = this.resolveFieldAccess(obj, fieldPath, context);
    
    console.log('Result:', { 
      originalObj: obj,
      result,
      resultType: typeof result
    });
    
    // Test our stringification logic directly
    let stringified: string;
    
    if (typeof result === 'object' && result !== null) {
      stringified = JSON.stringify(result);
    } else {
      stringified = String(result);
    }
    
    console.log('Stringified result:', stringified);
    console.log('=== END DEBUG TEST ===');
    
    return { 
      originalObj: obj,
      result 
    };
  }
} 