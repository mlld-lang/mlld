# Phase 1.4: Validation Planning

## Test Strategy

### 1. Unit Tests - Service Interfaces
Test each service interface in isolation with mocked dependencies.

### 2. Integration Tests - Handler Flow
Test complete directive processing using real AST fixtures.

### 3. E2E Tests - Full Pipeline
Test entire system from parse to output using API integration tests.

## Test Scenarios by Directive Type

### Text Directives
| Fixture | Test Case | Validates |
|---------|-----------|-----------|
| text-assignment-1 | Simple assignment | Basic variable storage |
| text-template-1 | Template with variable | Variable interpolation |
| text-template-multiline-1 | Multi-line template | Line handling |
| text-assignment-add | Append operator (+=) | State mutations |
| text-assignment-run-1 | Command interpolation | Command execution |

**Key Test**:
```typescript
it('should resolve template with variables', async () => {
  // Given
  const state = new StateService();
  state.setVariable({ name: 'variable', value: 'value', type: 'text' });
  
  // When
  const directive = fixtures['text-template-1'].ast[0];
  const result = await textHandler.handle(directive, state, services);
  
  // Then
  expect(result.stateChanges.variables.template.value).toBe('This is a template with value');
});
```

### Data Directives
| Fixture | Test Case | Validates |
|---------|-----------|-----------|
| data-primitive-1 | String value | Simple data storage |
| data-object-1 | Object value | Complex data storage |
| data-array-1 | Array value | Array handling |
| data-object-nested-1 | Nested objects | Deep structures |

**Key Test**:
```typescript
it('should store parsed data directly', async () => {
  // Given
  const directive = fixtures['data-object-1'].ast[0];
  
  // When
  const result = await dataHandler.handle(directive, state, services);
  
  // Then
  expect(result.stateChanges.variables.config.value).toEqual({
    port: 3000,
    host: 'localhost'
  });
});
```

### Path Directives
| Fixture | Test Case | Validates |
|---------|-----------|-----------|
| path-assignment-1 | Relative path | Basic path resolution |
| path-assignment-absolute-1 | Absolute path | Absolute path handling |
| path-assignment-special-1 | $HOMEPATH | Special variables |
| path-assignment-project-1 | $PROJECTPATH | Project resolution |
| path-assignment-variable-1 | Path with variable | Variable in paths |

**Key Test**:
```typescript
it('should resolve special path variables', async () => {
  // Given
  const directive = fixtures['path-assignment-special-1'].ast[0];
  
  // When
  const result = await pathHandler.handle(directive, state, services);
  
  // Then
  expect(result.stateChanges.variables.homepath.value).toBe(process.env.HOME);
});
```

### Run/Exec Directives
| Fixture | Test Case | Validates |
|---------|-----------|-----------|
| run-command | Simple command | Command execution |
| run-code | Inline code | Code execution |
| exec-command | Exec command | Command with output |
| exec-code-1 | Exec code | Code with output |
| run-exec-parameters-1 | Parameters | Parameter handling |

**Key Test**:
```typescript
it('should execute command and store output', async () => {
  // Given
  const directive = fixtures['exec-command'].ast[0];
  services.fs.executeCommand = jest.fn().mockResolvedValue('output');
  
  // When
  const result = await execHandler.handle(directive, state, services);
  
  // Then
  expect(result.stateChanges.variables.result.value).toBe('output');
});
```

### Import Directives
| Fixture | Test Case | Validates |
|---------|-----------|-----------|
| import-all-1 | Import all | Full import |
| import-selected-1 | Import specific | Selective import |
| import-all-variable-1 | Import with path var | Path resolution |

**Key Test**:
```typescript
it('should import and merge child state', async () => {
  // Given
  const directive = fixtures['import-all-1'].ast[0];
  
  // When
  const result = await importHandler.handle(directive, state, services);
  
  // Then
  expect(result.stateChanges.childStates).toHaveLength(1);
  expect(result.stateChanges.childStates[0].variables).toBeDefined();
});
```

### Add Directives
| Fixture | Test Case | Validates |
|---------|-----------|-----------|
| add-template | Add template | Content addition |
| add-variable-1 | Add with variable | Variable in content |
| add-path | Add file content | File reading |
| add-section | Add section | Section extraction |

**Key Test**:
```typescript
it('should add resolved content as node', async () => {
  // Given
  const directive = fixtures['add-template'].ast[0];
  
  // When
  const result = await addHandler.handle(directive, state, services);
  
  // Then
  expect(result.stateChanges.nodes).toHaveLength(1);
  expect(result.stateChanges.nodes[0].type).toBe('content');
});
```

## Adapter Removal Strategy

### Phase 1: Validate New Interfaces
1. Create parallel tests using new interfaces
2. Ensure same results as adapter-based tests
3. Document any behavior differences

### Phase 2: Gradual Migration
1. Update one service at a time
2. Run both old and new tests
3. Fix integration issues

### Phase 3: Final Removal
1. Remove StateServiceAdapter
2. Update all imports
3. Delete backup files (.bak)

## High-Risk Areas

### 1. Variable Interpolation
- **Risk**: Complex resolution context structure
- **Validation**: Test with nested variables, circular refs
- **Fixtures**: text-template-*, add-variable-*

### 2. Path Resolution
- **Risk**: Security vulnerabilities, cross-platform
- **Validation**: Test with various path types
- **Fixtures**: path-assignment-*

### 3. Import Handling
- **Risk**: State merging, circular imports
- **Validation**: Test recursive imports
- **Fixtures**: import-*

### 4. Command Execution
- **Risk**: Security, error handling
- **Validation**: Test with mock filesystem
- **Fixtures**: run-*, exec-*

## Test Infrastructure

### 1. Fixture Loader
```typescript
class FixtureManager {
  static load(name: string): Fixture {
    return require(`@core/ast/fixtures/${name}.fixture.json`);
  }
  
  static getAST(name: string): DirectiveNode {
    return this.load(name).ast[0];
  }
}
```

### 2. Service Mocks
```typescript
const createMockServices = (): HandlerServices => ({
  fs: {
    readFile: jest.fn(),
    executeCommand: jest.fn(),
    exists: jest.fn().mockResolvedValue(true),
    // ...
  },
  resolver: {
    resolve: jest.fn().mockImplementation(({ value }) => 
      typeof value === 'string' ? value : 'resolved'
    ),
    // ...
  }
});
```

### 3. State Assertions
```typescript
const expectStateChanges = (result: DirectiveResult) => ({
  toHaveVariable: (name: string, value: any) => {
    expect(result.stateChanges?.variables?.[name]?.value).toEqual(value);
  },
  toHaveNode: (type: string) => {
    expect(result.stateChanges?.nodes?.[0]?.type).toBe(type);
  }
});
```

## Success Criteria

1. **All Fixtures Tested**: Each fixture has corresponding test
2. **Type Safety**: No `any` types in test code
3. **Mock Independence**: Tests don't depend on real filesystem
4. **Clear Failures**: Test failures indicate exact problem
5. **Performance**: All tests run in < 5 seconds

## Next Steps for Phase 2

1. Implement minimal ResolutionService
2. Update ResolutionContext interface
3. Fix variable interpolation in handlers
4. Run integration tests from this plan
5. Iterate until all tests pass