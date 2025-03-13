# VariableReferenceResolver Refactoring Needed

## Overview

During the ServiceMediator removal project (Phase 5.2), two related issues were discovered with the `VariableReferenceResolver` class:

1. Constructor parameter mismatch between implementation and tests
2. Numerous TypeScript errors relating to type definitions, error handling, and AST node structure

These issues appear to be symptoms of the same underlying architectural and design problems that require a comprehensive refactoring effort.

## Issue 1: Constructor Parameter Mismatch

### Current Implementation

In `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts`, the constructor is defined as:

```typescript
constructor(
  private readonly stateService: IStateService,
  private readonly resolutionService?: IResolutionService
) {}
```

### Current Usage in Tests

In `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts`, the class is instantiated as:

```typescript
resolver = new VariableReferenceResolver(stateService, undefined, parserService);
```

Where `parserService` is a mock parser service created with `createMockParserService()`.

## Issue 2: Type Definition Errors

The implementation file contains numerous TypeScript errors, including:

### Missing Enum Values

```typescript
Property 'FIELD_NOT_FOUND' does not exist on type 'typeof ResolutionErrorCode'
Property 'INVALID_ACCESS' does not exist on type 'typeof ResolutionErrorCode'
Property 'Error' does not exist on type 'typeof ErrorSeverity'
```

### AST Node Type Mismatches

```typescript
Property 'value' does not exist on type 'TextNode'
This comparison appears to be unintentional because the types 'NodeType' and '"VariableReference"' have no overlap
Property 'fields' does not exist on type 'TextVarNode | DataVarNode'
```

### Interface Definition Problems

```typescript
Property 'resolveInContext' does not exist on type 'IResolutionServiceClient'
```

### Error Details Structure Issues

```typescript
Object literal may only specify known properties, and 'variable' does not exist in type 'ResolutionErrorDetails'
Object literal may only specify known properties, and 'path' does not exist in type 'ResolutionErrorDetails'
```

## Root Cause Analysis

These issues stem from the same underlying problems:

1. **Evolution of Dependencies**: The resolver has evolved from using ServiceMediator to direct dependencies to factory pattern, but the constructor and interfaces haven't been consistently updated.

2. **Hidden Dependencies**: The resolver relies on a parser service that isn't properly declared in its constructor, causing the mismatch.

3. **AST Structure Changes**: The AST node structures have changed over time but the resolver hasn't been fully updated to match.

4. **Type Definition Drift**: Error codes, severity levels, and API interfaces have evolved but type definitions haven't kept pace.

5. **Inconsistent Dependency Injection**: The code mixes several approaches to dependency injection (constructor, ServiceMediator, factories), leading to confusion.

## Evidence of Relationship

The relationship between these issues is evident in several ways:

1. The undeclared third parameter (`parserService`) in the constructor corresponds to the parser-related functionality that generates AST node type errors.

2. The resolver references `this.serviceMediator` for parsing but also attempts to use direct parser client access through factories, showing the transitional state.

3. Tests continue to pass despite these issues, suggesting the runtime behavior works but the types and interfaces have drifted from implementation.

4. Both issues appeared during ServiceMediator removal work, indicating they were masked by the mediator's loose coupling previously.

## Runtime Behavior

Despite these issues, the resolver continues to function correctly (tests pass). This suggests:

1. JavaScript's dynamic nature allows the code to work even with TypeScript errors
2. The tests might not be comprehensive enough to catch all potential runtime issues
3. The implementation is using fallback mechanisms when primary approaches fail

## Recommended Approach

These issues require a dedicated refactoring effort that addresses both the constructor mismatch and the type errors as part of a comprehensive solution:

1. **Align Constructor with Dependencies**:
   - Explicitly declare all dependencies in the constructor, including the parser service
   - Update all instantiation sites to match the new constructor signature

```typescript
constructor(
  private readonly stateService: IStateService,
  private readonly resolutionService?: IResolutionService,
  private readonly parserService?: IParserService
) {}
```

2. **Update Type Definitions**:
   - Update AST node interfaces to match the actual structure used at runtime
   - Add missing error codes and severity levels
   - Update error details interfaces to include all required properties

3. **Standardize Dependency Approach**:
   - Choose a consistent approach (either constructor injection or factory pattern)
   - If using factories, ensure they're properly initialized and handle errors
   - Remove any remaining references to ServiceMediator

4. **Improve Test Coverage**:
   - Add tests for edge cases, especially AST parsing scenarios
   - Ensure tests validate both happy paths and error conditions
   - Add tests specifically for each type of variable resolution pattern

5. **Refactor Node Processing Logic**:
   - Implement proper type guards and narrowing for AST nodes
   - Use discriminated unions for node types
   - Ensure field access is properly typed

## Implementation Plan

This refactoring should be approached as a dedicated task:

1. **Stage 1**: Create a comprehensive test suite that documents current behavior
2. **Stage 2**: Update constructor and dependency injection approach
3. **Stage 3**: Fix type definitions and interfaces
4. **Stage 4**: Refactor AST node processing
5. **Stage 5**: Improve error handling
6. **Stage 6**: Comprehensive testing and documentation

## Impact on Current Work

For the ServiceMediator removal project, we recommend:

1. Continue with ServiceMediator removal as a separate task
2. Document these issues for future refactoring (this file serves that purpose)
3. Accept that some TypeScript errors will remain until the dedicated refactoring is complete
4. Ensure runtime behavior continues to work despite type errors

## Related Artifacts

- ServiceMediator removal project (Phase 5.2)
- `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts`
- `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts`
- AST node type definitions in `meld-spec` 