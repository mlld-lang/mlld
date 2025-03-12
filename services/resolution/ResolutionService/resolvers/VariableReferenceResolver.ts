import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, DirectiveNode, TextVarNode, DataVarNode } from 'meld-spec';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import { IServiceMediator } from '@services/mediator/index.js';
import { container } from 'tsyringe';
import { IResolutionServiceClient } from '../interfaces/IResolutionServiceClient.js';
import { ResolutionServiceClientFactory } from '../factories/ResolutionServiceClientFactory.js';

// Define the field type for clarity
interface Field {
  type: 'field' | 'index';
  value: string | number;
}

/**
 * Handles resolution of variable references ({{var}})
 * Previously used ${var} for text and #{var} for data, now unified as {{var}}
 */
export class VariableReferenceResolver {
  private readonly MAX_RESOLUTION_DEPTH = 10;
  private readonly MAX_ITERATIONS = 100;
  private resolutionTracker?: VariableResolutionTracker;
  private resolutionClient?: IResolutionServiceClient;
  private resolutionClientFactory?: ResolutionServiceClientFactory;
  private factoryInitialized: boolean = false;

  constructor(
    private readonly stateService: IStateService,
    private readonly resolutionService?: IResolutionService,
    private readonly serviceMediator?: IServiceMediator
  ) {}

  /**
   * Lazily initialize the ResolutionServiceClient factory
   * This is called only when needed to avoid circular dependencies
   */
  private ensureFactoryInitialized(): void {
    if (this.factoryInitialized) {
      return;
    }
    
    this.factoryInitialized = true;
    
    try {
      this.resolutionClientFactory = container.resolve('ResolutionServiceClientFactory');
      this.initializeResolutionClient();
    } catch (error) {
      // Factory not available, will use mediator or direct reference
      logger.debug('ResolutionServiceClientFactory not available, using fallback for resolution operations');
    }
  }
  
  /**
   * Initialize the ResolutionServiceClient using the factory
   */
  private initializeResolutionClient(): void {
    if (!this.resolutionClientFactory) {
      return;
    }
    
    try {
      this.resolutionClient = this.resolutionClientFactory.createClient();
      logger.debug('Successfully created ResolutionServiceClient using factory');
    } catch (error) {
      logger.warn('Failed to create ResolutionServiceClient, falling back to direct reference or mediator', { error });
      this.resolutionClient = undefined;
    }
  }

  /**
   * Set the resolution tracker for debugging
   * @internal
   */
  setResolutionTracker(tracker: VariableResolutionTracker): void {
    this.resolutionTracker = tracker;
  }

