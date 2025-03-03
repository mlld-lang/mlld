# Centralize Error Messages

## Overview

This issue proposes a comprehensive plan for centralizing all error messages in the codebase to improve consistency, maintainability, and testing. We've already started this work with path-related error messages, but this plan expands it to cover all error types.

## Problem Statement

Error messages in the codebase are currently:

1. **Scattered**: Embedded directly in service implementations across the codebase
2. **Inconsistent**: The same errors have different wording in different services
3. **Duplicated**: Similar errors are repeated in multiple places
4. **Difficult to test**: Tests need to know exact error message strings to verify behavior
5. **Hard to maintain**: Changes require finding all instances of an error message

## Current State

We've already started centralizing error messages with the following work:
- Created `core/errors/messages/paths.ts` for path-related errors
- Implemented a structure for error messages with message, code, and severity
- Started using these messages in the PathService implementation

## Solution Architecture

We'll expand the existing pattern into a comprehensive error message system:

### 1. Message Structure

Each error message will be structured as:

```typescript
{
  message: "Human-readable error message with {placeholders}",
  code: "ERROR_CODE",
  severity: ErrorSeverity,
  details?: string // Optional additional guidance for users
}
```

### 2. Directory Structure

```
core/errors/messages/
├── index.ts                 // Central export point
├── paths.ts                 // Path-related messages (already implemented)
├── directives/
│   ├── index.ts             // Exports all directive messages
│   ├── common.ts            // Common directive errors
│   ├── text.ts              // Text directive errors
│   ├── data.ts              // Data directive errors
│   ├── import.ts            // Import directive errors
│   ├── embed.ts             // Embed directive errors
│   ├── run.ts               // Run directive errors
│   ├── define.ts            // Define directive errors
│   └── path.ts              // Path directive errors
├── resolution/
│   ├── index.ts             // Exports all resolution messages
│   ├── circularity.ts       // Circularity detection errors
│   ├── variable.ts          // Variable resolution errors
│   └── validation.ts        // Validation errors
├── parser.ts                // Parser error messages
├── interpreter.ts           // Interpreter error messages
├── filesystem.ts            // File system error messages
├── output.ts                // Output generation error messages
└── cli.ts                   // CLI-related error messages
```

### 3. Error Message Usage Pattern

Error messages will be used consistently throughout the codebase:

```typescript
import { DirectiveErrorMessages } from '@core/errors/messages';

throw new DirectiveError(
  DirectiveErrorMessages.text.missingIdentifier.message,
  this.kind,
  DirectiveErrorMessages.text.missingIdentifier.code,
  {
    severity: DirectiveErrorMessages.text.missingIdentifier.severity,
    // Additional context...
  }
);
```

### 4. Message Format Utilities

We'll create utilities to format error messages with placeholders:

```typescript
import { formatErrorMessage } from '@core/errors/formatUtils';

const message = formatErrorMessage(
  DirectiveErrorMessages.validation.fileNotFound.message, 
  { filePath: '/path/to/file.meld' }
);
```

## Implementation Plan

The implementation will be carried out in phases to minimize disruption and allow for incremental validation:

### Phase 1: Infrastructure and Foundations

**Goal**: Establish the basic architecture for centralized error messages.

1. **Create Directory Structure**
   - Expand `core/errors/messages/` with planned subdirectories
   - Add `index.ts` files for proper exports

2. **Implement Formatting Utilities**
   - Create `formatUtils.ts` with functions to handle placeholders in messages
   - Add unit tests for formatting functions

3. **Update Base Error Classes**
   - Enhance `MeldError` to better work with the centralized messages
   - Add support for automatically formatting placeholder values

**Deliverables**:
- Complete directory structure
- Message formatting utilities
- Updated base error classes
- Unit tests for new infrastructure

### Phase 2: Directive-Related Error Messages

**Goal**: Centralize all directive-related error messages.

1. **Common Directive Errors**
   - Create `directives/common.ts` for errors shared across directive types
   - Update `DirectiveError` to use these messages

2. **Individual Directive Type Errors**
   - Create files for each directive type (text.ts, data.ts, etc.)
   - Catalog all error messages for each directive type

3. **Migrate First Directive Handler**
   - Update `TextDirectiveHandler` to use centralized messages
   - Adjust tests to use the centralized messages

4. **Complete All Directive Handlers**
   - Methodically update each remaining directive handler
   - Update corresponding tests

**Deliverables**:
- Complete directive error message catalog
- Updated directive handlers using centralized messages
- Updated tests for directive handlers

### Phase 3: Resolution and Validation Error Messages

**Goal**: Centralize error messages related to resolution and validation.

1. **Variable Resolution Errors**
   - Create `resolution/variable.ts` for variable resolution errors
   - Update `VariableReferenceResolver` to use these messages

2. **Validation Errors**
   - Create `resolution/validation.ts` for validation errors
   - Update all validators to use these messages

3. **Circularity Detection Errors**
   - Create `resolution/circularity.ts` for circularity detection errors
   - Update `CircularityService` to use these messages

**Deliverables**:
- Complete resolution error message catalog
- Updated resolvers and validators using centralized messages
- Updated tests for resolution and validation

### Phase 4: Remaining Core Services

