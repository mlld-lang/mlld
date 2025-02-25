# Migration Plan for Error Handling System

## Overview

The new error handling system has been implemented with the following key features:
- `ErrorSeverity` enum with `Fatal`, `Recoverable`, and `Warning` levels
- Enhanced `MeldError` base class with severity and context support
- Updated `InterpreterOptions` to include strict mode and error handler
- Updated `InterpreterService` to handle errors based on severity and mode
- Error testing utilities for testing both strict and permissive modes

## Migration Strategy

1. **Categorize Tests**: Group skipped/todo tests by component and error type ✅
2. **Verify Implementation**: Check if the error handling is already implemented for each component ✅
3. **Update Tests**: Implement tests using the new error testing utilities ✅ (in progress)
4. **Verify Coverage**: Ensure all error scenarios are covered

## 1. Resolver Tests

### TextResolver Tests

**Todo Tests:**
- `should handle environment variables appropriately (pending new error system)` ✅
- `should handle undefined variables (pending new error system)` ✅

**Implementation Plan:**
```typescript
// services/resolution/ResolutionService/resolvers/TextResolver.test.ts

it('should handle environment variables appropriately', async () => {
  // Arrange
  const originalEnv = process.env;
  process.env = { ...process.env, TEST_ENV_VAR: 'test-value' };
  
  // Act & Assert
  // Test that it resolves correctly when env var exists
  const result = await resolver.resolve('${ENV_TEST_ENV_VAR}', context);
  expect(result).toBe('test-value');
  
  // Test strict mode behavior for missing env vars
  await expectThrowsWithSeverity(
    () => resolver.resolve('${ENV_MISSING_VAR}', context, createStrictModeOptions()),
    MeldResolutionError,
    ErrorSeverity.Recoverable
  );
  
  // Test permissive mode behavior for missing env vars
  await expectWarningsInPermissiveMode(
    (options) => resolver.resolve('${ENV_MISSING_VAR}', context, options),
    MeldResolutionError
  );
  
  // Cleanup
  process.env = originalEnv;
});

it('should handle undefined variables', async () => {
  // Arrange
  stateService.getVariable.mockReturnValue(undefined);
  
  // Act & Assert
  // Test that it throws in strict mode
  await expectThrowsWithSeverity(
    () => resolver.resolve('${undefined}', context, createStrictModeOptions()),
    MeldResolutionError,
    ErrorSeverity.Recoverable
  );
  
  // Test that it warns in permissive mode
  await expectWarningsInPermissiveMode(
    (options) => resolver.resolve('${undefined}', context, options),
    MeldResolutionError
  );
  
  // Test that it returns empty string in permissive mode
  const collector = new ErrorCollector();
  const result = await resolver.resolve('${undefined}', context, createPermissiveModeOptions(collector));
  expect(result).toBe('');
  expect(collector.warnings).toHaveLength(1);
});
```

### CommandResolver Tests

**Todo Tests:**
- `should handle undefined commands appropriately (pending new error system)` ✅
- `should handle parameter count mismatches appropriately (pending new error system)` ✅

**Implementation Plan:**
```typescript
// services/resolution/ResolutionService/resolvers/CommandResolver.test.ts

it('should handle undefined commands appropriately', async () => {
  // Arrange
  stateService.getCommand.mockReturnValue(undefined);
  
  // Act & Assert
  // Test strict mode
  await expectThrowsWithSeverity(
    () => resolver.resolve('$undefined(${param})', context, createStrictModeOptions()),
    MeldResolutionError,
    ErrorSeverity.Recoverable
  );
  
  // Test permissive mode
  await expectWarningsInPermissiveMode(
    (options) => resolver.resolve('$undefined(${param})', context, options),
    MeldResolutionError
  );
});

it('should handle parameter count mismatches appropriately', async () => {
  // Arrange
  const command = {
    parameters: ['param1', 'param2'],
    body: '@run [echo ${param1} ${param2}]'
  };
  stateService.getCommand.mockReturnValue(command);
  
  // Act & Assert
  // Test too few parameters in strict mode
  await expectThrowsWithSeverity(
    () => resolver.resolve('$command(${param1})', context, createStrictModeOptions()),
    MeldResolutionError,
    ErrorSeverity.Recoverable
  );
  
  // Test too many parameters in strict mode
  await expectThrowsWithSeverity(
    () => resolver.resolve('$command(${param1}, ${param2}, ${param3})', context, createStrictModeOptions()),
    MeldResolutionError,
    ErrorSeverity.Recoverable
  );
  
  // Test parameter mismatch in permissive mode
  await expectWarningsInPermissiveMode(
    (options) => resolver.resolve('$command(${param1})', context, options),
    MeldResolutionError
  );
});
```