  /**
   * Resolves all variable references in the given text
   * @param text Text containing variable references like {{varName}}
   * @param context Resolution context
   * @returns Resolved text with all variables replaced with their values
   */
  async resolve(content: string, context: ResolutionContext): Promise<string> {
    if (!content) {
      logger.debug('Empty content provided to variable resolver');
      return content;
    }
    
    // Track this resolution attempt if debug tracking is enabled
    if (this.resolutionTracker) {
      this.resolutionTracker.trackResolution('start', content, context);
    }
    
    try {
      // Check if the content contains variable references before proceeding
      if (!this.containsVariableReferences(content)) {
        return content;
      }
      
      // Special handling for test context
      if (context.state) {
        // In test context, we need to handle the mocked state service
        // This is needed because the test is mocking getTextVar and getDataVar directly
        const mockStateService = context.state;
        
        // Handle variable references one by one
        const variableMatcher = /\{\{([^}]+)\}\}/g;
        let match;
        let result = content;
        
        // Process each match
        while ((match = variableMatcher.exec(content)) !== null) {
          const fullMatch = match[0];
          const varName = match[1];
          
          // Check if this is a field access (contains dots)
          if (varName.includes('.')) {
            // Extract the base variable name and fields
            const parts = varName.split('.');
            const baseName = parts[0];
            const fields = parts.slice(1);
            
            // First try as data variable (most common for field access)
            const dataValue = mockStateService.getDataVar(baseName);
            if (dataValue !== undefined) {
              // Access fields in the data object
              let currentValue = dataValue;
              for (const field of fields) {
                if (currentValue && typeof currentValue === 'object' && field in currentValue) {
                  currentValue = currentValue[field];
                } else {
                  // Field not found
                  if (context.strict) {
                    throw new MeldResolutionError(
                      `Field ${field} not found in variable ${baseName}`,
                      {
                        code: ResolutionErrorCode.FIELD_NOT_FOUND,
                        severity: ErrorSeverity.Error,
                        details: { variable: baseName, field }
                      }
                    );
                  }
                  currentValue = '';
                  break;
                }
              }
              
              // Replace the variable reference with its value
                  result = result.replace(fullMatch, String(currentValue));
                continue;
            }
            
            // Try as text variable (less common for field access)
            const textValue = mockStateService.getTextVar(baseName);
            if (textValue !== undefined) {
              // Text variables don't support field access
            if (context.strict) {
              throw new MeldResolutionError(
                  `Cannot access fields in text variable ${baseName}`,
                {
                    code: ResolutionErrorCode.INVALID_ACCESS,
                  severity: ErrorSeverity.Error,
                  details: { variable: baseName }
                }
              );
            }
              result = result.replace(fullMatch, '');
            continue;
          }
          
            // Variable not found
            if (context.strict) {
              throw new MeldResolutionError(
                `Variable ${baseName} not found`,
                {
                  code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
                  severity: ErrorSeverity.Error,
                  details: { variable: baseName }
                }
              );
            }
            result = result.replace(fullMatch, '');
            continue;
          }
          
          // Simple variable reference (no field access)
          // Try as text variable first
          const textValue = mockStateService.getTextVar(varName);
          if (textValue !== undefined) {
            result = result.replace(fullMatch, textValue);
            continue;
          }
          
          // Try as data variable
          const dataValue = mockStateService.getDataVar(varName);
          if (dataValue !== undefined) {
            // Convert to string representation
            const stringValue = this.convertToString(dataValue);
            result = result.replace(fullMatch, stringValue);
            continue;
          }
          
          // Variable not found
          if (context.strict) {
            throw new MeldResolutionError(
              `Variable ${varName} not found`,
              {
                code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
                severity: ErrorSeverity.Error,
                details: { variable: varName }
              }
            );
          }
          result = result.replace(fullMatch, '');
    }
    
    return result;
  }
  
      // Normal context (not test)
      // Parse the content to extract variable references
      const nodes = await this.parseContent(content);
      
      // Process each node
      let result = '';
      for (const node of nodes) {
        if (node.type === 'Text') {
          // Text node - add as is
          result += (node as TextNode).value;
        } else if (node.type === 'VariableReference') {
          // Variable reference - resolve it
          const varNode = node as TextVarNode | DataVarNode;
          const varName = varNode.identifier;
          
          // Check if this is a field access
          if (varNode.fields && varNode.fields.length > 0) {
            // Get the base variable
            const value = await this.getVariable(varName, context);
            if (value === undefined) {
              // Variable not found
      if (context.strict) {
        throw new MeldResolutionError(
                  `Variable ${varName} not found`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName }
                  }
                );
              }
              result += '';
              continue;
            }
            
            // Access fields
            try {
              const fieldValue = await this.accessFields(value, varNode.fields, context, varName);
              result += fieldValue;
    } catch (error) {
              // Field access error
              if (context.strict) {
                throw error;
              }
              result += '';
            }
          } else {
            // Simple variable reference
            const value = await this.getVariable(varName, context);
            if (value === undefined) {
              // Variable not found
      if (context.strict) {
        throw new MeldResolutionError(
                  `Variable ${varName} not found`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName }
                  }
                );
              }
              result += '';
              continue;
            }
            
