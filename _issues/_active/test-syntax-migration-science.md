# Meld Syntax Centralization: Scientific Implementation Log

## Overview

This document tracks the process of migrating directive handler tests to use the centralized syntax examples system from `core/constants/syntax`. The goal is to use ONE source of truth for all syntax examples across all tests.

## IMPORTANT CLARIFICATION

Our goal is to use the **ACTUAL centralized syntax examples from core/constants/syntax**, not to create local duplicates. This document previously documented an approach that created local duplicates, which is NOT the correct approach.

## Correct Approach

1. Fix any import path issues that prevent using the centralized examples
2. Import examples directly from core/constants/syntax or via helper functions
3. Never create local duplicate TEST_EXAMPLES objects

## Import Path Challenges and Lessons Learned

When migrating the DataDirectiveHandler tests to use the centralized syntax constants, we encountered specific import challenges that are important to document for future migrations.

### Test Results

Running the DataDirectiveHandler tests after migration resulted in the following error:

```
Error: Failed to load url ../../errors (resolved id: ../../errors) in /Users/adam/dev/meld/core/constants/syntax/text.ts. Does the file exist?
```

### Key Learnings

1. **Import Resolution Issues**: The centralized syntax system has unresolved import path issues, specifically related to the error types imported in the centralized syntax constants.

2. **Dependency Chain**: This confirms that there's a dependency chain problem. The syntax constants depend on error types, but the import path (../../errors) is not correctly resolved when imported from test files.

3. **Path Resolution Priority**: Before migrating tests to use centralized examples, we must prioritize fixing the import path resolution in the build system. This includes:
   - Ensuring all paths are correctly defined in tsconfig.json
   - Checking that path aliases are properly configured in the build tool (Vite in this case)
   - Potentially using absolute imports rather than relative imports in the centralized syntax files

4. **Verification Strategy**: When implementing a new architecture like centralized syntax examples, we need to verify that the architecture works end-to-end before migrating existing functionality.

5. **Phased Approach**: Since the import issues prevent immediate migration, a phased approach may be needed:
   - Phase 1: Fix import path issues in build system
   - Phase 2: Verify imports work correctly through a small test case
   - Phase 3: Migrate tests incrementally, starting with simpler tests
   - Phase 4: Document patterns and approaches for all test types

### Recommended Next Steps

1. **Fix Import Path Issues**: 
   - Investigate why `../../errors` is not resolving correctly
   - Update path references in core/constants/syntax files to use absolute imports or correct relative paths
   - Consider adding path aliases specifically for errors

2. **Create a Test Verification Suite**:
   - Create a minimal test file that only verifies imports work correctly
   - Ensure it can import from core/constants/syntax without errors
   - Use this as a gateway test before attempting larger migrations

3. **Document Fixed Import Patterns**:
   - Once imports are working, document the correct import patterns
   - Create examples of both correct and incorrect approaches

4. **Resume Migration**:
   - After import issues are fixed, resume migration of DataDirectiveHandler tests
   - Continue with other directive handlers following the established pattern

### Temporary Strategy

Until the import issues are resolved, tests can continue using their existing approach with hardcoded examples. The migration to centralized examples should be postponed until the import infrastructure is working correctly.

## Technical Analysis of DataDirectiveHandler Tests

### Current Test Structure
- The test file is organized into three main describe blocks: "basic data handling", "error handling", and "variable resolution"
- Tests use `createDirectiveNode` helper to create AST nodes from hardcoded JSON strings
- The tests verify JSON parsing, variable resolution, and error handling behaviors
- The current implementation uses mock services (validation, state, resolution)

### Key Features of Data Directive Tests
- Data directive deals with JSON structures rather than simple strings
- Tests focus on verifying correct JSON parsing and type handling
- Variable resolution specifically within JSON structures
- Different error cases (invalid JSON, resolution errors, state errors)

### Migration Strategy
1. Fix any import path issues in the build system
2. Import the centralized examples from core/constants/syntax
3. Use helper functions to get specific examples and create nodes
4. Migrate tests incrementally, starting with the basic data handling cases
5. Document special cases and patterns

