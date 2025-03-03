# Test State Visualization Guide

## Overview

This guide explains how to use the enhanced state visualization tools developed as part of Phase 4 of the better-test-output project. These tools are designed to provide cleaner, more organized test output with flexible verbosity levels and file output options.

## Components

The enhanced state visualization system consists of the following components:

1. **CompactStateVisualization** - Generates simplified text-based summaries of state data
2. **StateVisualizationFileOutput** - Writes visualization output to files in various formats
3. **TestVisualizationManager** - Integrates visualization components with verbosity control

## Usage Examples

### Basic Usage

```typescript
import { TestVisualizationManager, TestOutputVerbosity } from '@tests/utils/debug/StateVisualizationService';

// In your test setup
const visManager = new TestVisualizationManager(
  stateVisualizationService,  // Existing service
  stateHistoryService,        // Existing service
  stateTrackingService,       // Existing service
  {
    verbosity: TestOutputVerbosity.Standard,  // Default level
    outputToFiles: false,                     // Console output by default
    defaultFormat: 'mermaid'                  // Visualization format
  }
);

// In your test
test('should process state correctly', async () => {
  // Run your test logic
  const state = await someOperation();
  
  // Visualize the state (respects verbosity level)
  console.log(visManager.visualizeState(state.id, 'after-operation'));
  
  // Continue with assertions
  expect(state).toBeDefined();
});
```

### Control Verbosity Levels

Verbosity can be controlled through environment variables or explicitly:

```typescript
// Set environment variable before running tests
// TEST_LOG_LEVEL=minimal npm test

// Or set it programmatically
visManager.setVerbosity(TestOutputVerbosity.Verbose);

// Or use string values
visManager.setVerbosity('debug');
```

Available verbosity levels:

- **Minimal** - Only errors, no state visualization
- **Standard** - Basic state summaries (default)
- **Verbose** - Detailed state and transformation information
- **Debug** - Full visualizations with all available metadata

### File Output Mode

For tests that generate large state structures, output can be directed to files:

```typescript
// Enable file output
visManager.setOutputMode(true);

// Visualize (returns file path instead of content)
const filePath = visManager.visualizeState(stateId);
console.log(`State visualization written to: ${filePath}`);

// Clear output directory when needed
beforeAll(() => {
  visManager.clearOutputFiles();
});
```

### Variable Resolution Tracing

Visualize variable resolution across states:

```typescript
// Show how a variable propagates through the state system
const visualization = visManager.visualizeVariableResolution(
  'dataVariable', 
  rootStateId
);
console.log(visualization);
```

### State Metrics

Generate state system metrics suitable for the configured verbosity:

```typescript
// Output metrics
const metrics = visManager.generateMetrics();
console.log(metrics);
```

## Integration with Existing Tests

### Step 1: Import the Manager

```typescript
import { 
  TestVisualizationManager, 
  TestOutputVerbosity 
} from '@tests/utils/debug/StateVisualizationService';
```

### Step 2: Set Up in Test Suite

```typescript
describe('My Test Suite', () => {
  let visManager: TestVisualizationManager;
  
  beforeAll(() => {
    visManager = new TestVisualizationManager(
      visualizationService,
      historyService,
      trackingService,
      {
        // Use environment variable or default to standard
        verbosity: process.env.TEST_LOG_LEVEL || TestOutputVerbosity.Standard,
        
        // Write to files for CI environments
        outputToFiles: process.env.CI === 'true',
        
        // Output directory relative to project root
        outputDir: './logs/test-visualization'
      }
    );
    
    // Clean up old visualizations
    visManager.clearOutputFiles();
  });
  
  // Your tests...
});
```

### Step 3: Use in Tests

Replace console.log calls with visualization methods:

```typescript
// Before:
console.log('State after operation:', stateId, state);

// After:
visManager.visualizeState(stateId, 'after-operation');
```

## Environment Variables

The system responds to these environment variables:

- **TEST_LOG_LEVEL** - Sets the verbosity level (minimal, standard, verbose, debug)
- **TEST_VISUALIZATION_LEVEL** - Alternative name for the verbosity level
- **CI** - When set to 'true', can be used to enable file output automatically

## Output Examples

### Standard Output (Compact)

```
State abc123 (new)
  File: /path/to/file.meld
  Ancestry: root → parent → abc123
  Children: 2
  Transforms: 3
```

### Verbose Output (With Transforms)

```
State abc123 (new)
  File: /path/to/file.meld
  Ancestry: root → parent → abc123
  Children: 2
  Transforms: 3

State abc123 transforms (3):
  update: 2
  merge: 1
  First: update (2 changed, 0 added, 0 removed)
  Last: merge (1 changed, 1 added, 0 removed)
```

### Debug Output (Full Diagram)

For debug mode, Mermaid or DOT diagrams are generated showing the complete state hierarchy and transformations.

## Best Practices

1. **Use Environment Variables for Control**:
   ```bash
   # Run with minimal output
   TEST_LOG_LEVEL=minimal npm test
   
   # Run with debug output
   TEST_LOG_LEVEL=debug npm test
   ```

2. **Output to Files for Complex Tests**:
   ```typescript
   // For tests with complex state structures
   visManager.setOutputMode(true);
   ```

3. **Label Your Visualizations**:
   ```typescript
   // Add context to visualizations
   visManager.visualizeState(stateId, 'before-transformation');
   await transform();
   visManager.visualizeState(stateId, 'after-transformation');
   ```

4. **Group Multiple States**:
   ```typescript
   // Show relationship between states
   visManager.visualizeStates([stateId1, stateId2], 'related-states');
   ```

5. **Clean Up Output Files**:
   ```typescript
   // In your test setup
   beforeAll(() => visManager.clearOutputFiles());
   ```

## Advanced Usage

### Custom Integration

For integration with specialized test frameworks:

```typescript
// Create a test reporter
class VisualizationReporter {
  private visManager: TestVisualizationManager;
  
  constructor() {
    // Initialize with appropriate services
    this.visManager = new TestVisualizationManager(/* ... */);
  }
  
  onTestStart(test) {
    this.visManager.clearOutputFiles();
  }
  
  onStateCreated(stateId, label) {
    return this.visManager.visualizeState(stateId, label);
  }
  
  onTestComplete(test) {
    // Generate final metrics
    const metrics = this.visManager.generateMetrics();
    console.log(metrics);
  }
}
```

### Combined with Other Debug Tools

```typescript
// Integrate with debugger service
class EnhancedDebugger {
  constructor(
    private debuggerService,
    private visManager: TestVisualizationManager
  ) {}
  
  async analyzeState(stateId) {
    // Run standard analysis
    const diagnostics = await this.debuggerService.analyzeState(stateId);
    
    // Add visualization
    const visualization = this.visManager.visualizeState(stateId, 'analysis');
    
    return {
      diagnostics,
      visualization
    };
  }
}
```