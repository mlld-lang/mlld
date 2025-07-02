# Grammar Error Recovery Strategy for mlld

## Executive Summary

The mlld Peggy.js grammar currently produces unhelpful error messages due to excessive backtracking. When a directive like `/var` has invalid internal syntax, the parser backtracks completely and reports all possible alternatives at the character level, resulting in errors like:

```
Expected "/exe", "/import", "/output", "/path", "/run", "/show", "/when", "<<", ">>", "@", "```", "{{", Backtick Sequence, Special reserved variable, [ \t], end of input, or var directive but "/" found.
```

This document outlines a comprehensive strategy to implement error recovery rules that provide context-aware, helpful error messages at the point of failure.

## Core Problem Analysis

### Current Parser Behavior

1. Parser enters `Directive` rule
2. Successfully matches `/var` prefix  
3. Enters `SlashVar` rule
4. Fails parsing internal content (e.g., unclosed array)
5. **Backtracks completely** out of SlashVar and Directive
6. Tries all top-level alternatives
7. Reports that it expected anything BUT the `/` it found

### Root Cause

The grammar uses ordered choice without commitment:

```peggy
Start = (Comment / MlldRunFence / CodeFence / Directive / Variable / TextBlock)*

Directive = ... (SlashVar / SlashShow / SlashExe / ...)
```

Without error recovery, Peggy doesn't know that once we've matched `/var`, we're committed to parsing a var directive.

## Solution Pattern: Committed Error Recovery

### Design Principle

Once a directive prefix is matched, we're committed to that directive. Any subsequent failures should produce directive-specific errors, not generic backtracking errors.

### Implementation Pattern

Each directive should have multiple ordered choices, from most specific to most general:

```peggy
SlashVar "var directive"
  = DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent ... // Success path
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ &{
      // Lookahead shows we're in a bad state
      const nextChar = input[peg$currPos];
      return nextChar === '[' || nextChar === '{' || nextChar === '"';
    } {
      error(`Invalid value in /var directive. Expected a value after '=' but found incomplete expression.`);
    }
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" {
      error(`Missing value in /var directive. Expected a value after '='`);
    }
  / DirectiveContext "/var" _ "@" id:BaseIdentifier {
      error(`Invalid /var syntax. Expected '=' after variable name '@${id}'`);
    }
  / DirectiveContext "/var" _ "@" {
      error(`Invalid /var syntax. Expected variable name after '@'`);
    }
  / DirectiveContext "/var" {
      error(`Invalid /var syntax. Expected: /var @name = value`);
    }
```

### Key Techniques

1. **Ordered Choices**: Most specific failures first, general failures last
2. **Semantic Predicates**: Use `&{ ... }` to detect specific error conditions
3. **Context Preservation**: Include parsed information in error messages
4. **No Backtracking**: Once a directive is identified, stay within its error recovery

## Error Recovery Rules by Directive

### /var Directive

Common errors and recovery rules:

```peggy
SlashVar "var directive"
  = // Normal success path
    DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent tail:TailModifiers? ...
  
  // Unclosed array literal
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ "[" _ &{
      // Scan ahead to check if array is unclosed
      let depth = 1;
      let i = peg$currPos;
      while (i < input.length && depth > 0) {
        if (input[i] === '[') depth++;
        else if (input[i] === ']') depth--;
        else if (input[i] === '\n' && depth > 0) return true; // Unclosed
        i++;
      }
      return depth > 0;
    } {
      error(`Unclosed array in /var directive. Expected ']' to close the array.`);
    }
  
  // Unclosed object literal  
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ "{" _ &{
      // Similar check for unclosed objects
      let depth = 1;
      let i = peg$currPos;
      while (i < input.length && depth > 0) {
        if (input[i] === '{') depth++;
        else if (input[i] === '}') depth--;
        else if (input[i] === '\n' && depth > 0) return true;
        i++;
      }
      return depth > 0;
    } {
      error(`Unclosed object in /var directive. Expected '}' to close the object.`);
    }
  
  // Multiline array without [[ syntax
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ "[" [^\n\]]* "\n" {
      error(`Multiline arrays require double brackets. Use [[ ... ]] for arrays spanning multiple lines.`);
    }
  
  // Missing @ before variable name
  / DirectiveContext "/var" _ id:BaseIdentifier _ "=" {
      error(`Missing '@' before variable name in /var directive. Use: /var @${id} = value`);
    }
  
  // ... additional recovery rules
