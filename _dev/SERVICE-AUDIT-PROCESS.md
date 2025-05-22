# Service Audit Process for AST Type Migration

This document outlines a structured process for auditing each service to determine how it should be refactored to leverage the new AST and type system. The process aims to create specific, actionable refactoring guides for each service.

## Audit Process Overview

For each service, follow these steps:

1. **Understand the AST Types**
2. **Review AST Fixtures**
3. **Study the StateService Model**
4. **Analyze Current Service Implementation**
5. **Design a Simplified Interface**
6. **Create a Refactoring Plan**

## Detailed Audit Steps

### Step 1: Understand the AST Types

**Activities:**
- Review all relevant AST type definitions in `core/ast/types`
- Note the discriminated unions and structural patterns
- Understand how the AST represents different directive types

**Key Questions:**
- What are the relevant node types for this service?
- How are discriminated unions used for type safety?
- What metadata is available on each node type?

**Deliverable:**
- Summary of key AST types relevant to the service

### Step 2: Review AST Fixtures

**Activities:**
- Examine fixtures in `core/ast/fixtures`
- Trace how directives are parsed into AST nodes
- Note the structure and properties of generated nodes

**Key Questions:**
- How are values captured in the AST?
- What patterns appear across multiple fixtures?
- How are complex structures represented?

**Deliverable:**
- Examples of key AST structures relevant to the service

### Step 3: Study the StateService Model

**Activities:**
- Review the new StateService implementation
- Understand how it acts as a simple typed container
- Note patterns for state access and modification

**Key Questions:**
- How does StateService store and retrieve values?
- What type safety mechanisms are used?
- How are discriminated unions leveraged for type checking?

**Deliverable:**
- Summary of StateService patterns to adopt

### Step 4: Analyze Current Service Implementation

**Activities:**
- Review current service interface and implementation
- Identify complex patterns and context objects
- Note dependencies on other services

**Key Questions:**
- What are the core responsibilities of this service?
- Which methods contain complex logic that could be simplified?
- What context objects are used and how can they be simplified?
- Which methods rely on generic typing that could use discriminated unions?

**Deliverable:**
- List of service responsibilities and complex patterns to simplify

### Step 5: Design a Simplified Interface

**Activities:**
- Create a new interface definition that:
  - Uses AST types directly
  - Leverages discriminated unions
  - Minimizes context objects
  - Focuses on core responsibilities

**Key Questions:**
- What are the minimal methods needed for this service?
- How can parameters be simplified?
- How can discriminated unions improve type safety?

**Deliverable:**
- Proposed simplified interface with method signatures

### Step 6: Create a Refactoring Plan

**Activities:**
- Document specific changes needed for each method
- Provide before/after examples for key methods
- Address handling of dependencies
- Create a testing strategy

**Key Questions:**
- What is the step-by-step approach to refactoring?
- How should dependencies be handled during refactoring?
- What are potential issues to watch for?

**Deliverable:**
- Comprehensive refactoring guide for the service

## Service Audit Template

```markdown
# [ServiceName] Refactoring Guide

## 1. Key AST Types

[Summary of relevant AST types from core/ast/types]

## 2. AST Fixture Examples

[Examples of key fixtures showing AST structure]

## 3. StateService Patterns to Adopt

[Patterns from StateService to incorporate]

## 4. Current Service Analysis

### Core Responsibilities
[List of essential responsibilities]

### Complex Patterns to Simplify
[List of patterns that can be improved]

### Dependencies
[List of dependencies and how they should be handled]

## 5. Simplified Interface

```typescript
export interface I[ServiceName] {
  // New method signatures
}
```

## 6. Refactoring Plan

### Method Refactoring Examples

**Before/After Examples:**
[Code examples for key methods]

### Dependencies Handling
[How to handle service dependencies]

### Testing Strategy
[Approach to testing the refactored service]

### Implementation Steps
1. [Step 1]
2. [Step 2]
...
```

## Service Audit Schedule

To ensure a systematic approach, audit services in the following order:

1. **ResolutionService** - Handles variable resolution, most critical after StateService
2. **PathService** - Manages path handling and validation
3. **DirectiveService** - Orchestrates directive handling
4. **ValidationService** - Handles directive validation
5. **InterpreterService** - Coordinates overall interpretation

## Integration with Broader Refactoring

This audit process is part of the broader type system refactoring:

1. Update core/types to re-export AST types (in progress)
2. Complete service audits using this process
3. Implement refactoring for each service
4. Update tests for each service
5. Verify end-to-end functionality

By following this structured approach, each service can be systematically refactored to leverage the new AST type system, resulting in a cleaner, more maintainable codebase.