### DataResolver Tests

**Todo Tests:**
- `should handle undefined variables appropriately (pending new error system)`
- `should handle field access restrictions appropriately (pending new error system)`
- `should handle null/undefined field access appropriately (pending new error system)`
- `should handle accessing field of non-object (pending new error system)`
- `should handle accessing non-existent field (pending new error system)`

**Implementation Plan:**
```typescript
// services/resolution/ResolutionService/resolvers/DataResolver.test.ts

it('should handle undefined variables appropriately', async () => {
  // Arrange
  stateService.getDataVariable.mockReturnValue(undefined);
  
  // Act & Assert
  await expectThrowsInStrictButWarnsInPermissive(
    (options) => resolver.resolve('#{undefined}', context, options),
    MeldResolutionError
  );
});

it('should handle field access restrictions appropriately', async () => {
  // Arrange
  stateService.getDataVariable.mockReturnValue({ field: 'value' });
  
  // Act & Assert
  // Test valid field access
  const result = await resolver.resolve('#{data.field}', context);
  expect(result).toBe('value');
  
  // Test field access on restricted types
  await expectThrowsInStrictButWarnsInPermissive(
    (options) => resolver.resolve('#{data.field.subfield}', context, options),
    MeldResolutionError
  );
});

it('should handle null/undefined field access appropriately', async () => {
  // Arrange
  stateService.getDataVariable.mockReturnValue({ nullField: null, undefinedField: undefined });
  
  // Act & Assert
  await expectThrowsInStrictButWarnsInPermissive(
    (options) => resolver.resolve('#{data.nullField.subfield}', context, options),
    MeldResolutionError
  );
  
  await expectThrowsInStrictButWarnsInPermissive(
    (options) => resolver.resolve('#{data.undefinedField.subfield}', context, options),
    MeldResolutionError
  );
});

it('should handle accessing field of non-object', async () => {
  // Arrange
  stateService.getDataVariable.mockReturnValue({ stringField: 'string', numberField: 42 });
  
  // Act & Assert
  await expectThrowsInStrictButWarnsInPermissive(
    (options) => resolver.resolve('#{data.stringField.subfield}', context, options),
    MeldResolutionError
  );
  
  await expectThrowsInStrictButWarnsInPermissive(
    (options) => resolver.resolve('#{data.numberField.subfield}', context, options),
    MeldResolutionError
  );
});

it('should handle accessing non-existent field', async () => {
  // Arrange
  stateService.getDataVariable.mockReturnValue({ field: 'value' });
  
  // Act & Assert
  await expectThrowsInStrictButWarnsInPermissive(
    (options) => resolver.resolve('#{data.nonexistent}', context, options),
    MeldResolutionError
  );
});
```

## 2. Directive Handler Tests

### TextDirectiveHandler Integration Tests

**Todo Tests:**
- `should handle circular reference detection - Complex error handling deferred for V1`
- `should handle error propagation through the stack - Complex error propagation deferred for V1`
- `should handle validation errors with proper context`
- `should handle mixed directive types - Complex directive interaction deferred for V1`