```

### /show Directive

```peggy
SlashShow "show directive"
  = // Success paths...
  
  // Missing content
  / DirectiveContext "/show" _ $ {
      error(`Missing content in /show directive. Expected text, template, or file reference.`);
    }
  
  // Unclosed template
  / DirectiveContext "/show" _ "::" [^:]* $ {
      error(`Unclosed template in /show directive. Expected closing '::' delimiter.`);
    }
  
  // Invalid foreach syntax
  / DirectiveContext "/show" _ "foreach" _ &{
      const rest = input.substring(peg$currPos);
      return !rest.match(/^@\w+\s*\(/);
    } {
      error(`Invalid foreach syntax. Expected: /show foreach @command(@array)`);
    }
```

### /run Directive  

```peggy
SlashRun "run directive"
  = // Success paths...
  
  // Missing command
  / DirectiveContext "/run" _ $ {
      error(`Missing command in /run directive. Expected {command}, "command", or language {code}.`);
    }
  
  // Unclosed command braces
  / DirectiveContext "/run" _ "{" [^}]* $ {
      error(`Unclosed command in /run directive. Expected '}' to close the command.`);
    }
  
  // Invalid language
  / DirectiveContext "/run" _ lang:BaseIdentifier &{
      const validLangs = ['js', 'node', 'python', 'py', 'bash', 'sh'];
      return !validLangs.includes(lang.toLowerCase());
    } {
      error(`Unknown language '${lang}' in /run directive. Supported: js, python, bash.`);
    }
```

### /import Directive

```peggy
SlashImport "import directive"
  = // Success paths...
  
  // Wildcard without alias
  / DirectiveContext "/import" _ "{" _ "*" _ "}" {
      error(`Wildcard imports must have an alias. Use: /import { * as name } from "path"`);
    }
  
  // Missing 'from' keyword
  / DirectiveContext "/import" _ "{" _ imports:ImportsList _ "}" _ path:ImportPath {
      error(`Missing 'from' keyword in import. Use: /import { ${imports} } from "${path}"`);
    }
  
  // Invalid module syntax
  / DirectiveContext "/import" _ "@" &{
      const rest = input.substring(peg$currPos);
      return !rest.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+/);
    } {
      error(`Invalid module reference. Expected format: @author/module-name`);
    }
```

### /exe Directive

```peggy
SlashExe "exe directive"  
  = // Success paths...
  
  // Missing parameter list
  / DirectiveContext "/exe" _ "@" name:BaseIdentifier _ "=" {
      error(`Missing parameters in /exe. Use: /exe @${name}() = ... or /exe @${name}(param1, param2) = ...`);
    }
  
  // Unclosed parameter list
  / DirectiveContext "/exe" _ "@" name:BaseIdentifier _ "(" [^)]* $ {
      error(`Unclosed parameter list in /exe directive. Expected ')' after parameters.`);
    }
  
  // Missing implementation
  / DirectiveContext "/exe" _ "@" name:BaseIdentifier _ params:ParameterList _ "=" _ $ {
      error(`Missing implementation in /exe directive. Expected command, code, or template after '='.`);
    }
```

### /when Directive

```peggy
SlashWhen "when directive"
  = // Success paths...
  
  // Missing condition
  / DirectiveContext "/when" _ "=>" {
      error(`Missing condition in /when directive. Expected: /when @condition => action`);
    }
  
  // Missing action  
  / DirectiveContext "/when" _ condition:WhenCondition _ "=>" _ $ {
      error(`Missing action in /when directive. Expected directive or command after '=>'.`);
    }
  
  // Unclosed condition block
  / DirectiveContext "/when" _ "[" [^\]]* $ {
      error(`Unclosed condition block in /when directive. Expected ']' to close conditions.`);
    }
