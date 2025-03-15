# AST Factory Pattern Implementation Plan

## Background

After eliminating the external `meld-spec` dependency and integrating its functionality directly into the codebase, we're encountering circular dependency issues with the AST types. These circular dependencies are breaking the build process despite all tests passing.

## Proposed Solution

Apply our established factory pattern to the AST types to break circular dependencies while maintaining consistency with the rest of the codebase.

## Implementation Outline

### 1. Interface Segregation

- Create a set of minimal interfaces for AST nodes in `core/syntax/types/interfaces/`
- Split monolithic interfaces into smaller, focused interfaces
- Establish clear dependency hierarchy between interfaces

### 2. Factory Implementation

- Create factories in `core/syntax/types/factories/`
- Each factory responsible for producing specific node types
- Factories depend only on interfaces, not implementations

### 3. Implementation Reorganization

- Move implementations to their own files to avoid circular imports
- Ensure one-way dependency flow from interfaces → factories → implementations

### 4. Dependency Injection Setup

- Register factories with the DI container
- Update existing code to request node instances from factories
- Use proper interface types rather than concrete implementations

## Specific Components to Address

1. **Base Node Types**
   - `MeldNode` interface
   - `NodeType` definition
   - `SourceLocation` interface

2. **Variable-Related Types**
   - `VariableType` definition
   - `VariableReferenceNode` interface
   - `Field` interface

3. **Directive-Related Types**
   - `DirectiveNode` interface
   - `DirectiveData` interface
   - `DirectiveKind` definition

4. **Content Node Types**
   - `TextNode` interface
   - `CodeFenceNode` interface
   - `CommentNode` interface

## Detailed Next Steps

This plan will be elaborated in a fresh session with sufficient context window to detail:

1. Exact interface definitions and hierarchy
2. Factory method signatures and responsibilities
3. Implementation strategy and migration approach
4. Testing strategy to ensure compatibility

The goal is to maintain backward compatibility while resolving the circular dependencies that are preventing successful builds.