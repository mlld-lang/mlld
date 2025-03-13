# VariableReferenceResolver Refactoring Plan

## Overview

Based on a thorough investigation of the `VariableReferenceResolver` class, this document outlines a comprehensive refactoring plan to address the constructor parameter mismatch between implementation and tests, as well as multiple TypeScript errors related to type definitions, error handling, and AST node structure.

## Current State Analysis

### Constructor Mismatch
The current implementation of `VariableReferenceResolver` has the following constructor:

```typescript
constructor(
  private readonly stateService: IStateService,
  private readonly resolutionService?: IResolutionService
) {}
```

However, the tests instantiate it with three parameters:

```typescript
resolver = new VariableReferenceResolver(stateService, undefined, parserService);
```

This mismatch is causing typechecking errors but not runtime errors because JavaScript ignores extra parameters.

### TypeScript Errors

Several categories of TypeScript errors were identified:

1. **Missing Enum Values**:
   - `ResolutionErrorCode.FIELD_NOT_FOUND` 
   - `ResolutionErrorCode.INVALID_ACCESS`
   - `ErrorSeverity.Error`

2. **AST Node Type Mismatches**:
   - Property `value` not existing on type `TextNode`
   - Incompatible types `NodeType` and `"VariableReference"`
   - Property `fields` not existing on type `TextVarNode | DataVarNode`

3. **Interface Definition Problems**:
   - Property `resolveInContext` not existing on type `IResolutionServiceClient`

4. **Error Details Structure Issues**:
   - Unknown properties `variable` and `path` in type `ResolutionErrorDetails`

### DI Approach Confusion

The class shows evidence of being in transition between several DI approaches:
- Legacy direct constructor parameter injection
- ServiceMediator pattern (now being removed)
- Factory pattern with lazy initialization

### AST Structure Discrepancies

The code assumes AST node structures that don't match the current type definitions, suggesting the code evolved but the type definitions didn't keep pace.

## Root Cause Analysis

These issues stem from multiple interrelated factors:

1. **Evolution of Dependency Architecture**: The class was initially designed with ServiceMediator in mind, then converted to direct dependencies, and now being transitioned to a factory pattern. This evolution was not consistently applied across the codebase.

2. **Incomplete Type Updates**: As the AST structure evolved, type definitions were not consistently updated, resulting in TypeScript errors.

3. **Test-Implementation Drift**: Tests continued to pass because they were using a parameter pattern that the runtime code was accepting but the type system wasn't.

4. **Hidden Parser Dependency**: The class clearly depends on a parser service, but this dependency isn't properly declared in the constructor, causing the mismatch.

5. **Inconsistent Error Handling**: Error codes and structures have evolved, but error construction hasn't been updated to match.

## Refactoring Approach

The refactoring will be implemented in distinct, testable stages that ensure all functionality is preserved while fixing the identified issues. Each stage will include comprehensive tests to verify that the refactoring doesn't break existing functionality.

### Stage 1: Align Constructor and Dependencies

1. **Update Constructor Signature**:
   ```typescript
   constructor(
     private readonly stateService: IStateService,
     private readonly resolutionService?: IResolutionService,
     private readonly parserService?: IParserService
   ) {}
   ```

2. **Add Factory Initialization Logic**:
   - Ensure proper initialization of the parser client
   - Add appropriate error handling
   - Update client initialization methods

3. **Update Parser-Related Methods**:
   - Properly access the parser service through the parameter
   - Fall back to factory-based client when appropriate

### Stage 2: Fix Type Definitions

1. **Update ResolutionErrorCode Enum**:
   - Add missing values: `FIELD_NOT_FOUND`, `INVALID_ACCESS` 
   - Ensure compatibility with existing usages

2. **Update ErrorSeverity Enum**:
   - Add missing values: `Error`
   - Ensure compatibility with existing usages

3. **Update ResolutionErrorDetails Interface**:
   - Add missing properties: `variable`, `path`, etc.
   - Ensure compatibility with existing error creation

### Stage 3: Update AST Node Handling

1. **Add Proper Type Guards**:
   ```typescript
   function isTextNode(node: MeldNode): node is TextNode {
     return node.type === 'Text';
   }
   
   function isVariableReferenceNode(node: MeldNode): node is TextVarNode | DataVarNode {
     return node.type === 'VariableReference';
   }
   ```

2. **Update Node Processing Logic**:
   - Use type guards to safely access node properties
   - Handle both old and new AST node formats for backward compatibility
   - Add proper null/undefined checks

