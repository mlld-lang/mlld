# Proposed TypeScript Type Improvements for `@define` Directive Handling

After analyzing the InterpreterService code and its interactions with the `@define` directive, I've identified several areas where stronger type definitions would significantly improve code clarity, safety, and maintainability.

## Current Challenges in the Code

The InterpreterService currently has several implementation challenges when handling directive nodes, particularly for specialized directives like `@define`:

1. **Loose typing for directive results**: The `callDirectiveHandleDirective` method returns `any`, requiring manual type checking and casting.

2. **Ambiguous replacement node handling**: The code must manually check for properties like `replacement` and `state` using type guards and unsafe casts.

3. **Directive-specific special handling**: Special handling for `import` directives is hardcoded with string comparisons rather than leveraging TypeScript's type system.

4. **Unsafe property access**: Several conditionals check for the existence of properties before accessing them.

5. **Complex type assertions**: The code uses `as unknown as` casts to work around type system limitations.

## Proposed Type Improvements

### 1. Define Command Definition Interface

```typescript
/**
 * Represents a parameter for a command defined with @define
 */
interface CommandParameter {
  /** Name of the parameter */
  name: string;
  /** Optional default value */
  defaultValue?: string;
}

/**
 * Discriminated union for different types of command templates
 */
type CommandTemplate = 
  | {
      /** Indicates this is a basic shell command */
      type: 'shell';
      /** The shell command template with placeholders */
      commandTemplate: string;
    }
  | {
      /** Indicates this is a language script */
      type: 'language';
      /** The language to use (js, python, bash, etc.) */
      language: string;
      /** The raw code block to execute */
      codeBlock: string;
      /** Parameters to pass to the language runtime */
      runtimeParams?: string[];
    };

/**
 * Represents a command defined with @define
 */
interface CommandDefinition {
  /** Name of the command (without $ prefix) */
  name: string;
  /** Parameters expected by the command */
  parameters: CommandParameter[];
  /** The command template (shell or language) */
  template: CommandTemplate;
  /** Source location information */
  location?: SourceLocation;
}
```

**Justification**: 
- **Type safety**: Eliminates runtime errors from accessing undefined properties by making required fields explicit.
- **Self-documenting code**: The interface clearly documents the structure of command definitions.
- **Discriminated unions**: The `type` property allows TypeScript to correctly narrow the type in conditionals.
- **Explicit parameter handling**: Structured parameter definitions prevent mismatches between definition and invocation.

### 2. Directive Result Interface with Define-Specific Type

```typescript
/**
 * Base interface for all directive results
 */
interface DirectiveResult {
  /** The updated state after directive execution */
  state: StateServiceLike;
  /** Optional replacement node for transformation */
  replacement?: MeldNode;
  /** Optional formatting context updates */
  getFormattingContext?(): FormattingContext;
}

/**
 * Specific result type for @define directive
 */
interface DefineDirectiveResult extends DirectiveResult {
  /** The command definition created by the directive */
  commandDefinition: CommandDefinition;
}

/**
 * Type guard to check if a directive result is from a define directive
 */
function isDefineDirectiveResult(result: DirectiveResult): result is DefineDirectiveResult {
  return 'commandDefinition' in result;
}
```

**Justification**:
- **Type narrowing**: Allows the InterpreterService to identify define-specific results without manual property checks.
- **Explicit contract**: Creates a clear contract between the DirectiveService and InterpreterService.
- **Safer transformations**: Ensures all required properties are present before attempting transformations.
- **Reduced casting**: Eliminates unsafe `as unknown as` casts by providing proper type guards.

### 3. Enhanced DirectiveNode with Define-Specific Type

```typescript
/**
 * Base interface for all directive nodes
 */
interface DirectiveNode extends MeldNode {
  type: 'Directive';
  directive: {
    kind: string;
    [key: string]: any;
  };
}

/**
 * Specific interface for @define directive nodes
 */
interface DefineDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'define';
    /** Command name without $ prefix */
    name: string;
    /** Parameter list as parsed */
    parameters: string[];
    /** Right-hand side directive (must be @run) */
    commandDirective: {
      kind: 'run';
      /** For language commands, the language specified */
      language?: string;
      /** For language commands, runtime parameters */
      languageParams?: string[];
      /** Command content (template string or code block) */
      command: string;
    };
  };
}

/**
 * Type guard to check if a node is a define directive
 */
function isDefineDirectiveNode(node: MeldNode): node is DefineDirectiveNode {
  return node.type === 'Directive' && 
         'directive' in node && 
         node.directive?.kind === 'define';
}
```

**Justification**:
- **Directive validation**: The InterpreterService can validate define directives structurally rather than with ad-hoc property checks.
- **Compiler assistance**: TypeScript can provide autocomplete and error checking when accessing define-specific properties.
- **Enforced constraints**: The type system enforces that the right-hand side must be a run directive.
- **Self-documenting**: Makes the structure of define directives explicit and documented in the type system.

### 4. Context Type for Directive Handling

```typescript
/**
 * Context passed to directive handlers
 */
interface DirectiveHandlerContext {
  /** Current state for the directive */
  state: StateServiceLike;
  /** Parent state (for imports and variable copying) */
  parentState: StateServiceLike;
  /** Current file path */
  currentFilePath?: string;
  /** Formatting context for consistent output */
  formattingContext: FormattingContext;
}

/**
 * Enhanced type for the callDirectiveHandleDirective method
 */
private async callDirectiveHandleDirective(
  node: DirectiveNode, 
  context: DirectiveHandlerContext
): Promise<DirectiveResult> {
  // Implementation remains similar, but with proper return type
}
```

**Justification**:
- **Explicit contracts**: Creates a clear, documented contract for what context is passed to directive handlers.
- **Type checking**: Prevents accidentally omitting required context properties.
- **Proper return typing**: Makes it clear that directive handlers should return a DirectiveResult.
- **Simplified error handling**: Errors from missing context properties become compile-time errors instead of runtime errors.

### 5. Enhanced Formatting Context Type

```typescript
/**
 * Context for formatting decisions
 */
interface FormattingContext {
  /** Whether output should be treated as literal text */
  isOutputLiteral: boolean;
  /** Whether this is inline or block context */
  contextType: 'inline' | 'block';
  /** Type of the node being processed */
  nodeType: string;
  /** Whether this node is at the start of a line */
  atLineStart: boolean;
  /** Whether this node is at the end of a line */
  atLineEnd: boolean;
}
```

**Justification**:
- **Standardized context**: Ensures consistent formatting decisions across service boundaries.
- **Type-safe string literals**: Prevents invalid values for contextType.
- **Required properties**: All properties are required, eliminating undefined checks.
- **Self-documenting**: Documents the purpose and valid values for each property.

## Implementation Examples

Here's how these improved types would simplify the directive handling code in the InterpreterService:

```typescript
case 'Directive':
  // Process directive with cloned state to maintain immutability
  const directiveState = currentState.clone();
  // Add the node first to maintain order
  directiveState.addNode(node);
  
  // Type guard ensures directive is properly structured
  if (!isValidDirectiveNode(node)) {