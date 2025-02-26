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
    console.log('*** VariableReferenceResolver.resolve: ', {
      text,
      stateTextVars: context.state?.getAllTextVars() || {},
      stateDataVars: context.state?.getAllDataVars() || {}
    });
    
    // Quick return if no variables likely present
    if (!text.includes('{{')) {
      console.log('*** No variables detected in text, returning original');
      return text;
    }

    try {
      console.log('*** Attempting to parse text for AST-based resolution');
      
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
    } catch (error) {
      console.log('*** Error during AST parsing:', String(error));
      
      // If parsing fails, try with a simple approach
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
        
        console.log('*** Processing variable node:', {
          nodeType: node.type,
          varRef,
          identifier: varNode.identifier,
          fields: varNode.fields,
          details: JSON.stringify(varNode, null, 2)
        });
        
        if (varRef) {
          // Split to get base variable and access path
          const parts = varRef.split('.');
          const baseVar = parts[0];
          
          console.log('*** Variable parts:', {
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
          
          resolutionPath.push(baseVar);
          
          try {
            // Resolve variable value
            console.log('*** Resolving variable:', varRef);
            const resolved = await this.resolveVariable(varRef, context);
            console.log('*** Variable resolved to:', resolved);
            result += resolved;
          } finally {
            resolutionPath.pop();
          }
        }
      } else {
        // For other node types, convert to string
        console.log('*** Converting other node type to string:', node.type);
        const str = this.nodeToString(node);
        console.log('*** Converted to:', str);
        result += str;
      }
    }
    
    console.log('*** processNodes final result:', result);
    return result;
  }
  
  /**
   * Convert a node to string representation
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
    console.log('*** VariableReferenceResolver.resolveText: ', {
      text,
      stateTextVars: context.state?.getAllTextVars() || {},
      stateDataVars: context.state?.getAllDataVars() || {}
    });
    
    // Use the new unified {{variable}} pattern for all variable types
    // This replaces the old ${textvar} and #{datavar} patterns
    const variablePattern = /\{\{([^}]+)\}\}/g;
    
    let result = text;
    let match;
    
    console.log('*** Starting variable resolution with pattern:', variablePattern.toString());
    
    // Clone the pattern for detecting variables first to avoid lastIndex issues
    const detectPattern = new RegExp(variablePattern);
    const hasVariables = detectPattern.test(text);
    
    console.log('*** Text contains variables:', hasVariables);
    
    if (!hasVariables) {
      return text;
    }
    
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
   * Fallback method for resolving variables when parsing fails
   */
  private resolveSimpleVariables(
    text: string,
    context: ResolutionContext
  ): string {
    console.log('*** SimpleVariables: Starting resolution on:', text);
    
    // Choose state service - prefer context.state if available
    const stateToUse = context.state || this.stateService;
    
    // Log all variables in state
    console.log('*** SimpleVariables: Available state variables:', {
      textVars: Object.keys(stateToUse.getAllTextVars() || {}),
      dataVars: Object.keys(stateToUse.getAllDataVars() || {})
    });
    
    // Using the new unified {{variable}} pattern
    const variablePattern = /\{\{([^}]+)\}\}/g;
    
    let result = text;
    let iterations = 0;
    
    // Handle all variable references in the text, with max iterations to prevent infinite loops
    while (result.includes('{{') && iterations < this.MAX_ITERATIONS) {
      iterations++;
      
      // Create a fresh match for each iteration to avoid regex lastIndex issues
      const matches = [...result.matchAll(new RegExp(variablePattern, 'g'))];
      
      // If no more matches, we're done
      if (matches.length === 0) break;
      
      // Process all matches in this iteration
      for (const match of matches) {
        const [fullMatch, varRef] = match;
        const matchIndex = match.index ?? 0;
        
        console.log('*** SimpleVariables: Processing variable:', {
          fullMatch,
          varRef,
          matchIndex,
          iteration: iterations
        });
        
        try {
          // Handle field access (e.g., data.user.name)
          const parts = varRef.split('.');
          const baseVar = parts[0];
          
          console.log('*** SimpleVariables: Variable parts:', {
            parts,
            baseVar
          });
          
          // Try text variable first
          let value = stateToUse.getTextVar(baseVar);
          console.log('*** SimpleVariables: Text variable lookup:', {
            variable: baseVar,
            value: value
          });
          
          // If not found in text vars, try data vars
          if (value === undefined && context.allowedVariableTypes.data) {
            value = stateToUse.getDataVar(baseVar);
            console.log('*** SimpleVariables: Data variable lookup:', {
              variable: baseVar,
              value: value
            });
          }
          
          // If not found, try path vars (critical for paths to work in text contexts)
          if (value === undefined && context.allowedVariableTypes.path) {
            value = stateToUse.getPathVar(baseVar);
            console.log('*** SimpleVariables: Path variable lookup:', {
              variable: baseVar,
              value: value
            });
          }
          
          // Handle environment variables
          if (value === undefined && baseVar.startsWith('ENV_')) {
            value = process.env[baseVar];
            console.log('*** SimpleVariables: Environment variable lookup:', {
              variable: baseVar,
              value: value
            });
          }
          
          // Handle undefined variables (continue with the loop)
          if (value === undefined) {
            console.log('*** SimpleVariables: Variable not found:', baseVar);
            // Throw an error for undefined variables
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
          
          // Handle field access
          if (parts.length > 1 && typeof value === 'object') {
            try {
              value = this.resolveFieldAccess(value, parts.slice(1), context);
              console.log('*** SimpleVariables: Field access result:', value);
            } catch (error) {
              console.log('*** SimpleVariables: Field access error:', String(error));
              // Throw the error instead of skipping
              throw new MeldResolutionError(
                'Invalid field access: ' + parts.slice(1).join('.'),
                {
                  code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
                  details: { 
                    fieldPath: parts.slice(1).join('.')
                  },
                  severity: ErrorSeverity.Recoverable
                }
              );
            }
          }
          
          // Replace in the result - using substring approach to avoid regex issues
          const prefix = result.substring(0, matchIndex);
          const suffix = result.substring(matchIndex + fullMatch.length);
          const resolvedValue = String(value);
          
          result = prefix + resolvedValue + suffix;
          
          console.log('*** SimpleVariables: Result after replacement:', {
            before: text,
            after: result
          });
        } catch (error) {
          // Rethrow MeldResolutionError instances
          if (error instanceof MeldResolutionError) {
            throw error;
          }
          
          // Log error and create a new error for other exceptions
          console.log('*** SimpleVariables: Error processing variable:', {
            variable: varRef,
            error: String(error)
          });
          
          throw new MeldResolutionError(
            `Error resolving variable ${varRef}: ${String(error)}`,
            {
              code: ResolutionErrorCode.RESOLUTION_ERROR,
              details: { 
                variableName: varRef
              },
              severity: ErrorSeverity.Recoverable
            }
          );
        }
      }
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
   */
  async extractReferences(text: string): Promise<string[]> {
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
} 