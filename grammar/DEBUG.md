# Debugging the Mlld Grammar

This document provides guidance on how to debug the Mlld grammar system, particularly when dealing with grammar build errors and test failures.

## Build Process and Error Location

The Mlld grammar uses a modular approach with multiple `.peggy` files that are concatenated by the `build-grammar.mjs` script. This has important implications for error reporting:

1. **Component vs. Concatenated Files**: When an error occurs, PEG.js reports line numbers in the concatenated file, not the original component file.

2. **Enhanced Error Reporting**: Our build script provides location mapping information _above_ the standard PEG.js errors, showing which component file contains the error.

Example build error output:
```
Component file error: /grammar/directives/text.peggy:6:80
PEG.js error: Expected "(", ".", "/", "/*", "//", ";", "@", "|", [!$&] ... but "{" found.
```

Always pay attention to the component file error first, as it points to the specific module causing the issue, not just a line in the concatenated file.

## Grammar Architecture Overview

Understanding the architecture is critical for effective debugging. Our grammar follows a layered approach:

```
grammar/
├── base/               # Level 1: Core primitives
│   ├── tokens.peggy    # Basic identifiers, characters
│   ├── literals.peggy  # Literal values 
│   ├── segments.peggy  # Basic text segments
│   └── context.peggy   # Context detection predicates
├── patterns/           # Levels 2-5: Reusable patterns
│   ├── variables.peggy # Variable reference patterns
│   ├── content.peggy   # Content patterns
│   └── rhs.peggy       # Right-hand side patterns
├── core/               # Level 6: Core content-type logic
│   ├── template.peggy  # Template content (used by text, add)
│   ├── command.peggy   # Command handling (used by run, exec)
│   ├── code.peggy      # Code block handling (used by run, exec)
│   └── path.peggy      # Path handling (used by import, add)
└── directives/         # Level 7: Full directive implementations
    ├── run.peggy       # Uses command.peggy and code.peggy
    ├── exec.peggy      # Uses command.peggy and code.peggy with assignment
    ├── text.peggy      # Uses template.peggy with assignment
    ├── import.peggy    # Uses path.peggy
    └── ...
```

When debugging, you should trace issues to the appropriate layer. Lower layers (base, patterns) affect everything above them, while higher layers (directives) are more isolated.

## Debug Strategy Decision Tree

Use this decision tree to determine the best approach for your specific issue:

### Build Failure
1. **Identify Component File**
   - Read the mapped location in our component grammar module
   
2. **Assess Error Type**
   - **Grammar Syntax Issue**: Error refers to PEG.js syntax (rule definitions, patterns)
      - Start by validating the grammar rule syntax
      - Check rule references, alternatives, sequence syntax 
   
   - **JavaScript Action Block Issue**: Error involves JavaScript code inside `{...}` blocks
      - Copy current version to `file.peggy.old`
      - Create a minimized version of the JS portion that's not working
      - Additively reconstruct by removing functions, hardcoding values
      - Make as small edits as possible
      - Run `npm run build:grammar` after each change
      - Commit working versions to allow easy rollback
      
### Test Failure
1. **Verify Test Correctness**
   - CRITICAL FIRST STEP: Ensure the test syntax and expectation is actually correct
   - Compare with documentation to verify expected behavior
   - If test is incorrect, update it!

2. **Debug the Grammar Implementation**
   - Add debugging using `helpers.debug`
   - Run the script: `npm run ast -- "<mlld syntax>"` 
   - Look for debug logs and specific errors
   - Iterate and run tests again

3. **Fix at Correct Abstraction Level**
   - Trace issues to the appropriate layer in the grammar
   - Fix the underlying abstraction instead of replacing it in higher layers
   - If a temporary abstraction replacement helped identify the issue, apply the fix to the abstraction itself

## JavaScript Action Block Limitations

PEG.js has limitations on what JavaScript syntax works reliably in action blocks `{...}`. When a build fails with cryptic errors like "Expected token but '{' found", it often indicates a JavaScript syntax issue.

Problematic patterns found in our experience:
- String methods like `.includes()` in certain contexts
- Object spread syntax (`...template.meta`)
- Complex variable manipulation and multi-step transformations
- Likely other JavaScript features that confuse PEG.js's own parser

When you encounter such issues, try this incremental approach:
1. Create a minimal working version (remove complex JS)
2. Hardcode values instead of computing them
3. Add back functionality step by step, testing after each change
4. Prefer using pre-calculated metadata (e.g., from core components) over calculating things in action blocks

## Using the Debug Script

The repository includes a debug script at `scripts/ast-output.js` that lets you directly test Mlld syntax:

```bash
# Quick parse with minimal quoting
npm run ast -- "@run [echo 'Hello World']"

# Same, but show grammar debug logs
npm run ast:debug -- "@run [echo 'Hello']"

# Avoid quotes entirely
echo @run [echo 'Hello'] | npm run ast

# Read from a file
npm run ast -- "$(cat snippet.mld)"

# Direct Node without npm script
node scripts/ast-output.js --debug "@import { a } from 'f.md'"
```

The script outputs:
- The input string being parsed
- The actual output structure (AST)
- Any parse errors, including messages and locations
- Debug traces if enabled

This is invaluable for isolating grammar component issues and testing specific syntax patterns.

## Adding Debug Logging to the Grammar

When the debug script isn't sufficient, you can add manual logging directly into grammar files using `helpers.debug`.

**Use the `helpers.debug` Function:**

```javascript
helpers.debug('AtText matched', { 
  template, 
  hasVariables: template.meta.hasVariables
});
```

**Safe Placement of Logging Calls:**

