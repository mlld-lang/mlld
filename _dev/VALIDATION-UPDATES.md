# Updated Validation Architecture Plan

## Background

The Meld codebase has undergone a major AST restructuring that significantly changes our validation approach. The new grammar produces rich, fully-typed AST nodes that eliminate the need for most string parsing and structural validation that was previously required.

### What Changed

Previously, our AST had a nested structure with a `directive` property:
```javascript
{
  type: "Directive",
  directive: {
    kind: "text",
    identifier: "greeting",
    value: "Hello world"
  }
}
```

Now, the AST has a flattened structure with typed node arrays:
```javascript
{
  type: "Directive",
  kind: "text",
  subtype: "textAssignment",
  source: "literal",
  values: {
    identifier: [{
      type: "VariableReference",
      identifier: "greeting"
    }],
    content: [{
      type: "Text",
      content: "Hello world"
    }]
  },
  raw: { identifier: "greeting", content: "Hello world" },
  meta: { sourceType: "literal", hasVariables: false }
}
```

This restructuring means:
1. The grammar handles all syntax validation
2. Every piece of content is a fully-typed node
3. String parsing is no longer needed in validators
4. Most structural validation is guaranteed by the grammar

## Current Understanding

### Three Layers of Validation (Simplified)

1. **Grammar Validation (AST Layer)**
   - Handles ALL syntax and structure validation
   - Creates typed AST nodes with proper structure
   - Guarantees node types and field presence
   - No additional syntax validation needed downstream

2. **Validator Logic (Semantic Layer)**
   - Only validates semantic rules and business logic
   - Examples:
     - Variable immutability rules
     - Cross-directive dependencies
     - Naming conventions
   - Does NOT validate syntax or structure (grammar handles this)

3. **Handler Service (Runtime Layer)**
   - Handles runtime validation only
   - Examples:
     - File existence
     - Variable resolution
     - Command execution

## Required Changes

### 1. Simplify Validators

Most validators can be reduced to minimal semantic checks:

```typescript
// Example: Text directive validator (if needed at all)
export function validateTextDirective(node: DirectiveNode): void {
  // Grammar guarantees structure, so we only check semantic rules
  // In this case, there might not be any semantic rules for @text
  
  // Example semantic rule: variable names can't start with underscore
  const identifier = node.values.identifier[0].identifier;
  if (identifier.startsWith('_')) {
    throw new MeldDirectiveError('Variable names cannot start with underscore');
  }
}
```

### 2. Remove String Parsing

All string parsing is handled by the grammar. Validators should work with typed nodes:

```typescript
// OLD approach (no longer needed)
function findVariablesInTemplate(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  // ... regex parsing
}

// NEW approach (variables are already parsed)
function getVariablesFromTemplate(nodes: TemplateNode[]): VariableReference[] {
  return nodes.filter(node => node.type === 'VariableReference');
}
```

### 3. Trust the AST Structure

Handlers can trust that the AST is valid:

```typescript
async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
  const node = context.directiveNode;
  
  // No need to validate structure - grammar guarantees it
  const identifier = node.values.identifier[0].identifier;
  const content = node.values.content;
  
  // Focus only on runtime concerns
  const resolvedContent = await this.resolveContent(content, context);
  // ...
}
```

## Validators to Keep, Simplify, or Remove

### Remove Entirely
- String syntax validators (grammar handles this)
- Structure validators (grammar guarantees structure)
- Type checking (TypeScript + grammar handle this)

### Simplify Dramatically
- **Path validator**: Just check semantic rules (if any)
- **Text validator**: Check naming conventions only
- **Data validator**: Possibly just check size limits

### Keep (But Update)
- **Cross-directive validators**: Still needed for relationship validation
- **State consistency validators**: Still needed for business logic
- **Import validators**: May need to validate import cycles

## Updated Validation Examples

### Example 1: Variable Immutability

```typescript
// This remains a semantic validation concern
export function validateDefineDirective(node: DirectiveNode, state: IStateService): void {
  const identifier = node.values.identifier[0].identifier;
  
  if (state.hasVariable(identifier)) {
    throw new MeldDirectiveError(
      `Variable '${identifier}' already defined`,
      { severity: ErrorSeverity.Recoverable }
    );
  }
}
```

### Example 2: Import Cycles

```typescript
// This remains a semantic concern
export function validateImportDirective(node: DirectiveNode, context: ValidationContext): void {
  const importPath = node.values.path[0].content;
  
  if (context.hasCircularImport(importPath)) {
    throw new MeldDirectiveError(
      `Circular import detected: ${importPath}`,
      { severity: ErrorSeverity.Fatal }
    );
  }
}
```

## Migration Strategy

1. **Audit existing validators**: Identify which perform string parsing
2. **Remove redundant validators**: Delete those that duplicate grammar work
3. **Update remaining validators**: Convert to work with new AST structure
4. **Update handlers**: Remove any validation that should be in validators
5. **Document patterns**: Create clear examples for future validators

## Benefits of New Approach

1. **Performance**: No redundant string parsing
2. **Maintainability**: Less code to maintain
3. **Clarity**: Clear separation of concerns
4. **Type Safety**: Full TypeScript support with typed nodes
5. **Error Quality**: More precise error locations from grammar

## Action Items

1. **Remove String Parsing**
   - [ ] Audit all validators for string parsing code
   - [ ] Remove regex-based validation
   - [ ] Update to use typed AST nodes

2. **Simplify Validators**
   - [ ] Identify validators that only check structure
   - [ ] Remove or dramatically simplify them
   - [ ] Focus on semantic rules only

3. **Update Handlers**
   - [ ] Remove structural validation from handlers
   - [ ] Trust AST structure from grammar
   - [ ] Focus on runtime concerns only

4. **Documentation**
   - [ ] Update examples to show new patterns
   - [ ] Document what validators are still needed
   - [ ] Create migration guide for existing code

## Implementation Priority

1. **High Priority**: Fix validators causing test failures
   - StringLiteralHandler (already fixed)
   - FuzzyMatchingValidator (already fixed)
   - Validators expecting `node.directive` structure

2. **Medium Priority**: Simplify working validators
   - Remove unnecessary string parsing
   - Reduce to semantic checks only

3. **Low Priority**: Documentation and cleanup
   - Update all examples
   - Remove dead code
   - Create best practices guide