# Complex Data Assignment - Grammar Implementation Plan

## Overview
This plan outlines the grammar changes needed to support embedded directives and complex expressions as values in @data directive objects and arrays.

**Key Architecture Principle**: This feature makes extensive use of existing RHS (right-hand side) patterns. The implementation should maximize reuse of abstractions from `grammar/core/*` rather than creating new patterns. This ensures consistency and maintainability.

## Current State
Currently, the data directive grammar only supports literal values (strings, numbers, booleans, objects, arrays) in object and array contexts. Variable interpolation is supported in strings but not directive embedding.

## Goal State
Enable the following syntax:
```mlld
@data results = {
  test: @run [npm test],
  docs: @add [@README.md],
  info: @myVariable.field[0],
  message: [[Hello {{name}}!]]
}
```

## Prerequisites

Before implementing, the developer should:
1. Review `grammar/docs/NAMING-CONVENTIONS.md` for naming patterns
2. Study existing abstractions in:
   - `grammar/base/context.peggy` - Context detection patterns
   - `grammar/core/*` - Reusable content-type logic (template, command, code, path)
   - `grammar/patterns/*` - Variable references, content patterns, RHS patterns
3. Identify which existing abstractions can be reused rather than recreated

## Implementation Steps

### Step 1: Add Reserved Keywords
**File**: `grammar/base/tokens.peggy` (or similar)

Add all directive names to reserved keywords list to prevent their use as variable names.

```peggy
ReservedDirective
  = "@data" / "@text" / "@run" / "@add" / "@path" 
  / "@import" / "@exec" / "@define"
```

### Step 2: Extract/Create Core Patterns
**File**: `grammar/core/*` (new or existing files)

Before implementing DataValue, audit existing patterns and create new core abstractions where needed:

1. **Check existing cores**: 
   - `RunCore` - May exist in `core/command.peggy` or `core/code.peggy`
   - `AddCore` - Likely needs extraction from `directives/add.peggy`
   - Template patterns - Check `core/template.peggy`

2. **Create new cores where missing**:
   ```peggy
   // In grammar/core/add.peggy (new file if needed)
   AddCore
     = AddPathCore      // Extract from add.peggy
     / AddTemplateCore  // Extract from add.peggy
     / AddVariableCore  // Extract from add.peggy
   
   AddPathCore
     = path:WrappedPathContent { 
         // Core logic without directive wrapper
         return { type: 'addPath', path };
       }
   
   // Similar for other Add variants
   ```

3. **Ensure cores are reusable**: Remove directive-specific wrapper logic, keep only content handling

### Step 3: Create DataValue Rule
**File**: `grammar/directives/data.peggy`

Now use the core patterns (existing or newly created):

```peggy
DataValue
  = DirectiveValue
  / TemplateValue  
  / VariableReferenceValue
  / ObjectLiteral
  / ArrayLiteral
  / LiteralValue

// Embedded directive value - use cores
DirectiveValue
  = "@run" _ expr:RunCore {  // From core/command.peggy or core/code.peggy
      return helpers.createDirectiveValue('run', expr, location());
    }
  / "@add" _ expr:AddCore {   // From newly created core/add.peggy
      return helpers.createDirectiveValue('add', expr, location());
    }

// Variable reference (including field access) - reuse from patterns/variables.peggy
VariableReferenceValue  
  = !ReservedDirective ref:AtVar {  // Important: negative lookahead for reserved directives
      return helpers.createVariableReferenceValue(ref, location());
    }

// Inline template value - reuse from core/template.peggy
TemplateValue
  = content:WrappedTemplateContent {  // Use existing wrapped pattern
      return helpers.createTemplateValue(content.nodes, location());
    }
```

### Step 4: Update Object Property Rules
**File**: `grammar/directives/data.peggy`

Modify object property values to use DataValue:

```peggy
ObjectProperty
  = key:PropertyKey _ ":" _ value:DataValue {
      return { key, value };
    }

PropertyKey
  = QuotedString
  / UnquotedIdentifier  // JSON5-style unquoted keys
```

### Step 5: Update Array Element Rules
**File**: `grammar/directives/data.peggy`

Modify array elements to use DataValue:

```peggy
ArrayElement
  = value:DataValue { return value; }

ArrayElements
  = first:ArrayElement rest:(_ "," _ el:ArrayElement { return el; })* {
      return [first, ...rest];
    }
```

### Step 6: Import Required Rules
**File**: `grammar/directives/data.peggy`

Import rules from core abstractions and patterns:

```peggy
// At the top of data.peggy - import from core/* after creating/verifying cores exist
@import "RunCore" from "../core/command.peggy"  // or "../core/code.peggy" 
@import "AddCore" from "../core/add.peggy"      // From newly created core file
@import "AtVar" from "../patterns/variables.peggy"
@import "WrappedTemplateContent" from "../core/template.peggy"
@import "DirectiveContext" from "../base/context.peggy"
```

### Step 7: Create Helper Functions
**File**: `grammar/helpers.js` (or helpers.ts)

Add helper functions for creating AST nodes:

```javascript
helpers.createDirectiveValue = function(kind, directive, location) {
  return {
    type: 'DirectiveValue',
    kind: kind,
    directive: directive,
    location: location
  };
};

helpers.createVariableReferenceValue = function(reference, location) {
  return {
    type: 'VariableReferenceValue',
    reference: reference,
    location: location
  };
};

helpers.createTemplateValue = function(content, location) {
  return {
    type: 'TemplateValue',
    content: content,
    location: location
  };
};
```

### Step 8: Handle Whitespace and Newlines
Ensure multiline support in objects:

```peggy
ObjectLiteral
  = "{" _ml props:ObjectProperties? _ml "}" {
      return helpers.createObjectLiteral(props || [], location());
    }

// Multiline whitespace  
_ml = [ \t\r\n]*
```

### Step 9: Test Cases
Create comprehensive test cases:

```javascript
// Test basic directive embedding
test('@data result = { test: @run [echo "hi"] }');

// Test variable references
test('@data result = { var: @myVar.field }');

// Test templates
test('@data result = { msg: [[Hello {{name}}!]] }');

// Test nested structures
test(`@data result = {
  info: {
    test: @run [npm test],
    docs: @add [@README.md]
  }
}`);

// Test arrays with directives
test('@data results = [@run [test1], @run [test2]]');
```

## Grammar Gotchas to Avoid

### 1. Ambiguity with Variable References
Be careful to distinguish between:
- `@varname` - variable reference
- `@run`, `@add`, etc. - directive keywords

Use negative lookahead with all reserved directives:
```peggy
VariableReferenceValue
  = !ReservedDirective ref:AtVar { ... }
```

### 2. Template Delimiters
Ensure `[[` and `]]` are properly recognized in value context and don't conflict with path brackets.

### 3. Nested Structures
Make sure recursive rules properly handle arbitrary nesting depth.

### 4. Whitespace Handling
Object and array values may span multiple lines - ensure proper whitespace handling.

### 5. Mixed Dot/Bracket Notation
The grammar currently supports `variable.field[0]` in template contexts but not in direct variable references. This should be extended to work in data value contexts as well.

### 6. Abstraction Hierarchy
Follow the established abstraction levels:
- Level 1-2: Use existing base primitives and variable references
- Level 3-4: Reuse content patterns from patterns/*
- Level 5-6: **Critical**: Reuse wrapped patterns and directive cores from core/*
- Level 7: Only create new rules at the directive level in data.peggy
- Level 8: This IS an RHS pattern implementation

## AST Structure

The grammar should generate this structure:

```json
{
  "type": "Directive",
  "kind": "data",
  "values": {
    "value": {
      "type": "object",
      "properties": {
        "test": {
          "type": "DirectiveValue",
          "kind": "run",
          "directive": { /* full run directive node */ }
        },
        "docs": {
          "type": "DirectiveValue", 
          "kind": "add",
          "directive": { /* full add directive node */ }
        },
        "info": {
          "type": "VariableReferenceValue",
          "reference": { /* variable reference node with fields */ }
        },
        "message": {
          "type": "TemplateValue",
          "content": [ /* template content nodes */ ]
        }
      }
    }
  }
}
```

## Testing Strategy

1. **Unit Tests**: Test each DataValue type individually
2. **Integration Tests**: Test complex nested structures
3. **Error Cases**: Test invalid syntax and reserved keyword usage
4. **Regression Tests**: Ensure existing data directive tests still pass

## Migration Considerations

1. The change should be backward compatible for simple literals
2. Add deprecation warnings for variables named "run" or "add"
3. Provide clear error messages for reserved keyword conflicts

## Dependencies

This work depends on:
- Run directive grammar (`run.peggy`)
- Add directive grammar (`add.peggy`)
- Variable pattern grammar (`variables.peggy`)
- Template content grammar (`content.peggy`)

## Success Criteria

1. All proposed syntax examples parse correctly
2. Generated AST matches the expected structure
3. No regression in existing data directive tests
4. Clear error messages for invalid syntax
5. Performance remains acceptable for deeply nested structures