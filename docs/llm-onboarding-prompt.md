# MLLD Language Guide for LLMs

## RULES FOR EDITING THIS FILE

This document serves as the authoritative onboarding guide for LLMs learning MLLD. It must be accurate, complete, and verified against the actual implementation.

### Editing Rules:
1. **Verify Before Editing**: Every syntax example and claim must be verified against:
   - Grammar files in `grammar/` (source of truth for syntax)
   - Test cases in `tests/cases/` (examples of valid/invalid syntax)
   - Interpreter code in `interpreter/` (implementation details)
   - Documentation in `docs/` (user-facing explanations)

2. **Confidence Threshold**: Only make edits when >95% confident in accuracy:
   - 100%: Verified in grammar + tests + working examples
   - 95%: Clear in code + documentation
   - <95%: Needs more investigation - file GitHub issue instead

3. **Example Accuracy**: All code examples must:
   - Parse successfully according to the grammar
   - Execute as described
   - Demonstrate best practices
   - Include both ❌ wrong and ✅ correct versions where helpful

4. **Completeness**: Cover common LLM mistakes and misconceptions:
   - MLLD is NOT a template language
   - Context-specific variable syntax
   - Module-first philosophy for complexity

5. **Maintenance**: When MLLD syntax evolves:
   - Update examples to match current syntax
   - Note deprecated patterns explicitly
   - Test all examples before committing

## Critical Understanding: MLLD is NOT a Template Language

MLLD (Markdown Language for LLM Development) is a **programming language embedded in Markdown**. This is the most important concept to internalize. Unlike template languages that process variables anywhere in text, MLLD **only executes lines that start with `@` directives**. Everything else is treated as literal Markdown.

## Core Mental Model

Think of MLLD as having two distinct modes:
1. **Markdown mode** (default): Any line not starting with `@` is plain Markdown
2. **MLLD mode**: Lines starting with `@` are interpreted as MLLD commands

This design keeps documents readable as regular Markdown while enabling programmatic capabilities where needed.

## The 10 Commandments of MLLD

### 1. Directives Must Start Lines
```mlld
❌ WRONG: Hello @name! Let me @add some text.
✅ RIGHT: 
@text greeting = [[Hello {{name}}!]]
@add @greeting
```

### 2. Variable Creation vs Reference
```mlld
@text name = "Alice"        # Create without @
@add [[Hello {{name}}!]]    # Reference with {{}} in templates
@run [echo "@name"]         # Reference with @ in commands
```

### 3. Commands Require Brackets
```mlld
❌ WRONG: @run echo "hello"
✅ RIGHT: @run [echo "hello"]
✅ RIGHT: @run js [console.log("hello")]  # Language outside brackets
✅ RIGHT: @run javascript [console.log("hello")]  # 'js' is shorthand for 'javascript'
```

### 4. Only @add and @run Produce Output
```mlld
@text secret = "hidden"     # No output
@data config = {"x": 1}     # No output
@add [[Visible text]]       # This appears!
@run [echo "Also visible"]  # This appears!
```

### 5. Context-Specific Variable Syntax
Remember: "Double brackets, double braces"
- String literals: `"literal text for @var"`
- Command context: `[echo "@var"]` (@ prefix inside brackets)
- Template context: `[[template with {{var}}]]`

### 6. Field Access Rules
```mlld
@data user = { "name": "Alice", "scores": [10, 20, 30] }

# In directives:
@add @user.name           # "Alice"
@add @user.scores.1       # 20 (array access with dot notation)

# In templates:
@add [[{{user.name}} scored {{user.scores.0}}]]
```

### 7. Parameterized Content
```mlld
# For commands, use @exec:
@exec greet(name) = @run [(echo "Hello @name")]
@run @greet("Alice")

# For templates, use @text:
@text welcome(name, role) = [[Welcome {{name}}, our new {{role}}!]]
@add @welcome("Bob", "developer")
```

### 8. Import Patterns
```mlld
# Local files (with quotes and .mld extension):
@import { helper, config } from "./utils.mld"

# Registry modules (no quotes, @ prefix):
@import { parallel, retry } from @mlld/core
```

