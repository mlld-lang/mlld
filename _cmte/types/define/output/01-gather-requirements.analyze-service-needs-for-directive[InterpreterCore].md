# Improving TypeScript Types for `@define` Directives in InterpreterCore

## Current Challenges in the InterpreterCore Implementation

After reviewing the InterpreterCore service code, I've identified several areas where the handling of `@define` directives could benefit from stronger TypeScript types. The current implementation has several challenges:

1. **Ambiguous Directive Result Handling**: The code uses type assertions with `as unknown as` when processing directive results, which is error-prone and bypasses TypeScript's type checking.

2. **No Clear Type Definition for Command Templates**: There's no explicit type for the command templates stored by `@define` directives, making it difficult to enforce correct structure.

3. **Inconsistent Replacement Node Handling**: The code manually checks for the existence of properties using `'replacement' in directiveResult`, which could be replaced with proper type discrimination.

4. **Missing Parameter Validation**: The code lacks strong typing for command parameters, which are crucial for correct parameter substitution during execution.

5. **Unclear Distinction Between Command Types**: There's no type-level distinction between basic shell commands and language-specific commands.

## Proposed TypeScript Type Improvements

### 1. Define a Discriminated Union for Command Definitions

```typescript
// Command parameter definition
interface CommandParameter {
  name: string;
  position: number;
}

// Base interface for all command definitions
interface BaseCommandDefinition {
  name: string;
  parameters: CommandParameter[];
  description?: string;
}

// Basic shell command definition
interface ShellCommandDefinition extends BaseCommandDefinition {
  type: 'shell';
  template: string;
  isMultiline: boolean;
}

// Language command definition
interface LanguageCommandDefinition extends BaseCommandDefinition {
  type: 'language';
  language: 'js' | 'python' | 'bash' | string;
  codeBlock: string;
  languageParameters: string[];
}

// Discriminated union type
type CommandDefinition = ShellCommandDefinition | LanguageCommandDefinition;
```

**Justification**: This type structure provides clear discrimination between shell commands and language commands, ensuring that each type has the required properties. It makes it impossible to mix properties that don't belong together (e.g., using `template` with a language command) and enables exhaustive type checking when handling different command types.

### 2. Create a Proper DirectiveResult Interface for Define Directives

```typescript
// Generic directive result interface
interface DirectiveResult<T = unknown> {
  state: StateServiceLike;
  replacement?: MeldNode;
  metadata?: Record<string, unknown>;
}

// Specific result for define directives
interface DefineDirectiveResult extends DirectiveResult {
  commandDefinition: CommandDefinition;
}
```

**Justification**: By creating a specific result type for `@define` directives, we can enforce that all handlers for these directives return the required command definition with the correct structure. This eliminates the need for type assertions and enables proper type checking when processing directive results.

### 3. Type-Safe Command Storage in StateService

```typescript
// Add to StateServiceLike interface
interface StateServiceLike {
  // Existing methods...
  
  // New methods for command management
  storeCommand(name: string, definition: CommandDefinition): void;
  getCommand(name: string): CommandDefinition | undefined;
  hasCommand(name: string): boolean;
}
```

**Justification**: Adding proper typed methods for command storage and retrieval ensures that commands are stored with the correct structure and can be retrieved with their full type information. This prevents errors where commands might be stored with missing or incorrect properties.

### 4. Improved Directive Node Types for Define Directives

```typescript
// Base directive node
interface DirectiveNode extends MeldNode {
  type: 'Directive';
  directive: {
    kind: string;
    // Other common properties
  };
}

// Define directive node
interface DefineDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'define';
    name: string;
    parameters: string[];
    value: {
      directive: {
        kind: 'run';
        command?: string;
        language?: string;
        languageParameters?: string[];
        content: string;
      }
    }
  };
}
```

**Justification**: Creating a specific type for `@define` directive nodes ensures that all required properties are present and correctly structured. This makes it easier to validate and process these directives, reducing the need for runtime checks and error handling.

### 5. Type Guard Functions for Safe Type Discrimination

```typescript
// Type guard for define directive nodes
function isDefineDirectiveNode(node: MeldNode): node is DefineDirectiveNode {
  return node.type === 'Directive' && 
         'directive' in node && 
         node.directive?.kind === 'define' &&
         'name' in node.directive &&
         'value' in node.directive &&
         node.directive.value?.directive?.kind === 'run';
}

// Type guard for command definitions
function isLanguageCommandDefinition(
  def: CommandDefinition
): def is LanguageCommandDefinition {
  return def.type === 'language';
}
```

**Justification**: Type guard functions provide a safe way to check the type of an object at runtime while maintaining type safety. This eliminates the need for type assertions and manual property checks, making the code more robust and easier to maintain.

## Implementation Impact on InterpreterCore

Let's look at how these type improvements would simplify the directive handling code in InterpreterCore:

### Before (current implementation):

```typescript
// Check if the directive handler returned a replacement node
if (directiveResult && 'replacement' in directiveResult && 'state' in directiveResult) {
  // We need to extract the replacement node and state from the result
  const result = directiveResult as unknown as { 
    replacement: MeldNode;
    state: StateServiceLike;
  };

  const replacement = result.replacement;
  const resultState = result.state;
  
  // Update current state with the result state
  currentState = resultState;
  
  // Special handling for imports in transformation mode...
}
```

### After (with improved types):

```typescript
// The result is now properly typed
const directiveResult = await this.callDirectiveHandleDirective(directiveNode, context);

// Update current state with the result
currentState = directiveResult.state;

// Check if we have a replacement node with type safety
if (directiveResult.replacement) {
  const replacement = directiveResult.replacement;
  
  // Special handling for imports in transformation mode...
  
  // If this is a define directive, store the command definition
  if (isDefineDirectiveNode(directiveNode)) {
    const defineResult = directiveResult as DefineDirectiveResult;
    currentState.storeCommand(
      directiveNode.directive.name, 
      defineResult.commandDefinition
    );
  }
}
```

## Benefits for the Define Directive Handler

The define directive handler would also benefit from these type improvements:

1. **Clear Parameter Structure**: The handler can enforce that parameters are correctly structured and positioned.

2. **Validated Command Templates**: The handler can ensure that command templates have the required structure before storing them.

3. **Type-Safe Command Storage**: Commands can be stored with their full type information, making them easier to retrieve and use.

4. **Reduced Runtime Validation**: With stronger types, many runtime checks can be eliminated, simplifying the code.

5. **Better Error Messages**: TypeScript can provide more specific error messages when types don't match, making debugging easier.

## Conclusion

Implementing these TypeScript type improvements for `@define` directives would significantly enhance the InterpreterCore service by:

1. **Reducing Type Assertions**: Eliminating unsafe `as` casts that bypass TypeScript's type checking.

2. **Ensuring Correct Structure**: Enforcing that all command definitions have the required properties.

3. **Enabling Better Tooling**: Providing better autocompletion and error checking in IDEs.

4. **Simplifying Code**: Reducing the need for manual property checks and error handling.

5. **Improving Maintainability**: Making the code more self-documenting and easier to understand.

These improvements align with the Meld language's goal of providing a robust and type-safe scripting environment, particularly for the critical `@define` directive that creates reusable command templates.