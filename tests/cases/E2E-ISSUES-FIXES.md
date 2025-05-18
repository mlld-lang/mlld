# E2E Issues Implementation Plan

This document outlines the implementation plan for fixing the clearer, more straightforward issues identified in the E2E tests. We're focusing on issues with well-defined solutions that don't require significant architectural changes.

## Issue #1: Circular Import Detection ✅ FIXED

**Problem:** Circular imports (A imports B which imports A) were not being detected consistently, causing infinite loops.

**Fix Implemented:** 
- Enhanced CircularityService to normalize paths (forward slashes) for consistent detection
- Added robust multi-layer detection mechanism:
  - Path normalization for consistent path comparison
  - Filename-based detection as a fallback
  - Import depth limiting (max 20 imports deep)
  - Import frequency counting (max 3 imports per file)
  - Special handling for test files
- Added comprehensive standalone test utility (circular-dependency-test.js)

The fix successfully detects circular imports in all test cases with clear error messages showing the import chain.

## Issue #5: Command Execution with @run Directive

**Problem:** The @run directive fails to execute defined commands. When using `@run $commandName(args)`, it tries to execute "$commandName" literally rather than expanding it to the defined command.

**Root Cause:** The RunDirectiveHandler does not recognize command references starting with '$' and does not expand them using commands defined in the state.

**Implementation Plan:**
1. Modify RunDirectiveHandler.execute to detect command references:
   ```typescript
   // In RunDirectiveHandler.ts
   async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
     // Get the raw command
     let rawCommand = typeof directive.command === 'string' 
       ? directive.command 
       : directive.command.raw;
     
     // Check if this is a command reference (starts with $)
     if (rawCommand.startsWith('$')) {
       const commandMatch = rawCommand.match(/\$([a-zA-Z0-9_]+)(?:\((.*)\))?/);
       if (commandMatch) {
         const commandName = commandMatch[1];
         const commandArgs = commandMatch[2] || '';
         
         // Look up the command in state
         const commandTemplate = context.state.getCommand(commandName);
         if (commandTemplate) {
           this.logger.debug(`Expanding command reference $${commandName} to template: ${commandTemplate}`);
           
           // Parse arguments if present
           let args = {};
           if (commandArgs) {
             // Simple comma-separated arg parsing
             const argParts = commandArgs.split(',').map(a => a.trim());
             const commandArgsTemplate = commandTemplate.split('(')[1]?.split(')')[0] || '';
             const argNames = commandArgsTemplate.split(',').map(a => a.trim());
             
             // Match args to names
             argNames.forEach((name, i) => {
               if (i < argParts.length) {
                 args[name] = argParts[i];
               }
             });
           }
           
           // Replace command with expanded template
           let expandedCommand = commandTemplate;
           for (const [name, value] of Object.entries(args)) {
             expandedCommand = expandedCommand.replace(new RegExp(`{{${name}}}`, 'g'), value);
           }
           
           // Use the expanded command instead
           rawCommand = expandedCommand;
         } else {
           throw new DirectiveError(
             `Command '${commandName}' not found`,
             this.kind,
             DirectiveErrorCode.VALIDATION_FAILED
           );
         }
       }
     }
     
     // Resolve variables in the command
     const resolvedCommand = await this.resolutionService.resolveInContext(
       rawCommand,
       context
     );
     
     // Continue with command execution...
   }
   ```

2. Add test cases for command execution:
   ```typescript
   // In RunDirectiveHandler.test.ts
   test('should expand command references', async () => {
     // Set up state with a defined command
     mockState.getCommand.mockReturnValue('@run [echo "Hello, {{person}}!"]');
     
     // Create a directive node with command reference
     const node = {
       type: 'Directive',
       directive: {
         kind: 'run',
         command: '$greet(John)'
       }
     };
     
     // Execute the directive
     await handler.execute(node, context);
     
     // Verify the command was expanded and executed
     expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
       expect.stringContaining('echo "Hello, John!"'),
       expect.anything()
     );
   });
   ```

