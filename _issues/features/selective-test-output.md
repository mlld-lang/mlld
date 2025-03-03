# Phase 5: Selective Test Output

## Overview

Phase 5 builds on the state visualization improvements from Phase 4 to implement selective test output based on test requirements. This phase focuses on making tests more maintainable by reducing verbosity during normal test runs while preserving full diagnostic capabilities when needed.

## Objectives

1. Create a test output filtering system that adapts based on test requirements
2. Implement per-test and per-suite verbosity controls
3. Provide integration with the test runner (Vitest)
4. Support selective test output via environment variables and configuration
5. Ensure backward compatibility with existing tests

## Technical Design

### 1. Test Output Filter Service

Create a new `TestOutputFilterService` that will:
- Control what gets logged during test execution
- Filter state transformations based on test needs
- Integrate with TestVisualizationManager for visualization control

```typescript
// Interface
interface ITestOutputFilterService {
  // Configure output filtering for the current test
  configureTestOutput(options: TestOutputOptions): void;
  
  // Determine if specific operation should be logged
  shouldLogOperation(operation: string, level?: LogLevel): boolean;
  
  // Filter state output based on current configuration
  filterStateOutput(stateData: any, level?: LogLevel): any;
  
  // Determine if state should be visualized
  shouldVisualizeState(stateId: string): boolean;
  
  // Reset output configuration between tests
  reset(): void;
}

// Configuration
interface TestOutputOptions {
  // Overall verbosity level 
  verbosity?: TestOutputVerbosity;
  
  // Specific operations to include/exclude
  includeOperations?: string[];
  excludeOperations?: string[];
  
  // Filter state fields
  includeStateFields?: string[];
  excludeStateFields?: string[];
  
  // Maximum nesting level for state objects
  maxDepth?: number;
  
  // Control file output behavior
  outputToFiles?: boolean;
  outputFileName?: string;
}
```

### 2. Test Runner Integration

Extend the Vitest setup files to:
- Read test configuration from environment variables
- Set default output filtering rules
- Support per-test configuration via test metadata

```typescript
// Vitest setup extension
import { beforeEach, afterEach } from 'vitest';
import { TestOutputFilterService } from './TestOutputFilterService';
import { TestOutputVerbosity } from '../StateVisualizationService/TestVisualizationManager';

// Initialize output filter service
const outputFilter = new TestOutputFilterService();

// Configure based on environment
const envVerbosity = process.env.TEST_OUTPUT_VERBOSITY;
if (envVerbosity) {
  const verbosity = envVerbosity.toLowerCase();
  switch (verbosity) {
    case 'minimal':
    case 'min':
      outputFilter.setDefaultVerbosity(TestOutputVerbosity.Minimal);
      break;
    case 'verbose':
      outputFilter.setDefaultVerbosity(TestOutputVerbosity.Verbose);
      break;
    case 'debug':
      outputFilter.setDefaultVerbosity(TestOutputVerbosity.Debug);
      break;
    default:
      outputFilter.setDefaultVerbosity(TestOutputVerbosity.Standard);
  }
}

// Reset filter between tests
afterEach(() => {
  outputFilter.reset();
});

// Expose service to tests
declare global {
  var testOutputFilter: TestOutputFilterService;
}

globalThis.testOutputFilter = outputFilter;
```

### 3. Per-Test Configuration

Create utilities to configure test output within test files:

```typescript
// Configure output for a specific test
export function withTestOutput(options: TestOutputOptions) {
  return (testFn: Function) => {
    return async (...args: any[]) => {
      // Set output configuration for this test
      globalThis.testOutputFilter.configureTestOutput(options);
      // Run the original test
      return await testFn(...args);
    };
  };
}

// Apply to specific tests or suites
describe('My test suite', () => {
  it('should run with standard output', () => {
    // Default output
  });
  
  it('should run with verbose output', 
    withTestOutput({ verbosity: TestOutputVerbosity.Verbose })(() => {
      // This test will have verbose output
    })
  );
});
```

### 4. Visualization Integration

Extend the TestVisualizationManager to work with the output filter:

```typescript
// Update TestVisualizationManager to use output filter
export class TestVisualizationManager {
  constructor(
    private visualizationService: IStateVisualizationService,
    private historyService: IStateHistoryService,
    private trackingService: IStateTrackingService,
    private outputFilter: ITestOutputFilterService,
    config: TestVisualizationConfig = {}
  ) {
    // Existing initialization...
  }
  
  public visualizeState(stateId: string, label?: string): string | null {
    // Check if this state should be visualized
    if (!this.outputFilter.shouldVisualizeState(stateId)) {
      return null;
    }
    
    // Proceed with visualization...
  }
  
  // Other methods...
}
```

### 5. Test Runner Output Hooks

Create hooks for the test runner to control output at key points:

```typescript
// Test event hooks
export interface TestOutputHooks {
  // Before each test
  beforeTest?(testName: string, testPath: string): void;
  
  // After each test
  afterTest?(testName: string, testPath: string, success: boolean): void;
  
  // On test error
  onTestError?(testName: string, error: Error): void;
  
  // Before test suite
  beforeSuite?(suiteName: string): void;
  
  // After test suite
  afterSuite?(suiteName: string): void;
}

// Register hooks with test runner
export function registerTestOutputHooks(hooks: TestOutputHooks): void {
  // Implementation to integrate with Vitest
}
```

## Implementation Plan

1. Create TestOutputFilterService implementation
2. Update test setup files to initialize and configure the service
3. Integrate with TestVisualizationManager
4. Add test runner hooks for Vitest integration
5. Create utility functions for per-test configuration
6. Update documentation and examples
7. Migrate key tests to use the new selective output system

## Expected Outcomes

- Reduced console output during standard test runs
- Clearer separation between test concerns
- Ability to dynamically adjust verbosity based on test requirements
- Improved test failure reporting with focused diagnostic information
- Better test maintainability through controlled output

## Backward Compatibility

The implementation will maintain backward compatibility by:
- Using default settings that match current behavior
- Supporting environment variable configuration for global settings
- Making per-test configuration optional

## Future Enhancements

- Integration with CI systems for optimized output
- Test output profiling to identify verbose tests
- Support for custom output formatting
- Test success/failure summaries with output stats