```

### /path Directive

```peggy
SlashPath "path directive"
  = // Success paths...
  
  // Brackets not allowed
  / DirectiveContext "/path" _ "@" id:BaseIdentifier _ "=" _ "[" {
      error(`Brackets not allowed in /path directive. Paths are references, not content. Remove the brackets.`);
    }
  
  // Missing path value
  / DirectiveContext "/path" _ "@" id:BaseIdentifier _ "=" _ $ {
      error(`Missing path value in /path directive. Expected file path or URL after '='.`);
    }
```

### /output Directive

```peggy
SlashOutput "output directive"
  = // Success paths...
  
  // Missing 'to' keyword
  / DirectiveContext "/output" _ content:OutputContent _ path:OutputPath {
      error(`Missing 'to' keyword in /output directive. Use: /output ${content} to ${path}`);
    }
  
  // Missing target
  / DirectiveContext "/output" _ content:OutputContent _ "to" _ $ {
      error(`Missing output target. Expected file path, 'stdout', 'stderr', or 'env:VARNAME'.`);
    }
```

## Peggy Error Formatting

### Enabling Location Context

Ensure all error messages include location information:

```javascript
// In grammar helpers
function createError(message, location) {
  const err = new Error(message);
  err.location = location || peg$computeLocation(peg$savedPos, peg$currPos);
  return err;
}
```

### Formatted Error Output

Configure Peggy to produce formatted errors with source context:

```javascript
try {
  parser.parse(input, { grammarSource: 'example.mld' });
} catch (e) {
  if (e.format) {
    console.error(e.format([{ source: 'example.mld', text: input }]));
  }
}
```

Expected output:
```
example.mld:7:14
7 | /var @items = [
                   ^
Expected ']' to close array in /var directive
```

## Implementation Strategy

### Phase 1: Core Directives (Week 1)
1. `/var` - Most complex, handles multiple value types
2. `/run` - Critical for command execution  
3. `/show` - User-facing output

### Phase 2: Import/Export (Week 2)
4. `/import` - Module system critical
5. `/output` - File operations
6. `/exe` - Command definitions

### Phase 3: Control Flow (Week 3)
7. `/when` - Conditional logic
8. `/path` - Path references

### Phase 4: Testing & Refinement (Week 4)
- Comprehensive error case testing
- Performance impact assessment
- Documentation updates

## Test Strategy

### Error Test Cases

For each directive, create test cases covering:

1. **Syntax Errors**
   - Missing required tokens (@, =, etc.)
   - Unclosed delimiters (brackets, braces, quotes)
   - Invalid characters or sequences

2. **Semantic Errors**  
   - Wrong value types
   - Invalid combinations
   - Missing required parts

3. **Edge Cases**
   - Empty inputs
   - Extremely long inputs
   - Unicode and special characters

### Test File Structure

```
tests/cases/errors/
├── var/
│   ├── missing-at-symbol.md
│   ├── unclosed-array.md
│   ├── unclosed-object.md
│   ├── multiline-array-single-bracket.md
│   └── missing-equals.md
├── run/
│   ├── missing-command.md
│   ├── unclosed-braces.md
│   └── invalid-language.md
└── ... (other directives)
```

### Validation Approach

1. Parse attempt should fail
2. Error message should be specific and helpful
3. Error location should be accurate
4. No generic backtracking errors

## Migration Notes

### Breaking Changes

None - this only improves error messages, doesn't change valid syntax.

### Performance Considerations

- Error recovery rules add overhead only on failure paths
- Success path performance unchanged
- Semantic predicates should be lightweight

### Backwards Compatibility

All valid mlld documents continue to parse correctly. Only error messages change.

## Success Metrics

1. **Error Specificity**: 100% of directive errors produce directive-specific messages
2. **Location Accuracy**: Error points to exact failure position
3. **Actionable Messages**: Every error suggests how to fix it
4. **No Backtracking Errors**: Zero "Expected [20 things]" messages

## Conclusion

This error recovery strategy transforms mlld's parser errors from cryptic lists of alternatives to helpful, context-aware messages that guide users to the solution. By implementing committed error recovery at the directive level, we ensure that users understand exactly what went wrong and how to fix it.