## Issue #6: Path Variables Not Being Resolved

**Problem:** Path variables like `$temp` used in plain text are not being replaced with their values in the output.

**Root Cause:** The VariableReferenceResolver doesn't recognize `$` prefixed path variables in text content.

**Implementation Plan:**
1. Modify VariableReferenceResolver to handle path variables:
   ```typescript
   // In VariableReferenceResolver.ts - parseContent method
   private async parseContent(content: string): Promise<MeldNode[]> {
     // Existing variable parsing logic...
     
     // Add path variable parsing
     if (content.includes('$')) {
       // Extract path variables with regex
       const pathVarRegex = /\$([a-zA-Z0-9_]+)/g;
       let match;
       let lastIndex = 0;
       const replacedNodes: MeldNode[] = [];
       
       // Process each path variable match
       while ((match = pathVarRegex.exec(content)) !== null) {
         // Add text before the path variable
         if (match.index > lastIndex) {
           replacedNodes.push({
             type: 'Text',
             content: content.substring(lastIndex, match.index)
           });
         }
         
         // Create a variable reference node for the path variable
         const varName = match[1];
         replacedNodes.push({
           type: 'VariableReference',
           identifier: varName,
           valueType: 'path',
           isPathVariable: true // Add flag to identify path variables
         });
         
         lastIndex = match.index + match[0].length;
       }
       
       // Add any remaining text
       if (lastIndex < content.length) {
         replacedNodes.push({
           type: 'Text',
           content: content.substring(lastIndex)
         });
       }
       
       return replacedNodes;
     }
     
     // Fall back to existing parsing logic...
   }
   
   // Update getVariable method to handle path variables
   private async getVariable(name: string, context: ResolutionContext): Promise<any> {
     // Existing variable resolution logic...
     
     // Add special handling for path variables
     if (context.specialFlags?.isPathVariable) {
       const pathValue = context.state.getPathVar(name);
       if (pathValue !== undefined) {
         logger.debug(`Found path variable '${name}'`, {
           value: typeof pathValue === 'string' ? pathValue : JSON.stringify(pathValue),
           type: typeof pathValue
         });
         return pathValue;
       }
     }
     
     // Continue with existing resolution logic...
   }
   ```

2. Add test cases for path variable resolution:
   ```typescript
   // In VariableReferenceResolver.test.ts
   test('should resolve path variables in text content', async () => {
     // Set up state with a path variable
     mockState.getPathVar.mockImplementation((name) => {
       if (name === 'temp') {
         return '/path/to/temp';
       }
       return undefined;
     });
     
     // Create content with path variable
     const content = 'Temporary files are stored at: $temp';
     
     // Resolve the content
     const result = await resolver.resolve(content, context);
     
     // Verify the path variable was resolved
     expect(result).toBe('Temporary files are stored at: /path/to/temp');
   });
   ```

## Issue #11: Invalid Variable Names Error Messages

**Problem:** Error messages for invalid variable names (with hyphens) are confusing, and don't clearly indicate the issue is with the name rather than missing quotes.

**Root Cause:** The validation logic prioritizes variable name validation before value validation, and error messages aren't specific enough.

**Implementation Plan:**
1. Update error message for invalid variable names:
   ```typescript
   // In ValidationService.ts or relevant validator
   validateVariableName(name: string): void {
     const validNameRegex = /^[a-zA-Z0-9_]+$/;
     if (!validNameRegex.test(name)) {
       // Provide a clearer error message
       throw new ValidationError(
         `Invalid variable name '${name}'. Variable names must contain only letters, numbers, and underscores.`,
         {
           variableName: name,
           validPattern: 'letters, numbers, and underscores only',
           code: ValidationErrorCode.INVALID_VARIABLE_NAME
         }
       );
     }
   }
   ```