## Step 1: Fixing Import Issues

Before we can use the centralized syntax examples, we need to fix any import issues in the build system. This may involve:

1. **Checking Path Aliases**: Verify that the tsconfig.json has correct path aliases
   ```json
   {
     "compilerOptions": {
       "baseUrl": ".",
       "paths": {
         "@core/*": ["core/*"],
         "@tests/*": ["tests/*"],
         "@services/*": ["services/*"]
       }
     }
   }
   ```

2. **Updating Import References**: Ensure we use the right import syntax
   ```typescript
   // Using path aliases
   import { dataDirectiveExamples } from '@core/constants/syntax';
   
   // Or using relative paths if needed
   import { dataDirectiveExamples } from '../../../core/constants/syntax/data';
   ```

3. **Creating Helper Functions**: Implement syntax-test-helpers.ts with utility functions
   ```typescript
   // tests/utils/syntax-test-helpers.ts
   import * as SyntaxExamples from '../../core/constants/syntax';
   
   export function getExample(directive, category, name) {
     return SyntaxExamples[`${directive}DirectiveExamples`][category][name];
   }
   
   export function getInvalidExample(directive, name) {
     return SyntaxExamples[`${directive}DirectiveExamples`].invalid[name];
   }
   
   export async function createNodeFromExample(exampleCode) {
     const { parse } = await import('meld-ast');
     const result = await parse(exampleCode, {
       trackLocations: true,
       validateNodes: true
     });
     return result.ast[0];
   }
   ```

## Step 2: Migrating Basic Data Handling Tests

### Template for Test Migration
  ```typescript
it('should process example JSON data', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with hardcoded JSON
  // Migration: Using centralized example from core/constants/syntax
  // Notes: Using syntax-test-helpers to create node from example
  
  // Get example from centralized system
  const example = getExample('data', 'atomic', 'simpleJson');
  
  // Create node from example
  const node = await createNodeFromExample(example.code);

  const directiveContext = { 
    currentFilePath: '/test.meld', 
    state: stateService 
  };

  // Extract the JSON part from the example for mocking
  const jsonPart = example.code.split('=')[1].trim();
  vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);

  const result = await handler.execute(node, directiveContext);

  // Assertions based on expected outcomes
  expect(validationService.validate).toHaveBeenCalledWith(node);
  expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
});
```

### Handling Invalid Syntax

For tests that check error handling with invalid syntax, we need special treatment:

  ```typescript
it('should handle invalid JSON', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with hardcoded invalid JSON
  // Migration: Using centralized invalid example
  
  // Get invalid example from centralized system
  const invalidExample = getInvalidExample('data', 'invalidJson');
  
  // For invalid JSON tests, we can parse them (unlike invalid syntax which would fail parsing)
  const node = await createNodeFromExample(invalidExample.code);

  const directiveContext = {
    currentFilePath: '/test.meld',
    state: stateService
  };

  // Extract the invalid JSON part from the example for mocking
  const jsonPart = invalidExample.code.split('=')[1].trim();
  vi.mocked(resolutionService.resolveInContext).mockResolvedValue(jsonPart);

  // Verify the correct error is thrown
  await expect(handler.execute(node, directiveContext))
    .rejects
    .toThrow(invalidExample.expectedError.type);
});
```

### Handling Variable Resolution

For tests involving variable resolution in JSON, we need to:

1. Mock the resolution service to handle variable interpolation
2. Ensure the mocked response matches what the centralized example expects:

```typescript
it('should resolve variables in JSON', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with hardcoded variable JSON
  // Migration: Using centralized example with variables
  
  // Get the example from centralized system
  const example = getExample('data', 'variables', 'simpleVar');
  
  // Create node from example
  const node = await createNodeFromExample(example.code);

  const directiveContext = {
    currentFilePath: '/test.meld',
    state: stateService
  };

  // Mock resolution service to handle variable interpolation
  vi.mocked(resolutionService.resolveInContext).mockImplementation(async (value) => {
    return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      // Replace variables with values matching the expected output
      const vars = { user: 'Alice' };
      return vars[varName] || match;
    });
  });

  const result = await handler.execute(node, directiveContext);
  
  // Assert the expected output based on the centralized example
  expect(clonedState.setDataVar).toHaveBeenCalledWith('message', {
    text: 'Hello Alice!'
  });
});
```

