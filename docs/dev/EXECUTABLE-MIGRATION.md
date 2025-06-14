# Executable Type Migration Guide

This guide explains how to migrate from the separate `command` and `textTemplate` types to the unified `executable` type.

## Overview

Previously, mlld had two separate variable types for parameterized callables:
- `command` - For @exec directives
- `textTemplate` - For @text templates with parameters

This created inconsistencies where operations like `foreach` couldn't work uniformly with both types.

The new system introduces a unified `executable` type that encompasses both, making them interchangeable and consistent.

## Type Changes

### Old Types

```typescript
// Command variable
interface CommandVariable {
  type: 'command';
  name: string;
  value: CommandDefinition;
}

// Text template (stored as generic object)
interface TextTemplate {
  type: 'textTemplate';
  name: string;
  identifier: string;
  params: string[];
  content: MlldNode[];
}
```

### New Unified Type

```typescript
interface ExecutableVariable {
  type: 'executable';
  name: string;
  value: ExecutableDefinition;
}

type ExecutableDefinition = 
  | CommandExecutable      // from @exec
  | CommandRefExecutable   // from @exec with reference
  | CodeExecutable        // from @exec with code
  | TemplateExecutable;   // from @text with params
```

## Migration Steps

### 1. Update Variable Creation

#### exec.ts
```typescript
// OLD
env.setVariable(identifier, {
  type: 'command',
  name: identifier,
  value: commandDef
});

// NEW
import { createExecutableVariable } from '@core/types';

const executableDef = {
  type: 'command',
  commandTemplate: commandNodes,
  paramNames,
  sourceDirective: 'exec'
};

env.setVariable(identifier, createExecutableVariable(identifier, executableDef));
```

#### text.ts
```typescript
// OLD
const templateDef = {
  type: 'textTemplate',
  name: identifier,
  params,
  content: directive.values?.content || []
};
env.setVariable(identifier, templateDef);

// NEW
import { createExecutableVariable } from '@core/types';

const executableDef = {
  type: 'template',
  templateContent: directive.values?.content || [],
  paramNames: params,
  sourceDirective: 'text'
};

env.setVariable(identifier, createExecutableVariable(identifier, executableDef));
```

### 2. Update Variable Lookups

#### exec-invocation.ts
```typescript
// OLD
if (command.type !== 'command' && command.type !== 'textTemplate') {
  throw new Error(`Variable ${commandName} is not a command or template`);
}

if (command.type === 'textTemplate') {
  // Special handling for text templates
}

// NEW
import { isExecutableVariable, isTemplateExecutable } from '@core/types';

if (!isExecutableVariable(command)) {
  throw new Error(`Variable ${commandName} is not executable`);
}

const definition = command.value;
if (isTemplateExecutable(definition)) {
  // Handle template execution
}
```

### 3. Update foreach Handling

#### data-value-evaluator.ts
```typescript
// OLD
if (variable.type === 'command') {
  return variable; // For lazy execution
}

// NEW
if (isExecutableVariable(variable)) {
  return variable; // For lazy execution
}
```

### 4. Update Import/Export

When importing/exporting variables, check for both old and new types for backwards compatibility:

```typescript
// Support both old and new formats
if (variable.type === 'command' || variable.type === 'textTemplate') {
  // Convert to new executable format
  const executableDef = convertLegacyToExecutable(variable);
  return createExecutableVariable(variable.name, executableDef);
} else if (variable.type === 'executable') {
  // Already in new format
  return variable;
}
```

## Backwards Compatibility

For a transition period, we should support both formats:

1. When loading variables, detect old format and convert to new
2. When executing, handle both old and new types
3. Log deprecation warnings for old format usage

## Benefits

1. **Consistency**: Both exec commands and text templates work the same way
2. **Flexibility**: Can use either in foreach, data assignments, etc.
3. **Extensibility**: Easy to add new executable types in the future
4. **Type Safety**: Better TypeScript support with discriminated unions

## Testing

Key areas to test:
1. @exec command definitions still work
2. @text template definitions still work
3. foreach works with both types
4. Variable references resolve correctly
5. Import/export maintains compatibility