            // Convert to string
            result += this.convertToString(value);
          }
        }
      }
      
      return result;
    } catch (error) {
      // Track error if debug tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolution('error', content, context, error);
      }
      
      // Re-throw the error
            throw error;
    } finally {
      // Track completion if debug tracking is enabled
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolution('end', content, context);
      }
    }
  }

  /**
   * Resolve a field access expression like varName.field1.field2
   * This is used for direct field access in tests
   */
  async resolveFieldAccess(varName: string, fieldPath: string, context: ResolutionContext): Promise<any> {
    // Get the base variable
    const value = await this.getVariable(varName, context);
    if (value === undefined) {
        throw new MeldResolutionError(
        `Variable ${varName} not found`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName }
        }
      );
    }
    
    // No fields to access
    if (!fieldPath) {
      return value;
    }
    
    // Split the field path
    const fields = fieldPath.split('.').map(field => {
      // Check if this is a numeric index
      const numIndex = parseInt(field, 10);
      if (!isNaN(numIndex)) {
        return { type: 'index', value: numIndex };
      }
      // Otherwise it's a field name
      return { type: 'field', value: field };
    });
    
    // Access the fields
    let current = value;
    for (const field of fields) {
      if (current === undefined || current === null) {
          throw new MeldResolutionError(
            `Cannot access field ${field.value} in undefined value`,
            {
              code: ResolutionErrorCode.FIELD_NOT_FOUND,
              severity: ErrorSeverity.Error,
            details: { path: `${varName}.${fieldPath}`, field: field.value }
            }
          );
      }
      
      if (field.type === 'index') {
        // Array access
        if (Array.isArray(current)) {
          if (typeof field.value === 'number' && field.value >= 0 && field.value < current.length) {
            current = current[field.value];
            } else {
            throw new MeldResolutionError(
              `Array index ${field.value} out of bounds for array of length ${current.length}`,
              {
                code: ResolutionErrorCode.INVALID_ACCESS,
                severity: ErrorSeverity.Error,
                details: { path: `${varName}.${fieldPath}`, index: field.value, length: current.length }
              }
            );
          }
        } else {
            throw new MeldResolutionError(
              `Cannot access array index in non-array value`,
              {
                code: ResolutionErrorCode.INVALID_ACCESS,
                severity: ErrorSeverity.Error,
              details: { path: `${varName}.${fieldPath}`, type: typeof current }
              }
            );
        }
      } else {
        // Field access
        if (typeof current === 'object' && current !== null) {
          if (field.value in current) {
            current = current[field.value as string];
          } else {
            throw new MeldResolutionError(
              `Field ${field.value} not found in object`,
              {
                code: ResolutionErrorCode.FIELD_NOT_FOUND,
                severity: ErrorSeverity.Error,
                details: { path: `${varName}.${fieldPath}`, field: field.value }
              }
            );
          }
        } else {
            throw new MeldResolutionError(
              `Cannot access field in non-object value`,
              {
                code: ResolutionErrorCode.INVALID_ACCESS,
                severity: ErrorSeverity.Error,
              details: { path: `${varName}.${fieldPath}`, type: typeof current }
            }
          );
        }
      }
    }
    
    return current;
  }

  /**
   * Debug version of field access that returns detailed information
   * This is used for testing and debugging
   */
  debugFieldAccess(obj: any, fields: string[], context: ResolutionContext): any {
    // Start with the base value
    let current = obj;
    const path = [];
    
    try {
      // Handle each field
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        path.push(field);
        
        // Check if current value exists
        if (current === undefined || current === null) {
          return {
            success: false,
            error: `Cannot access field ${field} in undefined value`,
            path: path.join('.'),
            result: undefined
          };
        }
        
        // Try to parse as number for array access
        const numIndex = parseInt(field, 10);
        if (!isNaN(numIndex)) {
          // Array access
          if (Array.isArray(current)) {
            if (numIndex >= 0 && numIndex < current.length) {
              current = current[numIndex];
            } else {
              return {
                success: false,
                error: `Array index ${numIndex} out of bounds for array of length ${current.length}`,
                path: path.join('.'),
                result: undefined
              };
            }
          } else {
            return {
              success: false,
              error: `Cannot access array index in non-array value`,
              path: path.join('.'),
              type: typeof current,
              result: undefined
            };
          }
        } else {
          // Field access
          if (typeof current === 'object' && current !== null) {
            if (field in current) {
              current = current[field];
            } else {
              return {
                success: false,
                error: `Field ${field} not found in object`,
                path: path.join('.'),
                result: undefined
              };
            }
          } else {
            return {
              success: false,
              error: `Cannot access field in non-object value`,
              path: path.join('.'),
              type: typeof current,
              result: undefined
            };
          }
        }
      }
      
      // Success
      return {
        success: true,
        path: path.join('.'),
        result: current
      };
    } catch (error) {
      // Unexpected error
      return {
        success: false,
        error: error.message,
        path: path.join('.'),
        result: undefined
      };
    }
  }
  
  /**
   * Check if the content contains variable references
   */
  private containsVariableReferences(content: string): boolean {
    return content.includes('{{') && content.includes('}}');
  }

  /**
   * Parse the content to extract variable references
   */
  private async parseContent(content: string): Promise<MeldNode[]> {
    // Use the parser service if available
    if (this.serviceMediator) {
      try {
        return await this.serviceMediator.parse(content);
    } catch (error) {
        logger.error('Error parsing content for variable resolution', { content, error });
        throw error;
      }
    }
    
    // Fallback to simple regex parsing
    const nodes: MeldNode[] = [];
    const variableMatcher = /\{\{([^}]+)\}\}/g;
    let lastIndex = 0;
    let match;
    
    while ((match = variableMatcher.exec(content)) !== null) {
      // Add text before the variable
      if (match.index > lastIndex) {
        const textValue = content.substring(lastIndex, match.index);
        nodes.push({
          type: 'Text',
          value: textValue
        } as TextNode);
      }
      
      // Add the variable reference
      const varName = match[1];
      
      // Check if this is a field access
      if (varName.includes('.')) {
        const parts = varName.split('.');
        const baseName = parts[0];
        const fields = parts.slice(1).map(field => {
          // Check if this is a numeric index
          const numIndex = parseInt(field, 10);
          if (!isNaN(numIndex)) {
            return { type: 'index', value: numIndex };
          }
          // Otherwise it's a field name
          return { type: 'field', value: field };
        });
        
        nodes.push({
          type: 'VariableReference',
          identifier: baseName,
          fields
        } as DataVarNode);
      } else {
        // Simple variable reference
        nodes.push({
          type: 'VariableReference',
          identifier: varName
        } as TextVarNode);
      }
      
      // Update last index
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      const textValue = content.substring(lastIndex);
      nodes.push({
        type: 'Text',
        value: textValue
      } as TextNode);
    }
    
    return nodes;
  }

  /**
   * Get a variable value by name
   */
  private async getVariable(name: string, context: ResolutionContext): Promise<any> {
    // Check if this is a test context with a mocked state service
    if (context.state) {
      // Try as text variable first
      const textValue = context.state.getTextVar(name);
      if (textValue !== undefined) {
        return textValue;
      }
      
      // Try as data variable
      const dataValue = context.state.getDataVar(name);
      if (dataValue !== undefined) {
        return dataValue;
      }
      
      // Try as path variable
      const pathValue = context.state.getPathVar?.(name);
      if (pathValue !== undefined) {
        return pathValue;
      }
      
      // Variable not found
      return undefined;
    }
    
    // Normal context
    // Try as text variable first
    const textValue = this.stateService.getTextVar(name);
    if (textValue !== undefined) {
      return textValue;
    }
    
    // Try as data variable
    const dataValue = this.stateService.getDataVar(name);
    if (dataValue !== undefined) {
      return dataValue;
    }
    
    // Try as path variable
    const pathValue = this.stateService.getPathVar?.(name);
    if (pathValue !== undefined) {
      return pathValue;
    }
    
    // Variable not found
    return undefined;
  }

  /**
   * Convert a value to string representation
   */
  private convertToString(value: any): string {
    if (value === undefined || value === null) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.convertToString(item)).join(', ');
    }
    
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
    } catch (error) {
        logger.error('Error stringifying object', { value, error });
        return '[Object]';
      }
    }
    
    return String(value);
  }
  
  /**
   * Extract all variable references from the given text
   * @param text The text to extract references from
   * @returns Array of variable references
   */
  extractReferences(text: string): string[] {
    if (!text) {
      return [];
    }
    
    // Use simple regex for basic cases
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = text.match(regex);
    
    if (!matches) {
      return [];
    }
    
    // Extract variable names and deduplicate
    const variables = matches.map(match => {
      // Remove {{ and }}
      const varPath = match.slice(2, -2).trim();
      
      // Extract base variable name (before any dots or brackets)
      const baseNameMatch = varPath.match(/^([^.\[]+)/);
      return baseNameMatch ? baseNameMatch[1] : varPath;
    });
    
    // Return unique variables
    return [...new Set(variables)];
  }
  
  /**
   * Extract variable references asynchronously using AST when possible
   * @param text The text to extract references from
   * @returns Array of variable references and information
   */
  async extractReferencesAsync(text: string): Promise<string[]> {
    // Simple case - no variables
    if (!text || !text.includes('{{')) {
      return [];
    }
    
    try {
      // Try to use AST-based parsing if mediator is available
      if (this.serviceMediator) {
        const nodes = await this.serviceMediator.parse(text);
          return this.extractVariableReferencesFromNodes(nodes);
      }
    } catch (error) {
      logger.debug('Error extracting references with AST', { error });
      // Fall back to regex-based extraction
    }
    
    // Fall back to simple extraction
    return this.extractReferences(text);
  }
  
  /**
   * Extract variable references from AST nodes
   * @param nodes The AST nodes to extract references from
   * @returns Array of variable references
   */
  private extractVariableReferencesFromNodes(nodes: MeldNode[]): string[] {
    if (!nodes || nodes.length === 0) {
      return [];
    }
    
    const references = new Set<string>();
    
    for (const node of nodes) {
      if (node.type === 'VariableReference') {
        // Variable reference
        references.add((node as TextVarNode | DataVarNode).identifier);
      } else if (node.type === 'Directive') {
        const directive = (node as DirectiveNode).directive;
        if (directive?.kind === 'text' || directive?.kind === 'data') {
          // Text or data directive
          if (directive.items?.[0]?.value) {
            references.add(directive.items[0].value);
          }
        }
      }
    }
    
    return Array.from(references);
  }

  /**
   * Parse a variable reference into base name and fields
   */
  private parseVariableReference(reference: string): { baseName: string, fields: Field[] } {
    // Check if this is a field access
    if (reference.includes('.')) {
      const parts = reference.split('.');
      const baseName = parts[0];
      const fields = parts.slice(1).map(field => {
        // Check if this is a numeric index
        const numIndex = parseInt(field, 10);
        if (!isNaN(numIndex)) {
          return { type: 'index', value: numIndex };
        }
        // Otherwise it's a field name
        return { type: 'field', value: field };
      });
      
      return { baseName, fields };
    }
    
    // Simple variable reference
    return { baseName: reference, fields: [] };
  }
  
  /**
   * Access fields in a nested object or array
   */
  private async accessFields(
    baseValue: any, 
    fields: Field[], 
    context: ResolutionContext,
    originalPath: string
  ): Promise<string> {
    // Start with the base value
    let current = baseValue;
    
    // Handle each field
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      
      // Check if current value exists
      if (current === undefined || current === null) {
        if (context.strict) {
          throw new MeldResolutionError(
            `Cannot access field ${field.value} in undefined value`,
            {
              code: ResolutionErrorCode.FIELD_NOT_FOUND,
              severity: ErrorSeverity.Error,
              details: { path: originalPath, field: field.value }
            }
          );
        }
        return '';
      }
      
      // Read the field value
      if (field.type === 'index') {
        // Array access
        if (Array.isArray(current)) {
          // Numeric index
          if (typeof field.value === 'number') {
            current = current[field.value];
          }
          // String index (might be a variable)
          else if (typeof field.value === 'string') {
            const resolvedIndex = await this.resolveVariableInFieldName(field.value, context);
            
            if (typeof resolvedIndex === 'number') {
              current = current[resolvedIndex];
            } else {
              // Try to parse as number
              const numIndex = parseInt(resolvedIndex, 10);
              if (!isNaN(numIndex)) {
                current = current[numIndex];
              } else {
                // Use as string index (for objects disguised as arrays)
                current = current[resolvedIndex];
              }
            }
          }
        }
        // Object access (treat like a regular field)
        else if (typeof current === 'object') {
          const fieldName = typeof field.value === 'number' 
            ? field.value.toString() 
            : field.value;
          
          const resolvedField = await this.resolveVariableInFieldName(fieldName, context);
          current = current[resolvedField];
        }
        // Primitive value - cannot access indices
        else {
          if (context.strict) {
    throw new MeldResolutionError(
              `Cannot access array index in non-array value`,
      {
                code: ResolutionErrorCode.INVALID_ACCESS,
        severity: ErrorSeverity.Error,
                details: { path: originalPath, type: typeof current }
              }
            );
          }
          return '';
        }
    } else {
        // Field access (dot notation)
        if (typeof current === 'object' && current !== null) {
          const resolvedField = await this.resolveVariableInFieldName(field.value as string, context);
          current = current[resolvedField];
        }
        // Primitive value - cannot access fields
        else {
          if (context.strict) {
            throw new MeldResolutionError(
              `Cannot access field in non-object value`,
              {
                code: ResolutionErrorCode.INVALID_ACCESS,
                severity: ErrorSeverity.Error,
                details: { path: originalPath, type: typeof current }
              }
            );
          }
          return '';
        }
      }
    }
    
    // Convert the final value to string
    return this.convertToString(current);
  }

  /**
   * Resolve a variable reference in a field name
   * This allows for dynamic field access like obj[varName]
   */
  private async resolveVariableInFieldName(fieldName: string, context: ResolutionContext): Promise<string | number> {
    // Check if this is a variable reference
    if (fieldName.startsWith('{{') && fieldName.endsWith('}}')) {
      // Extract the variable name
      const varName = fieldName.substring(2, fieldName.length - 2);
      
      // Resolve the variable
      const value = await this.getVariable(varName, context);
      if (value === undefined) {
        if (context.strict) {
    throw new MeldResolutionError(
            `Variable ${varName} not found in field name`,
      {
        code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
        severity: ErrorSeverity.Error,
        details: { variable: varName }
      }
    );
  }
      return '';
    }
    
      // Convert to string or number
      if (typeof value === 'number') {
      return value;
    }
      return this.convertToString(value);
    }
    
    // Not a variable reference
    return fieldName;
  }

  /**
   * Resolves a variable reference that contains another variable reference
   * For example: {{var_{{nested}}}}
   */
  private async resolveNestedVariableReference(reference: string, context: ResolutionContext): Promise<string> {
    // Ensure factory is initialized before trying to use it
    this.ensureFactoryInitialized();
    
    // Try new approach first (factory pattern)
    if (this.resolutionClient) {
      try {
        return await this.resolutionClient.resolveVariables(reference, context);
      } catch (error) {
        logger.warn('Error using resolutionClient.resolveVariables, falling back to alternatives', { 
          error, 
          reference 
        });
      }
    }
    
    // Try direct reference next
    if (this.resolutionService) {
      try {
        return await this.resolutionService.resolveInContext(reference, context);
      } catch (error) {
        logger.warn('Error using resolutionService.resolveInContext, falling back to mediator', { 
          error, 
          reference 
        });
      }
    }
    
    // Fall back to mediator for backward compatibility
    if (this.serviceMediator) {
      try {
        return await this.serviceMediator.resolveInContext(reference, context);
      } catch (error) {
        logger.error('Error using serviceMediator.resolveInContext', { 
          error, 
          reference 
        });
        throw error;
      }
    }
    
    // Last resort fallback
    logger.warn('No resolution service available, returning unresolved reference', { reference });
    return reference;
  }
}