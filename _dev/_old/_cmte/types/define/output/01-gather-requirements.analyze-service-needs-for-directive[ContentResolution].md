# Improving @define Directive Type Safety in ContentResolution Service

## Current Challenges

After reviewing the ContentResolution service code and the @define directive documentation, I've identified several areas where stronger TypeScript types would significantly improve code reliability, maintainability, and runtime safety.

The ContentResolver currently processes content nodes generically, but lacks specific handling for @define directives and their content. This creates several challenges:

1. **Ambiguous Content Types**: The current implementation doesn't distinguish between different types of content that @define directives can contain (shell commands vs. language scripts)
2. **Manual Type Checking**: Extensive type checking and casting is required (e.g., `node as TextNode`)
3. **No Parameter Validation**: No validation for parameter types or count in @define directives
4. **Missing Command Structure**: No formal type structure for command templates

## Proposed Type Improvements

### 1. Define Command Template Types

First, we need proper discriminated union types to represent the two distinct types of @define commands:

```typescript
// Base interface for all command definitions
interface ICommandDefinition {
  name: string;
  parameters: string[];
}

// For shell commands (@run [...])
interface IShellCommandDefinition extends ICommandDefinition {
  type: 'shell';
  template: string;  // The shell command template with {{param}} placeholders
}

// For language commands (@run js/python/bash [...])
interface ILanguageCommandDefinition extends ICommandDefinition {
  type: 'language';
  language: 'js' | 'python' | 'bash';  // Supported language types
  codeBlock: string;  // Raw code block to execute
}

// Union type for all command definitions
type CommandDefinition = IShellCommandDefinition | ILanguageCommandDefinition;
```

**Justification**: This creates a clear, type-safe distinction between shell and language commands. The discriminated union (with the `type` field) enables exhaustive type checking and prevents mixing properties between different command types. This would eliminate runtime errors where shell commands are treated as language commands or vice versa.

### 2. Parameter Type Validation

Add types to represent parameter validation and substitution:

```typescript
// For validating parameter counts when executing commands
interface IParameterValidation {
  required: number;  // Number of required parameters
  optional: number;  // Number of optional parameters
  variadic: boolean; // Whether the command accepts variable args
}

// For tracking parameter substitutions
interface IParameterSubstitution {
  name: string;      // Parameter name from definition
  value: string;     // Resolved value from invocation
  position: number;  // Position in the parameter list
}
```

**Justification**: These types would enforce consistent parameter handling across the codebase. The current code likely has to re-implement parameter validation logic in multiple places. With these types, we can centralize validation logic and ensure parameters are consistently checked before command execution.

### 3. Content Resolution Types

Create specific types for content resolution from @define directives:

```typescript
// For the content resolver to handle different content types
interface IContentResolutionOptions {
  resolveVariables: boolean;      // Whether to resolve {{var}} references
  allowCommandExecution: boolean; // Whether to allow @run commands
  contentType: 'text' | 'command' | 'all'; // Type of content to resolve
}

// For resolving command content specifically
interface ICommandResolutionContext {
  commandName: string;
  args: string[];
  parentState: IStateService; // For variable resolution
  sourceLocation?: string;    // For error reporting
}
```

**Justification**: These types would make the ContentResolver more precise about what it's resolving and how. The current implementation treats all content generically, which makes it harder to apply specific rules for @define directives. With these types, we can have specialized handling paths for different content types.

### 4. Enhanced ContentResolver Implementation

With these types, we can enhance the ContentResolver to specifically handle @define directives:

```typescript
export class ContentResolver {
  constructor(
    private stateService: IStateService,
    private commandRegistry?: ICommandRegistry // New dependency for command handling
  ) {}

  // New method specifically for resolving @define directive content
  async resolveCommandDefinition(
    node: DirectiveNode, 
    context: ResolutionContext
  ): Promise<CommandDefinition | null> {
    // Implementation that uses the new types to properly parse and validate
    // @define directive content, returning a strongly-typed CommandDefinition
  }

  // Enhanced resolve method that handles commands specifically
  async resolve(
    nodes: MeldNode[], 
    context: ResolutionContext, 
    options?: IContentResolutionOptions
  ): Promise<string> {
    // Enhanced implementation that uses the type information to properly
    // handle different content types
  }
}
```

**Justification**: This enhancement provides clear paths for handling different types of content, making the code more maintainable and less error-prone. The specialized methods make it explicit what kind of content is being processed, reducing the risk of misinterpreting directive content.

## Benefits of These Improvements

1. **Type Safety**: The discriminated unions ensure we can't mix up shell and language commands.

2. **Self-Documenting Code**: The types clearly show what properties each command type should have.

3. **Improved Error Handling**: We can provide more specific error messages when validation fails.

4. **Simplified Content Processing**: Clear distinction between text content and command definitions.

5. **Reduced Type Casting**: Less need for manual type assertions (`as` casts).

6. **Better IDE Support**: Autocomplete and type checking will guide developers to use the correct properties.

7. **Centralized Validation**: Validation logic can be consolidated rather than scattered throughout the codebase.

## Implementation Example for ContentResolver

Here's how the improved ContentResolver could handle @define directives:

```typescript
async resolveDefineDirective(directive: DirectiveNode): Promise<CommandDefinition> {
  const { name, parameters, value } = this.extractDefineComponents(directive);
  
  // Check if it's a shell command (@run [...])
  if (value.startsWith('@run [') || value.startsWith('@run [[')) {
    return {
      type: 'shell',
      name,
      parameters,
      template: this.extractCommandTemplate(value)
    };
  }
  
  // Check if it's a language command (@run js/python/bash [...])
  const languageMatch = value.match(/^@run\s+(js|python|bash)\s*\(/);
  if (languageMatch) {
    return {
      type: 'language',
      name,
      parameters,
      language: languageMatch[1] as 'js' | 'python' | 'bash',
      codeBlock: this.extractCodeBlock(value)
    };
  }
  
  throw new ResolutionError(
    'Invalid @define directive format',
    { directive: directive.content }
  );
}
```

This implementation clearly separates the two command types and provides strongly-typed returns, making it much easier to work with @define directives throughout the codebase.

## Conclusion

Adding these stronger TypeScript types for the @define directive would significantly improve the ContentResolution service by:

1. Making the code more self-documenting and easier to understand
2. Reducing runtime errors through compile-time type checking
3. Centralizing validation logic for command definitions
4. Providing clearer error messages when validation fails
5. Supporting better IDE tooling for developers

These improvements align with the Meld architecture's emphasis on strong typing and dependency injection, and would make the ContentResolution service more robust and maintainable.