**Implementation Plan:**
```typescript
// services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts

it('should handle validation errors with proper context', async () => {
  // Arrange
  const node = createDirectiveNode('text', 'invalid', { 
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
  });
  
  // Act & Assert
  await expectThrowsWithSeverity(
    () => handler.execute(node, context),
    DirectiveError,
    ErrorSeverity.Recoverable
  );
  
  try {
    await handler.execute(node, context);
  } catch (error) {
    expectDirectiveErrorWithCode(error, DirectiveErrorCode.VALIDATION_FAILED, ErrorSeverity.Recoverable);
    expect(error.context).toMatchObject({
      directiveKind: 'text',
      location: { line: 1, column: 1 }
    });
  }
});
```

## 3. CLI Service Tests

**Todo Tests:**
- `should handle overwrite cancellation appropriately (pending new error system)`
- `should handle overwrite confirmation appropriately (pending new error system)`

**Implementation Plan:**
```typescript
// services/cli/CLIService/CLIService.test.ts

it('should handle overwrite cancellation appropriately', async () => {
  // Arrange
  const cliService = new CLIService(/* dependencies */);
  const options = { input: 'test.meld', output: 'existing.md' };
  fileSystemService.fileExists.mockResolvedValue(true);
  promptService.confirm.mockResolvedValue(false); // User cancels overwrite
  
  // Act & Assert
  const collector = new ErrorCollector();
  await cliService.run(options, collector.handleError);
  
  // Should have a warning about cancelled operation
  expect(collector.warnings).toHaveLength(1);
  expect(collector.warnings[0].message).toContain('Operation cancelled');
  
  // Should not have written the file
  expect(fileSystemService.writeFile).not.toHaveBeenCalled();
});

it('should handle overwrite confirmation appropriately', async () => {
  // Arrange
  const cliService = new CLIService(/* dependencies */);
  const options = { input: 'test.meld', output: 'existing.md' };
  fileSystemService.fileExists.mockResolvedValue(true);
  promptService.confirm.mockResolvedValue(true); // User confirms overwrite
  
  // Act
  await cliService.run(options);
  
  // Assert
  // Should have written the file
  expect(fileSystemService.writeFile).toHaveBeenCalledWith('existing.md', expect.any(String));
});
```

## 4. FuzzyMatchingValidator Tests

**Todo Tests:**
- `should reject fuzzy thresholds below 0 - Edge case validation deferred for V1`
- `should reject fuzzy thresholds above 1 - Edge case validation deferred for V1`
- `should reject non-numeric fuzzy thresholds - Edge case validation deferred for V1`
- `should provide helpful error messages - Detailed error messaging deferred for V1`

**Implementation Plan:**
```typescript
// services/resolution/ValidationService/validators/FuzzyMatchingValidator.test.ts

it('should reject fuzzy thresholds below 0', async () => {
  // Arrange
  const validator = new FuzzyMatchingValidator();
  const value = { fuzzyThreshold: -0.1 };
  
  // Act & Assert
  await expectThrowsWithSeverity(
    () => validator.validate(value),
    ValidationError,
    ErrorSeverity.Recoverable
  );
  
  try {
    await validator.validate(value);
  } catch (error) {
    expect(error.message).toContain('Fuzzy threshold must be between 0 and 1');
  }
});

it('should reject fuzzy thresholds above 1', async () => {
  // Arrange
  const validator = new FuzzyMatchingValidator();
  const value = { fuzzyThreshold: 1.1 };
  
  // Act & Assert
  await expectThrowsWithSeverity(
    () => validator.validate(value),
    ValidationError,
    ErrorSeverity.Recoverable
  );
});

it('should reject non-numeric fuzzy thresholds', async () => {
  // Arrange
  const validator = new FuzzyMatchingValidator();
  const value = { fuzzyThreshold: 'not-a-number' };
  
  // Act & Assert
  await expectThrowsWithSeverity(
    () => validator.validate(value),
    ValidationError,
    ErrorSeverity.Recoverable
  );
});

it('should provide helpful error messages', async () => {
  // Arrange
  const validator = new FuzzyMatchingValidator();
  
  // Act & Assert
  try {
    await validator.validate({ fuzzyThreshold: -0.1 });
  } catch (error) {
    expect(error.message).toContain('Fuzzy threshold must be between 0 and 1');
  }
  
  try {
    await validator.validate({ fuzzyThreshold: 1.1 });
  } catch (error) {
    expect(error.message).toContain('Fuzzy threshold must be between 0 and 1');
  }
  
  try {
    await validator.validate({ fuzzyThreshold: 'not-a-number' });
  } catch (error) {
    expect(error.message).toContain('Fuzzy threshold must be a number');
  }
});
```

