# Variable Resolution Architecture Cleanup

## Current State: Hybrid Architecture

The Meld codebase currently uses a hybrid architecture for variable resolution, where the transition from OutputService handling resolution to ResolutionService handling it has been partially completed:

1. **Completed Transitions**:
   - Text nodes now properly delegate to ResolutionService for variable resolution
   - The `resolveVariablesInOutput` feature flag has been removed from text node handling
   - Basic resolution flows follow the proper architecture

2. **Incomplete Transitions**:
   - Embed directives with variable references (`@embed {{variable}}`) are still processed directly in OutputService 
   - OutputService creates custom resolution contexts with non-standard flags (`isInVariableContext`, `isInEmbedDirective`)
   - Special handling for array access and field access exists in both services
   - Documentation still refers to dual architectures as if they're active options

## Core Problems to Fix

1. **Architecture Violation**: OutputService is still handling variable resolution for embed directives
2. **Custom Context Creation**: OutputService manually creates contexts rather than using ResolutionContextFactory
3. **Undocumented Context Flags**: Flags like `isInVariableContext` aren't in the ResolutionContext interface
4. **Inconsistent Documentation**: References to dual architecture and feature flags that no longer exist

## Cleanup Plan

### Phase 1: Standardize Resolution Context

1. **Update ResolutionContext Interface**:
   ```typescript
   // In services/pipeline/ResolutionService/IResolutionService.ts
   interface ResolutionContext {
     // Existing fields...
     
     // Add fields currently used by OutputService
     isInVariableContext?: boolean;
     isInEmbedDirective?: boolean;
     
     // Document each field with JSDoc comments
   }
   ```

2. **Enhance ResolutionContextFactory**:
   ```typescript
   // In ResolutionContextFactory.ts
   static forVariableEmbed(filePath?: string, state?: IStateService): ResolutionContext {
     return {
       // Existing fields...
       isInVariableContext: true,
       isInEmbedDirective: true,
       fieldAccessOptions: {
         preserveType: true,
         arrayNotation: true,
         numericIndexing: true,
         allowDataFields: true,
         formattingContext: { 
           isBlock: true,
           nodeType: 'embed',
           linePosition: 'start',
           isOutputLiteral: true,
           preserveFormatting: true
         }
       }
     };
   }
   ```

3. **Add Context Validation Utility**:
   ```typescript
   // In services/pipeline/ResolutionService/utils/ContextValidator.ts
   export function validateVariableEmbedContext(context: ResolutionContext): void {
     // Check for critical flags
     if (!context.isVariableEmbed || !context.disablePathPrefixing || !context.preventPathPrefixing) {
       throw new Error('Missing critical flags for variable embed context');
     }
     
     // Verify path variables are disabled
     if (context.allowedVariableTypes.path !== false) {
       throw new Error('Path variables must be disabled for variable embed contexts');
     }
   }
   ```

### Phase 2: Delegate Embed Resolution to ResolutionService

1. **Create Specialized Method in ResolutionService**:
   ```typescript
   // In ResolutionService.ts
   async resolveVariableEmbed(variableReference: any, context: ResolutionContext): Promise<string> {
     // Validate context has necessary flags
     validateVariableEmbedContext(context);
     
     let resolvedValue;
     
     // Extract variable name and field path
     const { variableName, fieldPath } = this.extractVariableInfo(variableReference);
     
     // First try direct field access for performance
     if (fieldPath) {
       const baseValue = context.state.getDataVar(variableName);
       if (baseValue !== undefined) {
         try {
           resolvedValue = FieldAccessUtility.accessFieldsByPath(
             baseValue, 
             fieldPath,
             {
               arrayNotation: true,
               numericIndexing: true,
               preserveType: true
             },
             variableName
           );
         } catch (error) {
           // Fall back to standard resolution
           resolvedValue = await this.resolveInContext(variableReference, context);
         }
       }
     } else {
       // Use standard resolution for simple cases
       resolvedValue = await this.resolveInContext(variableReference, context);
     }
     
     // Convert result to string with formatting preserved
     if (resolvedValue === undefined || resolvedValue === null) {
       return '';
     } else if (typeof resolvedValue === 'string') {
       return resolvedValue;
     } else if (typeof resolvedValue === 'object') {
       return JSON.stringify(resolvedValue, null, 2);
     } else {
       return String(resolvedValue);
     }
   }
   
   // Helper method to extract variable name and field path
   private extractVariableInfo(variableReference: any): { variableName: string, fieldPath: string } {
     // Implementation of variable info extraction
   }
   ```

2. **Update OutputService to Delegate Completely**:
   ```typescript
   // In OutputService.ts, replace the embed directive handling:
   if (directive.directive.path && 
       typeof directive.directive.path === 'object' && 
       directive.directive.path.isVariableReference === true &&
       state.isTransformationEnabled()) {
     
     // Create proper context using factory
     const context = ResolutionContextFactory.forVariableEmbed(
       state.getCurrentFilePath?.() || undefined,
       state
     );
     
     // Delegate to ResolutionService
     try {
       const resolvedContent = await this.resolutionService.resolveVariableEmbed(
         directive.directive.path,
         context
       );
       
       // Apply formatting and return
       return this.handleNewlines(resolvedContent, formattingContext);
     } catch (error) {
       logger.error('Error resolving variable embed', {
         error: error instanceof Error ? error.message : String(error)
       });
       
       // Return error placeholder in non-strict mode
       return `[Error resolving embed: ${error instanceof Error ? error.message : String(error)}]`;
     }
   }
   ```

