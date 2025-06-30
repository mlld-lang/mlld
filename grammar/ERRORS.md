# Peggy Grammar Error Recovery System

## Overview

The mlld grammar uses Peggy's error recovery capabilities to provide context-aware, helpful error messages instead of generic parse failures. This system intercepts common syntax errors and provides specific guidance on how to fix them.

## Current Implementation

### Error Flow

1. **Grammar Level**: Error recovery rules use `helpers.mlldError()` to throw structured errors
2. **Parser Level**: Peggy catches these and adds location information
3. **Interpreter Level**: Enhances errors and attempts to use Peggy's format() method
4. **Display Level**: Shows formatted errors with source context

### Key Components

1. **mlldError Helper**: Creates errors with enhanced location tracking
   ```javascript
   mlldError(message, expectedToken, loc) {
     const error = new Error(message);
     error.isMlldError = true;
     error.expectedToken = expectedToken;
     error.mlldErrorLocation = loc;
     throw error;
   }
   ```

2. **Pattern-Based Enhancement**: The interpreter includes `enhanceParseError()` which matches error messages to provide additional context

3. **Peggy Format Integration**: When available, uses Peggy's format() method for source display
   ```javascript
   if (typeof error.format === 'function') {
     peggyFormatted = error.format([{ 
       source: filePath || 'input', 
       text: source 
     }]);
   }
   ```

## Design Philosophy

### 1. **Fail Fast with Clarity**
Rather than letting the parser backtrack through multiple rules and produce a generic "Expected X but found Y" message, we catch errors as soon as we can identify them and provide specific, actionable feedback.

### 2. **Context-Aware Messages**
Error messages include:
- What went wrong
- Why it's wrong  
- How to fix it
- Examples of correct syntax

### 3. **Semantic Commitment**
Once we identify a directive (e.g., `/when`, `/var`), we stay within that directive's error recovery. This prevents confusing messages about unrelated directives.

## Technical Approach

### Grammar Rule Ordering

```peggy
DirectiveName
  = SuccessPattern1
  / SuccessPattern2
  / ErrorRecoveryPattern1  // Most specific errors first
  / ErrorRecoveryPattern2
  / GenericCatchAll       // Least specific last
```

### Error Recovery Pattern

```peggy
/ DirectiveContext "/directive" _ &{
    // Semantic predicate - returns true if error condition detected
    return helpers.detectErrorCondition(input, peg$currPos);
  } {
    // Call mlldError with helpful message and location
    helpers.mlldError("Specific error message", "expectedToken", location());
  }
```

## Helper Functions

Located in `grammar/deps/grammar-core.js`:

- `isUnclosedArray(input, pos)` - Detects `[` without matching `]`
- `isUnclosedObject(input, pos)` - Detects `{` without matching `}`
- `detectMissingQuoteClose(input, pos, quoteChar)` - Detects unclosed string literals
- `isUnclosedTemplate(input, pos)` - Detects unclosed `::` delimiters
- `isMissingFromKeyword(input, pos)` - Detects missing 'from' in imports
- `isValidLanguageKeyword(lang)` - Validates language identifiers for code blocks
- `isMultilineArrayStart(input, pos)` - Checks for multiline array patterns
- `mlldError(message, expectedToken, loc)` - Creates enhanced error objects

## Implemented Error Recovery by Directive

### `/var` - Variable Assignment Errors

All error cases are implemented with specific recovery rules:

1. **Missing @ before variable name**
   ```
   /var myvar = "value"
   → Error: Missing '@' before variable name in /var directive. Use: /var @myvar = value
   ```

2. **Missing = after variable name**
   ```
   /var @myvar "value"
   → Error: Invalid /var syntax. Expected '=' after variable name '@myvar'.
   ```

3. **Missing value after =**
   ```
   /var @myvar =
   → Error: Missing value in /var directive. Expected a value after '=' for variable '@myvar'.
   ```

4. **Unclosed array**
   ```
   /var @data = [1, 2, 3
   → Error: Unclosed array in /var directive. Expected ']' to close the array.
   ```

5. **Unclosed object**
   ```
   /var @config = { "key": "value"
   → Error: Unclosed object in /var directive. Expected closing brace to close the object.
   ```

6. **Unclosed strings** (both single and double quotes)
   ```
   /var @text = "hello
   → Error: Unclosed string in /var directive. Expected closing double quote (").
   ```

7. **Unclosed template**
   ```
   /var @template = ::content
   → Error: Unclosed template in /var directive. Expected closing '::' delimiter.
   ```

### `/show` - Display Directive Errors

1. **Missing content**
   ```
   /show
   → Error: Missing content after /show directive. Expected text, variable reference, or template.
   ```

2. **Invalid variable reference**
   ```
   /show myvar
   → Error: Invalid variable reference in /show. Variables must start with '@'.
   ```