## 5. CLI Tests

**Todo Tests:**
- `should handle missing data fields appropriately (pending new error system)`
- `should handle missing env vars appropriately (pending new error system)`
- `should not warn on expected stderr from commands`
- `should handle type coercion silently`

**Implementation Plan:**
```typescript
// cli/cli.test.ts

it('should handle missing data fields appropriately', async () => {
  // Arrange
  const content = '@data config = { "field": "value" }\n#{config.nonexistent}';
  fs.writeFileSync('test.meld', content);
  
  // Act
  const { stdout, stderr } = await execCLI('test.meld --stdout');
  
  // Assert
  // In permissive mode (CLI default), should warn but continue
  expect(stderr).toContain('Warning: Field not found: nonexistent');
  // Should output empty string for missing field
  expect(stdout).toBe('');
});

it('should handle missing env vars appropriately', async () => {
  // Arrange
  const content = '${ENV_NONEXISTENT_VAR}';
  fs.writeFileSync('test.meld', content);
  
  // Act
  const { stdout, stderr } = await execCLI('test.meld --stdout');
  
  // Assert
  // In permissive mode (CLI default), should warn but continue
  expect(stderr).toContain('Warning: Environment variable not found: NONEXISTENT_VAR');
  // Should output empty string for missing env var
  expect(stdout).toBe('');
});

it('should not warn on expected stderr from commands', async () => {
  // Arrange
  const content = '@run [echo "Error message" >&2]';
  fs.writeFileSync('test.meld', content);
  
  // Act
  const { stdout, stderr } = await execCLI('test.meld --stdout');
  
  // Assert
  // Command stderr should be in stderr output
  expect(stderr).toContain('Error message');
  // But should not contain a warning about it
  expect(stderr).not.toContain('Warning: Command produced stderr output');
});

it('should handle type coercion silently', async () => {
  // Arrange
  const content = '@data num = 42\n${num}';
  fs.writeFileSync('test.meld', content);
  
  // Act
  const { stdout, stderr } = await execCLI('test.meld --stdout');
  
  // Assert
  // Should coerce number to string without warning
  expect(stdout).toBe('42');
  expect(stderr).not.toContain('Warning: Type coercion');
});
```

## 6. Init Command Tests

**Skipped Tests:**
- `should exit if meld.json already exists`

**Implementation Plan:**
```typescript
// cli/commands/init.test.ts

it('should exit if meld.json already exists', async () => {
  // Arrange
  fs.writeFileSync('meld.json', JSON.stringify({ projectRoot: '.' }));
  
  // Act & Assert
  await expect(initCommand()).rejects.toThrow('meld.json already exists');
  
  // Clean up
  fs.unlinkSync('meld.json');
});
```

## 7. API Tests

**Skipped Tests:**
- `should handle large files efficiently`
- `should handle deeply nested imports`

