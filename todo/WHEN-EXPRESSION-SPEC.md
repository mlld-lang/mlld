# When Expression and Simplified Action Syntax Specification

## Overview

This specification defines two major enhancements to mlld's `/when` directive:
1. **RHS When** - Using `when:` as an expression in `/var` and `/exe` assignments
2. **Simplified Action Syntax** - Implicit directives within when blocks

Both features aim to make mlld more expressive as a logical router while maintaining its clarity and avoiding programming language complexity.

## 1. RHS When Expression (`when:`)

### 1.1 Motivation

Currently, `/when` can only execute side effects. This enhancement allows `/when` to return values, making it usable in assignments:

```mlld
/exe @reviewPrompt(context) = when: [
  @hasItems(@context.validation.issues) => @buildWithIssues(@context)
  !@hasItems(@context.validation.issues) => @buildWithoutIssues(@context)
]
```

### 1.2 Grammar

The `when:` expression is valid in RHS contexts for `/var` and `/exe`:

```peggy
// In var-rhs.peggy
VarRHSContent
  = WhenExpression
  / /* existing patterns */

// In exe.peggy (for template/code/command variants)
ExeRHSContent
  = WhenExpression
  / /* existing patterns */

// New pattern
WhenExpression
  = "when" _ ":" _ "[" _ conditions:WhenExpressionConditionList _ "]" tail:TailModifiers? {
      return {
        type: 'whenExpression',
        conditions: conditions,
        tail: tail
      };
    }

WhenExpressionConditionList
  = first:WhenExpressionPair rest:(_ pair:WhenExpressionPair { return pair; })* {
      return [first, ...rest];
    }

WhenExpressionPair
  = condition:Expression _ "=>" _ value:ExpressionValue {
      return { condition, value };
    }

// Expression values are references or function calls only
ExpressionValue
  = UnifiedReferenceWithTail  // Handles @var, @func(), with full tail support
  / TemplateCore              // For template values
  / StringLiteral            // For literal strings
  / NumericLiteral          // For numbers
  / BooleanLiteral         // For true/false
  / NullLiteral           // For null
```

### 1.3 Semantics

- **Expression Context**: `when:` creates an expression that evaluates to a value
- **First Match**: Like `/when first:`, stops at the first true condition
- **Return Value**: The value from the `=>` of the matching condition
- **No Match**: Returns `null` if no conditions match
- **Side Effects**: Actions within `when:` should be pure expressions (no `/show`, `/output`, etc.)

### 1.4 Tail Modifiers Support

The `when:` expression supports ALL tail modifiers:

```mlld
# Security modifiers
/var @secured = when: [
  @isProd => @prodData
  true => @testData
] trust: always

# Pipeline transformations
/var @formatted = when: [
  @format == "json" => @data
  @format == "xml" => @data
] | @json | @pretty

# With clause
/exe @process(data) = when: [
  @data.type == "csv" => @parseCSV(@data)
  @data.type == "json" => @parseJSON(@data)
] with { timeout: 30000, format: "text" }

# Trust modifier (for exe)
/exe @handler(input) = when: [
  @input.secure => @secureProcess(@input)
  true => @normalProcess(@input)
] trust: system
```

### 1.5 Examples

```mlld
# Conditional variable assignment
/var @greeting = when: [
  @time.hour < 12 => "Good morning"
  @time.hour < 18 => "Good afternoon"
  true => "Good evening"
]

# Conditional executable definition
/exe @processData(type, data) = when: [
  @type == "json" => @jsonProcessor(@data)
  @type == "xml" => @xmlProcessor(@data)
  @type == "csv" => @csvProcessor(@data)
  true => @genericProcessor(@data)
]

# With operators
/var @result = when: [
  @a && @b => "both true"
  @a || @b => "at least one true"
  true => "both false"
]
```

## 2. Simplified When Action Syntax

### 2.1 Motivation

Current `/when` blocks require explicit directives:

```mlld
/when @condition: [
  true => /var @result = "value"
  false => /exe @function(x) = @helper(x)
]
```

This enhancement allows implicit syntax for cleaner routing:

```mlld
/when @condition: [
  true => @result = "value"
  false => @function(x) = @helper(x)
]
```

### 2.2 Grammar Updates

Update `WhenAction` in `when.peggy`:

```peggy
WhenAction
  = WhenActionBlock
  / WhenActionDirective
  / WhenActionImplicit      // New!

// Implicit actions (no leading /)
WhenActionImplicit
  = ImplicitVarAssignment
  / ImplicitExeDefinition
  / ImplicitExecution

// Variable assignment: @var = value
ImplicitVarAssignment
  = "@" id:BaseIdentifier _ "=" _ value:VarRHSContent tail:TailModifiers? {
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      // Create the same AST as /var would create
      return [helpers.createNode(NodeType.Directive, {
        kind: 'var',
        subtype: 'var',
        values: { 
          identifier: [idNode],
          value: processVarValue(value)
        },
        raw: {
          identifier: id,
          value: helpers.reconstructRawString(value)
        },
        meta: {
          ...extractVarMeta(value),
          implicit: true
        },
        location: location()
      })];
    }

// Executable definition: @func(params) = implementation
ImplicitExeDefinition
  = "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters _ "=" _ 
    implementation:ExeImplementation tail:TailModifiers? {
      // Create the same AST as /exe would create
      return createExeDirective(id, params, implementation, meta, tail, true);
    }

// Pure execution: @function() or @variable
ImplicitExecution
  = ref:UnifiedReferenceWithTail {
      // For execution without assignment
      return createExecutionDirective(ref);
    }

// Exe implementations (simplified from full /exe)
ExeImplementation
  = TemplateCore             // Templates
  / UnifiedCommandBrackets   // {command}
  / RunLanguageCodeCore      // js {code}
  / "@" ref:UnifiedReferenceWithTail  // @reference
```

### 2.3 Supported Features

#### Full Tail Support

All implicit actions support the complete tail modifier syntax:

```mlld
/when @env: [
  "prod" => @config = @loadProdConfig() trust always
  "dev" => @config = @loadDevConfig() | @validate | @sanitize
]

/when @type: [
  "secure" => @handler(x) = @secureProcess(x) trust never
  "normal" => @handler(x) = @normalProcess(x) with { timeout: 5000 }
]
```

#### Modifier Support

Modifiers like `|`, `trust:`, `with:` work as expected:

```mlld
/when @needsAuth: [
  true => @process(data) = @authRequired(@data) trust verify with { retry: 3 }
  false => @process(data) = @publicAccess(@data)
]
```

### 2.4 Constraints

1. **Single-line only** - No multi-line code blocks or templates
2. **No inline commands** - Must use pre-defined executables
3. **No complex literals** - No inline object/array definitions
4. **Expression focus** - Emphasizes routing over complex logic

### 2.5 What's NOT Allowed

```mlld
# ❌ Multi-line code blocks
/when @type: [
  "js" => @run = js {
    console.log("line 1");
    console.log("line 2");
  }
]

# ❌ Inline shell commands
/when @env: [
  "prod" => run "deploy --production"
  "dev" => run "deploy --staging"
]

# ❌ Complex object literals
/when @config: [
  "full" => @settings = {
    "option1": true,
    "option2": false
  }
]

# ✅ Instead, use references
/exe @prodSettings() = { "option1": true, "option2": false }
/when @config: [
  "full" => @settings = @prodSettings()
]
```

## 3. Integration Example

Combining both features:

```mlld
# Define conditional prompt builder
/exe @buildPrompt(context) = when: [
  @context.hasErrors => @errorPrompt(@context)
  @context.needsReview => @reviewPrompt(@context)
  true => @standardPrompt(@context)
] | @formatPrompt

# Use in conditional workflow
/when @taskType: [
  "review" => @prompt = @buildPrompt(@reviewContext) trust always
  "generate" => @prompt = @buildPrompt(@genContext) | @enhance
  "test" => @prompt = @testPrompt() with { mock: true }
]

# Execute with appropriate handler
/var @result = @llmCall(@prompt) with { 
  model: "claude-3", 
  temperature: 0.7 
} | @parseResponse
```

## 4. Implementation Phases

### Phase 1: RHS When Expression
1. Add `when:` to grammar for var/exe RHS
2. Implement expression evaluation in interpreter
3. Ensure tail modifiers work correctly
4. Add tests for all combinations - VERIFY TEST SYNTAX WITH USER!!

### Phase 2: Simplified When Actions
1. Update when action grammar
2. Implement implicit directive creation
3. Preserve all tail functionality
4. Add comprehensive tests

### Phase 3: Documentation Update
1. Update llms.txt with new syntax
2. Update CLAUDE.md
3. Update all docs/*.md files
4. Add examples to docs/when.md

### Phase 4: Migration Examples
1. Show before/after patterns
2. Highlight best practices
3. Explain when to use each form

## 5. Grammar Ambiguity Mitigation

### Parser Precedence
1. Explicit directives (`/var`, `/exe`) parse first
2. Assignment patterns (`@x = y`) parse as implicit var
3. Function patterns (`@f(x) = y`) parse as implicit exe
4. Pure references parse as execution

### Disambiguation Rules
- `=` after `@identifier` → variable assignment
- `=` after `@identifier(params)` → executable definition
- No `=` → execution/reference

## 6. Benefits

1. **Cleaner Syntax** - Less visual noise in when blocks
2. **Better Routing** - when expressions return values
3. **Preserved Power** - All tail modifiers still work
4. **Clear Intent** - Implicit syntax matches mental model

## 7. Testing Strategy

### RHS When Tests
- Basic value selection
- With all tail modifiers
- In var context
- In exe context
- Error conditions

### Implicit Syntax Tests
- Variable assignments
- Executable definitions
- With all modifiers
- Parser precedence
- Error messages

### Integration Tests
- Combined features
- Complex workflows
- Module imports
- Real-world patterns
