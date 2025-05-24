# Migrating to the New AST Type System: A Comprehensive Guide

This guide outlines how to refactor your services to leverage the new AST type system and simpler architecture. It focuses on practical changes needed for each service.

## Core Architectural Principles

1. **State as a Simple Container**: State should be a dumb container for well-typed data, not a behavioral service
2. **Strong Types with Discriminated Unions**: Leverage TypeScript's discriminated unions for type safety
3. **AST-Centric Design**: Let AST types drive the design, with services adapting to them

## General Changes for All Services

### What to Remove
- Complex context objects (ResolutionContext, FormattingContext, etc.)
- Redundant type validation
- Complex state transformations

### What to Adopt
- Direct imports from `@core/ast/types`
- Type-driven logic using discriminated unions
- Smaller, more focused methods

## Service-Specific Migration Guide

### 1. ResolutionService

**Stop Doing:**
- Using complex ResolutionContext objects
- Handling multiple resolution types in monolithic methods
- Duplicating path validation logic

**Start Doing:**
- Create specialized resolvers for different variable types
- Focus solely on variable resolution and value access
- Use discriminated unions for variable type handling

**Example Transformation:**

```typescript
// BEFORE
async resolveData(node: VariableReferenceNode, context: ResolutionContext): Promise<JsonValue> {
  // Complex logic with context objects
  const variable = this.stateService.getVariable(node.identifier, VariableType.DATA);
  // More complex logic...
}

// AFTER
async resolveVariable(
  node: VariableReferenceNode, 
  options: { strict: boolean, currentPath?: string }
): Promise<unknown> {
  // Leverage discriminated union on node.variableType
  switch (node.variableType) {
    case 'data':
      return this.resolveDataVariable(node, options);
    case 'text':
      return this.resolveTextVariable(node, options);
    // Other cases...
  }
}
```

### 2. PathService

**Stop Doing:**
- Using complex path objects with mixed responsibilities
- Combining URL and filesystem path handling
- Variable interpolation in paths

**Start Doing:**
- Use discriminated unions for path types
- Create specialized handlers for different path operations
- Provide a cleaner validation API

**Example Transformation:**

```typescript
// BEFORE
async validatePath(
  filePath: string | MeldPath,
  context: PathValidationContext
): Promise<MeldPath> {
  // Complex validation with multiple path types
  // URL detection and handling
  // Security checks
}

// AFTER
async validatePath(
  path: string,
  options: { baseDir?: string, restrictToBase?: boolean }
): Promise<ValidatedPath> {
  // Early delegation to URL service if needed
  if (this.urlService.isUrl(path)) {
    return this.urlService.validateUrl(path, options);
  }
  
  // Simple filesystem path validation
  const absolutePath = this.resolvePath(path, options.baseDir);
  // Security checks
  return createValidatedPath(absolutePath, path);
}
```

### 3. DirectiveService

**Stop Doing:**
- Complex context preparation
- Mixing directive validation with execution
- Complex state management

**Start Doing:**
- Use discriminated unions to route directives
- Let handlers own their type-specific logic
- Use simpler context objects

**Example Transformation:**

```typescript
// BEFORE
async handleDirective(
  node: DirectiveNode,
  context: DirectiveProcessingContext
): Promise<DirectiveResult> {
  // Complex context creation
  // Validation
  // Handler lookup and invocation with extensive context
}

// AFTER
async handleDirective<T extends DirectiveNode>(
  directive: T,
  state: IStateService,
  options: { strict: boolean, filePath?: string }
): Promise<DirectiveResult> {
  // Find handler using discriminated union
  const handler = this.findHandler(directive);
  // Type-safe handler invocation
  return handler.handle(directive, state, options);
}
```

### 4. InterpreterService

**Stop Doing:**
- Complex nested interpretation logic
- Using complex options objects
- Handling multiple responsibilities

**Start Doing:**
- Focus on coordinating the interpretation pipeline
- Use simpler, focused parameters
- Delegate specialized tasks

**Example Transformation:**

```typescript
// BEFORE
async interpret(
  nodes: MeldNode[],
  options?: InterpreterOptions,
  initialState?: IStateService
): Promise<IStateService> {
  // Complex options handling
  // State initialization
  // Complex node processing with nested contexts
}

// AFTER
async interpret(
  nodes: MeldNode[],
  options: {
    initialState?: IStateService,
    filePath?: string,
    strict?: boolean
  } = {}
): Promise<IStateService> {
  // Simple state initialization
  const state = options.initialState || this.stateFactory.createState();
  
  // Process nodes using discriminated unions
  for (const node of nodes) {
    await this.processNode(node, state, options);
  }
  
  return state;
}
```

### 5. ValidationService

**Stop Doing:**
- Generic validation logic
- Validation based solely on directive kind
- Tight coupling with other services

**Start Doing:**
- Use discriminated unions for type-specific validation
- Create specialized validators
- Provide better error messages

**Example Transformation:**

```typescript
// BEFORE
async validate(node: DirectiveNode): Promise<void> {
  const validator = this.validators.get(node.kind);
  await validator(node);
}

// AFTER
async validate<T extends DirectiveNode>(directive: T): Promise<void> {
  // Find validator using discriminated union
  const validator = this.validators.get(directive.kind);
  // Type-safe validation
  await validator(directive);
}
```

### 6. StateService (Already Using New System?)

**Stop Doing:**
- Complex state objects with many methods
- Mixing state storage with operations
- Internal variable type management

**Start Doing:**
- Use a simple typed container
- Make state immutable by default
- Use specialized data structures

**Example Transformation:**

```typescript
// BEFORE
setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): Promise<void> {
  // Complex metadata handling
  // Immutability checks
  // Type-specific variable creation
  await this.setVariable(textVar);
}

// AFTER
setVariable<T extends VariableType>(
  name: string,
  value: any,
  type: T
): void {
  // Create variable using type discriminator
  const variable = createVariable(name, value, type);
  // Simple storage update
  this.getVariables(type).set(name, variable);
}
```

## Implementation Strategy

1. **Start at the Core**: Focus first on core type changes
2. **Service-by-Service Approach**: Refactor one service at a time, starting with StateService
3. **Clean Compiler Errors**: Let TypeScript guide your refactoring by fixing compile errors
4. **Layered Testing**: Test each service thoroughly after refactoring

## Verification Checklist

For each service, ensure:

- [ ] All imports use `@core/ast/types` for AST types
- [ ] Complex context objects are replaced with simple parameter objects
- [ ] Methods leverage discriminated unions for type safety
- [ ] Service has focused responsibilities
- [ ] Tests pass with the new implementation

This refactoring will significantly reduce complexity while improving type safety and maintainability.