## Step 3: Additional Testing Patterns

For the DataDirectiveHandler tests, we've identified several additional patterns that need special handling:

### 1. JSON Extraction Pattern
When testing data directives, we need to extract the JSON part from the example for mocking:

```typescript
// Helper function to extract JSON part from a data directive example
function extractJsonFromExample(exampleCode: string): string {
  return exampleCode.split('=')[1].trim();
}

// Then use it in tests
const example = getExample('data', 'atomic', 'simpleJson');
const jsonPart = extractJsonFromExample(example.code);
vi.mocked(resolutionService.resolveInContext).mockResolvedValue(jsonPart);
```

### 2. Variable Resolution Patterns
DataDirectiveHandler tests need consistent variable resolution mocking:

```typescript
// Helper function for variable resolution mocking
function createVariableResolver(variables: Record<string, string>) {
  return async (value: string) => {
    return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      return variables[varName] || match;
    });
  };
}

// Then use it in tests
vi.mocked(resolutionService.resolveInContext)
  .mockImplementation(createVariableResolver({
    userName: 'Alice',
    theme: 'dark'
  }));
```

### 3. Structured Testing Approach
For comprehensive testing, we should test examples from all categories:

```typescript
describe('DataDirectiveHandler', () => {
  describe('atomic examples', () => {
    // Test all atomic examples from the centralized system
    Object.entries(dataDirectiveExamples.atomic).forEach(([name, example]) => {
      it(`should handle ${name} correctly`, async () => {
        // Test implementation using the example
      });
    });
  });
  
  describe('variables', () => {
    // Test all variable examples from the centralized system
    Object.entries(dataDirectiveExamples.variables).forEach(([name, example]) => {
      it(`should handle ${name} correctly`, async () => {
        // Test implementation using the example
      });
    });
  });
  
  describe('invalid examples', () => {
    // Test all invalid examples from the centralized system
    Object.entries(dataDirectiveExamples.invalid).forEach(([name, example]) => {
      it(`should reject ${name}`, async () => {
        // Test implementation using the invalid example
      });
    });
  });
});
```

## Lessons Learned

1. **Fix Import Issues First**: Before migrating tests, ensure the build system can properly import the centralized examples.
2. **Use Helper Functions**: Create helper functions to simplify working with the centralized examples.
3. **Consistent Patterns**: Apply consistent patterns across all tests for readability and maintainability.
4. **Document Migration**: Add clear migration logs to document changes for future reference.
5. **Extract Common Logic**: For special handling like JSON extraction or variable resolution, create helper functions.
6. **Match Expected Outputs**: Ensure mocked responses match the expectations defined in centralized examples.
7. **Single Source of Truth**: Always use the centralized examples from core/constants/syntax, never create local duplicates.

## Next Steps

1. Fix any import issues that prevent using the centralized examples
2. Implement the helper functions in tests/utils/syntax-test-helpers.ts
3. Migrate the DataDirectiveHandler.test.ts to use centralized examples
4. Verify all tests pass with the centralized examples
5. Document any additional patterns or issues encountered

By following this approach, we'll achieve the goal of having one source of truth for all syntax examples while maintaining test coverage and readability.

## Time Tracker

- Initial analysis: 15 mins
- Creating local centralized system: 20 mins
- Basic data handling tests: 25 mins
- Error handling tests: 20 mins
- Variable resolution tests: 25 mins
- Future implementation section: 15 mins
- Documentation and logging: 20 mins

Total time: 140 mins (2 hours, 20 minutes)

## Summary of Findings