*   **Inside Existing Action Blocks:** The safest place to add logging is within *existing* action blocks `{...}` that typically appear at the end of a rule definition.

    ```peggy
    MyRule
      = part1:SubRule1 part2:SubRule2 {
          // Existing logic to process part1, part2...
          helpers.debug('MyRule Matched', { part1, part2 });
          return result;
        }
    ```

*   **Logging Rule Entry:** To log when a rule *starts* trying to match, you can sometimes add a simple predicate action, but this is more fragile.

    ```peggy
    // Potentially fragile - use with caution
    MyRule
      = &{ helpers.debug('MyRule: Trying to match...'); return true; }
        part1:SubRule1 part2:SubRule2 {
          // ... rest of rule ...
        }
    ```

**Unsafe Placement (Avoid):**

*   **Before Alternatives in a Choice:** Do NOT place action blocks directly before alternatives separated by `/`. This is invalid syntax.

    ```peggy
    // INVALID SYNTAX - DO NOT DO THIS
    RuleChoice
      = { helpers.debug('Trying Alt1'); return true; } Alt1
      / { helpers.debug('Trying Alt2'); return true; } Alt2
    ```

*   **Modifying Fundamental Rules:** Be extremely careful when adding action blocks to basic rules like whitespace (`_`), `BaseIdentifier`, etc.

*   **Inside Predicates:** Adding logging inside predicate blocks (`&{...}` or `!{...}`) can be syntactically tricky.

## Incremental Testing/Building Approach

When fixing complex grammar issues, follow this incremental approach that has proven effective:

1. **Create a minimal working version**:
   - Simplify to the most basic functioning version
   - Remove complex JavaScript from action blocks
   - Hardcode values instead of computing them
   - Focus on just one rule variant at a time

2. **Add features incrementally**:
   - Make small, isolated changes
   - Run `npm run build:grammar` after each change
   - Commit working versions to allow easy rollback
   - Prefer using pre-calculated metadata over calculating things in action blocks

3. **Example workflow** (from real-world text.peggy fix):
   ```
   // 1. Start with hardcoded values
   const subtype = 'textAssignment';
   const sourceType = 'literal';
   
   // 2. Create separate meta object
   const meta = { 
     sourceType: sourceType,
     hasVariables: false 
   };
   
   // 3. Only after these work, try actually computing values
   const hasVariables = template.meta.hasVariables;
   const subtype = hasVariables ? 'textTemplate' : 'textAssignment';
   ```

## Rule Ordering and the "First Match Wins" Principle

One of the most common sources of issues in PEG.js grammars is related to rule ordering. Unlike some other parsing systems, **PEG.js always uses the first matching alternative and never backtracks to try others**.

### The First Match Wins Principle

In a choice expression with multiple alternatives (`A / B / C`):
1. PEG.js tries each alternative **in the exact order specified**
2. The **first** alternative that matches will be used, even if later alternatives might match "better"
3. There is **no concept of "specificity"** or "longest match" - only order matters

### Example of an Ordering Problem

```peggy
// PROBLEMATIC: More general rule comes first
Expression
  = CommandRule  // Matches "foo"
  / SpecificRule // Also matches "foo" but with important extra context - NEVER REACHED!

// CORRECT: More specific rule comes first
Expression
  = SpecificRule // Matches specific case first
  / CommandRule  // Catches everything else
```

### Common Symptoms of Rule Ordering Issues

1. **Unexpected rule matched**: A construct is parsed by the wrong rule
2. **Missing information**: The AST is technically valid but missing expected metadata
3. **Split nodes**: Content that should be a single node gets broken into multiple nodes
4. **"Greedy" early rules**: An early rule consumes part of what should be matched by a later rule

### How to Diagnose and Fix

1. Use `helpers.debug` to confirm which rule is actually matching
2. Examine the rule ordering in choice expressions (`/` operator)
3. Put **more specific rules before more general rules**
4. Consider extracting shared patterns to predicates (`&` and `!`) to guide rule selection

### Real-World Example

```peggy
// BUG: This will ALWAYS match the PathCore rule, never reaching the code case
AtRun
  = DirectiveContext "@run" _ command:CommandCore {
      return helpers.createDirective('runCommand', {...});
    }
  / DirectiveContext "@run" _ language:RunCodeLanguage _ code:CodeCore {
      return helpers.createDirective('runCode', {...});
    }

// FIX: Put the more specific pattern first
AtRun
  = DirectiveContext "@run" _ language:RunCodeLanguage _ code:CodeCore {
      return helpers.createDirective('runCode', {...});
    }
  / DirectiveContext "@run" _ command:CommandCore {
      return helpers.createDirective('runCommand', {...});
    }
```

## Core Debugging Principles

1. **Fix at the Right Abstraction Level**:
   - It's imperative to trace issues to the abstraction level where they originate
   - Avoid replacing abstractions in higher-level components as a "fix"
   - If you temporarily replace an abstraction to debug, ensure you properly fix the abstraction itself

2. **Test Correctness First**:
   - The first task in fixing a test failure is verifying the test itself is correct
   - Many apparent grammar "bugs" are actually incorrect test expectations
   - The grammar has more rigor and strategic construction than individual tests

3. **Isolate Before Fixing**:
   - Test individual grammar components in isolation
   - Use the debug script to directly test specific syntax patterns
   - Create minimal reproduction cases

## Additional Resources

- **Peggy Documentation**: Local copy available at `grammar/dev/peggy.html` for reference
- **Grammar REFACTOR.md**: Overview of architecture and implementation standards
- **Build Script**: Review `grammar/build-grammar.mjs` to understand the build process

Remember that changes to the grammar files require rebuilding the parser before they take effect:

```bash
# Rebuild grammar and run tests
npm run build:grammar && npm test grammar
```