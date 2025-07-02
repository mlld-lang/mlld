# Grammar Error Recovery Strategy for mlld

## Context for Next Claude

We've discovered that our Peggy.js grammar is producing unhelpful error messages because of excessive backtracking. When a directive like `/var` has invalid internal syntax, the parser backtracks all the way to the `/` character and reports all possible alternatives, resulting in errors like:

```
Parse error: Expected "/exe", "/import", "/output", "/path", "/run", "/show", "/when", "<<", ">>", "@", "```", "{{", Backtick Sequence, Special reserved variable, [ \t], end of input, or var directive but "/" found.
```

This used to work better before a major grammar refactor. The issue is that we're not using Peggy's error recovery features effectively.

## Your Mission

Please review our grammar system and create a comprehensive strategy for adding error recovery rules to all directives. This will prevent backtracking and provide helpful, context-aware error messages.

## Required Reading

1. **grammar/README.md** - Overview of our grammar structure and patterns
2. **grammar/docs/DEBUG.md** - Debugging guide showing how our grammar works
3. **grammar/peggy-readme.md** - Peggy.js documentation and features

## The Problem in Detail

### Current Behavior
When parsing `/var @items = [` with a newline after the bracket:
1. Parser enters `Directive` rule
2. Successfully matches `/var`  
3. Enters `SlashVar` rule
4. Fails when it hits the unexpected newline
5. **Backtracks completely** to before the `/`
6. Tries all other alternatives (Comment, CodeFence, Variable, TextBlock)
7. Reports that it expected any of those things but found `/`

### Root Cause
Our grammar allows complete backtracking when a directive fails internally. The top-level rule is:

```peggy
Start = (Comment / MlldRunFence / CodeFence / Directive / Variable / TextBlock)*
```

Without error recovery rules, Peggy doesn't know that once we've seen `/var`, we're definitely in a var directive and should report var-specific errors.

## Desired Outcome

### 1. Error Recovery Rules
Add error recovery to each directive. Example for `/var`:

```peggy
SlashVar "var directive"
  = DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent ... // normal rule
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" {
      error(`Invalid value in /var directive. Expected a value after '='`);
    }
  / DirectiveContext "/var" _ "@" id:BaseIdentifier {
      error(`Invalid /var syntax. Expected '=' after variable name '@${id}'`);
    }
  / DirectiveContext "/var" {
      error(`Invalid /var syntax. Expected: /var @name = value`);
    }
```

### 2. Better Error Formatting
Investigate if we're properly using Peggy's error formatting with location context:
```
  test.mld:7:14
  7 | /var @items = [
                    ^
  Expected ']' to close array
```

### 3. Consistent Pattern
Develop a consistent pattern for error recovery that can be applied to all directives:
- `/var` - variable assignment errors
- `/show` - display directive errors  
- `/run` - command execution errors
- `/exe` - executable definition errors
- `/import` - import syntax errors
- `/output` - output routing errors
- `/when` - conditional syntax errors
- `/path` - path assignment errors

## Strategy Development Tasks

1. **Analyze Current Grammar Structure**
   - Review how each directive is currently defined
   - Identify where backtracking occurs
   - Note any existing error recovery attempts

2. **Design Error Recovery Pattern**
   - Create a template for directive error recovery
   - Ensure errors are specific and actionable
   - Maintain consistency across all directives

3. **Peggy Error Formatting**
   - Investigate how to enable Peggy's formatted errors
   - Check if we're suppressing or overriding them
   - Ensure location information is preserved

4. **Implementation Plan**
   - Prioritize directives by usage frequency
   - Create test cases for each error scenario
   - Ensure backward compatibility

## Example Test Cases

For each directive, we need error recovery for common mistakes:

### /var
- Missing `@` before variable name
- Missing `=` after variable name  
- Invalid value syntax (unclosed arrays, objects)
- Multiline arrays without `[[`

### /import
- Wildcard without alias: `/import { * }`
- Missing `from` keyword
- Invalid module syntax

### /run
- Missing command braces or quotes
- Invalid code language
- Unclosed multiline commands

## Success Criteria

1. No more "Expected [20 things] but '/' found" errors
2. Each directive failure produces a specific, helpful error
3. Error messages suggest the correct syntax
4. Location context is shown with the error
5. Tests verify all error recovery paths

## Questions to Consider

1. Should we use Peggy's `expected()` function for better error messages?
2. Can we use semantic predicates to provide even more context?
3. Should certain errors be warnings in lenient mode?
4. How do we handle ambiguous cases (could be multiple directives)?

## Deliverable

Create a document outlining:
1. The error recovery pattern to use across all directives
2. Specific error recovery rules for each directive
3. How to properly format errors using Peggy's capabilities
4. Test strategy for validating error messages
5. Implementation priority and timeline

Remember: The goal is to make errors helpful at the grammar level, so users immediately understand what went wrong and how to fix it.