3. **Fix Field Access Patterns**:
   - Update the fields property handling to match AST node structure
   - Add proper indexing methods

### Stage 4: Implement Clean Resolution Client Interface

1. **Update IResolutionServiceClient Interface**:
   - Add missing methods like `resolveInContext`
   - Ensure backward compatibility

2. **Enhance Factory Initialization**:
   - Improve error handling during factory initialization
   - Add more descriptive error messages

3. **Update Tests**:
   - Update tests to reflect the new constructor signature
   - Add tests for different initialization scenarios
   - Verify correct factory usage

### Stage 5: Improve Error Handling

1. **Standardize Error Creation**:
   - Use consistent error creation patterns
   - Ensure all error details match the interface

2. **Add Comprehensive Error Types**:
   - Add missing error types and codes
   - Ensure all error cases are properly typed

3. **Enhance Error Context**:
   - Include more context in error details
   - Improve error messages for debugging

### Stage 6: Comprehensive Testing

1. **Unit Test Coverage**:
   - Add tests for all edge cases
   - Test different initialization scenarios
   - Test with and without factories

2. **Integration Testing**:
   - Verify integration with ResolutionService
   - Test with actual parser implementations
   - Verify field access patterns

3. **Documentation**:
   - Update comments to reflect new implementation
   - Add JSDoc for all methods
   - Document initialization requirements

## Implementation Details

### Stage 1: Align Constructor and Dependencies

#### Constructor Update

```typescript
/**
 * Creates a new instance of the VariableReferenceResolver
 * @param stateService - State service for variable management
 * @param resolutionService - Optional resolution service for variable resolution
 * @param parserService - Optional parser service for content parsing
 */
constructor(
  private readonly stateService: IStateService,
  private readonly resolutionService?: IResolutionService,
  private readonly parserService?: IParserService
) {
  // Initialize factories if direct services aren't provided
  if (!this.parserService) {
    this.initializeFactories();
  }
}
```

#### Factory Initialization Update

```typescript
/**
 * Lazily initialize the service client factories
 * This is called only when needed to avoid circular dependencies
 */
private initializeFactories(): void {
  if (this.factoryInitialized) {
    return;
  }
  
  this.factoryInitialized = true;
  
  // Initialize resolution client factory
  try {
    this.resolutionClientFactory = container.resolve('ResolutionServiceClientFactory');
    this.initializeResolutionClient();
  } catch (error) {
    logger.warn('Failed to resolve ResolutionServiceClientFactory', { error });
  }
  
  // Initialize parser client factory
  try {
    this.parserClientFactory = container.resolve('ParserServiceClientFactory');
    this.initializeParserClient();
  } catch (error) {
    logger.warn('Failed to resolve ParserServiceClientFactory', { error });
  }
}
```

#### Parser Usage Update

```typescript
private async parseContent(content: string): Promise<MeldNode[]> {
  // If direct parser service is provided, use it
  if (this.parserService) {
    try {
      return await this.parserService.parse(content);
    } catch (error) {
      logger.warn('Error parsing content with direct parser service', { error });
    }
  }
  
  // Fall back to factory-based client
  this.ensureFactoryInitialized();
  
  if (this.parserClient) {
    try {
      return await this.parserClient.parseString(content);
    } catch (error) {
      logger.warn('Error parsing content with parser client', { error });
    }
  }
  
  // Fall back to simple regex parsing
  // [existing fallback code]
}
```

### Stage 2: Fix Type Definitions

#### Update Resolution Error Codes

```typescript
// In ResolutionErrorCode enum
export enum ResolutionErrorCode {
  VARIABLE_NOT_FOUND = 'variable-not-found',
  CIRCULAR_REFERENCE = 'circular-reference',
  REFERENCE_DEPTH_EXCEEDED = 'reference-depth-exceeded',
  FIELD_NOT_FOUND = 'field-not-found',
  INVALID_ACCESS = 'invalid-access',
  FIELD_ACCESS_ERROR = 'field-access-error'
}
```

#### Update Error Severity Enum

```typescript
// In ErrorSeverity enum
export enum ErrorSeverity {
  Fatal = 'fatal',
  Error = 'error',
  Recoverable = 'recoverable',
  Warning = 'warning'
}
```

#### Update Resolution Error Details Interface

```typescript
// In ResolutionErrorDetails interface
export interface ResolutionErrorDetails {
  code?: ResolutionErrorCode;
  severity?: ErrorSeverity;
  variableName?: string;
  variable?: string;
  field?: string | number;
  path?: string;
  index?: number;
  length?: number;
  type?: string;
}
```