**Implementation Plan:**
```typescript
// api/api.test.ts

it('should handle large files efficiently', async () => {
  // Arrange
  const largeContent = '@text var = "value"\n'.repeat(1000);
  fs.writeFileSync('large.meld', largeContent);
  
  // Act
  const startTime = Date.now();
  const result = await meld.processFile('large.meld');
  const endTime = Date.now();
  
  // Assert
  expect(result).toBeDefined();
  // Should process in a reasonable time (adjust threshold as needed)
  expect(endTime - startTime).toBeLessThan(1000);
});

it('should handle deeply nested imports', async () => {
  // Arrange
  fs.writeFileSync('level1.meld', '@text var1 = "level1"\n@import [level2.meld]');
  fs.writeFileSync('level2.meld', '@text var2 = "level2"\n@import [level3.meld]');
  fs.writeFileSync('level3.meld', '@text var3 = "level3"\n@import [level4.meld]');
  fs.writeFileSync('level4.meld', '@text var4 = "level4"\n@import [level5.meld]');
  fs.writeFileSync('level5.meld', '@text var5 = "level5"');
  
  // Act
  const result = await meld.processFile('level1.meld');
  
  // Assert
  expect(result).toContain('level1');
  expect(result).toContain('level2');
  expect(result).toContain('level3');
  expect(result).toContain('level4');
  expect(result).toContain('level5');
});
```

## 8. InterpreterService Integration Tests

**Todo Tests:**
- `handles nested imports with state inheritance`
- `maintains correct state after successful imports`
- `handles nested directive values correctly`

**Implementation Plan:**
```typescript
// services/pipeline/InterpreterService/InterpreterService.integration.test.ts

it('handles nested imports with state inheritance', async () => {
  // Arrange
  const parentContent = '@text parent = "parent"\n@import [child.meld]';
  const childContent = '@text child = "child"\n${parent}';
  
  fileSystem.writeFile('parent.meld', parentContent);
  fileSystem.writeFile('child.meld', childContent);
  
  // Act
  const nodes = await parser.parse(parentContent);
  const state = await interpreter.interpret(nodes, { filePath: 'parent.meld' });
  
  // Assert
  expect(state.getVariable('parent')).toBe('parent');
  expect(state.getVariable('child')).toBe('child');
});

it('maintains correct state after successful imports', async () => {
  // Arrange
  const mainContent = '@text before = "before"\n@import [imported.meld]\n@text after = "after"';
  const importedContent = '@text imported = "imported"';
  
  fileSystem.writeFile('main.meld', mainContent);
  fileSystem.writeFile('imported.meld', importedContent);
  
  // Act
  const nodes = await parser.parse(mainContent);
  const state = await interpreter.interpret(nodes, { filePath: 'main.meld' });
  
  // Assert
  expect(state.getVariable('before')).toBe('before');
  expect(state.getVariable('imported')).toBe('imported');
  expect(state.getVariable('after')).toBe('after');
});

it('handles nested directive values correctly', async () => {
  // Arrange
  const content = '@text inner = "inner"\n@text outer = @embed [${inner}.md]';
  fileSystem.writeFile('inner.md', 'Content from inner');
  
  // Act
  const nodes = await parser.parse(content);
  const state = await interpreter.interpret(nodes);
  
  // Assert
  expect(state.getVariable('inner')).toBe('inner');
  expect(state.getVariable('outer')).toBe('Content from inner');
});
```

## Implementation Timeline

1. **Week 1: Core Resolver Tests**
   - Implement TextResolver tests ✅
   - Implement CommandResolver tests ✅
   - Implement DataResolver tests

2. **Week 2: Directive Handler Tests**
   - Implement TextDirectiveHandler integration tests
   - Implement other directive handler tests as needed

3. **Week 3: CLI and Validation Tests**
   - Implement CLI Service tests
   - Implement FuzzyMatchingValidator tests
   - Implement CLI tests

4. **Week 4: API and Integration Tests**
   - Implement API tests
   - Implement InterpreterService integration tests
   - Final verification and cleanup

## Verification Process

For each implemented test:
1. Run the test to verify it passes
2. Check code coverage to ensure the error handling code is exercised
3. Verify that both strict and permissive modes are tested
4. Update any related documentation

## Conclusion

This migration plan provides a comprehensive approach to updating the skipped and todo tests to use the new error handling system. By following this plan, we can ensure that all error scenarios are properly tested in both strict and permissive modes, providing a robust foundation for the Meld language interpreter.
