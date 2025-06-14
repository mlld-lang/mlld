# Unified Executable Type

## Summary

This document describes the unified executable type system that replaces the separate `command` and `textTemplate` types in mlld.

## Problem

Previously, mlld had two incompatible variable types for parameterized executables:
- `command` (type: 'command') - Created by @exec directives
- `textTemplate` (type: 'textTemplate') - Created by @text directives with parameters

This caused issues where operations like `foreach` couldn't work uniformly with both types, leading to inconsistent behavior and complex conditional logic throughout the codebase.

## Solution

We've created a unified `ExecutableVariable` type with the following structure:

```typescript
interface ExecutableVariable {
  type: 'executable';
  name: string;
  value: ExecutableDefinition;
  metadata?: VariableMetadata;
}

type ExecutableDefinition = 
  | CommandExecutable      // @exec name(params) = @run [command]
  | CommandRefExecutable   // @exec name(params) = @otherCommand(args)
  | CodeExecutable        // @exec name(params) = @run language [code]
  | TemplateExecutable;   // @text name(params) = [[template]]
```

Each executable definition includes:
- `type`: Discriminator for the specific executable type
- `paramNames`: Array of parameter names
- `sourceDirective`: Whether it came from 'exec' or 'text'
- Type-specific fields (commandTemplate, templateContent, etc.)

## Implementation Status

### Completed
1. ✅ Created new type definitions in `core/types/executable.ts`
2. ✅ Updated `MlldVariable` union to include `ExecutableVariable`
3. ✅ Added `VariableType.EXECUTABLE` enum value
4. ✅ Created type guards (`isExecutableVariable`, etc.)
5. ✅ Created factory function (`createExecutableVariable`)
6. ✅ Created migration guide in `docs/dev/EXECUTABLE-MIGRATION.md`

### TODO - Migration Tasks

The following components need to be updated to use the new unified type:

#### 1. Variable Creation
- [ ] `interpreter/eval/exec.ts` - Update to create ExecutableVariable instead of CommandVariable
- [ ] `interpreter/eval/text.ts` - Update text template definitions to create ExecutableVariable

#### 2. Variable Execution
- [ ] `interpreter/eval/exec-invocation.ts` - Update to handle ExecutableVariable uniformly
- [ ] Remove special handling for textTemplate vs command types

#### 3. Data Operations
- [ ] `interpreter/eval/data-value-evaluator.ts` - Update to recognize ExecutableVariable
- [ ] `interpreter/utils/foreach.ts` - Update to work with unified type

#### 4. Import/Export
- [ ] Update import handlers to support both old and new formats
- [ ] Add migration logic for backwards compatibility

#### 5. Tests
- [ ] Update existing tests to use new type
- [ ] Add tests for type migration/compatibility

## Benefits

1. **Consistency**: Both @exec commands and @text templates work identically
2. **Simplicity**: Single code path for handling executables
3. **Flexibility**: Operations like foreach work with both types seamlessly
4. **Type Safety**: Better TypeScript support with discriminated unions
5. **Extensibility**: Easy to add new executable types in the future

## Backwards Compatibility

During the transition period:
1. Support reading both old formats (command/textTemplate)
2. Convert old format to new on load
3. Log deprecation warnings
4. Document migration path for users

## Known Issues

1. Grammar bug: `@exec name() = @run [...]` is sometimes parsed as `execResolver` instead of `execCommand` (tracked separately)