### `/when` - Conditional Logic Errors

1. **Missing => after condition**
   ```
   /when @condition action
   → Error: Missing '=>' in /when directive. Expected: /when @condition => action
   ```

2. **Missing condition**
   ```
   /when => action
   → Error: Missing condition in /when directive. Expected a variable or expression before '=>'.
   ```

3. **Unclosed array in conditions**
   ```
   /when @var [
   → Error: Unclosed array in /when directive. Expected ']' to close condition array.
   ```

4. **Invalid modifier**
   ```
   /when @var invalid: [...]
   → Error: Invalid modifier 'invalid' in /when directive. Valid modifiers: first, all, any
   ```

### `/import` - Import Directive Errors

1. **Missing from keyword**
   ```
   /import { var1, var2 } "file.mld"
   → Error: Missing 'from' keyword in /import. Use: /import { ... } from "..."
   ```

2. **Unclosed import list**
   ```
   /import { var1, var2
   → Error: Unclosed import list. Expected '}' to close the import list.
   ```

3. **Missing import source**
   ```
   /import { var1 } from
   → Error: Missing import source. Expected a file path or module name after 'from'.
   ```

### `/output` - Output Directive Errors

1. **Missing 'to' keyword**
   ```
   /output @data "file.json"
   → Error: Missing 'to' keyword in /output. Use: /output ... to ...
   ```

2. **Missing target**
   ```
   /output @data to
   → Error: Missing output target in /output directive. Expected file path or stream after 'to'.
   ```

3. **Unclosed command in output**
   ```
   /output @{echo "test" to file.txt
   → Error: Unclosed command in /output directive. Expected '}' to close the command.
   ```

### `/exe` - Executable Definition Errors

1. **Missing @ before identifier**
   ```
   /exe greet(name) = run {echo "Hello"}
   → Error: Missing '@' before command name in /exe directive. Use: /exe @greet...
   ```

2. **Missing = after parameters**
   ```
   /exe @greet(name)
   → Error: Missing '=' in /exe directive. Expected: /exe @name(...) = ...
   ```

3. **Unclosed parameters**
   ```
   /exe @greet(name
   → Error: Unclosed parameter list in /exe directive. Expected ')' to close parameters.
   ```

4. **Missing definition**
   ```
   /exe @greet =
   → Error: Missing definition in /exe directive. Expected command or code block after '='.
   ```

### `/run` - Command Execution Errors

1. **Unclosed command brackets**
   ```
   /run {echo "hello"
   → Error: Unclosed command in /run directive. Expected '}' to close the command.
   ```

2. **Missing code block after language**
   ```
   /run js
   → Error: Missing code block in /run directive. Expected '{' after language identifier.
   ```

3. **Unclosed code block**
   ```
   /run js {console.log("test")
   → Error: Unclosed code block in /run js. Expected '}' to close the code block.
   ```

### `/path` - Path Assignment (NOT IMPLEMENTED)

The `/path` directive exists but does not have error recovery rules implemented yet.

## Implementation Details

### Error Display

The system displays errors with source context:

```
Parse error at ./example.mld:2:14
  1 | # Example  
  2 | /var @name = 
               ^
  3 | /show @name

Missing value in /var directive. Expected a value after '=' for variable '@name'.
```

### Limitations

1. **Column Precision**: All errors report column 1 due to how location() works in error recovery rules
2. **No Partial AST**: Errors fail the entire parse rather than recovering with partial results
3. **Limited Peggy Integration**: While we use format(), we can't leverage all of Peggy's advanced error features

## Testing Error Recovery

Each error case has:
1. Test cases in `tests/cases/invalid/` for syntax errors
2. Expected error messages in test fixtures
3. Verification that errors are caught at parse time

## Best Practices

### 1. **Order Matters**
- Place error recovery rules AFTER all successful parse patterns
- Order error rules from most specific to least specific
- End with a generic catch-all for the directive

### 2. **Use Semantic Predicates Wisely**
- Keep predicates simple and focused
- Avoid side effects in predicates
- Return boolean values only

### 3. **Error Message Guidelines**
- Start with what went wrong
- Explain why it's wrong (if not obvious)
- Provide the correct syntax
- Include examples when helpful
- Use consistent formatting

### 4. **Location Tracking**
All error recovery rules must pass `location()` as the third parameter to `mlldError()`:
```peggy
helpers.mlldError("Error message", "expectedToken", location());
```

## Future Improvements

1. **Precise Column Tracking**: Implement token-level position capture (see PRECISE-ERROR-LOCATIONS-ANALYSIS.md)
2. **Error Recovery**: Allow parsing to continue after errors for better IDE integration
3. **Quick Fixes**: Add structured fix suggestions to error objects
4. **Multi-file Support**: Better error display for import chains