3. **Remove Custom Context Creation in OutputService**:
   - Delete the block where OutputService manually creates a resolution context (lines ~2100-2150)
   - Replace all direct context creation with ResolutionContextFactory calls

### Phase 3: Update EmbedDirectiveHandler

1. **Enhance Variable Embed Handling**:
   ```typescript
   // In EmbedDirectiveHandler.ts
   private async handleVariableEmbed(
     node: DirectiveNode,
     context: DirectiveContext,
     variableReference: any,
     resolutionContext?: ResolutionContext
   ): Promise<{ content: string; childState: IStateService }> {
     const childState = context.state.createChildState();
     
     // Create proper variable embed context using factory
     const variableContext = ResolutionContextFactory.forVariableEmbed(
       resolutionContext?.currentFilePath || context.currentFilePath,
       childState
     );
     
     // Use the specialized method in ResolutionService
     try {
       const resolvedContent = await this.resolutionService.resolveVariableEmbed(
         variableReference,
         variableContext
       );
       
       return { content: resolvedContent, childState };
     } catch (error) {
       this.logger.error('Error resolving variable reference', {
         error: error instanceof Error ? error.message : String(error)
       });
       
       // In strict mode, rethrow
       if (variableContext.strict) {
         throw error;
       }
       
       // In non-strict mode, return error message
       return { 
         content: `[Error resolving variable: ${error instanceof Error ? error.message : String(error)}]`,
         childState
       };
     }
   }
   ```

2. **Update Template Embed Handling**:
   ```typescript
   // Ensure template embed also uses factory for context creation
   private async handleTemplateEmbed(
     node: DirectiveNode,
     context: DirectiveContext,
     template: string
   ): Promise<{ content: string; childState: IStateService }> {
     const childState = context.state.createChildState();
     
     // Use factory for context creation
     const variableContext = ResolutionContextFactory.forVariableEmbed(
       context.currentFilePath,
       childState
     );
     
     // Rest of implementation...
   }
   ```

### Phase 4: Update Tests and Documentation

1. **Create Integration Tests for Variable Embeds**:
   ```typescript
   // In tests/integration/variable-embed.test.ts
   it('should properly handle variable embeds with array access', async () => {
     // Test dot notation
     stateService.setDataVar('items', ['first', 'second', 'third']);
     const dotEmbed = createEmbedDirectiveNode('{{items.1}}');
     const dotResult = await processFullPipeline(dotEmbed, stateService);
     expect(dotResult).toBe('second');
     
     // Test bracket notation
     const bracketEmbed = createEmbedDirectiveNode('{{items[2]}}');
     const bracketResult = await processFullPipeline(bracketEmbed, stateService);
     expect(bracketResult).toBe('third');
   });
   
   it('should prevent path prefixing in variable embeds', async () => {
     stateService.setTextVar('content', 'text content');
     stateService.setCurrentFilePath('/path/to/file.mld');
     
     const result = await processEmbedDirective('{{content}}', stateService);
     expect(result).toBe('text content');
     expect(result).not.toContain('/path');
   });
   ```

2. **Update Documentation**:
   - Update `PIPELINE.md` to remove references to dual architecture
   - Update `PIPELINE-DEBUGGING.md` to reflect the current architecture
   - Update `_dev/debug/resolution/README.md` to focus on the current architecture

3. **Add Architectural Decision Record**:
   ```markdown
   # ADR: Variable Resolution Architecture

   ## Status
   Accepted

   ## Context
   Meld previously had a dual architecture for variable resolution:
   1. OutputService doing direct resolution
   2. ResolutionService handling resolution

   This created inconsistencies and maintenance challenges.

   ## Decision
   We've unified the architecture to have ResolutionService be the single source of truth for variable resolution.

   ## Consequences
   - Simpler architecture with clear responsibilities
   - Consistent handling of all variable types
   - OutputService focused solely on output generation
   - ResolutionService contains all resolution logic
   ```

### Phase 5: Cleanup

1. **Remove Unused Environment Variables**:
   - Delete any references to `MELD_DISABLE_OUTPUT_VARIABLE_RESOLUTION`
   - Update debug environments to no longer reference feature flags

2. **Delete Temporary Debug Code**:
   - Remove debug file writing and temporary logging
   - Clean up any remaining debug paths and placeholders

3. **Final Review**:
   - Verify OutputService no longer contains any variable resolution logic
   - Ensure all context creation goes through factories
   - Check that all tests pass with the updated architecture

## Testing Strategy

1. **Regression Testing**:
   - Run all existing tests to ensure functionality is preserved
   - Verify all variable resolution scenarios still work (text, data, paths)

2. **Edge Case Testing**:
   - Test array access with both dot notation and bracket notation
   - Test nested object access in variable embeds
   - Test variable embeds inside template embeds

3. **Path Prefixing Tests**:
   - Verify path prefixing doesn't occur in variable embeds
   - Test absolute and relative paths in path embeds

4. **Performance Testing**:
   - Compare response times between old and new implementations
   - Verify there's no significant performance regression

## Outcome

When complete, the architecture will be cleaner and more maintainable:

1. **Simplified Responsibility Boundaries**:
   - OutputService: Format and generate output, no variable resolution
   - ResolutionService: Handle all variable resolution, field access, and path operations

2. **Consistent Context Creation**:
   - All contexts created through ResolutionContextFactory
   - Standard context properties documented in interface

3. **Predictable Behavior**:
   - Variable resolution works consistently for all node types
   - Field access works consistently with all notation styles
   - Path prefixing only occurs when appropriate

This cleanup will make the codebase more maintainable, reduce bugs, and improve developer experience.
