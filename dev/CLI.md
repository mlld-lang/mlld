# CLI Testing Strategy

Since we've refactored the CLI to be a thin wrapper around the API, our testing strategy should focus on CLI-specific concerns rather than duplicating API tests. This approach ensures we have good test coverage while maintaining a clear separation of concerns.

## Testing Philosophy

1. **API Tests**: Handle core processing logic, file interpretation, and transformation
2. **CLI Tests**: Focus on CLI-specific concerns like argument parsing, output formatting, and user interaction

## CLI Test Categories

### 1. Argument Parsing Tests

- [x] Basic argument parsing (flags, positional args)
- [x] Format option (`--format`, `-f`) handling
- [x] Output path option (`--output`, `-o`) handling
- [x] Stdout flag (`--stdout`) handling
- [x] Strict/permissive mode flags
- [x] Version and help flags
- [ ] Invalid argument combinations
- [ ] Missing required arguments

### 2. File I/O Tests

- [x] Output to file with correct extension
- [x] Output to stdout
- [x] File overwrite confirmation
- [ ] Error handling for file not found
- [ ] Error handling for permission issues
- [ ] Custom output path handling

### 3. API Integration Tests

- [x] Basic delegation to API
- [x] Proper conversion of CLI options to API options
- [x] Error propagation from API to CLI
- [ ] Custom filesystem handling for tests

### 4. CLI-Specific Features

- [x] Watch mode functionality
- [ ] Handling init command
- [ ] Environment variables handling
- [ ] Path variables resolution

### 5. Error Handling Tests

- [x] CLI-specific error formatting
- [x] Different behavior in strict vs. permissive mode
- [ ] Exit codes handling
- [ ] Error message readability

## Test Implementation Plan

1. **Priority Tests** (Implemented in priority-cli.test.ts):
   - [x] Basic CLI functionality
   - [x] Command-line argument handling
   - [x] File I/O operations
   - [x] Error handling
   - [x] Output options
   - [x] Path variable handling
   - [x] Text variable handling

2. **Additional Tests** (To implement in cli.test.ts):
   - [ ] Edge cases for argument parsing
   - [ ] More comprehensive error handling tests
   - [ ] Watch mode edge cases
   - [ ] Integration with various API options
   - [ ] Overwrite confirmation handling

## Test Implementation Guidelines

1. Use `setupCliTest()` helper for consistent testing environment
2. Mock `process.exit` to catch exit codes without terminating tests
3. Mock `console.log/error` to verify output
4. Use `MemfsTestFileSystemAdapter` for file system operations
5. Focus on testing the CLI layer's responsibilities, not API functionality

## Next Steps

1. Complete missing tests in cli.test.ts
2. Add tests for any newly discovered edge cases
3. Update test documentation
4. Ensure all tests pass with the new implementation