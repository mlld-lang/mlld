# Command Base Detection Specification

## Overview

This specification defines how the Mlld parser detects and extracts command bases from `@run` and `@exec` directives for security authorization purposes. Command bases are the actual executables being invoked, separate from their arguments.

## Node Type

### CommandBase Node
```typescript
interface CommandBase {
  type: 'CommandBase';
  nodeId: string;
  location: Location;
  command: string;           // The base command (e.g., "ls", "npm run")
  script?: string;          // For script runners (e.g., "build" in "npm run build")
  package?: string;         // For package runners (e.g., "eslint" in "npx eslint")
  module?: string;          // For module runners (e.g., "venv" in "python -m venv")
  isScriptRunner?: boolean; // True for npm/yarn/pnpm run commands
  isPackageRunner?: boolean;// True for npx commands
  isInlineCode?: boolean;   // True for sh -c, node -e, etc.
}
```

## Detection Patterns

### 1. Simple Commands
The first word of a command is the command base:
```mlld
@run ls -la              # CommandBase: { command: "ls" }
@run git status          # CommandBase: { command: "git" }
@run echo "hello"        # CommandBase: { command: "echo" }
```

### 2. Piped and Chained Commands
Commands separated by operators each have their own command base:
```mlld
@run ls | grep foo       # CommandBases: [{ command: "ls" }, { command: "grep" }]
@run cd src && npm test  # CommandBases: [{ command: "cd" }, { command: "npm" }]
@run mkdir tmp; cd tmp   # CommandBases: [{ command: "mkdir" }, { command: "cd" }]
@run cat file || echo err # CommandBases: [{ command: "cat" }, { command: "echo" }]
```

Operators recognized: `|`, `&&`, `||`, `;`

### 3. Script Runners
Special handling for common script execution patterns:

#### npm/yarn/pnpm/bun run
```mlld
@run npm run build       # CommandBase: { command: "npm run", script: "build", isScriptRunner: true }
@run yarn run test       # CommandBase: { command: "yarn run", script: "test", isScriptRunner: true }
@run pnpm run dev        # CommandBase: { command: "pnpm run", script: "dev", isScriptRunner: true }
@run bun run start       # CommandBase: { command: "bun run", script: "start", isScriptRunner: true }
```

#### npx (package execution)
```mlld
@run npx eslint .        # CommandBase: { command: "npx", package: "eslint", isPackageRunner: true }
@run npx prettier --write # CommandBase: { command: "npx", package: "prettier", isPackageRunner: true }
```

### 4. Special Command Patterns

#### Python module execution
```mlld
@run python -m venv      # CommandBase: { command: "python -m", module: "venv" }
@run python3 -m pip      # CommandBase: { command: "python3 -m", module: "pip" }
```

#### Inline code execution
```mlld
@run node -e "code"      # CommandBase: { command: "node -e", isInlineCode: true }
@run sh -c "command"     # CommandBase: { command: "sh -c", isInlineCode: true }
@run bash -c "script"    # CommandBase: { command: "bash -c", isInlineCode: true }
```

#### Build tools with targets
```mlld
@run make install        # CommandBase: { command: "make" }
@run cargo run --bin app # CommandBase: { command: "cargo" }
@run go run main.go      # CommandBase: { command: "go" }
```

Note: For now, we treat build tool targets as regular arguments, not part of the command base.

## AST Structure

### Current Structure (Before Implementation)
```javascript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  values: {
    command: [/* array of Text and VariableReference nodes */]
  },
  raw: {
    command: "ls -la | grep foo"
  },
  meta: {
    hasVariables: false,
    isMultiLine: false
  }
}
```

### New Structure (After Implementation)
```javascript
{
  type: 'Directive',
  kind: 'run',
  subtype: 'runCommand',
  values: {
    command: [/* array of Text and VariableReference nodes */],
    commandBases: [  // NEW: Array of CommandBase nodes
      {
        type: 'CommandBase',
        nodeId: '...',
        location: { ... },
        command: 'ls'
      },
      {
        type: 'CommandBase',
        nodeId: '...',
        location: { ... },
        command: 'grep'
      }
    ]
  },
  raw: {
    command: "ls -la | grep foo",
    commandBases: ['ls', 'grep']  // NEW: Raw command strings
  },
  meta: {
    hasVariables: false,
    isMultiLine: false,
    commandCount: 2,      // NEW: Number of commands detected
    hasScriptRunner: false // NEW: Whether any script runners detected
  }
}
```

## Variable Interpolation

Command bases should be detected even when variables are present:
```mlld
@run @cmd --flag         # If @cmd = "git", CommandBase: { command: "git" }
@run npm run @script     # CommandBase: { command: "npm run", script: "@script" }
```

Note: When the command itself is a variable, the command base detection happens at runtime in the interpreter, not at parse time.

## Security Integration

The interpreter can use the command bases for authorization:

```typescript
// Example usage in interpreter
const directive = /* parsed run directive */;
const commandBases = directive.values.commandBases;

for (const base of commandBases) {
  if (base.isScriptRunner && base.script) {
    // Check if script is allowed for this runner
    await authorizeScript(base.command, base.script);
  } else if (base.isPackageRunner && base.package) {
    // Check if package execution is allowed
    await authorizePackage(base.package);
  } else {
    // Check if command is allowed
    await authorizeCommand(base.command);
  }
}
```

## Implementation Priority

1. **Phase 1**: Simple command detection (first word)
2. **Phase 2**: Operator detection (`|`, `&&`, `||`, `;`)
3. **Phase 3**: Script runner patterns (npm run, yarn run, etc.)
4. **Phase 4**: Special patterns (python -m, node -e, etc.)

## Notes

- Command base detection is parse-time only. Runtime variable resolution is handled by the interpreter.
- The parser should not make security decisions, only provide the structural information.
- Empty commands or malformed syntax should not crash the parser but may result in empty command bases.
- Case sensitivity: Command names are case-sensitive ("NPM" ≠ "npm").