### Stage 3: AST Node Handling Updates

#### Add Type Guards

```typescript
/**
 * Type guard for TextNode
 */
private isTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text';
}

/**
 * Type guard for VariableReferenceNode
 */
private isVariableReferenceNode(node: MeldNode): node is any {
  // Handle both string literal and enum value
  return node.type === 'VariableReference' || node.type === NodeType.VariableReference;
}

/**
 * Type guard for field access nodes
 */
private hasFields(node: any): node is { fields: Field[] } {
  return node && Array.isArray(node.fields);
}
```

#### Update Node Processing Logic

```typescript
/**
 * Process a parsed node
 */
private async processNode(node: MeldNode, context: ResolutionContext): Promise<string> {
  // Text node handling
  if (this.isTextNode(node)) {
    // Safe access with type guard
    return (node as TextNode).value || '';
  }
  
  // Variable reference handling
  if (this.isVariableReferenceNode(node)) {
    const varNode = node as any; // Using any temporarily until we fix the types
    const varName = varNode.identifier || '';
    
    // Handle field access
    if (this.hasFields(varNode)) {
      return await this.processFieldAccessNode(varNode, context);
    }
    
    // Simple variable
    return await this.processSimpleVariable(varName, context);
  }
  
  // Unknown node type
  return '';
}
```

### Stage 4: Resolution Client Interface

```typescript
// Update IResolutionServiceClient interface
export interface IResolutionServiceClient {
  // Existing methods
  resolveString(content: string): Promise<string>;
  
  // Add missing methods
  resolveInContext(content: string, context: ResolutionContext): Promise<string>;
  extractReferences(content: string): string[];
}
```

### Stage 5: Consistent Error Handling

```typescript
/**
 * Create a standardized resolution error
 */
private createResolutionError(
  message: string,
  code: ResolutionErrorCode,
  severity: ErrorSeverity,
  details: Partial<ResolutionErrorDetails>
): MeldResolutionError {
  return new MeldResolutionError(
    message,
    {
      code,
      severity,
      ...details
    }
  );
}

/**
 * Handle variable not found error
 */
private handleVariableNotFound(varName: string, context: ResolutionContext): string {
  if (context.strict) {
    throw this.createResolutionError(
      `Variable ${varName} not found`,
      ResolutionErrorCode.VARIABLE_NOT_FOUND,
      ErrorSeverity.Error,
      { variable: varName }
    );
  }
  return '';
}
```

## Testing Strategy

The refactoring will be accompanied by comprehensive tests to ensure that all functionality is preserved and no regressions are introduced. The testing strategy includes:

1. **Unit Tests**: Tests for each public method and key private methods
2. **Integration Tests**: Tests with actual parser and resolver implementations
3. **Edge Case Tests**: Tests for error handling, fallbacks, and unusual inputs
4. **Factory Tests**: Tests for different factory initialization scenarios
5. **Performance Tests**: Ensure the refactored code maintains performance characteristics

## Backward Compatibility

The refactoring will maintain backward compatibility by:

1. **Supporting Multiple Constructor Patterns**: Both two and three parameter constructors will work
2. **Handling Old and New AST Formats**: Both old and new node types will be supported
3. **Supporting Mixed Dependency Approaches**: Direct services, factories, and ServiceMediator (transitionally) will be supported
4. **Maintaining Error Patterns**: Error messages and structure will remain consistent

## Timeline and Milestones

| Stage | Description | Estimated Effort | Testing Approach |
|-------|-------------|------------------|------------------|
| 1     | Constructor Alignment | 1 day | Unit tests for constructor |
| 2     | Type Definition Fixes | 1 day | Typechecking and unit tests |
| 3     | AST Node Handling | 2 days | Unit and integration tests |
| 4     | Resolution Client Interface | 1 day | Unit tests with mock clients |
| 5     | Error Handling | 1 day | Comprehensive error tests |
| 6     | Comprehensive Testing | 2 days | Full test suite, integration tests |

Total estimated time: 8 days (1.5-2 weeks of development effort)

## Conclusion

This refactoring plan addresses the constructor parameter mismatch and TypeScript errors in the `VariableReferenceResolver` class through a staged approach that ensures backward compatibility and comprehensive testing. The primary focus is on aligning the implementation with the tests, fixing type definitions, improving AST node handling, and standardizing error handling.

By following this plan, we can resolve the issues without disrupting the ongoing ServiceMediator removal project while setting the stage for more robust variable resolution implementation in the future.