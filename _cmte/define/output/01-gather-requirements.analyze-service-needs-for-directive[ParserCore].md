# ParserCore Improvements for @define Directive Type Handling

## Current Limitations and Challenges

After analyzing the ParserCore service, I've identified several areas where we can enhance TypeScript type support for the `@define` directive. The current implementation has these limitations:

1. **No Specialized Type for @define Directives**: The code uses generic `DirectiveNode` types, requiring manual validation and type assertion.

2. **Inadequate Parameter Type Handling**: Parameters in `@define` directives need stronger type validation to prevent runtime errors.

3. **Lack of Discrimination Between Command Types**: Basic shell commands vs. language commands (JS, Python, etc.) aren't clearly distinguished at the type level.

4. **Missing Structure for Command Templates**: The right-hand side `@run` directive structure isn't enforced by the type system.

## Proposed Type Improvements

### 1. Define-Specific Directive Type

```typescript
interface DefineDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'define';
    commandName: string;
    parameters: string[];
    body: RunDirectiveNode; // Must be a @run directive
    // Metadata for better error reporting
    location?: SourceLocation;
  }
}
```

**Justification**: This specialized type would:
- Eliminate the need for manual type checking and casting in the `transformVariableNode` method
- Provide compile-time validation that all required properties exist
- Make the code more self-documenting by clearly showing the expected structure
- Enable better IDE autocompletion and error detection

### 2. Parameter Type Enhancement

```typescript
interface DefineParameter {
  name: string;
  defaultValue?: string | null;
  location?: SourceLocation;
}

// Updated directive to use the enhanced parameter type
interface DefineDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'define';
    commandName: string;
    parameters: DefineParameter[]; // Using the stronger type
    body: RunDirectiveNode;
    location?: SourceLocation;
  }
}
```

**Justification**: This improvement would:
- Support future parameter validation (e.g., default values, required vs. optional)
- Enable better error messages that point to the specific parameter causing an issue
- Provide location information for highlighting the problematic parameter in error messages
- Simplify parameter handling by providing a consistent structure

### 3. Command Type Discrimination

```typescript
type RunDirectiveKind = 'basic' | 'language';

interface BaseRunDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'run';
    runKind: RunDirectiveKind;
    location?: SourceLocation;
  }
}

interface BasicRunDirectiveNode extends BaseRunDirectiveNode {
  directive: {
    kind: 'run';
    runKind: 'basic';
    command: string;
    isMultiline: boolean;
    location?: SourceLocation;
  }
}

interface LanguageRunDirectiveNode extends BaseRunDirectiveNode {
  directive: {
    kind: 'run';
    runKind: 'language';
    language: string;
    parameters: string[];
    code: string;
    location?: SourceLocation;
  }
}

type RunDirectiveNode = BasicRunDirectiveNode | LanguageRunDirectiveNode;
```

**Justification**: This discrimination would:
- Enforce correct handling of different command types through TypeScript's discriminated unions
- Prevent errors from trying to access properties that don't exist on a particular command type
- Make code more maintainable by clearly indicating the expected structure for each command type
- Simplify conditional logic with type guards instead of manual property checking

### 4. Command Definition Type

```typescript
interface CommandDefinition {
  commandName: string;
  parameters: DefineParameter[];
  runDirective: RunDirectiveNode;
  sourceLocation?: SourceLocation;
}
```

**Justification**: This type would:
- Provide a clean structure for storing command definitions in the state
- Ensure all necessary information is captured for later execution
- Make the relationship between define directives and their execution clearer
- Enable better error reporting by preserving source locations

## Implementation Benefits

Implementing these type improvements would bring several benefits to the ParserCore service:

### 1. Simplified Variable Node Transformation

Current code in `transformVariableNode` uses type assertions and manual property checking:

```typescript
if (anyNode.type === 'Directive' && anyNode.directive) {
  // Clone the directive data and recursively transform any variables it contains
  const transformedDirective = { ...anyNode.directive };
  
  // Check for specific properties that might contain variable references
  if (transformedDirective.value && typeof transformedDirective.value === 'object') {
    transformedDirective.value = this.transformVariableNode(transformedDirective.value);
  }
  
  return {
    ...anyNode,
    directive: transformedDirective
  };
}
```

With improved types, we could have clearer, type-safe handling:

```typescript
if (isDefineDirective(anyNode)) {
  // Handle define directive specifically
  return {
    ...anyNode,
    directive: {
      ...anyNode.directive,
      body: this.transformVariableNode(anyNode.directive.body) as RunDirectiveNode
    }
  };
}
```

### 2. Enhanced Error Reporting

Our current error handling in `validateCodeFences` could be extended to validate define directives:

```typescript
private validateDefineDirective(node: DefineDirectiveNode): void {
  const { commandName, parameters, body } = node.directive;
  
  // Validate command name
  if (!commandName || commandName.trim() === '') {
    throw new MeldParseError(
      'Invalid @define directive: missing command name',
      node.location
    );
  }
  
  // Validate that body is a run directive
  if (body.directive.kind !== 'run') {
    throw new MeldParseError(
      'Invalid @define directive: body must be a @run directive',
      body.location || node.location
    );
  }
  
  // Additional validations based on run directive kind
  if (body.directive.runKind === 'language') {
    // Validate language-specific requirements
  }
}
```

### 3. Safer Parameter Handling

With the enhanced parameter type, we can perform better validation:

```typescript
private validateParameters(parameters: DefineParameter[]): void {
  // Check for duplicate parameter names
  const paramNames = new Set<string>();
  for (const param of parameters) {
    if (paramNames.has(param.name)) {
      throw new MeldParseError(
        `Duplicate parameter name: ${param.name}`,
        param.location
      );
    }
    paramNames.add(param.name);
  }
}
```

## Migration Path

To implement these improvements with minimal disruption:

1. **Define the new types** in a dedicated file (e.g., `@core/syntax/types/directives/DefineDirectiveTypes.ts`)

2. **Add type guards** to safely check and convert between types:

```typescript
function isDefineDirective(node: MeldNode): node is DefineDirectiveNode {
  return (
    node.type === 'Directive' &&
    node.directive?.kind === 'define' &&
    typeof node.directive.commandName === 'string'
  );
}
```

3. **Update the parser transformation logic** to use these specialized types

4. **Add validation functions** that leverage the type information

## Conclusion

By enhancing the TypeScript types for the `@define` directive, we can make the ParserCore service more robust, maintainable, and self-documenting. These improvements would:

- Provide stronger compile-time validation
- Reduce the need for manual type checking and assertions
- Enable better error messages with precise location information
- Make the code more maintainable by clearly expressing the expected structure
- Improve IDE support with better autocompletion and error detection

These benefits directly address the complexity and manual validation currently required for handling `@define` directives, resulting in code that is both safer and easier to understand.