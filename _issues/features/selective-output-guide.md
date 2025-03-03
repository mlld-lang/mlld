# Selective Test Output Implementation Guide

This guide provides step-by-step instructions for implementing Phase 5 of the better-test-output project: Selective Test Output.

## Overview

Phase 5 introduces selective test output filtering that allows:
- Controlling verbosity levels on a per-test basis
- Filtering specific operations and state fields
- Prioritizing important states for visualization
- Controlling output depth
- Directing output to files vs console

## Step 1: Import and Setup

To use selective test output in your tests, add these imports:

```typescript
// Import the utilities
import { withTestOutput } from '../utils/debug/vitest-output-setup';
import { TestOutputVerbosity } from '../utils/debug/StateVisualizationService/TestVisualizationManager';
import { getOutputFilterInstance } from '../utils/debug/TestOutputFilterService';
```

## Step 2: Controlling Verbosity in Tests

To set verbosity for a specific test, use the `withTestOutput` decorator:

```typescript
// Example: Verbose output for a specific test
it('should process complex transformation', 
  withTestOutput({ verbosity: TestOutputVerbosity.Verbose })
  (async () => {
    // Test with verbose output
    const result = await someOperation();
    expect(result).toBeDefined();
  })
);

// Example: Minimal output for a quick test
it('should validate input quickly',
  withTestOutput({ verbosity: TestOutputVerbosity.Minimal })
  (async () => {
    // Test with minimal output
    const result = await quickValidation();
    expect(result).toBeTruthy();
  })
);
```

## Step 3: Filtering Operations

You can include or exclude specific operations:

```typescript
it('should focus on variable resolution',
  withTestOutput({
    verbosity: TestOutputVerbosity.Standard,
    includeOperations: ['resolveVariable', 'transformVariable'],
    excludeOperations: ['parseFragment', 'validateDirective']
  })
  (async () => {
    // Test code focusing on variable resolution
  })
);
```

## Step 4: Filtering State Fields

Control which fields appear in state data:

```typescript
it('should only show variable-related state fields',
  withTestOutput({
    includeStateFields: ['variables', 'variableRefs', 'resolvedVars'],
    maxDepth: 3  // Limit nesting depth
  })
  (async () => {
    // Test code
  })
);
```

## Step 5: Highlighting Important States

Ensure critical states are visualized even in minimal mode:

```typescript
it('should highlight important transformation states',
  withTestOutput({
    verbosity: TestOutputVerbosity.Minimal,
    alwaysVisualizeStates: ['transformationRoot', 'finalState']
  })
  (async () => {
    // Test that produces state transformations
  })
);
```

## Step 6: Redirecting Output to Files

Reduce console clutter by writing visualization to files:

```typescript
it('should write complex visualizations to files',
  withTestOutput({
    verbosity: TestOutputVerbosity.Debug,
    outputToFiles: true,
    outputFileName: 'complex-transform-test'
  })
  (async () => {
    // Test with extensive output that's better viewed in files
  })
);
```

## Step 7: Environment Configuration

Control test output globally with environment variables:

```bash
# Set global verbosity level
TEST_OUTPUT_VERBOSITY=minimal npm test

# Output to files instead of console
TEST_OUTPUT_TO_FILES=true npm test

# Set output directory
TEST_OUTPUT_DIR=./logs/test-output npm test
```

## Step 8: Applying to Test Suites

You can configure entire test suites by setting a filter in a `beforeEach` block:

```typescript
describe('Variable resolution tests', () => {
  beforeEach(() => {
    // Get the output filter
    const outputFilter = getOutputFilterInstance();
    
    // Configure for all tests in this suite
    outputFilter.configureTestOutput({
      verbosity: TestOutputVerbosity.Verbose,
      includeOperations: ['resolveVariable'],
      maxDepth: 4
    });
  });
  
  // Tests will use the suite-wide configuration
  it('should resolve simple variables', async () => {
    // Test code
  });
  
  // This test will override the suite configuration
  it('should be silent for this test',
    withTestOutput({ verbosity: TestOutputVerbosity.Minimal })
    (async () => {
      // Test with minimal output
    })
  );
});
```

## Step 9: Integration with State Visualization

The TestOutputFilterService works with TestVisualizationManager for state visualization. To manually control state visualization:

```typescript
it('should generate custom state visualization', async () => {
  // Get the output filter
  const outputFilter = getOutputFilterInstance();
  
  // Get the state ID
  const stateId = someOperation.getStateId();
  
  // Check if we should visualize this state
  if (outputFilter.shouldVisualizeState(stateId)) {
    // Generate visualization
    const viz = testContext.visualizeState(stateId);
    // Use the visualization
  }
});
```

## Step 10: Adding Selective Output to Existing Tests

When migrating existing tests to use selective output:

1. Start by setting global verbosity to Standard for backward compatibility
2. Add selective output to problematic or slow tests first
3. Group tests with similar output needs into suites with shared configuration
4. For CI environments, set minimal verbosity and redirect to files
5. Only use verbose/debug modes when specifically debugging issues

## Best Practices

1. **Test Performance**: Use minimal output for performance-critical tests
2. **CI Settings**: In CI, set environment variables to reduce output volume
3. **Important States**: Always identify critical states with `alwaysVisualizeStates`
4. **Files vs Console**: Use files for detailed output that doesn't need immediate visibility
5. **Field Filtering**: Filter to relevant fields to reduce output size

## Examples

See the sample file at `_issues/features/selective-output-sample.ts` for complete examples of selective output usage.