# OutputService and VariableReferenceResolver Circular Dependency Issue

## Summary

When implementing Phase 4 of the P0 fixing plan, we encountered a circular dependency issue between the OutputService and the VariableReferenceResolverClientFactory. This issue was causing test failures with the error "TypeInfo not known for VariableReferenceResolverClientFactory".

## Problem Details

1. **Context**: The OutputService needed enhanced field access capabilities that are provided by the VariableReferenceResolver.
2. **Goal**: We wanted to modify OutputService to use VariableReferenceResolverClient for field access to ensure consistent handling of array indices and nested object properties.
3. **Issue**: Adding VariableReferenceResolverClientFactory as a dependency to OutputService created a circular dependency in the DI system.

## Attempted Solutions

### Approach 1: Standard DI with Factory
- Added VariableReferenceResolverClientFactory as a standard DI dependency to OutputService
- Tests failed with "TypeInfo not known for VariableReferenceResolverClientFactory"
- This indicated a circular dependency issue in the DI container

### Approach 2: Lazy Loading Pattern
- Attempted to implement a lazy-loading pattern to defer client creation until needed
- Added a getVariableResolver method to create the client on demand
- This approach still had dependency issues during initialization

### Approach 3: "Drastic" Approach (Working Solution)
- Bypassed the DI system for this specific dependency
- Made the factory dependency truly optional
- Implemented fallback mechanisms for when the client is unavailable
- This pragmatic solution worked and allowed tests to pass

## Implementation Details of Drastic Approach

1. Modified OutputService to accept an optional VariableReferenceResolverClientFactory
2. Added fallback implementations that use direct field access when the client is unavailable
3. Enhanced context-aware string conversion and formatting
4. Added tests to verify the functionality works with and without the resolver client
5. Made the DI dependency truly optional to avoid breaking existing tests

## Benefits of Current Solution

1. Tests are now passing
2. Field access works consistently
3. The implementation is robust with fallbacks
4. No breaking changes to existing code

## Drawbacks

1. The solution bypasses standard DI patterns
2. May require revisiting with a more elegant solution later
3. Adds technical debt in the form of non-standard dependency management

## Recommendations for Future Work

1. Further investigate DI approaches for handling circular dependencies
2. Consider refactoring the architecture to avoid the circular dependency
3. Enhance testing to cover more edge cases with different data types
4. Document this pattern for other services that may encounter similar issues

## Priority

Medium - The current solution is working, but a more elegant solution should be considered for long-term maintainability.