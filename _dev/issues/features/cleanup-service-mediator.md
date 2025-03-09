# Remove ServiceMediator Pattern

## Background
The ServiceMediator pattern was implemented as a transitional solution during the DI migration to handle circular dependencies between core services. Now that the DI implementation is complete, this pattern should be removed in favor of a cleaner architecture.

## Problem
The ServiceMediator creates tight coupling between services and relies on manual initialization with numerous null checks. While it effectively broke the circular dependencies during the migration, it's not an ideal long-term solution and masks deeper architectural issues.

## Proposed Solution
1. Identify and eliminate circular dependencies between core services
2. Restructure service interfaces to reduce interdependencies 
3. Consider using factory patterns or providers for complex dependency chains
4. Remove the ServiceMediator class and all related logic
5. Update tests that rely on the ServiceMediator

## Implementation Steps
1. Audit all services using ServiceMediator to understand dependency relationships
2. Identify alternative patterns to resolve each circular dependency
3. Refactor each service to eliminate mediator dependencies
4. Update di-config.ts to use standard DI registration without manual wiring
5. Remove ServiceMediator class and interface
6. Update tests to work without ServiceMediator

## Success Criteria
- ServiceMediator class and interface completely removed
- All services instantiated correctly without circular dependencies
- No regression in functionality
- Tests pass without ServiceMediator-related mocks

## Estimated Complexity
Medium-High - Requires careful refactoring of core service relationships