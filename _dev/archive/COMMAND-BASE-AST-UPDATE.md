# Command Base Detection - AST Update for Interpreter

## Overview

We've added command base detection to the AST for security authorization purposes. This allows the interpreter to identify and authorize individual executables in complex shell commands before execution.

## What Changed

### New Node Type: CommandBase

Added `CommandBase` to the NodeType enum. This node represents a detected command executable within a shell command.

```typescript
interface CommandBase {
  type?: 'CommandBase';  // May be undefined in current implementation
  nodeId: string;
  location: Location;
  command: string;           // The base command (e.g., "ls", "npm run")
  script?: string;          // For script runners (e.g., "build" in "npm run build")
  package?: string;         // For package runners (e.g., "prettier" in "npx prettier")
  module?: string;          // For module runners (e.g., "http.server" in "python -m http.server")
  isScriptRunner?: boolean; // true for npm/yarn/pnpm run commands
  isPackageRunner?: boolean;// true for npx commands
  isInlineCode?: boolean;   // true for inline code execution (future use)
}
```

### Updated Directive Structure

Run and Exec directives now include `commandBases` array in their values:

```typescript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  values: {
    command: [...],  // Existing command parts
    commandBases: [  // NEW: Array of CommandBase nodes
      {
        nodeId: '...',
        command: 'ls',
        location: {...}
      },
      {
        nodeId: '...',
        command: 'grep',
        location: {...}
      }
    ]
  },
  raw: {
    command: 'ls | grep foo',        // Full command as entered by user
    commandBases: ['ls', 'grep']     // NEW: Array of just the command base strings
  },
  meta: {
    hasVariables: false,
    commandCount: 2,         // NEW: Number of command bases detected
    hasScriptRunner: false   // NEW: Whether any script runners detected
  }
}
```

## Detection Patterns

### 1. Simple Commands
```meld
@run [ls -la]
```
- Detects: `ls`

### 2. Piped Commands
```meld
@run [ls | grep foo | wc -l]
```
- Detects: `ls`, `grep`, `wc`

### 3. Chained Commands
```meld
@run [mkdir test && cd test && touch file.txt]
```
- Detects: `mkdir`, `cd`, `touch`

```meld
@run [rm temp || echo "Already clean"]
```
- Detects: `rm`, `echo`

```meld
@run [npm test; npm build; npm deploy]
```
- Detects: `npm`, `npm`, `npm`

### 4. Script Runners
```meld
@run [npm run build]
@run [yarn run test]
@run [pnpm run dev]
```
- Detects as special `command: "npm run"` with `script: "build"`
- Sets `isScriptRunner: true`

### 5. Special Patterns
```meld
@run [npx prettier --write .]
```
- Detects: `command: "npx"` with `package: "prettier"`
- Sets `isPackageRunner: true`

```meld
@run [python -m http.server]
```
- Detects: `command: "python -m"` with `module: "http.server"`

## Important: Command Syntax

For proper command parsing and command base detection, commands should be enclosed in brackets:

```meld
@run [echo "Hello from command"]   # ✓ Correct - full command captured
@run echo "Hello from command"     # ✗ Problematic - only "echo" captured
```

Without brackets, the parser treats the first space as the end of the directive, making everything after it separate content. This is a known limitation of the current grammar.

## Implementation Notes for Interpreter

### 1. Security Authorization

Before executing a command, iterate through `commandBases` to authorize each:

```typescript
async function authorizeCommand(directive: RunDirective): Promise<void> {
  const { commandBases } = directive.values;
  
  for (const base of commandBases) {
    if (base.isScriptRunner) {
      // Check if script runner (npm, yarn, etc.) is allowed
      await authorizeScriptRunner(base.command, base.script);
    } else if (base.isPackageRunner) {
      // Check if package execution is allowed
      await authorizePackageRunner(base.command, base.package);
    } else {
      // Check if command executable is allowed
      await authorizeExecutable(base.command);
    }
  }
}
```

### 2. Command Count Validation

Use `meta.commandCount` for quick validation:

```typescript
if (directive.meta.commandCount > MAX_COMMANDS_PER_LINE) {
  throw new Error('Too many commands in pipeline');
}
```

### 3. Script Runner Handling

When `meta.hasScriptRunner` is true, you may want different security policies:

```typescript
if (directive.meta.hasScriptRunner) {
  // Script runners often need different permissions
  // They execute package.json scripts which may have complex commands
}
```

## Variable Interpolation

Command bases are detected on the raw command string AFTER variable interpolation. The parser handles:

```meld
@run [ls @dir | grep @pattern]
```

The `commandBases` will be `['ls', 'grep']` regardless of variable values.

## Edge Cases

1. **Quoted Commands**: Commands in quotes are treated as literals but command bases are still detected
   ```meld
   @run "ls | grep foo"  # Still detects: ls, grep
   ```

2. **Complex Script Names**: Script names with colons are preserved
   ```meld
   @run [npm run build:prod]  # script: "build:prod"
   ```

3. **Multiple Operators**: All operators (|, &&, ||, ;) trigger command base detection
   ```meld
   @run [a | b && c || d; e]  # Detects all 5 commands
   ```

## Testing

New test cases have been added in:
- `tests/cases/run/command-bases/example-npm-run.md` - Script runner patterns
- `tests/cases/run/command-bases/example-operators.md` - Command operators
- `tests/cases/run/command-bases/example-special-patterns.md` - Special patterns

Run fixtures to see the AST structure:
```bash
npm run build:fixtures
cat tests/fixtures/run-command-bases-*.fixture.json
```

## Migration Guide

If you're currently parsing commands manually:

**Before:**
```typescript
const firstWord = directive.raw.command.split(' ')[0];
```

**After:**
```typescript
const commandBases = directive.values.commandBases;
const firstCommand = commandBases[0]?.command;
```

## Future Enhancements

1. **Subcommand Detection**: Detect git subcommands, docker commands, etc.
2. **Sudo/Elevation Detection**: Special handling for privilege escalation
3. **Shell Built-in Detection**: Identify shell built-ins vs external commands
4. **Inline Code Detection**: For `node -e`, `python -c`, etc.