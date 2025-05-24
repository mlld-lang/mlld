# Grammar Enhancement: Remove `@run` Requirement from `@exec` Directives

## Current Behavior

Currently, `@exec` directives require the right-hand side (RHS) to start with `@run`. This creates a more verbose and less intuitive syntax:

```meld
@exec greet(name) = @run [echo "Hello, {{name}}!"]
```

## Proposed Change

Remove the requirement for explicit `@run` on the RHS of `@exec` directives. This would simplify the syntax to:

```meld
@exec greet(name) = [echo "Hello, {{name}}!"]
```

## Implementation Tasks

1. **Grammar Updates**:
   - Modify the grammar definition for `@exec` directives to make the `@run` prefix optional
   - Update the `exec.peggy` grammar file to handle both formats for backward compatibility

2. **AST Handling**:
   - Ensure the AST structure remains consistent regardless of whether `@run` is present
   - Add normalization logic to standardize the internal representation

3. **Handler Updates**:
   - Update the `ExecDirectiveHandler` to properly process both formats
   - Ensure execution logic works the same way with or without the `@run` prefix

4. **Testing**:
   - Add test cases for the new simplified syntax
   - Ensure backward compatibility with existing syntax
   - Update existing tests that might expect the `@run` prefix

5. **Documentation**:
   - Update documentation to show the simplified syntax as the preferred approach
   - Mark the `@run` prefix as deprecated but supported for backward compatibility

## Compatibility Considerations

- The change should maintain backward compatibility with existing scripts
- Both formats should be supported during a transition period
- Eventually, the `@run` prefix could be fully deprecated

## Examples

**Current syntax**:
```meld
@exec list_files(dir, pattern) = @run [find {{dir}} -name "{{pattern}}"]
@exec greet(name) = @run [echo "Hello, {{name}}!"]
@exec process_data(input) = @run python [ print(input) ]
```

**Proposed syntax**:
```meld
@exec list_files(dir, pattern) = [find {{dir}} -name "{{pattern}}"]
@exec greet(name) = [echo "Hello, {{name}}!"]
@exec process_data(input) = python [ print(input) ]
```

## Benefits

1. More intuitive syntax with less redundancy
2. Better alignment with other directive syntaxes
3. Reduced cognitive load for users 
4. Cleaner, more concise scripts

## Implementation Timeline

This should be implemented as part of the next grammar update cycle, with a transition period to support both formats before potentially deprecating the `@run` prefix in a future major version.