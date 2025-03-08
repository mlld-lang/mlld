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

  constructor(
    private readonly stateService: IStateService,
    private readonly resolutionService?: IResolutionService,
    private readonly serviceMediator?: IServiceMediator
  ) {}

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
      // First try the regex approach for performance
      // Only use AST-based parsing if regex fails or for complex cases
      let resolved = await this.resolveWithRegEx(content, context);
      
      // Check if we need to use AST approach
      if (this.needsAstResolution(resolved)) {
        // Fall back to AST-based resolution
        resolved = await this.resolveWithAst(content, context);
      }
      
      // Track successful resolution
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolution('success', content, context, resolved);
      }
      
      return resolved;
    } catch (error) {
      // Track failed resolution
      if (this.resolutionTracker) {
        this.resolutionTracker.trackResolution('error', content, context, undefined, error as Error);
      }
      
      // Re-throw the error
      throw error;
    }
  }
  
  /**
   * Determines if a string needs AST-based resolution
   * Regex-based resolution doesn't handle all cases correctly
   */
  private needsAstResolution(content: string): boolean {
    // Look for problematic patterns that regex can't handle well
    
    // 1. Deeply nested objects with multiple brackets
    if (content.includes('{{') && content.includes('}}') && content.includes('.')) {
      return true;
    }
    
    // 2. Array access syntax that might be ambiguous
    if (content.includes('[') && content.includes(']')) {
      return true;
    }
    
    // 3. Instances where regex might over-capture
    const openBraceCount = (content.match(/\{/g) || []).length;
    const closeBraceCount = (content.match(/\}/g) || []).length;
    if (openBraceCount > 2 || closeBraceCount > 2) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Resolves variable references in text using regex
   * Faster than AST-based resolution for simple cases
   */
  private async resolveWithRegEx(content: string, context: ResolutionContext): Promise<string> {
    // Bail out early for empty strings
    if (!content.trim()) {
      return content;
    }
    
    let result = content;
    let iteration = 0;
    const variableMatcher = /\$\{([^}]+)\}|\$\{\{([^}]+)\}\}/g;
    
    // Keep resolving until no more matches are found or we hit the max iterations
    while (variableMatcher.test(result) && iteration < this.MAX_ITERATIONS) {
      // Reset the regex for the next iteration
      variableMatcher.lastIndex = 0;
      
      // Replace all matches in this iteration
      result = await this.replaceAsync(result, variableMatcher, async (match, textGroup, dataGroup) => {
        try {
          const varName = textGroup || dataGroup;
          if (!varName) {
            return match;
          }
          
          // Detect variable type from the match pattern
          const isDataVariable = match.startsWith('${{');
          
          // Resolve the variable using the appropriate method
          let value: string;
          if (isDataVariable) {
            value = await this.resolveData(varName, context);
          } else {
            value = await this.resolveText(varName, context);
          }
          
          return value;
        } catch (error) {
          logger.warn(`Error resolving variable in regex mode: ${match}`, { error });
          // Keep the original text for this variable if resolution fails
          return match;
        }
      });
      
      iteration++;
    }
    
    // If we hit the max iterations, there might be a circular reference
    if (iteration >= this.MAX_ITERATIONS) {
      logger.warn(`Possible circular reference in content: ${content}`);
    }
    
    return result;
  }
  
  /**
   * Helper for async string replacement with regex
   */
  private async replaceAsync(
    str: string,
    regex: RegExp,
    asyncFn: (match: string, ...groups: string[]) => Promise<string>
  ): Promise<string> {
    // Reset regex state
    regex.lastIndex = 0;
    
    const promises: Promise<{index: number, length: number, replacement: string}>[] = [];
    let match: RegExpExecArray | null;
    
    // Collect all matches and their replacements asynchronously
    while ((match = regex.exec(str)) !== null) {
      const startIndex = match.index;
      const matchLength = match[0].length;
      
      promises.push(
        asyncFn(match[0], ...match.slice(1))
          .then(replacement => ({
            index: startIndex,
            length: matchLength,
            replacement
          }))
      );
    }
    
    // Wait for all replacements to complete
    const results = await Promise.all(promises);
    
    // Sort replacements by index in descending order to avoid position shifts
    results.sort((a, b) => b.index - a.index);
    
    // Apply replacements from end to start
    let result = str;
    for (const {index, length, replacement} of results) {
      result = result.slice(0, index) + replacement + result.slice(index + length);
    }
    
    return result;
  }
  
  /**
   * Resolves a text variable
   */
  private async resolveText(varName: string, context: ResolutionContext): Promise<string> {
    if (!varName || !varName.trim()) {
      return '';
    }
    
    try {
      // Parse to handle nested variables
      if (this.needsAstForVariableName(varName)) {
        return this.resolveTextAsAst(varName, context);
      }
      
      // Check if this is a nested variable (field access)
      if (varName.includes('.') || (varName.includes('[') && varName.includes(']'))) {
        return this.resolveNestedVariable(varName, context, 'text');
      }
      
      // Simple variable lookup
      const value = await this.lookupTextVariable(varName, context);
      
      // Convert to string if needed
      return this.ensureString(value);
    } catch (error) {
      logger.debug(`Error resolving text variable: ${varName}`, { error });
      // Return empty string or throw depending on strict mode
      if (context.strict) {
        throw new MeldResolutionError(
          `Failed to resolve text variable: ${varName}`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName }
          },
          error as Error
        );
      }
      return '';
    }
  }
  
  /**
   * Check if a variable name itself needs AST parsing
   */
  private needsAstForVariableName(varName: string): boolean {
    // Look for patterns suggesting nested variables
    return (
      varName.includes('${') || 
      varName.includes('${{') || 
      (varName.includes('[') && varName.includes('${'))
    );
  }
  
  /**
   * Resolves a text variable using AST parsing
   */
  private async resolveTextAsAst(varName: string, context: ResolutionContext): Promise<string> {
    try {
      // Parse the text to find variable nodes
      const nodes = await this.serviceMediator?.parseForResolution(varName);
      
      // If AST parsing succeeds, this is a complex variable with nesting
      if (nodes && nodes.length > 0) {
        // First, resolve any nested variables in the variable name
        let resolvedName = '';
        for (const node of nodes) {
          if (node.type === 'Text') {
            resolvedName += node.content;
          } else if (node.type === 'TextVar' && 'name' in node) {
            const nestedVarName = (node as any).name;
            const resolved = await this.resolveText(nestedVarName, context);
            resolvedName += resolved;
          } else if (node.type === 'DataVar' && 'name' in node) {
            const nestedVarName = (node as any).name;
            const resolved = await this.resolveData(nestedVarName, context);
            resolvedName += resolved;
          }
          // Other node types are ignored
        }
        
        // Now that we have a fully resolved variable name, look up its value
        if (resolvedName.includes('.') || (resolvedName.includes('[') && resolvedName.includes(']'))) {
          return this.resolveNestedVariable(resolvedName, context, 'text');
        }
        
        return this.ensureString(await this.lookupTextVariable(resolvedName, context));
      }
      
      // Fallback if AST parsing fails
      return this.ensureString(await this.lookupTextVariable(varName, context));
    } catch (error) {
      logger.debug(`Error resolving text variable with AST: ${varName}`, { error });
      // Fallback to simple lookup if AST parsing fails
      return this.ensureString(await this.lookupTextVariable(varName, context));
    }
  }
  
  /**
   * Resolves a data variable
   */
  private async resolveData(varName: string, context: ResolutionContext): Promise<string> {
    if (!varName || !varName.trim()) {
      return '';
    }
    
    try {
      // Parse to handle nested variables
      if (this.needsAstForVariableName(varName)) {
        return this.resolveDataAsAst(varName, context);
      }
      
      // Check if this is a nested variable (field access)
      if (varName.includes('.') || (varName.includes('[') && varName.includes(']'))) {
        return this.resolveNestedVariable(varName, context, 'data');
      }
      
      // Simple variable lookup
      const value = await this.lookupDataVariable(varName, context);
      
      // Convert to string if needed
      return this.ensureString(value);
    } catch (error) {
      logger.debug(`Error resolving data variable: ${varName}`, { error });
      // Return empty string or throw depending on strict mode
      if (context.strict) {
        throw new MeldResolutionError(
          `Failed to resolve data variable: ${varName}`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName }
          },
          error as Error
        );
      }
      return '';
    }
  }
  
  /**
   * Resolves a data variable using AST parsing
   */
  private async resolveDataAsAst(varName: string, context: ResolutionContext): Promise<string> {
    try {
      // Parse the data variable for nested variables
      const nodes = await this.serviceMediator?.parseForResolution(varName);
      
      // If AST parsing succeeds, this is a complex variable with nesting
      if (nodes && nodes.length > 0) {
        // First, resolve any nested variables in the variable name
        let resolvedName = '';
        for (const node of nodes) {
          if (node.type === 'Text') {
            resolvedName += node.content;
          } else if (node.type === 'TextVar' && 'name' in node) {
            const nestedVarName = (node as any).name;
            const resolved = await this.resolveText(nestedVarName, context);
            resolvedName += resolved;
          } else if (node.type === 'DataVar' && 'name' in node) {
            const nestedVarName = (node as any).name;
            const resolved = await this.resolveData(nestedVarName, context);
            resolvedName += resolved;
          }
          // Other node types are ignored
        }
        
        // Now that we have a fully resolved variable name, look up its value
        if (resolvedName.includes('.') || (resolvedName.includes('[') && resolvedName.includes(']'))) {
          return this.resolveNestedVariable(resolvedName, context, 'data');
        }
        
        return this.ensureString(await this.lookupDataVariable(resolvedName, context));
      }
      
      // Fallback if AST parsing fails
      return this.ensureString(await this.lookupDataVariable(varName, context));
    } catch (error) {
      logger.debug(`Error resolving data variable with AST: ${varName}`, { error });
      // Fallback to simple lookup if AST parsing fails
      return this.ensureString(await this.lookupDataVariable(varName, context));
    }
  }
  
  /**
   * Resolves a nested variable (with dot notation or array access)
   */
  private async resolveNestedVariable(
    varName: string, 
    context: ResolutionContext, 
    type: 'text' | 'data' | 'any'
  ): Promise<string> {
    try {
      // Parse the variable path
      const { baseName, fields } = this.parseVariablePath(varName);
      
      // Get the base value
      let value: any;
      
      if (type === 'text' || type === 'any') {
        // Try as text variable first
        try {
          value = await this.lookupTextVariable(baseName, context);
        } catch (error) {
          // If text fails, try data (when type is 'any')
          if (type === 'any') {
            value = await this.lookupDataVariable(baseName, context);
          } else {
            throw error;
          }
        }
      } else {
        // Lookup as data variable
        value = await this.lookupDataVariable(baseName, context);
      }
      
      // Access fields
      return this.accessFields(value, fields, context, varName);
    } catch (error) {
      logger.debug(`Error resolving nested variable: ${varName}`, { error });
      
      // Return empty string or throw depending on strict mode
      if (context.strict) {
        throw new MeldResolutionError(
          `Failed to resolve nested variable: ${varName}`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName }
          },
          error as Error
        );
      }
      return '';
    }
  }
  
  /**
   * Parse a variable path into base name and fields
   * Handles both dot notation and array access syntax
   */
  private parseVariablePath(variablePath: string): { baseName: string; fields: Field[] } {
    const fields: Field[] = [];
    let currentPos = 0;
    let inBracket = false;
    let currentToken = '';
    let baseName = '';
    
    // Process character by character
    for (let i = 0; i < variablePath.length; i++) {
      const char = variablePath[i];
      
      if (char === '[' && !inBracket) {
        // Start of bracket notation
        if (currentPos === 0) {
          // This is the base name
          baseName = currentToken;
        } else {
          // This was a field accessed by dot notation
          fields.push({ type: 'field', value: currentToken });
        }
        currentToken = '';
        inBracket = true;
      } else if (char === ']' && inBracket) {
        // End of bracket notation
        // Determine if this is an integer index or a string
        const isNumeric = /^[0-9]+$/.test(currentToken);
        fields.push({
          type: 'index',
          value: isNumeric ? parseInt(currentToken, 10) : currentToken
        });
        currentToken = '';
        inBracket = false;
      } else if (char === '.' && !inBracket) {
        // Dot notation field separator
        if (currentPos === 0) {
          // This is the base name
          baseName = currentToken;
          currentPos = 1;
        } else {
          // This was a field
          fields.push({ type: 'field', value: currentToken });
        }
        currentToken = '';
      } else {
        // Part of the current token
        currentToken += char;
      }
    }
    
    // Handle any remaining token
    if (currentToken) {
      if (currentPos === 0) {
        // This is the base name
        baseName = currentToken;
      } else {
        // This was a field
        fields.push({ type: 'field', value: currentToken });
      }
    }
    
    return { baseName, fields };
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
    return this.ensureString(current);
  }
  
  /**
   * Resolve a variable in a field name, if present
   * This handles things like a[${index}] or a[${someVar}]
   */
  private async resolveVariableInFieldName(
    fieldName: string,
    context: ResolutionContext
  ): Promise<string | number> {
    // Check if field name contains variables
    if (fieldName.includes('${') || fieldName.includes('${{')) {
      // Try to parse and resolve
      try {
        const resolved = await this.resolveSimpleVariables(fieldName, context);
        // Check if result is a number
        const num = Number(resolved);
        if (!isNaN(num)) {
          return num;
        }
        return resolved;
      } catch (error) {
        logger.debug(`Error resolving variable in field name: ${fieldName}`, { error });
        // Return the original field name if resolution fails
        return fieldName;
      }
    }
    // No variables, return as is
    return fieldName;
  }
  
  /**
   * Resolve simple variable references in a string
   * Used for handling variables within field names
   */
  private async resolveSimpleVariables(
    text: string,
    context: ResolutionContext
  ): Promise<string> {
    if (!text.includes('${') && !text.includes('${{')) {
      return text;
    }
    
    try {
      // If no ServiceMediator available, throw an error
      if (!this.serviceMediator) {
        throw new MeldResolutionError(
          'ServiceMediator is required for variable resolution',
          {
            code: ResolutionErrorCode.RESOLUTION_FAILED,
            severity: ErrorSeverity.Fatal,
            details: { value: 'ServiceMediator not available' }
          }
        );
      }
      
      // Store the original value in case we need to recover
      const original = text;
      
      // Extract variables as AST nodes
      const variables = await this.extractReferencesAst(text);
      
      // If no variables found, return as is
      if (!variables.length) {
        return text;
      }
      
      // Replace variables with their values
      let result = text;
      for (const variable of variables) {
        // Skip if the variable doesn't look like a variable reference
        if (!variable.startsWith('${') && !variable.startsWith('${{')) {
          continue;
        }
        
        let value = '';
        
        try {
          // Split into variable type and name
          if (variable.startsWith('${{')) {
            // Data variable
            const varName = variable.substring(3, variable.length - 2);
            value = await this.resolveData(varName, context);
          } else {
            // Text variable
            const varName = variable.substring(2, variable.length - 1);
            value = await this.resolveText(varName, context);
          }
          
          // Replace the variable with its value
          result = result.replace(variable, value);
        } catch (error) {
          logger.debug(`Error resolving variable: ${variable}`, { error });
          // Keep the original reference in case of error
          continue;
        }
      }
      
      return result;
    } catch (error) {
      logger.debug(`Error in resolveSimpleVariables: ${text}`, { error });
      return text;
    }
  }
  
  /**
   * Extract variable references from a string using AST parsing
   */
  private async extractReferencesAst(text: string): Promise<string[]> {
    try {
      // Check if service mediator is available
      if (!this.serviceMediator) {
        throw new Error('ServiceMediator is required for variable resolution');
      }
      
      // Use the mediator to get AST nodes
      const nodes = await this.serviceMediator.parseForResolution(text);
      
      return this.extractVariableReferencesFromNodes(nodes);
    } catch (error) {
      logger.debug(`Error extracting references from AST: ${text}`, { error });
      
      // Fallback to simpler method if AST parsing fails
      return this.extractReferencesSimple(text);
    }
  }
  
  /**
   * Extract variable references from a string using regex
   */
  private extractReferencesSimple(text: string): string[] {
    const references: string[] = [];
    
    // Match ${var} syntax
    const textVarMatch = text.match(/\$\{[^}]+\}/g);
    if (textVarMatch) {
      references.push(...textVarMatch);
    }
    
    // Match ${{var}} syntax
    const dataVarMatch = text.match(/\$\{\{[^}]+\}\}/g);
    if (dataVarMatch) {
      references.push(...dataVarMatch);
    }
    
    return references;
  }
  
  /**
   * Extract variable references from AST nodes
   */
  private extractVariableReferencesFromNodes(nodes: MeldNode[]): string[] {
    const references: string[] = [];
    
    for (const node of nodes) {
      // Extract text variables
      if (node.type === 'TextVar' && 'name' in node) {
        references.push(`\${${(node as any).name}}`);
      } 
      // Extract data variables
      else if (node.type === 'DataVar' && 'name' in node) {
        references.push(`\${{${(node as any).name}}}`);
      }
      // Extract from text nodes that might contain variables
      else if (node.type === 'Text' && node.content) {
        // For text nodes, check if they might contain variables
        const textContent = node.content;
        if (textContent.includes('${') || textContent.includes('${{')) {
          try {
            // Parse the text node's content
            const subNodes = this.serviceMediator?.parseForResolution(textContent);
            if (subNodes && Array.isArray(subNodes)) {
              const subVarNodes = this.extractVariableReferencesFromNodes(subNodes);
              references.push(...subVarNodes);
            }
          } catch (error) {
            // If parsing fails, try regex extraction
            const simpleRefs = this.extractReferencesSimple(textContent);
            references.push(...simpleRefs);
          }
        }
      }
    }
    
    return references;
  }
  
  /**
   * Extract variable nodes from AST nodes
   */
  private extractVariableNodesFromAst(nodes: MeldNode[]): MeldNode[] {
    const variableNodes: MeldNode[] = [];
    
    for (const node of nodes) {
      // Extract text and data variables
      if (node.type === 'TextVar' || node.type === 'DataVar') {
        variableNodes.push(node);
      } 
      // Extract from text nodes that might contain variables
      else if (node.type === 'Text' && node.content) {
        const textContent = node.content;
        if (textContent.includes('${') || textContent.includes('${{')) {
          try {
            // Parse the text node's content
            const subNodes = this.serviceMediator?.parseForResolution(textContent);
            if (subNodes && Array.isArray(subNodes)) {
              const subVarNodes = this.extractVariableNodesFromAst(subNodes);
              variableNodes.push(...subVarNodes);
            }
          } catch (error) {
            // If parsing fails, just skip
            continue;
          }
        }
      }
    }
    
    return variableNodes;
  }
  
  /**
   * Resolve text using the AST
   * This handles complex cases that regex can't
   */
  private async resolveWithAst(text: string, context: ResolutionContext): Promise<string> {
    if (!text) {
      return text;
    }
    
    try {
      // Parse the text to get AST nodes
      const nodes = await this.serviceMediator.parseForResolution(text);
      
      let result = '';
      
      // Process each node
      for (const node of nodes) {
        if (node.type === 'Text') {
          // Text nodes can be added directly
          result += node.content;
        } else if (node.type === 'TextVar' && 'name' in node) {
          // Resolve text variables
          const varName = (node as any).name;
          const resolved = await this.resolveText(varName, context);
          result += resolved;
        } else if (node.type === 'DataVar' && 'name' in node) {
          // Resolve data variables
          const varName = (node as any).name;
          const resolved = await this.resolveData(varName, context);
          result += resolved;
        } else if (node.type === 'Directive' && (node as DirectiveNode).directive?.kind === 'text') {
          // Handle text directive nodes
          if ((node as DirectiveNode).directive?.items?.[0]?.value) {
            const varName = (node as DirectiveNode).directive.items[0].value;
            const resolved = await this.resolveText(varName, context);
            result += resolved;
          }
        } else if (node.type === 'Directive' && (node as DirectiveNode).directive?.kind === 'data') {
          // Handle data directive nodes
          if ((node as DirectiveNode).directive?.items?.[0]?.value) {
            const varName = (node as DirectiveNode).directive.items[0].value;
            const resolved = await this.resolveData(varName, context);
            result += resolved;
          }
        }
        // Other node types are ignored
      }
      
      return result;
    } catch (error) {
      logger.debug(`Error resolving with AST: ${text}`, { error });
      
      // Fallback to the original text if AST resolution fails
      return text;
    }
  }
  
  /**
   * Check if a string has variable references
   */
  async hasVariableReferences(text: string): Promise<boolean> {
    if (!text) {
      return false;
    }
    
    // Quick check using regex
    if (!text.includes('${') && !text.includes('${{')) {
      return false;
    }
    
    try {
      // Parse the text to find variable nodes
      const nodes = await this.serviceMediator?.parseForResolution(text);
      
      if (nodes && nodes.length > 0) {
        // Check for variable nodes
        return nodes.some(node => 
          node.type === 'TextVar' || 
          node.type === 'DataVar' ||
          (node.type === 'Directive' && 
           ((node as DirectiveNode).directive?.kind === 'text' || 
            (node as DirectiveNode).directive?.kind === 'data'))
        );
      }
    } catch (error) {
      // If parsing fails, check using regex
      return this.extractReferencesSimple(text).length > 0;
    }
    
    return false;
  }
  
  /**
   * Extract variable references from a string
   * Returns the list of variable references
   */
  async extractReferences(text: string): Promise<string[]> {
    // No need to process empty strings
    if (!text || !text.trim()) {
      return [];
    }
    
    try {
      return this.extractReferencesAst(text);
    } catch (error) {
      // Fallback to simple extraction
      return this.extractReferencesSimple(text);
    }
  }
  
  /**
   * Extract variable references and their corresponding variable names
   */
  async extractReferencesAsync(text: string): Promise<{ reference: string; variableName: string; }[]> {
    if (!text || !text.trim()) {
      return [];
    }
    
    try {
      // Parse the text into nodes
      const nodes = await this.serviceMediator.parseForResolution(text);
      
      const result: { reference: string; variableName: string; }[] = [];
      
      // Process each node
      for (const node of nodes) {
        if (node.type === 'TextVar' && 'name' in node) {
          // Text variable
          const varName = (node as any).name;
          result.push({
            reference: `\${${varName}}`,
            variableName: varName
          });
        } else if (node.type === 'DataVar' && 'name' in node) {
          // Data variable
          const varName = (node as any).name;
          result.push({
            reference: `\${{${varName}}}`,
            variableName: varName
          });
        } else if (node.type === 'Directive') {
          const directive = (node as DirectiveNode).directive;
          if (directive?.kind === 'text' && directive.items?.[0]?.value) {
            // Text directive
            const varName = directive.items[0].value;
            result.push({
              reference: `@text [${varName}]`,
              variableName: varName
            });
          } else if (directive?.kind === 'data' && directive.items?.[0]?.value) {
            // Data directive
            const varName = directive.items[0].value;
            result.push({
              reference: `@data [${varName}]`,
              variableName: varName
            });
          }
        }
      }
      
      return result;
    } catch (error) {
      // Fallback to regex-based extraction
      const references: { reference: string; variableName: string; }[] = [];
      
      // Extract text variables
      const textVarMatches = text.match(/\$\{([^}]+)\}/g);
      if (textVarMatches) {
        for (const match of textVarMatches) {
          const varName = match.substring(2, match.length - 1);
          references.push({
            reference: match,
            variableName: varName
          });
        }
      }
      
      // Extract data variables
      const dataVarMatches = text.match(/\$\{\{([^}]+)\}\}/g);
      if (dataVarMatches) {
        for (const match of dataVarMatches) {
          const varName = match.substring(3, match.length - 2);
          references.push({
            reference: match,
            variableName: varName
          });
        }
      }
      
      return references;
    }
  }
  
  /**
   * Look up a text variable in the state
   */
  private async lookupTextVariable(varName: string, context: ResolutionContext): Promise<any> {
    try {
      // Check in context state first
      if (context.state) {
        const value = await context.state.getText(varName);
        if (value !== undefined) {
          return value;
        }
      }
      
      // If not found and strict mode is enabled, throw an error
      if (context.strict) {
        throw new MeldResolutionError(
          `Text variable not found: ${varName}`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName, type: 'text' }
          }
        );
      }
      
      // Return empty string for not found
      return '';
    } catch (error) {
      // Rethrow error in strict mode
      if (context.strict) {
        throw error;
      }
      
      // Log and return empty string
      logger.debug(`Error looking up text variable: ${varName}`, { error });
      return '';
    }
  }
  
  /**
   * Look up a data variable in the state
   */
  private async lookupDataVariable(varName: string, context: ResolutionContext): Promise<any> {
    try {
      // Check in context state first
      if (context.state) {
        const value = await context.state.getData(varName);
        if (value !== undefined) {
          return value;
        }
      }
      
      // If not found and strict mode is enabled, throw an error
      if (context.strict) {
        throw new MeldResolutionError(
          `Data variable not found: ${varName}`,
          {
            code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
            severity: ErrorSeverity.Error,
            details: { variable: varName, type: 'data' }
          }
        );
      }
      
      // Return empty object for not found
      return {};
    } catch (error) {
      // Rethrow error in strict mode
      if (context.strict) {
        throw error;
      }
      
      // Log and return empty object
      logger.debug(`Error looking up data variable: ${varName}`, { error });
      return {};
    }
  }
  
  /**
   * Ensure a value is converted to string
   */
  private ensureString(value: any): string {
    if (value === undefined || value === null) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        logger.debug('Error stringifying object', { error });
        return '[Object]';
      }
    }
    
    // Convert other types
    return String(value);
  }
}