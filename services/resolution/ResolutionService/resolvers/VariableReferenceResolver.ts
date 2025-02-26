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
    private readonly resolutionService: IResolutionService,
    private readonly parserService: IParserService
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
      } else if (node.type === 'TextVar' || node.type === 'DataVar' || node.type === 'VariableReference') {
        // Handle text/data variable nodes (new meld-ast format)
        // or variable reference nodes (backward compatibility)
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
            pathValue = await this.resolutionService.resolveInContext(structPath, context);
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
            const nodes = await this.parserService.parse(pathStr);
            const parsedPathNode = nodes.find(n => n.type === 'PathVar');
            
            if (parsedPathNode && (parsedPathNode as any).value) {
              // Get the structured path from the parsed node
              const structPath = (parsedPathNode as any).value;
              
              // Let ResolutionService resolve it
              pathValue = await this.resolutionService.resolveInContext(structPath, context);
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
            const pathValue = await this.resolutionService.resolvePath(
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
            if (!context.strict) {
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
            const cmdResult = await this.resolutionService.resolveCommand(
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
            if (!context.strict) {
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
            } else {
              // If not found in state, use the value from the directive
              const directiveValue = directiveNode.directive.value;
              console.log('*** Text variable not found in state, using directive value:', {
                identifier: id,
                directiveValue
              });
              result += directiveValue !== undefined ? String(directiveValue) : '';
            }
          }
        } else if (directiveNode.directive.kind === 'data') {
          // Handle data directives
          const id = directiveNode.directive.identifier;
          
          if (id) {
            // Get the value from state
            const value = context.state?.getDataVar(id) || 
                       this.stateService.getDataVar(id);
            
            if (value !== undefined) {
              console.log('*** Resolved data directive:', {
                identifier: id,
                value
              });
              
              // Convert to string representation
              result += typeof value === 'object' ? JSON.stringify(value) : String(value);
            } else {
              // If not found in state, use the value from the directive
              const directiveValue = directiveNode.directive.value;
              console.log('*** Data variable not found in state, using directive value:', {
                identifier: id,
                directiveValue
              });
              
              try {
                // Try to parse if it's a JSON string
                if (typeof directiveValue === 'string' && 
                    (directiveValue.startsWith('{') || directiveValue.startsWith('['))) {
                  const parsed = JSON.parse(directiveValue);
                  result += JSON.stringify(parsed);
                } else {
                  result += directiveValue !== undefined ? String(directiveValue) : '';
                }
              } catch (error) {
                // If parsing fails, use the raw value
                result += directiveValue !== undefined ? String(directiveValue) : '';
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
    
    // Define the variable pattern for {{variable}} syntax
    // This replaces the old ${variable} pattern
    const variablePattern = /\{\{([^}]+)\}\}/g;
    
    // Check if there are any variables to resolve
    if (!variablePattern.test(result)) {
      return result;
    }
    
    // Reset the regex lastIndex
    variablePattern.lastIndex = 0;
    
    console.log('*** Starting variable resolution with pattern:', variablePattern.toString());
    
    // Check for variables to resolve
    const detectPattern = new RegExp(variablePattern);
    if (!detectPattern.test(result)) {
      console.log('*** No variables to resolve in:', result);
      return result;
    }
    
    // Reset lastIndex after test
    variablePattern.lastIndex = 0;
    
    let match;
    
    while ((match = variablePattern.exec(result)) !== null) {
      const [fullMatch, varRef] = match;
      
      console.log('*** Found variable match:', {
        fullMatch,
        varRef
      });
      
      // Split to get base variable and access path
      const parts = varRef.split('.');
      const baseVar = parts[0];
      
      console.log('*** Processing variable:', {
        parts,
        baseVar
      });
      
      // Check for circular references
      if (resolutionPath.includes(baseVar)) {
        const path = [...resolutionPath, baseVar].join(' -> ');
        throw new MeldResolutionError(
          `Circular reference detected: ${path}`,
          {
            code: ResolutionErrorCode.CIRCULAR_REFERENCE,
            details: { variableName: baseVar },
            severity: ErrorSeverity.Fatal
          }
        );
      }
      
      // Add to resolution path to track circular references
      resolutionPath.push(baseVar);
      
      try {
        // Resolve the variable value
        const resolvedValue = await this.resolveVariable(varRef, context);
        console.log('*** Resolved variable:', {
          varRef,
          resolvedValue
        });
        
        // Replace in result text - using a delimiter approach to avoid regex
        // lastIndex issues with variable replacement
        const prefix = result.substring(0, match.index);
        const suffix = result.substring(match.index + fullMatch.length);
        result = prefix + resolvedValue + suffix;
        
        // Reset pattern match index
        variablePattern.lastIndex = prefix.length + String(resolvedValue).length;
      } finally {
        // Remove from resolution path
        resolutionPath.pop();
      }
    }
    
    console.log('*** Final resolved text:', result);
    return result;
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
      textVars: Object.fromEntries(stateToUse.getAllTextVars() || []),
      dataVars: Object.keys(stateToUse.getAllDataVars() || {}),
      pathVars: Object.keys(stateToUse.getAllPathVars() || {})
    });
    
    // Try text variable first
    let value = stateToUse.getTextVar(baseVar);
    console.log('*** Text variable lookup result:', {
      variable: baseVar,
      value: value
    });
    
    // If not found in text vars, try data vars
    if (value === undefined && context.allowedVariableTypes.data) {
      value = stateToUse.getDataVar(baseVar);
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
      console.log('*** Checking context state directly');
      
      // Double-check by directly examining all variables (debug help)
      const allTextVars = stateToUse.getAllTextVars ? stateToUse.getAllTextVars() : {};
      console.log('*** All text variables:', Object.fromEntries(allTextVars));
      
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
        value = this.resolveFieldAccess(value, parts.slice(1), context);
        console.log('*** Field access result:', value);
      } catch (error) {
        console.log('*** Field access error:', String(error));
        throw new MeldResolutionError(
          'Invalid field access: ' + parts.slice(1).join('.'),
          {
            code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
            details: { 
              fieldPath: parts.slice(1).join('.')
            },
            severity: ErrorSeverity.Fatal
          }
        );
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
    return fieldPath.reduce((current, field) => {
      if (current === null || current === undefined) {
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
          return current[indexValue];
        }
        
        return current[index];
      }
      
      return current[field];
    }, obj);
  }
  
  /**
   * Handles the resolution of standard text variables using a simpler approach
   * @param text Text containing variable references
   * @param context Resolution context
   * @returns Text with variables resolved
   */
  private resolveSimpleVariables(text: string, context: ResolutionContext): string {
    console.log('*** SimpleVariables: Starting resolution on:', text);
    
    // Choose state service - prefer context.state if available
    const stateToUse = context.state || this.stateService;
    
    console.log('*** SimpleVariables: Available state variables:', { 
      textVars: stateToUse ? ['[state service available]'] : [],
      dataVars: stateToUse ? ['[state service available]'] : []
    });

    // Regular expression to match variable references
    const variableRegex = /\{\{([^{}]+?)\}\}/g;
    let result = text;
    let iteration = 1;
    
    // Find all variable references in the text
    const matches: { fullMatch: string; varRef: string; matchIndex: number }[] = [];
    let match;
    
    while ((match = variableRegex.exec(text)) !== null) {
      matches.push({
        fullMatch: match[0],
        varRef: match[1],
        matchIndex: match.index
      });
    }
    
    // If no matches, return the original text
    if (matches.length === 0) {
      return text;
    }
    
    // Sort matches by position to ensure correct replacement order
    matches.sort((a, b) => a.matchIndex - b.matchIndex);
    
    console.log('*** SimpleVariables: Iteration', iteration);
    
    // Process each match
    for (const match of matches) {
      console.log('*** SimpleVariables: Processing variable:', match);
      
      // Handle field access in variable names (e.g., "data.user.name")
      const parts = match.varRef.split('.');
      const baseVar = parts[0];
      
      console.log('*** SimpleVariables: Variable parts:', { parts, baseVar });
      
      let value: any;
      
      // First, try to find the variable in the text variables
      value = stateToUse?.getTextVar?.(baseVar);
      console.log('*** SimpleVariables: Text variable lookup:', { variable: baseVar, value });
      
      // If not found in text variables, try data variables
      if (value === undefined) {
        value = stateToUse?.getDataVar?.(baseVar);
        console.log('*** SimpleVariables: Data variable lookup:', { variable: baseVar, value });
      }
      
      // If variable is not found, throw an error
      if (value === undefined) {
        if (baseVar.startsWith('ENV_')) {
          console.log('*** SimpleVariables: Environment variable not set:', baseVar);
          throw new MeldResolutionError(
            `Environment variable not set: ${baseVar}`,
            ErrorSeverity.RECOVERABLE,
            ResolutionErrorCode.VARIABLE_NOT_FOUND
          );
        } else {
          console.log('*** SimpleVariables: Undefined variable:', baseVar);
          throw new MeldResolutionError(
            `Undefined variable: ${baseVar}`,
            ErrorSeverity.RECOVERABLE,
            ResolutionErrorCode.VARIABLE_NOT_FOUND
          );
        }
      }
      
      // Handle field access for object values
      if (parts.length > 1 && typeof value === 'object' && value !== null) {
        try {
          // Navigate the object properties
          for (let i = 1; i < parts.length; i++) {
            value = value[parts[i]];
            if (value === undefined) {
              throw new MeldResolutionError(
                `Field not found: ${parts.slice(0, i + 1).join('.')}`,
                ErrorSeverity.RECOVERABLE,
                ResolutionErrorCode.FIELD_NOT_FOUND
              );
            }
          }
          console.log('*** SimpleVariables: Field access result:', value);
        } catch (error) {
          if (error instanceof MeldResolutionError) {
            throw error;
          }
          throw new MeldResolutionError(
            `Error accessing field: ${match.varRef}`,
            ErrorSeverity.RECOVERABLE,
            ResolutionErrorCode.FIELD_ACCESS_ERROR
          );
        }
      }
      
      // Replace the variable reference with its value
      const before = result;
      result = result.replace(match.fullMatch, String(value));
      
      console.log('*** SimpleVariables: Result after replacement:', {
        before,
        currentMatch: match.fullMatch,
        resolvedValue: String(value),
        after: result
      });
    }
    
    console.log('*** SimpleVariables: Final result:', result);
    return result;
  }

  /**
   * Checks if a resolution path contains a circular reference
   */
  private hasCircularReference(path: string[]): boolean {
    const seen = new Set<string>();
    for (const varName of path) {
      if (seen.has(varName)) {
        return true;
      }
      seen.add(varName);
    }
    return false;
  }

  /**
   * Extract all variable references from input text
   * Note: This method is synchronous to match the interface expected by tests
   */
  extractReferences(text: string): string[] {
    if (!text) {
      return [];
    }

    try {
      // Try AST-based extraction first
      return this.extractReferencesAst(text);
    } catch (error) {
      console.log('Error in AST reference extraction, falling back to regex:', error);
      // Fall back to regex-based extraction
      return this.extractReferencesRegex(text);
    }
  }
  
  /**
   * Helper method to asynchronously extract references using AST parsing
   * @internal
   */
  private async extractReferencesAsync(text: string): Promise<string[]> {
    try {
      // Use AST-based extraction
      const nodes = await this.parserService.parse(text);
      if (nodes && nodes.length > 0) {
        return this.extractReferencesFromNodes(nodes);
      }
    } catch (error) {
      console.log('*** Error parsing for reference extraction:', String(error));
    }
    
    // Fallback to regex
    return this.extractReferencesWithRegex(text);
  }
  
  /**
   * Extract references from AST nodes
   */
  private extractReferencesFromNodes(nodes: MeldNode[]): string[] {
    const references: Set<string> = new Set();
    
    for (const node of nodes) {
      if (node.type === 'Text') {
        // Extract from text content
        const textNode = node as TextNode;
        const extracted = this.extractReferencesFromText(textNode.content);
        extracted.forEach(ref => references.add(ref));
      } else if (node.type === 'TextVar' || node.type === 'DataVar' || node.type === 'PathVar') {
        // Extract from variable nodes
        const varNode = node as any;
        const varName = varNode.identifier || varNode.variable;
        if (varName) {
          references.add(varName);
        }
      } else if (node.type === 'VariableReference') {
        // Handle direct variable reference nodes
        const varRef = (node as any).reference;
        if (varRef) {
          // Get base variable name (before any field access)
          const baseVar = varRef.split('.')[0];
          references.add(baseVar);
        }
      }
    }
    
    return Array.from(references);
  }
  
  /**
   * Extract references from text using regex (fallback)
   */
  private extractReferencesWithRegex(text: string): string[] {
    // Use the new unified {{variable}} pattern
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const matches = text.match(variablePattern);
    
    if (!matches) {
      return [];
    }
    
    const refs = matches.map(match => {
      // Remove {{}} and get base variable name (before any field access)
      const varRef = match.slice(2, -2);
      return varRef.split('.')[0];
    });
    
    // Return unique references
    return [...new Set(refs)];
  }
  
  /**
   * Extract references from text content (helper method)
   */
  private extractReferencesFromText(text: string): string[] {
    // Use the new unified {{variable}} pattern
    const variablePattern = /\{\{([^}]+)\}\}/g;
    const references: Set<string> = new Set();
    
    let match;
    while ((match = variablePattern.exec(text)) !== null) {
      const varRef = match[1];
      const baseVar = varRef.split('.')[0];
      references.add(baseVar);
    }
    
    return Array.from(references);
  }

  /**
   * Extract references using regex pattern matching
   * @param text The text to search for references
   * @returns Array of unique variable names
   */
  private extractReferencesRegex(text: string): string[] {
    const references = new Set<string>();
    const pattern = /\{\{([^{}]+?)\}\}/g;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      const varRef = match[1];
      const baseVar = varRef.split('.')[0];
      references.add(baseVar);
    }
    
    return Array.from(references);
  }

  /**
   * Extract references using AST parser
   * @param text The text to parse for references
   * @returns Array of unique variable names
   */
  private extractReferencesAst(text: string): string[] {
    const references = new Set<string>();
    
    // Use the parser to get AST nodes
    const nodes = this.parserService.parse(text);
    
    // Extract variable names from nodes
    for (const node of nodes) {
      if (node.type === 'TextVar' || node.type === 'PathVar' || node.type === 'DataVar') {
        const varName = node.value.split('.')[0];
        references.add(varName);
      }
    }
    
    return Array.from(references);
  }

  // Safe accessor methods to handle different context shapes
  private getSafeTextVars(context: ResolutionContext): Record<string, string> {
    const stateService = context.state || this.stateService;
    
    // Try various ways the state might expose text variables
    if (stateService?.getAllTextVars && typeof stateService.getAllTextVars === 'function') {
      return stateService.getAllTextVars() || {};
    }
    
    if (stateService?.getTextVars && typeof stateService.getTextVars === 'function') {
      return stateService.getTextVars() || {};
    }
    
    // Fallback for test mocks or other state implementations
    if (typeof stateService === 'object' && stateService !== null) {
      if ('textVars' in stateService && typeof stateService.textVars === 'object') {
        return stateService.textVars || {};
      }
    }
    
    return {};
  }
  
  private getSafeDataVars(context: ResolutionContext): Record<string, any> {
    const stateService = context.state || this.stateService;
    
    // Try various ways the state might expose data variables
    if (stateService?.getAllDataVars && typeof stateService.getAllDataVars === 'function') {
      return stateService.getAllDataVars() || {};
    }
    
    if (stateService?.getDataVars && typeof stateService.getDataVars === 'function') {
      return stateService.getDataVars() || {};
    }
    
    // Fallback for test mocks or other state implementations
    if (typeof stateService === 'object' && stateService !== null) {
      if ('dataVars' in stateService && typeof stateService.dataVars === 'object') {
        return stateService.dataVars || {};
      }
    }
    
    return {};
  }

  private async resolveWithAst(text: string, context: ResolutionContext): Promise<string> {
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
} 