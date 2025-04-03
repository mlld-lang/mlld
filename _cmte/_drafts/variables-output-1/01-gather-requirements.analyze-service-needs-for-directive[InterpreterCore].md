# TypeScript Type Improvements for Variable Handling in InterpreterService

After reviewing the InterpreterService code, I've identified several areas where the TypeScript type system could be enhanced to improve variable handling, reduce errors, and increase code maintainability. Here are my proposed improvements with justifications.

## 1. Strongly-Typed Directive Result Interface

### Current Issue
```typescript
// Current approach uses type casting with unknown
if (directiveResult && 'replacement' in directiveResult && 'state' in directiveResult) {
  // We need to extract the replacement node and state from the result
  const result = directiveResult as unknown as { 
    replacement: MeldNode;
    state: StateServiceLike;
  };
}
```

This code uses unsafe type casting and property checking, which is error-prone and difficult to maintain. It also provides no compile-time guarantees about the structure of directive results.

### Proposed Solution
```typescript
/**
 * Represents the result of a directive handler that provides replacement nodes
 */
interface DirectiveHandlerResult {
  state: StateServiceLike;
  replacement?: MeldNode;
  getFormattingContext?(): FormattingContext;
}

/**
 * Type guard to check if a directive result includes a replacement node
 */
function isDirectiveHandlerWithReplacement(result: any): result is DirectiveHandlerResult {
  return result && 'state' in result && 'replacement' in result;
}
```

### Justification
1. **Type Safety**: Eliminates unsafe type casting with proper interfaces and type guards
2. **Self-Documentation**: Makes the expected structure of directive results explicit
3. **IDE Support**: Enables autocomplete and compile-time checking for directive handler results
4. **Maintainability**: Changes to the expected result structure will be caught at compile time

## 2. Formatting Context Type Definition

### Current Issue
```typescript
// Currently using inline type with string literal
const formattingContext = {
  isOutputLiteral: state.isTransformationEnabled?.() || false,
  contextType: 'block' as 'inline' | 'block', // Default to block context
  nodeType: node.type,
  atLineStart: true, // Default assumption
  atLineEnd: false // Default assumption
};
```

The formatting context is created inline with ad-hoc types, making it difficult to ensure consistency across service boundaries.

### Proposed Solution
```typescript
/**
 * Defines the context for variable formatting and output generation
 */
interface FormattingContext {
  /** Whether to use literal output mode (preserves structure) */
  isOutputLiteral: boolean;
  /** The context type (block or inline) affects formatting */
  contextType: 'block' | 'inline';
  /** The type of node being processed */
  nodeType: string;
  /** Whether the node is at the start of a line */
  atLineStart: boolean;
  /** Whether the node is at the end of a line */
  atLineEnd: boolean;
}
```

### Justification
1. **Cross-Service Consistency**: Ensures the same structure is used across all services
2. **Documentation**: Clearly documents the purpose of each field
3. **Validation**: Prevents accidental omission of required fields
4. **Maintenance**: Makes changes to the formatting context structure explicit and trackable

## 3. Directive Handler Context Interface

### Current Issue
```typescript
// Currently using 'any' for the context
private async callDirectiveHandleDirective(node: DirectiveNode, context: any): Promise<any> {
  // ...
}

// Usage with inline object
const directiveResult = await this.callDirectiveHandleDirective(directiveNode, {
  state: directiveState,
  parentState: currentState,
  currentFilePath: state.getCurrentFilePath() ?? undefined,
  formattingContext
});
```

Using `any` for the context object loses type safety and makes it difficult to ensure consistent context structure across directive handlers.

### Proposed Solution
```typescript
/**
 * Context passed to directive handlers
 */
interface DirectiveHandlerContext {
  /** Current state for the directive */
  state: StateServiceLike;
  /** Parent state for inheritance and variable resolution */
  parentState: StateServiceLike;
  /** Current file path for error reporting and path resolution */
  currentFilePath?: string;
  /** Formatting context for consistent output generation */
  formattingContext: FormattingContext;
}

private async callDirectiveHandleDirective(
  node: DirectiveNode, 
  context: DirectiveHandlerContext
): Promise<DirectiveHandlerResult | StateServiceLike> {
  // ...
}
```

### Justification
1. **Type Safety**: Ensures all required context fields are provided
2. **Documentation**: Makes the expected context structure explicit
3. **Consistency**: Guarantees the same context structure is used across all directive handlers
4. **Error Prevention**: Catches missing or incorrect context fields at compile time

## 4. Variable Type Enumeration

### Current Issue
```typescript
// Currently using string checks or any casts
if ((node as any).valueType === 'text') {
  // Handle TextVar nodes...
} else if ((node as any).valueType === 'data') {
  // Handle DataVar nodes...
}
```

The code uses string literals and type casting to check variable types, which is error-prone and difficult to maintain.

### Proposed Solution
```typescript
/**
 * Represents the different types of variables in Meld
 */
enum VariableType {
  Text = 'text',
  Data = 'data',
  Path = 'path'
}

/**
 * Extended MeldNode with variable type information
 */
interface VariableReferenceNode extends MeldNode {
  type: 'VariableReference';
  valueType: VariableType;
  name: string;
  fields?: string[];
}

// Usage
if (node.type === 'VariableReference') {
  const varNode = node as VariableReferenceNode;
  if (varNode.valueType === VariableType.Text) {
    // Handle text variables
  } else if (varNode.valueType === VariableType.Data) {
    // Handle data variables
  }
}
```

### Justification
1. **Type Safety**: Eliminates string literal comparisons with proper enums
2. **Refactoring Support**: Makes it easier to rename or change variable types
3. **Autocompletion**: Enables IDE suggestions for variable types
4. **Error Prevention**: Catches typos and invalid variable types at compile time

## 5. State Variable Access Type Safety

### Current Issue
```typescript
// Current approach relies on optional chaining and runtime checks
if (currentState.isTransformationEnabled && currentState.isTransformationEnabled()) {
  // ...
}

// Transformed nodes access is also unsafe
if (!currentState.getTransformedNodes || !currentState.getTransformedNodes()) {
  // Initialize transformed nodes if needed
  const originalNodes = currentState.getNodes();
  if (originalNodes && currentState.setTransformedNodes) {
    currentState.setTransformedNodes([...originalNodes]);
  }
}
```

The code uses optional chaining and runtime checks to safely access state methods, which is verbose and error-prone.

### Proposed Solution
```typescript
/**
 * Enhanced state service interface with transformation capabilities
 */
interface TransformableStateService extends StateServiceLike {
  /** Check if transformation is enabled */
  isTransformationEnabled(): boolean;
  /** Get transformed nodes array */
  getTransformedNodes(): MeldNode[] | undefined;
  /** Set transformed nodes array */
  setTransformedNodes(nodes: MeldNode[]): void;
  /** Transform a node by replacing it with another */
  transformNode(original: MeldNode, replacement: MeldNode): void;
}

/**
 * Type guard to check if a state supports transformations
 */
function isTransformableState(state: StateServiceLike): state is TransformableStateService {
  return (
    'isTransformationEnabled' in state &&
    typeof state.isTransformationEnabled === 'function' &&
    'getTransformedNodes' in state &&
    'setTransformedNodes' in state &&
    'transformNode' in state
  );
}

// Usage
if (isTransformableState