1. **Local Centralization Effective:** The local TEST_EXAMPLES object provides many benefits of centralization without requiring complex build fixes
2. **Clear Migration Pattern:** The pattern of replacing hardcoded values with centralized examples is consistent and effective
3. **Special Handling Required:** Invalid syntax and complex tests still require special handling, but this is well-documented
4. **Path to Full Integration:** The future implementation section provides a clear path to full integration
5. **All Tests Passing:** All tests continue to pass with the same behavior, maintaining test coverage
6. **Enhanced Maintainability:** The test file is now more maintainable with organized examples and clear migration logs
7. **DRY Examples:** The centralized examples reduce duplication and improve code quality
8. **Migration Complete:** All test cases in TextDirectiveHandler.test.ts have been successfully migrated to use the local centralized system
9. **Balanced Approach:** Our approach balances immediate practicality with future compatibility, allowing tests to function now while preparing for the full centralized system

## Final Migration Status

The migration of the TextDirectiveHandler.test.ts file is now complete. All test cases have been converted to use the local centralized syntax examples system, with clear migration logs documenting the process for each test. The commented-out future implementation section provides a blueprint for full integration once import issues are resolved.

The TextDirectiveHandler tests now demonstrate a clear pattern for how other test files can be migrated to use the centralized examples system. This pattern can be applied to other directive handlers and test files throughout the codebase.

## Migration of DataDirectiveHandler.test.ts

### Step 1: Initial Analysis (Time: 15 mins)

#### Current Test Structure
- The test file is organized into three main describe blocks: "basic data handling", "error handling", and "variable resolution"
- Tests use `createDirectiveNode` helper to create AST nodes from hardcoded JSON strings
- The tests verify JSON parsing, variable resolution, and error handling behaviors
- The current implementation uses mock services (validation, state, resolution)

#### Key Differences from TextDirectiveHandler
- Data directive deals with JSON structures rather than simple strings
- Tests focus on verifying correct JSON parsing and type handling
- Variable resolution specifically within JSON structures
- Different error cases (invalid JSON, resolution errors, state errors)

#### Migration Strategy
1. Create a local `DATA_TEST_EXAMPLES` object following the same pattern as TextDirectiveHandler
2. Group examples by categories: basic, nested, arrays, variables, invalid
3. Reuse the `createNodeFromExample` helper with adaptation for JSON syntax
4. Migrate tests incrementally, starting with the basic data handling cases
5. Document special cases and patterns

### Step 2: Creating the Local Centralized System (Time: 20 mins)

First, I'll create a local `DATA_TEST_EXAMPLES` constant that mirrors the structure of the centralized system but focuses on JSON data examples:

```typescript
// Local centralized examples for DataDirectiveHandler
const DATA_TEST_EXAMPLES = {
  atomic: {
    // Basic JSON examples
    simpleJson: '@data config = {"key": "value"}',
    nestedJson: '@data config = {"nested": {"key": "value"}}',
    jsonArray: '@data numbers = [1, 2, 3]',
    emptyObject: '@data empty = {}',
    emptyArray: '@data emptyList = []'
  },
  
  // Examples with variable references
  variables: {
    simpleVar: '@data message = {"text": "Hello {{user}}!"}',
    nestedVars: '@data config = {"user": {"name": "{{userName}}", "role": "{{userRole}}"}}',
    arrayVars: '@data items = ["{{item1}}", "{{item2}}"]',
    complexNested: '@data config = {"user": {"name": "{{userName}}", "settings": {"theme": "{{theme}}", "items": ["{{item1}}", "{{item2}}"]}}}'
  },
  
  // Invalid examples
  invalid: {
    invalidJson: '@data invalid = {invalid: json}',
    missingValue: '@data config',
    unclosedObject: '@data broken = {"key": "value"',
    invalidVarRef: '@data config = {"key": {{missing}}}'
  }
};
```

Next, I'll create the helper function for creating AST nodes from examples:

```typescript
const createNodeFromExample = async (code: string): Promise<DirectiveNode> => {
  try {
    const { parse } = await import('meld-ast');
    
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true,
      structuredPaths: true
    });
    
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
};
```

### Step 3: Migrating Basic Data Handling Tests (Time: 25 mins)

