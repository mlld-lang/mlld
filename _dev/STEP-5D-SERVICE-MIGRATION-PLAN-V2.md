# Step 5d: Other Services Migration Plan (v2)

## Overview

This plan leverages the comprehensive fixture/example system discovered in `core/examples/` and `core/ast/fixtures/`. Each fixture contains:
- Input Meld code
- Expected output
- Complete AST structure 
- Node metadata

This provides perfect test data for service migrations.

## Fixture Structure Understanding

Each fixture follows this pattern:
```json
{
  "name": "text-assignment",
  "input": "@text greeting = \"Hello, world!\"\\n@add @greeting",
  "expected": "Hello, world!",
  "directives": [...],
  "ast": [/* Complete AST structure */],
  "metadata": { "kind": "text", "subtype": "assignment" }
}
```

## Services to Migrate

### 1. ResolutionService (Highest Priority)

**Why Fixtures Are Perfect**:
- Fixtures include complete AST with interpolatable values
- Expected outputs show correctly resolved content
- Can test complex resolution scenarios (templates, nested properties)

**Key Test Scenarios**:
```typescript
// Example: Test template resolution
const fixture = loadFixture('data-object'); // has {{user.name}} template
const resolved = await resolutionService.resolveNodes(fixture.ast);
expect(resolved).toEqual("John is 30."); // from fixture.expected
```

**Fixtures to Use**:
- `text-template-*` - Template variable resolution
- `data-object-*` - Property access resolution  
- `add-template-variables-*` - Complex interpolations
- `import-all-variable-*` - Cross-file resolution

### 2. ValidationService

**Why Fixtures Help**:
- Valid fixtures provide known-good AST structures
- Can create invalid variations for error testing
- Metadata shows expected types and subtypes

**Key Test Scenarios**:
```typescript
// Test valid structure
const fixture = loadFixture('text-assignment');
expect(validator.validate(fixture.ast[0])).toBe(true);

// Test invalid structure (modify fixture)
const invalid = { ...fixture.ast[0], kind: 'invalid' };
expect(validator.validate(invalid)).toBe(false);
```

**Fixtures to Use**:
- All directive types for structure validation
- `invalid/*` fixtures for error cases
- Create variations of valid fixtures

### 3. PathService

**Why Fixtures Help**:
- Path fixtures show all path types (absolute, relative, special)
- Variable interpolation in paths
- Project-relative and home directory paths

**Key Test Scenarios**:
```typescript
// Test path resolution types
const fixture = loadFixture('path-assignment-absolute');
const resolved = await pathService.resolve(fixture.ast[0]);
expect(resolved).toMatch(/^\/absolute\/path/);
```

**Fixtures to Use**:
- `path-assignment-*` - All path variations
- `import-*` - Import path resolution
- `add-path-*` - File inclusion paths

### 4. OutputService

**Why Fixtures Help**:
- Complete transformation pipeline testing
- Expected outputs for validation
- All node types covered

**Key Test Scenarios**:
```typescript
// Test full transformation
const fixture = loadFixture('text-template');
const output = await outputService.transform(fixture.ast);
expect(output).toEqual(fixture.expected);
```

**Fixtures to Use**:
- All fixtures for comprehensive testing
- Multi-directive examples
- Complex nested scenarios

### 5. ParserService (Remaining Files)

**Why Fixtures Help**:
- Fixtures contain actual parsed AST
- Can verify parser output matches fixtures
- Grammar regression testing

**Key Test Scenarios**:
```typescript
// Verify parser produces correct AST
const fixture = loadFixture('text-assignment');
const parsed = await parserService.parse(fixture.input);
expect(parsed).toMatchObject(fixture.ast);
```

## Migration Strategy Using Fixtures

### Phase 1: Fixture Analysis
1. Review available fixtures for service
2. Identify test coverage gaps
3. Create service-specific test plan
4. Note which fixtures have dependencies (imports)

### Phase 2: Code Migration
1. Update imports from `@core/syntax/types` to `@core/ast/types`
2. Use AST structure directly (no `node.directive`)
3. Update discriminated union handling
4. Fix type guards and pattern matching

### Phase 3: Test Creation
1. Load fixtures using `ASTFixtureLoader`
2. Test against expected outputs
3. Create variations for edge cases
4. Use fixture metadata for validation

### Phase 4: Integration Testing
1. Test with dependent fixtures (imports)
2. Verify cross-service integration
3. End-to-end pipeline testing

## Service-Specific Fixture Usage

### ResolutionService
```typescript
// Template resolution test
it('should resolve template variables', async () => {
  const fixture = loadFixture('add-template-variables');
  const resolved = await resolution.resolveNodes(
    fixture.ast[1].values.content
  );
  expect(resolved).toContain("value"); // variable value
});

// Nested property resolution
it('should resolve nested properties', async () => {
  const fixture = loadFixture('data-object-nested');
  const resolved = await resolution.resolveReference(
    { identifier: 'config', fields: ['server', 'port'] }
  );
  expect(resolved).toBe(8080);
});
```

### ValidationService
```typescript
// Structure validation
it('should validate directive structure', async () => {
  const fixtures = await loadAllFixtures();
  fixtures.forEach(fixture => {
    fixture.ast.forEach(node => {
      expect(validator.validateNode(node)).toBe(true);
    });
  });
});
```

### PathService
```typescript
// Path type detection
it('should handle different path types', async () => {
  const fixtures = [
    'path-assignment-absolute',
    'path-assignment-project',
    'path-assignment-special'
  ];
  
  for (const name of fixtures) {
    const fixture = loadFixture(name);
    const pathType = pathService.getPathType(
      fixture.ast[0].values.path[0].content
    );
    expect(pathType).toMatchSnapshot();
  }
});
```

## Expected Benefits

1. **Real-World Testing**: All tests use actual AST structures
2. **Output Validation**: Can verify against known-good outputs
3. **Comprehensive Coverage**: Examples cover all directive types
4. **Dependency Testing**: Import fixtures test cross-file scenarios
5. **Reduced Mock Complexity**: Use real data instead of mocks

## Migration Checklist

For each service:

- [ ] **Fixture Analysis**
  - [ ] List applicable fixtures
  - [ ] Identify coverage gaps
  - [ ] Plan fixture variations
  
- [ ] **Code Updates**
  - [ ] Update imports to new types
  - [ ] Remove `node.directive` usage
  - [ ] Fix discriminated unions
  - [ ] Update property access
  
- [ ] **Test Implementation**
  - [ ] Create fixture-based tests
  - [ ] Add edge case variations
  - [ ] Test error scenarios
  - [ ] Verify expected outputs
  
- [ ] **Integration**
  - [ ] Test with dependent fixtures
  - [ ] Verify cross-service calls
  - [ ] End-to-end validation

## Timeline

Based on fixture availability:
- ResolutionService: 2 days (complex but well-covered)
- ValidationService: 1 day (straightforward testing)
- PathService: 1 day (good fixture coverage)
- OutputService: 1 day (transformation testing)
- ParserService: 1 day (AST comparison)

Total: 6 days

## Success Criteria

- All services use new AST structure
- Fixture-based tests provide better coverage
- Expected outputs match fixture data
- No `@core/syntax/types` imports remain
- Integration tests pass