### 9. Conditional Logic
```mlld
# Simple conditional:
@when @isProduction => @import { * } from "./prod-config.mld"

# Multiple conditions with strategies:
# Note: Conditions must be variables or command results, not comparisons
@exec checkExcellent(score) = @run js [score > 90 ? "true" : ""]
@exec checkGood(score) = @run js [score > 70 ? "true" : ""]

@when first: [
  @checkExcellent(@score) => @add "Excellent!"
  @checkGood(@score) => @add "Good job!"
  true => @add "Keep trying!"
]

# Important: @when does NOT support comparison operators like >, <, ==
# Use boolean variables or commands that return truthy/falsy values

# Also note: @when any: requires a block action, not individual actions
# ❌ WRONG:
# @when @var any: [
#   @cond1 => @add "Action 1"
#   @cond2 => @add "Action 2"
# ]
# ✅ RIGHT:
# @when @var any: [...conditions...] => @add "Block action for any match"
```

### 10. Iteration with foreach
```mlld
@data names = ["Alice", "Bob", "Charlie"]
@text greetTemplate(name) = [[Hello, {{name}}!]]
@data greetings = foreach @greetTemplate(@names)
# greetings = ["Hello, Alice!", "Hello, Bob!", "Hello, Charlie!"]
```

## Philosophy: Simplicity in Files, Complexity in Modules

MLLD's design philosophy centers on keeping `.mld` files simple and readable while abstracting complexity into reusable modules. Instead of adding language features, we encourage using modules:

```mlld
# Don't try to implement complex logic in MLLD
# Instead, import capabilities from modules:

@import { parallel, retry, cache, pipeline } from @mlld/core
@import { validateSchema, transform } from @myorg/data-utils

# Simple, readable MLLD:
@data results = @parallel(@tasks, { concurrency: 5 })
@data validated = @validateSchema(@results, @schema)
```

## Common Pitfalls to Avoid

### 1. Treating MLLD as a Template Language
```mlld
❌ This is {{name}}'s document     # Won't work - no @ directive
✅ @add [[This is {{name}}'s document]]
```

### 2. Forgetting Command Brackets
```mlld
❌ @run npm install
✅ @run [npm install]
```

### 3. Using @ When Creating Variables
```mlld
❌ @text @myvar = "value"
✅ @text myvar = "value"
```

### 4. Mixing Variable Syntaxes
```mlld
❌ @add [[Hello @name]]           # Wrong syntax in template
❌ @run [echo "{{message}}"]      # Wrong syntax in command
✅ @add [[Hello {{name}}]]        # Correct template syntax
✅ @run [echo "@message"]         # Correct command syntax
```

### 5. JavaScript Confusion
While you CAN write JavaScript in MLLD, it's best kept in modules:
```mlld
# Okay for simple cases:
@run js [console.log("Debug: " + @count)]

# Better for complex logic - create a module:
@import { processData } from @myorg/utils
@data result = @processData(@rawData)
```

## Best Practices

1. **Keep .mld files readable**: They should make sense as Markdown documents
2. **Use modules for complexity**: Don't try to implement algorithms in MLLD
3. **Explicit over implicit**: Always be clear about what produces output
4. **Test incrementally**: Use `@add` to verify variable values during development
5. **Think pipelines**: MLLD excels at composing data transformation pipelines

## Example: Well-Structured MLLD File

```mlld
---
description: Data processing pipeline for user analytics
version: 1.0.0
---

# User Analytics Pipeline

This document processes user data and generates insights.

@import { fetchData, validateUsers } from @analytics/core
@import { generateReport } from @company/reporting

## Configuration

@data config = {
  "apiEndpoint": "https://api.example.com",
  "batchSize": 100,
  "outputFormat": "markdown"
}

## Data Processing

@text status(phase) = [[✓ Completed: {{phase}}]]

### 1. Fetch User Data
@data users = @fetchData(@config.apiEndpoint)
@add @status("Data fetching")

### 2. Validate and Clean
@data validUsers = @validateUsers(@users)
@add @status("Validation")

### 3. Generate Report
@data report = @generateReport(@validUsers, @config)
@add @report

## Summary

@add [[Processed {{validUsers.length}} valid users out of {{users.length}} total.]]
```

## Remember

MLLD empowers everyone to create versionable, collaborative "pipelines of thought." It achieves this by being a programming language that looks and reads like a document, not by being a template system. When writing MLLD, think in terms of discrete processing steps, not text interpolation.

The power comes from composition: simple directives in your files, powerful capabilities in your modules.