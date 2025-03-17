# Understanding the Issue

After thorough debugging, I've identified the source of the problem. When a Meld file contains a command reference like:

```
@run $commandName("arg1", "arg2")
```

The parser doesn't parse this as a special "command reference" - instead, it treats it as a regular run directive with the command string being `$commandName("arg1", "arg2")`.

This means the AST structure does not have any separate parsing for the command name versus its arguments. The `RunDirectiveHandler` has to use regex to extract this information:

```typescript
const commandMatch = rawCommand.match(/\$([a-zA-Z0-9_]+)(?:\((.*)\))?/);
if (commandMatch) {
  const commandName = commandMatch[1];
  const rawArgs = commandMatch[2] || '';
  // ...
}
```

## Solution Approach

Rather than trying to change the grammar (which would require broader changes to the AST and potentially break existing code), I'll:

1. Keep the standard run directive parsing as is
2. Update the `RunDirectiveHandler` to better handle argument parsing, particularly for quoted strings and variable references

This handles the RUN-GRAMMAR.md requirements for better command reference handling, even though it's not changing the grammar directly.

For the other requirements (multi-line directives and language indicators), those would require grammar changes, but they're separate from the command reference issue.

## Implementation Plan

1. Update the `RunDirectiveHandler.ts` to improve its parameter parsing:
   - Better handling of quoted strings
   - Proper variable reference resolution
   - Support for comma-separated arguments
   - Special handling for complex arguments like those with commas inside quotes

2. Add tests to verify:
   - Basic command references with string arguments
   - Command references with variable references as arguments
   - Command references with complex arguments (quotes, commas)

3. Document the expected format for command references in the user documentation

This approach avoids making changes to the grammar while still addressing the core issue of properly parsing command reference arguments.