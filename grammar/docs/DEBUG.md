# Debugging the Meld Parser

This document provides guidance on how to debug the Meld parser, particularly when dealing with test failures.

## Using the Debug Script

The repository includes a debug script at `scripts/ast-output.js` (`npm run ast`) that can help you understand what's happening with specific test cases. This script:

1. Uses ESM imports with proper path resolution to load the parser and test types
2. Displays the input, actual output, any parse errors that occur, and debug output from grammar (if enabled)

### Running the Debug Script

To run the debug script:

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

### What the Debug Script Shows

For each test case, the script will output:
- The input string being parsed
- The actual output structure (from the parser)
- Any parse errors that occur, including error messages and locations
- Debug traces from the grammar if you've enabled them

This makes it easy to spot differences between what you expect and what the parser is actually producing.

## Adding Debug Logging to the Grammar

When the debug script isn't sufficient or you need finer-grained insight into the parser's internal execution path, you can add manual logging directly into the grammar file. However, Peggy's syntax is strict, and incorrect placement of logging code (especially action blocks `{...}`) can easily break the grammar build.

**Use the `helpers.debug` Function:**

The grammar's initializer block (`{ ... }` at the top) defines a `helpers.debug` function. Use this for consistency.

```javascript
// Inside meld.pegjs initializer block
{
  const DEBUG = true; // Ensure this is true
  // ... other helpers ...
  const helpers = {
    debug(msg, ...args) {
      if (DEBUG) {
        // Use process.stdout.write to avoid suppression by test runners
        const formattedArgs = args.map(arg => {
          try {
            return typeof arg === 'string' ? arg : JSON.stringify(arg);
          } catch (e) {
            return '[Unserializable]';
          }
        }).join(' ');
        process.stdout.write(`[DEBUG GRAMMAR] ${msg} ${formattedArgs}\n`);
      }
    },
    // ... other helpers ...
  };
}
```

**Safe Placement of Logging Calls:**

*   **Inside Existing Action Blocks:** The safest place to add `helpers.debug(...)` calls is within the *existing* action blocks `{...}` that typically appear at the end of a rule definition, right before the `return` statement. This doesn't change the grammar structure.

    ```pegjs
    MyRule
      = part1:SubRule1 part2:SubRule2 {
          // Existing logic to process part1, part2...
          const result = { type: 'MyType', ... };
          helpers.debug('MyRule Matched', `part1 type=${part1.type}`, `result=`, result);
          return result;
        }
    ```

*   **Logging Rule Entry:** To log when a rule *starts* trying to match, you can sometimes add a simple action block at the beginning if the rule structure allows it, but this is more fragile.

    ```pegjs
    // Potentially fragile - use with caution
    MyRule
      = { helpers.debug('MyRule: Trying to match...'); return true; } // Predicate-like action block
        part1:SubRule1 part2:SubRule2 {
          // ... rest of rule ...
        }
    ```

**Unsafe Placement (Avoid):**

*   **Before Alternatives in a Choice:** Do NOT place action blocks directly before alternatives separated by `/`. This is invalid syntax and will break the build.

    ```pegjs
    // INVALID SYNTAX - DO NOT DO THIS
    RuleChoice
      = { helpers.debug('Trying Alt1'); return true; } Alt1
      / { helpers.debug('Trying Alt2'); return true; } Alt2
    ```

*   **Modifying Fundamental Rules:** Be extremely careful when adding action blocks to very basic rules like whitespace (`_`, `__`), `Identifier`, `StringLiteral`, etc. Adding action blocks here seems more likely to cause unexpected build failures. It's generally better to log in the higher-level rules that *use* these fundamental rules.

*   **Inside Predicates:** Adding logging inside predicate blocks (`&{...}` or `!{...}`) might be possible but can also be syntactically tricky and is best avoided unless absolutely necessary.

**Workflow:**

1.  Add minimal, targeted `helpers.debug` calls in safe locations (preferably existing action blocks).
2.  Run `npm run build:grammar` immediately to check for syntax errors.
3.  If the build fails, remove the last log statement added and try again.
4.  Once the build succeeds, run the relevant tests (`npm test core/ast` or specific API tests) and check the console output for your `[DEBUG GRAMMAR]` messages.
5.  Remember to remove the debug logs once troubleshooting is complete.

Remember that changes to the grammar file require rebuilding the parser before they take effect:

```bash
# Rebuild grammar and run tests
npm run build:grammar && npm test grammar
```