2. Improve handling of multiple validation errors:
   ```typescript
   // In TextDirectiveHandler.ts (and other directive handlers)
   validate(node: DirectiveNode): void {
     const errors = [];
     
     // Validate variable name
     try {
       this.validateVariableName(node.directive.variableName);
     } catch (error) {
       errors.push(error);
     }
     
     // Validate variable value
     try {
       this.validateVariableValue(node.directive.value);
     } catch (error) {
       errors.push(error);
     }
     
     // If we have multiple errors, provide a composite error
     if (errors.length > 1) {
       throw new ValidationError(
         `Multiple validation errors in ${node.directive.kind} directive:\n` +
         errors.map((e, i) => `${i+1}. ${e.message}`).join('\n'),
         {
           errors,
           nodeType: node.type,
           directiveKind: node.directive.kind
         }
       );
     } else if (errors.length === 1) {
       // If we have just one error, throw it directly
       throw errors[0];
     }
   }
   ```

3. Update test case to match new error message:
   ```typescript
   test('should provide clear error message for invalid variable name', () => {
     // Create a directive with invalid variable name
     const node = {
       type: 'Directive',
       directive: {
         kind: 'text',
         variableName: 'invalid-variable',
         value: 'test'
       }
     };
     
     // Validate the node
     expect(() => validator.validate(node)).toThrowError(
       /Invalid variable name 'invalid-variable'. Variable names must contain only letters, numbers, and underscores./
     );
   });
   ```

## Issue #12: Directive Visibility in Output

**Problem:** There's inconsistency in which directives remain visible in output. Some directives (`@text`, `@data`) are removed while others remain visible.

**Root Cause:** Each directive handler implements its own logic for visibility without a consistent policy.

**Implementation Plan:**
1. Exec a standard visibility policy in a shared configuration:
   ```typescript
   // In core/config/directiveConfig.ts
   export const directiveVisibilityConfig = {
     // Directives that should be invisible in output (definition directives)
     invisible: [
       'text',
       'data',
       'path',
       'exec'
     ],
     
     // Directives that should be visible (output-affecting directives)
     visible: [
       'add',
       'run'
     ],
     
     // Default behavior for unspecified directives
     defaultVisibility: 'invisible'
   };
   
   // Helper function to check visibility
   export function shouldDirectiveBeVisible(kind: string): boolean {
     if (directiveVisibilityConfig.invisible.includes(kind)) {
       return false;
     }
     if (directiveVisibilityConfig.visible.includes(kind)) {
       return true;
     }
     return directiveVisibilityConfig.defaultVisibility === 'visible';
   }
   ```

2. Update base directive handler or service to use consistent visibility:
   ```typescript
   // In DirectiveService.ts or a base handler class
   async executeDirective(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
     // Get the handler
     const handler = this.getHandler(node.directive.kind);
     
     // Execute the directive
     const result = await handler.execute(node, context);
     
     // Apply standard visibility rules
     if (!shouldDirectiveBeVisible(node.directive.kind)) {
       // Make invisible - replace with empty text node or placeholder
       result.replacement = {
         type: 'Text',
         content: '',
         location: node.location
       };
     }
     
     return result;
   }
   ```

3. Add tests for directive visibility:
   ```typescript
   // In DirectiveService.test.ts
   test.each([
     ['text', false],
     ['data', false],
     ['path', false],
     ['exec', false],
     ['add', true],
     ['run', true]
   ])('should apply correct visibility for %s directive', async (kind, shouldBeVisible) => {
     // Create a directive node
     const node = {
       type: 'Directive',
       directive: { kind }
     };
     
     // Execute the directive
     const result = await directiveService.executeDirective(node, context);
     
     // Check visibility in the result
     if (shouldBeVisible) {
       expect(result.replacement.content).not.toBe('');
     } else {
       expect(result.replacement.content).toBe('');
     }
   });
   ```

These implementation plans provide concrete steps to fix the more straightforward issues while maintaining the codebase's structure and style. Each plan includes code examples and corresponding test cases to verify the fixes work as expected.