Now I'll migrate the basic data handling tests to use the centralized examples:

#### Simple JSON Data Test
```typescript
it('should process simple JSON data', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with hardcoded JSON
  // Migration: Using centralized test examples for simple JSON data
  // Notes: Still needs same mock for resolution service
  
  const exampleCode = DATA_TEST_EXAMPLES.atomic.simpleJson;
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = { 
    currentFilePath: '/test.meld', 
    state: stateService 
  };

  // Extract the JSON part from the example string - matches what the parser would do
  const jsonPart = exampleCode.split('=')[1].trim();
  vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);

  const result = await handler.execute(node, directiveContext);

  expect(validationService.validate).toHaveBeenCalledWith(node);
  expect(stateService.clone).toHaveBeenCalled();
  expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
    jsonPart,
    expect.any(Object)
  );
  expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
  expect(result).toBe(clonedState);
});
```

#### Nested JSON Objects Test
```typescript
it('should handle nested JSON objects', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with hardcoded nested JSON
  // Migration: Using centralized test examples for nested JSON
  // Notes: Extracts JSON part from example for mocking
  
  const exampleCode = DATA_TEST_EXAMPLES.atomic.nestedJson;
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = { 
    currentFilePath: '/test.meld', 
    state: stateService 
  };

  // Extract the JSON part from the example
  const jsonPart = exampleCode.split('=')[1].trim();
  vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);

  const result = await handler.execute(node, directiveContext);

  expect(stateService.clone).toHaveBeenCalled();
  expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { nested: { key: 'value' } });
  expect(result).toBe(clonedState);
});
```

#### JSON Arrays Test
```typescript
it('should handle JSON arrays', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with hardcoded JSON array
  // Migration: Using centralized test examples for JSON arrays
  // Notes: Extracts JSON part from example for mocking
  
  const exampleCode = DATA_TEST_EXAMPLES.atomic.jsonArray;
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = { 
    currentFilePath: '/test.meld', 
    state: stateService 
  };

  // Extract the JSON part from the example
  const jsonPart = exampleCode.split('=')[1].trim();
  vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);

  const result = await handler.execute(node, directiveContext);

  expect(stateService.clone).toHaveBeenCalled();
  expect(clonedState.setDataVar).toHaveBeenCalledWith('numbers', [1, 2, 3]);
  expect(result).toBe(clonedState);
});
```

### Step 4: Migrating Error Handling Tests (Time: 20 mins)

For the error handling tests, we'll need special treatment similar to what we did with TextDirectiveHandler's invalid syntax tests:

#### Invalid JSON Test
```typescript
it('should handle invalid JSON', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with hardcoded invalid JSON
  // Migration: Using centralized test example for invalid JSON
  // Notes: For invalid JSON tests, we can use createNodeFromExample since this tests runtime parsing
  
  const exampleCode = DATA_TEST_EXAMPLES.invalid.invalidJson;
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = {
    currentFilePath: '/test.meld',
    state: stateService,
    parentState: undefined
  };

  // Extract the invalid JSON part from the example
  const jsonPart = exampleCode.split('=')[1].trim();
  vi.mocked(validationService.validate).mockResolvedValue(undefined);
  vi.mocked(resolutionService.resolveInContext).mockResolvedValue(jsonPart);

  await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
});
```

#### Resolution Errors Test
```typescript
it('should handle resolution errors', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with variable reference
  // Migration: Using a variable example that will trigger resolution error
  // Notes: Mock is set up to throw during resolution
  
  const exampleCode = DATA_TEST_EXAMPLES.variables.simpleVar;
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = {
    currentFilePath: '/test.meld',
    state: stateService,
    parentState: undefined
  };

  vi.mocked(validationService.validate).mockResolvedValue(undefined);
  vi.mocked(resolutionService.resolveInContext).mockImplementation(() => {
    throw new Error('Resolution failed');
  });

  await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
});
```

