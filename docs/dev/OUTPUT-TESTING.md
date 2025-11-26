# Output Directive Test Infrastructure

## Overview

The test infrastructure now supports validating file operations from the `/output` directive. Previously, when `/output` wrote to files, no console output was generated, making it impossible to validate the file operations in fixture tests.

## Solution

### File Operation Logging

The `TestRedirectEffectHandler` now logs file operations to stderr when the `logFileOps` parameter is enabled. This is automatically enabled for all tests in the `slash/output/` directory.

Format: `[FILE] <path> (<bytes> bytes)`

Example:
```
[FILE] /output.md (34 bytes)
[FILE] /data.json (58 bytes)
```

### Validation

File operations can be validated using `expected-stderr.md` files in test case directories, just like other stderr output.

## Example

Test file: `tests/cases/slash/output/file/example.md`
```mlld
/var @content = "Hello, world!"
/output @content to "greeting.txt"
```

Expected stderr: `tests/cases/slash/output/file/expected-stderr.md`
```
[FILE] /greeting.txt (13 bytes)
```

## Path Resolution

Note that relative paths in `/output` directives are resolved to absolute paths in the virtual filesystem:
- `./output.md` → `/output.md`
- `message.txt` → `/message.txt`

When creating `expected-stderr.md` files, use the absolute path format.

## Implementation Details

### Code Changes

1. **TestRedirectEffectHandler** (`interpreter/interpreter.fixture.test.ts`):
   - Added `logFileOps` parameter to constructor
   - When enabled, logs file effect operations to stderr buffer
   - Automatically enabled for tests matching `fixture.name.includes('slash/output/')`

2. **Expected Stderr Files**:
   - Created `expected-stderr.md` for all `/output` tests that write to files
   - Paths use absolute format (starting with `/`)
   - Byte counts must match exactly

### Affected Tests

File operation logging is enabled for:
- `slash/output/alligator-content`
- `slash/output/command`
- `slash/output/document`
- `slash/output/file`
- `slash/output/literal`
- `slash/output/security-imported-exec`
- `slash/output/template-invocation`
- `slash/output/variable`
- `slash/output/when-action`

Tests using resolvers or stdout/stderr targets don't need file operation logging.

## Benefits

1. **Testable File Operations**: Can now verify that `/output` directives correctly write to files
2. **Format Detection**: Can validate that different file formats (JSON, YAML, text) are handled correctly
3. **Path Resolution**: Can verify that path interpolation and resolution works correctly
4. **Security**: Can test that file operations respect security constraints

## Related Issues

Resolves mlld-lang/mlld#343 - "Add test infrastructure for /output directive in fixture tests"
