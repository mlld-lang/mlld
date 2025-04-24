# Validation Architecture Plan

## Background

The Meld codebase has undergone significant architectural changes, particularly in how we handle variables and AST processing. Originally, much of our validation was done through string parsing and regular expressions, spread across different layers of the application. This led to redundant validation, unclear responsibilities, and potential inconsistencies.

A major shift came with the AST refactoring (see _plans/AST-VARIABLES-done.md), where we moved to a more structured approach. The grammar now produces rich AST nodes that contain all necessary information about variables, paths, and other elements. This eliminated the need for downstream services to re-parse strings or perform their own syntax validation.

However, our validation code hasn't fully caught up with this architectural shift. Many validators still contain string parsing logic that duplicates what the grammar already does. For example, the embed directive validator still uses regex to find variables in templates, even though those variables are already available as AST nodes.

This plan outlines how to align our validation architecture with the new AST-centric approach, ensuring each layer (Grammar, Validator, Handler) has clear responsibilities and avoiding redundant work.

## Current Understanding

### Three Layers of Validation

1. **Grammar Validation (AST Layer)**
   - Handles syntax and structure validation
   - Creates typed AST nodes with proper structure
   - Example: For `@embed [[template]]`, validates:
     - Basic directive syntax
     - Template content format
     - Variable reference syntax
     - Path formats

2. **Validator Service (Semantic Layer)**
   - Validates AST node structure and relationships
   - Should NOT re-parse strings or re-validate syntax
   - Should focus on validating AST node properties
   - Example: For `@embed`:
     - Validates that path exists in AST for embedPath
     - Validates that variable reference exists in AST for embedVariable
     - Validates that content exists for embedTemplate

3. **Handler Service (Runtime Layer)**
   - Handles runtime validation and execution
   - Validates actual resources and state
   - Example: For `@embed`:
     - Validates file existence for embedPath
     - Validates variable existence for embedVariable
     - Validates variable resolution for embedTemplate

## Current Issues

1. **Redundant Validation**
   - Validators sometimes re-parse strings that grammar already parsed
   - Example: Using regex to find variables in template when AST already has them

2. **Mixed Concerns**
   - Some validators try to do runtime validation
   - Some handlers repeat AST validation

3. **Inconsistent Approach**
   - Different directives handle validation differently
   - Some rely more on grammar, others on validators

## Required Changes

### 1. Update Validator Service

```typescript
// Example of proper validator approach
export function validateEmbedDirective(node: DirectiveNode): void {
  const directive = node.directive as EmbedDirectiveData;
  
  switch (directive.subtype) {
    case 'embedPath':
      // Only validate AST structure
      if (!directive.path) {
        throw new MeldDirectiveError('Missing path in AST');
      }
      break;
      
    case 'embedVariable':
      // Only validate AST structure
      if (!directive.path?.variable) {
        throw new MeldDirectiveError('Missing variable in AST');
      }
      break;
      
    case 'embedTemplate':
      // Only validate AST structure
      if (!directive.content) {
        throw new MeldDirectiveError('Missing content in AST');
      }
      break;
  }
}
```

### 2. Update Handlers

```typescript
// Example of proper handler approach
async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
  // Trust that AST is valid
  const directive = context.node.directive as EmbedDirectiveData;
  
  switch (directive.subtype) {
    case 'embedPath':
      // Focus on runtime validation
      if (!await this.fileSystem.exists(directive.path)) {
        throw new MeldDirectiveError('File does not exist');
      }
      break;
  }
}
```

### 3. Document Grammar Responsibilities

- Update grammar documentation to clearly state what it validates
- Add comments in grammar rules explaining validation
- Consider adding validation-specific grammar tests

## Action Items

1. **Audit Current Validators**
   - [ ] List all string parsing in validators
   - [ ] Identify what should move to grammar
   - [ ] Document AST shape requirements

2. **Update Grammar**
   - [ ] Move string parsing to grammar where possible
   - [ ] Ensure AST nodes contain all needed data
   - [ ] Add validation-focused tests

3. **Refactor Validators**
   - [ ] Remove string parsing
   - [ ] Focus on AST structure
   - [ ] Add clear error messages

4. **Update Handlers**
   - [ ] Remove AST validation
   - [ ] Focus on runtime checks
   - [ ] Add clear error messages

5. **Add Documentation**
   - [ ] Document validation layers
   - [ ] Add validation examples
   - [ ] Update contributor guide

## Implications

### 1. Performance
- Reduced redundant processing - no more re-parsing of strings
- Better error detection - issues caught at the right layer
- More efficient variable resolution - direct AST access vs string parsing

### 2. Maintainability
- Clear separation of concerns makes code easier to understand
- Validation bugs are easier to fix when we know which layer is responsible
- New directives have a clear template to follow

### 3. User Experience
- More accurate error messages - reported from the correct layer
- Better error locations - grammar catches syntax errors at exact position
- Faster processing - no redundant validation

### 4. Developer Experience
- Easier to add new directives - clear validation pattern
- Simpler testing - each layer has clear responsibilities
- Better IDE support - TypeScript can better understand AST types

## Migration Strategy

1. Start with one directive (e.g., `@embed`)
2. Update its grammar, validator, and handler
3. Use as example for other directives
4. Create validation checklist for new directives

## Success Metrics

1. No string parsing in validators
2. Clear separation of concerns
3. Consistent approach across directives
4. Better error messages
5. Fewer redundant checks
