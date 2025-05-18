# Service Tests Migration to Fixtures Guide

This guide provides comprehensive instructions for migrating service tests from inline test data to fixture-based testing patterns.

## Table of Contents
1. [Motivation](#motivation)
2. [Benefits](#benefits)
3. [Migration Steps](#migration-steps)
4. [Before & After Examples](#before--after-examples)
5. [Best Practices](#best-practices)
6. [Common Patterns](#common-patterns)
7. [Migration Checklist](#migration-checklist)
8. [Troubleshooting](#troubleshooting)

## Motivation

### Why Fixtures?
- **Separation of Concerns**: Keep test logic separate from test data
- **Reusability**: Share common test scenarios across multiple test files
- **Maintainability**: Update test data in one place
- **Clarity**: Make tests more readable by focusing on behavior
- **Consistency**: Standardize test data structure across the codebase
- **Real-world Testing**: Use actual AST structures from examples

## Benefits

1. **Improved Test Readability**
   - Tests focus on behavior, not data construction
   - Clearer intent and expectations

2. **Easier Maintenance**
   - Update fixtures when AST changes
   - No need to update multiple inline objects

3. **Better Coverage**
   - Test with real-world AST structures
   - Catch edge cases from actual examples

4. **Faster Development**
   - Copy and modify existing fixtures
   - Less boilerplate code

## Migration Steps

### Step 1: Identify Test Data Patterns

First, analyze your existing tests to identify common data patterns:

```typescript
// Look for patterns like this:
const mockTextDirective: TextDirective = {
  kind: DirectiveKind.Text,
  type: 'directive',
  // ... inline data
};
```

### Step 2: Create Fixture Files

Create fixtures in the appropriate directory:

```
core/fixtures/
├── text/
│   ├── text-assignment.fixture.json
│   ├── text-template.fixture.json
│   └── text-path.fixture.json
```

### Step 3: Extract Test Data to Fixtures

Convert inline test data to fixture files:

```json
{
  "type": "directive",
  "kind": "text",
  "name": "myOutput",
  "value": {
    "type": "template",
    "parts": [
      {
        "type": "literal",
        "value": "Hello, "
      },
      {
        "type": "variable",
        "name": "name"
      }
    ]
  }
}
```

### Step 4: Update Tests to Use Fixtures

Replace inline data with fixture loading:

```typescript
import { loadFixture } from '@tests/utils/FixtureManager';

const fixture = loadFixture<TextDirective>('text/text-template.fixture.json');
```

### Step 5: Run and Verify Tests

Ensure all tests pass after migration:

```bash
npm test services/directives/handlers/TextDirectiveHandler.test.ts
```

## Before & After Examples

### Before: Inline Test Data

```typescript
describe('TextDirectiveHandler', () => {
  it('should handle text assignment directive', async () => {
    // Inline mock data
    const mockDirective: TextDirective = {
      type: 'directive',
      kind: DirectiveKind.Text,
      name: 'output',
      value: {
        type: 'text',
        content: 'Hello World'
      },
      metadata: {
        startLine: 1,
        endLine: 1,
        sourceFile: 'test.meld'
      }
    };

    const result = await handler.handle(mockDirective, mockState, mockDependencies);
    
    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe('set_variable');
  });
});
```

### After: Fixture-Based Testing

```typescript
describe('TextDirectiveHandler', () => {
  it('should handle text assignment directive', async () => {
    // Load fixture
    const fixture = loadFixture<TextDirective>('text/text-assignment.fixture.json');
    
    const result = await handler.handle(fixture, mockState, mockDependencies);
    
    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe('set_variable');
  });
});
```

## Best Practices

### 1. Fixture Organization

```
core/fixtures/
├── text/              # Group by directive type
│   ├── assignment/    # Further group by subtype
│   ├── template/
│   └── path/
```

### 2. Naming Conventions

- Use descriptive names: `text-template-with-variables.fixture.json`
- Include variant type: `text-assignment-multiline.fixture.json`
- Match example names: `text-path-absolute.fixture.json`

### 3. Fixture Content

- Include all required fields
- Use realistic values
- Add metadata for source mapping
- Include edge cases

### 4. Helper Functions

Create utilities for common operations:

```typescript
// tests/utils/fixtures.ts
export function loadTextFixture(name: string): TextDirective {
  return loadFixture<TextDirective>(`text/${name}.fixture.json`);
}

export function createTextFixture(overrides: Partial<TextDirective>): TextDirective {
  const base = loadTextFixture('text-assignment');
  return { ...base, ...overrides };
}
```

### 5. Parameterized Tests

Use fixtures with parameterized tests:

```typescript
const testCases = [
  { fixture: 'text-assignment', expected: 'set_variable' },
  { fixture: 'text-template', expected: 'set_variable' },
  { fixture: 'text-path', expected: 'set_variable' }
];

testCases.forEach(({ fixture, expected }) => {
  it(`should handle ${fixture}`, async () => {
    const fixtureData = loadTextFixture(fixture);
    const result = await handler.handle(fixtureData, mockState, mockDependencies);
    expect(result.changes[0].type).toBe(expected);
  });
});
```

## Common Patterns

### 1. Variations Testing

```typescript
// Test different variations of the same directive
const variations = [
  'text-assignment',
  'text-assignment-multiline',
  'text-assignment-with-variables'
];

variations.forEach(fixture => {
  it(`should handle ${fixture}`, async () => {
    const data = loadTextFixture(fixture);
    // Test implementation
  });
});
```

### 2. Error Cases

```typescript
// Create fixtures for error cases
const errorFixtures = [
  'text-invalid-value',
  'text-missing-name',
  'text-circular-reference'
];

errorFixtures.forEach(fixture => {
  it(`should throw error for ${fixture}`, async () => {
    const data = loadTextFixture(fixture);
    await expect(handler.handle(data, mockState, mockDependencies))
      .rejects.toThrow();
  });
});
```

### 3. State Verification

```typescript
// Use fixtures to verify state changes
it('should update state correctly', async () => {
  const fixture = loadTextFixture('text-with-state-changes');
  const result = await handler.handle(fixture, mockState, mockDependencies);
  
  // Verify state changes
  expect(result.changes).toMatchSnapshot();
});
```

## Migration Checklist

- [ ] Identify all inline test data
- [ ] Create fixture directory structure
- [ ] Extract test data to JSON fixtures
- [ ] Update imports to include fixture utilities
- [ ] Replace inline data with fixture loading
- [ ] Verify all tests pass
- [ ] Remove unused mock creation code
- [ ] Add new fixtures for edge cases
- [ ] Update test documentation
- [ ] Create helper functions for common patterns
- [ ] Add fixture validation tests
- [ ] Run full test suite

## Troubleshooting

### Common Issues and Solutions

1. **Type Mismatches**
   ```typescript
   // Ensure proper typing
   const fixture = loadFixture<TextDirective>('text/text-assignment.fixture.json');
   ```

2. **Missing Required Fields**
   - Check fixture against type definitions
   - Add all required fields to fixtures

3. **Path Resolution Issues**
   ```typescript
   // Use absolute imports
   import { loadFixture } from '@tests/utils/FixtureManager';
   ```

4. **Test Failures After Migration**
   - Compare fixture content with original inline data
   - Check for missing metadata fields
   - Verify proper JSON formatting

### Debugging Tips

1. **Log Fixture Content**
   ```typescript
   const fixture = loadFixture('text/text-assignment');
   console.log(JSON.stringify(fixture, null, 2));
   ```

2. **Compare Before/After**
   - Keep original test temporarily
   - Run both versions side by side
   - Compare results

3. **Validate Fixtures**
   ```typescript
   // Add fixture validation test
   it('should have valid fixture structure', () => {
     const fixture = loadTextFixture('text-assignment');
     expect(fixture.type).toBe('directive');
     expect(fixture.kind).toBe('text');
   });
   ```

## Next Steps

1. Start with a single test file
2. Migrate incrementally
3. Document any custom patterns
4. Share learnings with team
5. Update this guide with discoveries

## Resources

- [Fixture Manager Documentation](./tests/utils/FixtureManager.ts)
- [AST Type Definitions](./core/types/ast-nodes.ts)
- [Example Fixtures](./core/fixtures/)
- [Test Utilities](./tests/utils/)