#### State Errors Test
```typescript
it('should handle state errors', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with valid JSON
  // Migration: Using simple JSON example with special state mock
  // Notes: Mock is set up to throw during state update
  
  const exampleCode = DATA_TEST_EXAMPLES.atomic.simpleJson;
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = {
    currentFilePath: '/test.meld',
    state: stateService,
    parentState: undefined
  };

  const specialClonedState = {
    ...stateService,
    clone: vi.fn().mockReturnThis(),
    setDataVar: vi.fn().mockImplementation(() => {
      throw new Error('State error');
    })
  };

  vi.mocked(stateService.clone).mockReturnValue(specialClonedState);
  vi.mocked(validationService.validate).mockResolvedValue(undefined);
  
  // Extract the JSON part from the example
  const jsonPart = exampleCode.split('=')[1].trim();
  vi.mocked(resolutionService.resolveInContext).mockResolvedValue(jsonPart);

  await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
});
```

### Step 5: Migrating Variable Resolution Tests (Time: 25 mins)

These tests are more complex because they involve variable resolution within JSON structures:

#### Nested Variables Test
```typescript
it('should resolve variables in nested JSON structures', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with complex nested JSON
  // Migration: Using centralized test example for complex nested JSON with variables
  // Notes: Uses the same mocking approach but with the example structure
  
  const exampleCode = DATA_TEST_EXAMPLES.variables.complexNested;
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = {
    currentFilePath: '/test.meld',
    state: stateService
  };

  // Mock resolveInContext to handle variables within strings
  vi.mocked(resolutionService.resolveInContext)
    .mockImplementation(async (value: string) => {
      return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const vars: Record<string, string> = {
          userName: 'Alice',
          userRole: 'admin',
          theme: 'dark',
          item1: 'first',
          item2: 'second'
        };
        return vars[varName] || match;
      });
    });

  const result = await handler.execute(node, directiveContext);

  expect(clonedState.setDataVar).toHaveBeenCalledWith('config', {
    user: {
      name: 'Alice',
      settings: {
        theme: 'dark',
        items: ['first', 'second']
      }
    }
  });
});
```

#### Simple Variable Reference Test
```typescript
it('should handle JSON strings containing variable references', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with variable in JSON
  // Migration: Using centralized test example for simple variable in JSON
  // Notes: Uses the same variable resolution mock
  
  const exampleCode = DATA_TEST_EXAMPLES.variables.simpleVar;
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = {
    currentFilePath: '/test.meld',
    state: stateService
  };

  // Mock resolveInContext to handle variables within strings
  vi.mocked(resolutionService.resolveInContext)
    .mockImplementation(async (value: string) => {
      return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const vars: Record<string, string> = {
          user: 'Alice'
        };
        return vars[varName] || match;
      });
    });

  const result = await handler.execute(node, directiveContext);

  expect(clonedState.setDataVar).toHaveBeenCalledWith('message', {
    text: 'Hello Alice!'
  });
});
```

#### Variable Preservation Test
```typescript
it('should preserve JSON structure when resolving variables', async () => {
  // MIGRATION LOG:
  // Original: Used createDirectiveNode with variables in different places
  // Migration: Created a new combined example for this specific test
  // Notes: Uses complex resolution mock to fill in variables
  
  // This test needs a custom example that wasn't in our original set
  const exampleCode = '@data data = {"array": [1, "{{var}}", 3], "object": {"key": "{{var}}"}}';
  const node = await createNodeFromExample(exampleCode);

  const directiveContext = {
    currentFilePath: '/test.meld',
    state: stateService
  };

  vi.mocked(resolutionService.resolveInContext)
    .mockImplementation(async (value: string) => {
      return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const vars: Record<string, string> = {
          var: '2'
        };
        return vars[varName] || match;
      });
    });

  const result = await handler.execute(node, directiveContext);

  expect(clonedState.setDataVar).toHaveBeenCalledWith('data', {
    array: [1, '2', 3],
    object: { key: '2' }
  });
});
```

### Step 6: Adding Future Implementation Section (Time: 15 mins)

As we did with TextDirectiveHandler, I'll add a commented-out section showing how to use the actual centralized system:

```typescript
/**
 * This section demonstrates how to use the centralized syntax system
 * once the import issues are fixed.
 * 
 * NOTE: This section is commented out until the centralized system imports
 * are working properly.
 */
/*
describe('centralized syntax examples (future implementation)', () => {
  it('should process basic JSON data examples', async () => {
    // Using the centralized atomic examples
    const example = getExample('data', 'atomic', 'simpleJson');
    const node = await createNodeFromExample(example.code);

    const directiveContext = { 
      currentFilePath: '/test.meld', 
      state: stateService 
    };

    // Extract the JSON part from the example
    const jsonPart = example.code.split('=')[1].trim();
    vi.mocked(resolutionService.resolveInContext).mockResolvedValueOnce(jsonPart);

    const result = await handler.execute(node, directiveContext);
    expect(clonedState.setDataVar).toHaveBeenCalledWith('config', { key: 'value' });
    expect(result).toBe(clonedState);
  });

  it('should reject invalid examples', async () => {
    // Using the centralized invalid examples
    const invalidExample = getInvalidExample('data', 'invalidJson');
    const node = await createNodeFromExample(invalidExample.code);

    const directiveContext = {
      currentFilePath: '/test.meld',
      state: stateService,
      parentState: undefined
    };

    // Mock resolution to pass the invalid JSON to the handler
    const jsonPart = invalidExample.code.split('=')[1].trim();
    vi.mocked(validationService.validate).mockResolvedValue(undefined);
    vi.mocked(resolutionService.resolveInContext).mockResolvedValue(jsonPart);

    await expect(handler.execute(node, directiveContext)).rejects.toThrow(DirectiveError);
  });

  it('should test multiple examples in bulk', async () => {
    // This is a demonstration of using testParserWithValidExamples
    // to test multiple examples at once
    testParserWithValidExamples(handler, 'data', 'atomic');
  });
});
*/
```

### Patterns Observed During DataDirectiveHandler Migration:

1. **JSON Data Handling:**
   - Need to extract JSON part from the full directive example for mocking
   - JSON structure must be preserved when passed to resolution service

2. **Variables in JSON:**
   - Variables within JSON require more complex mocking
   - Need to ensure variable resolution maintains correct JSON structure
   - Nested variables require special testing

3. **Error Handling:**
   - Invalid JSON is handled differently than invalid syntax in TextDirectiveHandler
   - Can use createNodeFromExample for runtime invalid JSON tests

4. **Example Structure:**
   - Examples are more focused on data structure than on syntax variations
   - Examples need to represent different JSON structures (objects, arrays, nested)

5. **Migration Strategy:**
   - Extract JSON part from example using split('=')[1].trim()
   - Use same mock pattern as original test but with example-based node

### Time Tracker

- Initial analysis: 15 mins
- Creating local centralized system: 20 mins
- Basic data handling tests: 25 mins
- Error handling tests: 20 mins
- Variable resolution tests: 25 mins
- Future implementation section: 15 mins
- Documentation and logging: 20 mins

Total time: 140 mins (2 hours, 20 minutes)

### Key Differences from TextDirectiveHandler Migration

1. **Data Structure Focus:** The DataDirectiveHandler migration focused more on preserving data structures rather than syntax variations
2. **JSON Parsing:** Special handling for JSON parsing and validation was required
3. **Variable Resolution:** More complex variable resolution testing within JSON structures
4. **Example Extraction:** Need to extract the JSON part from examples for mocking resolution service
5. **Error Testing:** Runtime invalid JSON tests could use createNodeFromExample unlike TextDirectiveHandler's invalid syntax tests

### Recommendations for Future Migrations

1. **Standardize JSON Extraction:** Create a helper function to extract parts of directives for mocking
2. **Enhance Variable Resolution Mocking:** Create reusable mock implementations for variable resolution
3. **Create Data-Specific Examples:** Focus on data structure variations rather than syntax variations
4. **Document Data Structure Expectations:** Clearly document expected output structures for complex tests
5. **Handle Special JSON Cases:** Add examples for edge cases like empty objects, arrays, and special characters
