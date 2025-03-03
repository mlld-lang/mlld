# Centralize Error Messages

## Overview

This issue proposes centralizing all error messages in the codebase to improve consistency, maintainability, and testing.

## Problem

Currently, error messages are scattered throughout the codebase, leading to several issues:

1. **Inconsistency**: The same type of error may have different messages in different places
2. **Duplication**: Similar error messages are repeated across multiple files
3. **Testing challenges**: Tests need to know the exact error messages to assert against
4. **Maintenance burden**: Changing an error message requires updating it in multiple places

## Solution

Create a centralized repository of error messages organized by domain/category in `core/errors/messages/`:

```
core/errors/messages/
├── index.ts           // Exports all message collections
├── paths.ts           // Path-related error messages
├── variables.ts       // Variable resolution error messages
├── parsing.ts         // Parser error messages
├── directives.ts      // Directive-related error messages
└── ...
```

Each message file will contain a structured collection of error messages with the following format:

```typescript
export const CategoryErrorMessages = {
  subcategory: {
    specificError: {
      message: "Error message with {placeholder} for dynamic content",
      code: "ERROR_CODE",
      severity: "recoverable" as ErrorSeverity
    }
  }
};
```

## Implementation Plan

1. **Create the message structure**:
   - Create `core/errors/messages/` directory
   - Add domain-specific message files (paths.ts, variables.ts, etc.)
   - Create an index.ts that exports all message collections

2. **Update error classes**:
   - Modify error classes to use the centralized messages
   - Add support for message placeholders (e.g., `{filePath}`)

3. **Migrate existing code**:
   - Identify all locations where error messages are created
   - Replace hard-coded messages with references to the centralized messages
   - Update tests to use the same centralized messages

4. **Documentation**:
   - Add a README.md to the messages directory explaining the approach
   - Document the message structure and conventions

## Benefits

1. **Consistency**: All error messages for similar errors will be identical
2. **Maintainability**: Changes to error messages can be made in one place
3. **Testing**: Tests can import exact messages from the central repository
4. **Documentation**: The centralized messages serve as documentation for possible errors
5. **Internationalization**: Makes it easier to implement i18n in the future

## Example

Before:
```typescript
throw new PathValidationError(
  'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
  PathErrorCode.CONTAINS_DOT_SEGMENTS
);
```

After:
```typescript
throw new PathValidationError(
  PathErrorMessages.validation.dotSegments.message,
  PathErrorCode.CONTAINS_DOT_SEGMENTS
);
```

## Next Steps

1. Implement the centralized message structure for path-related errors
2. Update the `PathService` and related tests to use these messages
3. Gradually expand to other error categories
4. Create automated tooling to help identify and migrate hard-coded error messages 