**Goal**: Centralize error messages for the remaining core services.

1. **Parser Errors**
   - Create `parser.ts` for parser-related errors
   - Update `ParserService` to use these messages

2. **Interpreter Errors**
   - Create `interpreter.ts` for interpreter-related errors
   - Update `InterpreterService` to use these messages

3. **File System Errors**
   - Create `filesystem.ts` for file system-related errors
   - Update `FileSystemService` to use these messages

4. **Output Errors**
   - Create `output.ts` for output generation errors
   - Update `OutputService` to use these messages

**Deliverables**:
- Complete error message catalog for core services
- Updated core services using centralized messages
- Updated tests for core services

### Phase 5: CLI and Integration Testing

**Goal**: Complete the error centralization and ensure full system integration.

1. **CLI Errors**
   - Create `cli.ts` for CLI-related errors
   - Update `CLIService` to use these messages

2. **Integration Testing**
   - Create end-to-end tests that verify error messages appear consistently
   - Verify that error handling works across service boundaries

3. **Documentation Update**
   - Create a comprehensive guide to error messages
   - Document how to use the centralized messages in new code

**Deliverables**:
- Complete error message centralization
- End-to-end integration tests for error handling
- Updated documentation for error messages

## Implementation Details

### Error Message Organization

Each error message will follow a consistent pattern within its domain:

```typescript
export const DirectiveErrorMessages = {
  common: {
    // Errors common to all directive types
    validationFailed: {
      message: "Directive validation failed: {reason}",
      code: "VALIDATION_FAILED",
      severity: "recoverable" as ErrorSeverity
    },
    // ...
  },
  text: {
    // Text directive specific errors
    missingIdentifier: {
      message: "Text directive is missing identifier",
      code: "TEXT_MISSING_IDENTIFIER",
      severity: "fatal" as ErrorSeverity
    },
    invalidValue: {
      message: "Text directive has invalid value: {value}",
      code: "TEXT_INVALID_VALUE",
      severity: "recoverable" as ErrorSeverity
    },
    // ...
  },
  // Other directive types...
};
```

### Error Codes

Error codes will follow a consistent pattern:
- `DOMAIN_SPECIFIC_ERROR`: Where DOMAIN is the area (PATH, DIRECTIVE, PARSER, etc.)
- All uppercase with underscores
- Specific enough to uniquely identify the error

### Severity Levels

We will use the existing `ErrorSeverity` enum from `MeldError`:
- `fatal`: Errors that must halt execution
- `recoverable`: Errors that can be converted to warnings in permissive mode
- `warning`: Issues that are always just warnings

### Error Message Format

Error messages will:
- Be clear and concise
- Use placeholders for dynamic content in curly braces: `{placeholder}`
- Not end with punctuation (to allow appending additional context)
- Focus on the problem, not the solution (solutions go in `details`)

## Benefits

The centralized error message approach offers significant benefits:

1. **Consistency**: Users see the same error messages for the same problems
2. **Quality**: Well-crafted messages that follow best practices
3. **Maintainability**: One place to update messages
4. **Testing**: Simplified error testing that doesn't depend on message strings
5. **Documentation**: Self-documenting catalog of all possible errors
6. **Future-proofing**: Foundation for internationalization and custom error reporting

## Migration Strategy

To minimize disruption while making this change:

1. **Parallel implementation**: Create the centralized messages without immediately replacing existing code
2. **Incremental adoption**: Replace error messages in one service at a time
3. **Test-driven**: Update tests before or alongside the implementation
4. **No behavioral changes**: Ensure error behavior remains the same during migration

## Backward Compatibility

This change should be transparent to users, as it only affects internal implementation details. Error messages may become more consistent, but no functional changes will occur.

## Concrete Examples

### Example 1: Path Validation Error

**Before**:
```typescript
throw new PathValidationError(
  'Path cannot contain . or .. segments - use $. or $~ to reference project or home directory',
  PathErrorCode.CONTAINS_DOT_SEGMENTS
);
```

**After**:
```typescript
throw new PathValidationError(
  PathErrorMessages.validation.dotSegments.message,
  PathErrorMessages.validation.dotSegments.code,
  {
    severity: PathErrorMessages.validation.dotSegments.severity
  }
);
```

### Example 2: Dynamic Content in Error Message

**Before**:
```typescript
throw new MeldFileNotFoundError(
  `File not found: ${filePath}`,
  { severity: ErrorSeverity.Recoverable }
);
```

**After**:
```typescript
throw new MeldFileNotFoundError(
  formatErrorMessage(FileSystemErrorMessages.fileNotFound.message, { filePath }),
  {
    code: FileSystemErrorMessages.fileNotFound.code,
    severity: FileSystemErrorMessages.fileNotFound.severity
  }
);
```

## Next Steps

1. Review and approve this plan
2. Create tickets for each phase of implementation
3. Begin with Phase 1 infrastructure work
4. Proceed through phases in order
5. Document progress and learnings as we go

## Completion Criteria

This initiative will be considered complete when:

1. All error messages are centralized in the `core/errors/messages` directory
2. No hardcoded error messages remain in the codebase
3. All tests use the centralized messages
4. Documentation is updated to reflect the new approach