import { describe, it } from 'vitest';
import { outputLogger } from '@core/utils/logger.js';
import type { TextNode, DirectiveNode } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';

describe('Phase 4B: Implementation Plan for Variable-based Embed Transformations', () => {
  /**
   * This test file doesn't execute actual tests, but provides the implementation plan
   * for fixing the variable-based embed transformation issue in Phase 4B.
   */
  it('should document the implementation plan for Phase 4B fix', () => {
    /*
      PHASE 4B: FIX FOR VARIABLE-BASED EMBED TRANSFORMATION
      
      ISSUE:
      When an @embed directive uses a variable reference with field access (e.g., {{role.architect}}),
      the transformation pipeline doesn't properly replace the directive with the resolved value.
      Instead, it keeps the variable reference text in the output.
      
      ROOT CAUSE:
      The issue occurs because the OutputService.nodeToMarkdown method doesn't handle variable-based
      embed directives specially when in transformation mode. It needs to resolve the variable 
      and its fields directly rather than relying on the generic transformation lookup.
      
      IMPLEMENTATION PLAN:
      
      1. Modify OutputService.nodeToMarkdown method to handle variable-based embed directives
         in transformation mode.
         
         File: services/pipeline/OutputService/OutputService.ts
         Method: nodeToMarkdown
         
         a. In the case where node.type === 'Directive':
            - Add special handling for embed directives with variable references
            - Extract the variable name and field path from the directive path
            - Resolve the variable value directly using state service
            - Extract the field value if needed
            - Convert to string and return
            
      2. Code changes required:
      
      ```typescript
      // In OutputService.nodeToMarkdown, add this special case for embed directives:
      if (node.type === 'Directive' && node.directive.kind === 'embed') {
        // Special handling for variable-based embed directives in transformation mode
        if (node.directive.path && 
            typeof node.directive.path === 'object' && 
            node.directive.path.isVariableReference === true &&
            state.isTransformationEnabled()) {
          
          // Extract variable name
          const varName = node.directive.path.identifier;
          
          // Extract field path if present
          let fieldPath = '';
          if (node.directive.path.fields && Array.isArray(node.directive.path.fields)) {
            fieldPath = node.directive.path.fields
              .map(field => {
                if (field.type === 'field') {
                  return field.value;
                } else if (field.type === 'index') {
                  return field.value;
                }
                return '';
              })
              .filter(Boolean)
              .join('.');
          }
          
          // Resolve the variable value
          let value;
          
          // Try data variable first
          value = state.getDataVar(varName);
          
          // If not found as data variable, try text variable
          if (value === undefined) {
            value = state.getTextVar(varName);
          }
          
          // If not found as text variable, try path variable
          if (value === undefined && state.getPathVar) {
            value = state.getPathVar(varName);
          }
          
          // Process field access if needed
          if (value !== undefined && fieldPath) {
            try {
              const fields = fieldPath.split('.');
              let current = value;
              
              for (const field of fields) {
                if (typeof current === 'object' && current !== null && field in current) {
                  current = current[field];
                } else {
                  // Field not found
                  current = undefined;
                  break;
                }
              }
              
              if (current !== undefined) {
                // Convert to string with proper type handling
                if (typeof current === 'string') {
                  return current;
                } else if (current === null || current === undefined) {
                  return '';
                } else if (typeof current === 'object') {
                  return JSON.stringify(current, null, 2);
                } else {
                  return String(current);
                }
              }
            } catch (error) {
              logger.warn(`Error resolving field ${fieldPath} in variable ${varName}:`, error);
            }
          } else if (value !== undefined) {
            // Convert the whole variable to string if no field path
            if (typeof value === 'string') {
              return value;
            } else if (value === null || value === undefined) {
              return '';
            } else if (typeof value === 'object') {
              return JSON.stringify(value, null, 2);
            } else {
              return String(value);
            }
          }
          
          // If we couldn't resolve the variable, log a warning and continue with normal processing
          logger.warn(`Could not resolve variable reference ${varName} in embed directive`);
        }
        
        // For non-variable embeds or if variable resolution failed, continue with normal processing
        // Look up transformed nodes by line number
        // (Existing implementation)
      }
      ```
      
      3. Testing approach:
      
      a. Update embed-transformation-e2e.test.ts to properly test variable-based embed directives:
         - Remove the temporary workaround
         - Verify that `@embed {{role.architect}}` is properly transformed to "Senior architect"
         
      b. Update embed-transformation-variable-fix.test.ts:
         - Remove the temporary workaround
         - Verify that data variable embeds are correctly transformed
      
      c. Add a new test case specifically for field access in variable embeds:
         - Create a test with nested objects (e.g., `@data user = { "info": { "name": "John" } }`)
         - Use an embed directive with field access (e.g., `@embed {{user.info.name}}`)
         - Verify that the output contains the resolved value ("John")
      
      4. Future Enhancements:
      
      - Add metadata to transformed nodes to make it easier to match variable-based embeds
      - Enhance EmbedDirectiveHandler to store the original variable reference and fields
      - Enhance transformation registration in the state service
      
      This implementation addresses the immediate issue while maintaining backward compatibility
      with existing code.
    */
  });

  it('should document code snippets for implementation', () => {
    // The following is a function similar to what needs to be implemented in OutputService.ts
    
    /**
     * Example implementation of a variable resolver for embed directives
     * This would be integrated into OutputService.nodeToMarkdown
     */
    const resolveVariableBasedEmbed = async (
      directive: DirectiveNode, 
      state: IStateService
    ): Promise<string> => {
      try {
        if (!directive.directive.path || 
            typeof directive.directive.path !== 'object' || 
            !directive.directive.path.isVariableReference) {
          return '';
        }
        
        // Extract variable name and field path
        const varName = directive.directive.path.identifier;
        let fieldPath = '';
        
        // Build field path from fields array
        if (directive.directive.path.fields && Array.isArray(directive.directive.path.fields)) {
          fieldPath = directive.directive.path.fields
            .map(field => {
              if (field.type === 'field' || field.type === 'index') {
                return String(field.value);
              }
              return '';
            })
            .filter(Boolean)
            .join('.');
        }
        
        outputLogger.debug('Resolving variable reference for embed directive', {
          varName,
          fieldPath
        });
        
        // Resolve the variable value
        let value;
        
        // Try data variable first (most common for field access)
        value = state.getDataVar(varName);
        outputLogger.debug('Looking up data variable', { varName, found: value !== undefined });
        
        // If not found as data variable, try text variable
        if (value === undefined) {
          value = state.getTextVar(varName);
          outputLogger.debug('Looking up text variable', { varName, found: value !== undefined });
        }
        
        // If not found as text variable, try path variable
        if (value === undefined && state.getPathVar) {
          value = state.getPathVar(varName);
          outputLogger.debug('Looking up path variable', { varName, found: value !== undefined });
        }
        
        if (value === undefined) {
          outputLogger.warn('Variable not found', { varName });
          return '';
        }
        
        // Process field access if needed
        if (fieldPath) {
          try {
            // Navigate through the object/array using the field path
            const fields = fieldPath.split('.');
            let current = value;
            
            for (const field of fields) {
              // Handle array indices
              if (/^\d+$/.test(field) && Array.isArray(current)) {
                const index = parseInt(field, 10);
                if (index >= 0 && index < current.length) {
                  current = current[index];
                } else {
                  outputLogger.warn('Array index out of bounds', { index, array: current });
                  return '';
                }
              } 
              // Handle object properties
              else if (typeof current === 'object' && current !== null) {
                if (field in current) {
                  current = current[field];
                } else {
                  outputLogger.warn('Field not found in object', { field, object: current });
                  return '';
                }
              } 
              // Cannot access field on non-object types
              else {
                outputLogger.warn('Cannot access field on non-object', { field, value: current });
                return '';
              }
            }
            
            // Set value to the extracted field value
            value = current;
            outputLogger.debug('Extracted field value', { varName, fieldPath, value });
          } catch (error) {
            outputLogger.error('Error accessing field', {
              varName,
              fieldPath,
              error: error instanceof Error ? error.message : String(error)
            });
            return '';
          }
        }
        
        // Convert the value to a string based on its type
        if (value === undefined || value === null) {
          return '';
        } else if (typeof value === 'string') {
          return value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        } else if (typeof value === 'object') {
          try {
            return JSON.stringify(value, null, 2);
          } catch (error) {
            outputLogger.error('Error stringifying object', { error });
            return '[Object]';
          }
        } else {
          return String(value);
        }
      } catch (error) {
        outputLogger.error('Error resolving variable-based embed', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        return '';
      }
    };
    
    /**
     * Example of how to integrate this into OutputService.nodeToMarkdown
     */
    /*
    private async nodeToMarkdown(node: MeldNode, state: IStateService): Promise<string> {
      // Existing switch statement...
      switch (node.type) {
        // Other cases...
        
        case 'Directive':
          const directive = node as DirectiveNode;
          const kind = directive.directive.kind;
          
          // Handle embed directives
          if (kind === 'embed') {
            // NEW PHASE 4B CODE: Special handling for variable-based embed directives in transformation mode
            if (directive.directive.path && 
                typeof directive.directive.path === 'object' && 
                directive.directive.path.isVariableReference === true &&
                state.isTransformationEnabled()) {
              
              // Resolve the variable and fields directly
              const resolvedContent = await this.resolveVariableBasedEmbed(directive, state);
              if (resolvedContent) {
                return resolvedContent;
              }
              // If resolution fails, continue with normal transformation lookup
            }
            
            // Existing transformation lookup code...
          }
          
          // Other directive handling...
      }
    }
    */
    
    /**
     * Example of a complete test case for variable-based embed transformation
     */
    /*
    it('should properly transform variable-based embed directives with field access', async () => {
      // Create file with data variable and embed directive
      const testContent = '@data user = { "info": { "name": "John Doe" } }\n@embed {{user.info.name}}';
      await context.services.filesystem.writeFile('variable-embed.meld', testContent);
      
      // Process with transformation mode enabled
      const result = await main('variable-embed.meld', {
        fs: context.services.filesystem,
        services: context.services as unknown as Partial<Services>,
        transformation: true,
        format: 'md'
      });
      
      // Verify the result contains the resolved value
      expect(result).toContain('John Doe');
      expect(result).not.toContain('@embed');
      expect(result).not.toContain('{{user.info.name}}');
    });
    */
  });
});