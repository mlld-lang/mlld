# AST Explorer Testing

This directory contains tests for the AST Explorer functionality. The tests use a memory-based file system (memfs) to isolate tests from the real file system.

## Test Files

### New Test Files

- **enhanced-batch.test.ts**: Tests for the enhanced batch processing functionality that handles convention-based directory structures.
- **enhanced-types.test.ts**: Tests for the enhanced type generation that creates discriminated union types.
- **e2e-fixtures.test.ts**: Tests for the E2E fixture generation from example files.
- **explorer.integration.test.ts**: Integration tests that verify the complete workflow from parsing to type generation.

### Updated Test Files

- **MemfsExplorer.ts**: Updated to support the enhanced functionality and provide a filesystem adapter.
- **MemfsTestFileSystem.ts**: Enhanced with additional methods needed for comprehensive testing.

## Testing Infrastructure

The testing infrastructure uses several key components:

### MemfsTestFileSystem

A memory-based file system implementation that allows tests to run without affecting the real filesystem. This implementation provides:

- File and directory operations (read, write, create, delete)
- Path resolution
- Debugging utilities

### MemfsExplorer

A wrapper around the Explorer class that uses the memory-based filesystem. This allows tests to:

- Create isolated test environments
- Verify file operations without touching the disk
- Test the complete explorer functionality in isolation

### TracedAdapter

A filesystem adapter that traces all calls, allowing tests to verify which operations were performed.

## Test Categories

1. **Basic Tests**: Verify basic functionality like parsing directives and generating individual files.
2. **Batch Processing Tests**: Verify the batch processing of multiple directives.
3. **Convention-Based Directory Tests**: Verify the processing of examples organized by kind/subtype.
4. **Type Generation Tests**: Verify the generation of TypeScript interfaces and discriminated unions.
5. **E2E Fixture Tests**: Verify the generation of end-to-end test fixtures from examples.
6. **Integration Tests**: Verify the complete workflow from parsing to type generation.

## Running Tests

Tests can be run using Vitest:

```bash
npm test
```

Or run specific test files:

```bash
npm test tests/enhanced-batch.test.ts
```

## Test Conventions

1. Each test should clean up after itself to avoid interference between tests.
2. Use the MemfsExplorer for filesystem operations to ensure isolation.
3. Mock or stub external dependencies when needed.
4. For comprehensive tests, verify both the existence of files and their content.