# Grammar Fix Plan

## Overview
This plan addresses the grammar issues identified in GitHub issues #56-60, focusing on proper abstractions and existing patterns.

## Issues Summary

### Issue #56: Template invocations with parameters in data values
**Problem**: Cannot use `@add @messageTemplate("Alice", "logged in")` in data objects
**Error**: Expected "," "}" or whitespace but "\"" found

### Issue #57: Exec references in data values  
**Problem**: Cannot use `@run @getVersion` in data objects
**Error**: Expected Wrapped command content or whitespace but "@" found

### Issue #58: Null values crash the grammar
**Problem**: `value: null` causes TypeError: Cannot read properties of null
**Error**: Grammar processing error, not parsing error

### Issue #59: Template values not evaluated (Interpreter issue)
**Note**: This is an interpreter issue, not grammar - skip for now

### Issue #60: Relative paths in test fixtures (Test harness issue)
**Note**: This is a test harness issue, not grammar - skip for now

## Current State Analysis

### Existing Patterns
1. **Template Parameters**: Already exists in `text.peggy` for template definitions
   - `TextParamsList` and parameter handling already implemented
   - `@text templateName(param1, param2) = @add [[content]]`

2. **Exec References**: Already exists in `run.peggy` 
   - `RunCommandReference` handles `@run @commandRef`
   - Just needs to be made available in data context

3. **Null Handling**: `NullLiteral` exists in `base/literals.peggy`
   - Returns actual `null` value which causes issues in AST processing

### Key Architecture Principles
- Reuse existing abstractions from `grammar/core/*`
- Follow naming conventions from `grammar/docs/NAMING-CONVENTIONS.md`
- This is implementing RHS patterns (Level 8 abstraction)
- DirectiveValue in data.peggy should reuse cores, not recreate logic

## Implementation Plan

### Phase 1: Extract Core Abstractions

#### 1.1 Create AddCore abstraction
**File**: `grammar/core/add.peggy` (new)

Extract the core add logic from `directives/add.peggy`:
- `AddPathCore` - Path inclusion logic
- `AddTemplateCore` - Template content logic  
- `AddVariableCore` - Variable reference logic
- `AddTemplateInvocationCore` - Template invocation with parameters

This allows reuse in data values without directive wrapper.

#### 1.2 Verify RunCore abstractions
**Files**: Check `grammar/core/command.peggy` or `grammar/core/code.peggy`

Ensure we have:
- `RunCommandCore` - For `[command]` syntax
- `RunExecCore` - For `@execVar` references

### Phase 2: Fix DirectiveValue in data.peggy

#### 2.1 Support template invocations (#56)
Update `DirectiveValue` rule to handle:
```peggy
/ "@add" _ "@" id:BaseIdentifier _ "(" _ args:TemplateArgsList? _ ")" {
    // Use AddTemplateInvocationCore from core/add.peggy
    return helpers.createDirectiveValue('add', {
      type: 'templateInvocation',
      templateName: id,
      arguments: args || []
    }, location());
  }
```

#### 2.2 Support exec references (#57)
Update `DirectiveValue` to handle exec references:
```peggy
/ "@run" _ "@" ref:RunCommandReference {
    // Use RunExecCore logic
    return helpers.createDirectiveValue('run', {
      type: 'execReference',
      identifier: ref.identifier,
      args: ref.args
    }, location());
  }
```

### Phase 3: Fix Null Value Handling (#58)

#### 3.1 Update DataPrimitiveValue
Wrap null values properly to avoid AST processing errors:
```peggy
DataPrimitiveValue
  = value:StringLiteral { return value; }
  / value:NumberLiteral { return value; }
  / value:BooleanLiteral { return value; }
  / NullLiteral { 
      // Return a proper node instead of raw null
      return helpers.createNode(NodeType.Null, { value: null, location: location() });
    }
  / varRef:Variable { return varRef; }
```

#### 3.2 Update AST processing
Ensure all value processing handles the null node type properly.

### Phase 4: Import Required Rules

Update imports in `data.peggy`:
```peggy
// Import from newly created core files
@import "AddPathCore, AddTemplateCore, AddVariableCore, AddTemplateInvocationCore" from "../core/add.peggy"
@import "RunCommandCore, RunExecCore" from "../core/command.peggy" 
@import "RunCommandReference" from "../directives/run.peggy"
@import "TemplateArgsList" from "../directives/add.peggy"
```

### Phase 5: Testing

Create test cases for each fix:
1. Template invocation in data: `@data result = { msg: @add @template("arg1", "arg2") }`
2. Exec reference in data: `@data result = { version: @run @getVersion }`
3. Null values: `@data result = { value: null, flag: false }`
4. Combined complex case with all features

## Implementation Order

1. **Create core abstractions** (Phase 1)
   - Extract add directive cores
   - Verify run directive cores

2. **Update data.peggy** (Phases 2-4)
   - Add template invocation support
   - Add exec reference support
   - Fix null value handling
   - Update imports

3. **Test and validate** (Phase 5)
   - Run AST parser on test cases
   - Ensure no regression
   - Verify error messages

## Success Criteria

1. All examples from issues #56, #57, #58 parse correctly
2. Generated AST matches expected structure from design docs
3. No regression in existing tests
4. Clear error messages for invalid syntax
5. Follows established abstraction patterns

## Notes

- Issues #59 and #60 are not grammar issues and will be addressed separately
- The implementation should maximize reuse of existing patterns
- Follow the abstraction hierarchy strictly (Level 8 RHS patterns)
- Ensure backward compatibility for existing data directive usage