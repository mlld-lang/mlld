# Meld Debugging Tools

This document describes the debugging tools available in Meld, with a focus on the variable resolution debugging capabilities.

## Variable Resolution Debugging

### Overview

Variable resolution is a core feature of Meld, but it can sometimes be challenging to troubleshoot when variables don't resolve as expected, especially when:

- Variables are imported across multiple files
- Variables cross context boundaries (imports, embeds)
- Complex data structures are involved
- Transformation is active

The Variable Resolution Debugging tool tracks resolution attempts throughout the execution pipeline, providing insights into why a variable might not be resolving as expected.

### How It Works

The Variable Resolution Debugging system consists of several key components:

1. **VariableResolutionTracker**: A lightweight tracking system that records variable resolution attempts
2. **Context Boundary Tracking**: Monitors when variables cross boundaries (like imports or embeds)
3. **CLI Interface**: Allows you to debug specific files and variables

The system is designed with performance in mind:
- Zero impact when disabled (default state)
- Minimal impact when enabled through conditional execution
- Optional sampling rate to reduce overhead with frequently resolved variables

### Context Boundary Tracking

A critical part of the debugging system is the ability to track context boundaries - the points at which variables are passed between different execution contexts (such as during imports or embeds).

#### How Context Boundary Tracking Works

When enabled, the debugging system automatically tracks:

1. **State Parent-Child Relationships**: When one state creates another (e.g., during imports)
2. **Variable Crossings**: When variables are copied from one state to another
3. **File Paths**: The files involved in each context boundary

This information is essential for diagnosing issues where variables seem to "disappear" or change unexpectedly when crossing context boundaries.

#### Implementation Details

The `ImportDirectiveHandler` has been enhanced with robust error handling for context tracking:

- All calls to track boundaries and variable crossings are protected by conditional execution, ensuring zero impact when debugging is disabled
- File path resolution includes proper exception handling to prevent crashes when metadata is missing
- Safe tracking of state IDs to diagnose relationship issues

#### Usage Example

To understand how context boundaries are affecting your variables:

```bash
meld debug-resolution myfile.meld --var userData --track-boundaries
```

The output will include detailed information about context boundaries crossed by the specified variable:

```
CONTEXT BOUNDARY: Import
From: source_state_123 (file1.meld)
To: target_state_456 (file2.meld)
Variables crossing: userData

Variable resolution in target context:
  Resolution attempt #1: SUCCESS
  Value: { "name": "John", "age": 30 }
```

### Using the Debug-Resolution CLI Command

#### Basic Usage

```bash
meld debug-resolution <file> [options]
```

#### Options

```
--var <varName>           Filter resolution tracking to specific variable(s)
--output-format <format>  Output format (json, table, summary)
--track-boundaries        Include detailed context boundary information
-w, --watch               Watch mode: monitor file changes
-v, --verbose             Show detailed resolution information
--home-path <path>        Specify home directory path
-h, --help                Show help information
```

#### Examples

Debug all variables in a file:
```bash
meld debug-resolution myfile.meld
```

Debug a specific variable:
```bash
meld debug-resolution myfile.meld --var userData
```

Get JSON output for programmatic processing:
```bash
meld debug-resolution myfile.meld --output-format json > debug.json
```

Watch a file for changes:
```bash
meld debug-resolution myfile.meld --var userData --watch
```

### Understanding the Output

The debug output provides several key pieces of information:

#### Resolution Attempts

Each resolution attempt includes:
- **Variable Name**: The name of the variable being resolved
- **Context**: The file/location where resolution was attempted
- **Success**: Whether the resolution succeeded
- **Value**: The resolved value (if successful)
- **Timestamp**: When the resolution attempt occurred
- **Context Boundary**: Information about context crossing (if applicable)

#### Context Boundaries

When variables cross context boundaries (e.g., during imports), the debug tool tracks:
- **Boundary Type**: Whether parent-to-child or child-to-parent
- **Source State ID**: Identifier for the source state
- **Target State ID**: Identifier for the target state

#### Sample Output

```
Variable Resolution Debug for myfile.meld
=====================================

VARIABLE: userData (3 resolution attempts)

Attempt #1:
  Context: /project/myfile.meld
  Success: false
  Error: Variable not found
  
Attempt #2:
  Context: /project/imported.meld
  Success: true
  Value: {"name":"John","age":30}
  Context Boundary: 
    Type: child-to-parent
    Source: state_347829
    Target: state_347830
    
Attempt #3:
  Context: /project/myfile.meld
  Success: true
  Value: {"name":"John","age":30}
```

### Diagnosing Common Issues

#### Variable Not Found

If you see "Success: false" with "Error: Variable not found":
- Check if the variable is defined in the expected file
- Verify import statements are correctly bringing in the variable
- Check for typos in variable names

#### Context Boundary Issues

If variables are defined but not crossing context boundaries:
- Check import paths and import statements
- Verify the variable is being exported correctly
- Look for circular import issues

#### Transformation Problems

When variables resolve differently during transformation:
- Check if directives are being transformed as expected
- Verify if context boundaries are preserved during transformation
- Look for timing issues with async operations

## Implementation Details

For developers who want to understand or extend the debug functionality:

### VariableResolutionTracker Class

The core of the debugging system is the `VariableResolutionTracker` class in `services/resolution/ResolutionService/tracking/VariableResolutionTracker.ts`. This class:

- Tracks resolution attempts when enabled
- Provides filtering and query capabilities
- Supports sampling for high-throughput scenarios

### ImportDirectiveHandler Instrumentation

The `ImportDirectiveHandler` has been enhanced with context boundary tracking, which monitors:
- Variables crossing from parent to child contexts
- Variables crossing from child to parent contexts
- State relationships during imports

The implementation includes robust error handling to prevent crashes when optional methods like `getCurrentFilePath` are unavailable and includes conditional execution to ensure zero performance impact when debugging is disabled.

### StateDebuggerService

The `StateDebuggerService` integrates all debugging components and provides a unified interface for the CLI commands. It is initialized through the `initializeContextDebugger` function, which sets up the dependency chain:

```typescript
export function initializeContextDebugger(): StateDebuggerService {
  // Create services in proper dependency order
  const trackingService = new StateTrackingService();
  const eventService = container.resolve<IStateEventService>('StateEventService');
  const historyService = new StateHistoryService(eventService);
  const visualizationService = new StateVisualizationService(
    historyService,
    trackingService
  );
  
  return new StateDebuggerService(
    visualizationService,
    historyService,
    trackingService
  );
}
```

### Best Practices

- **Keep Debugging Disabled in Production**: Only enable debugging when needed
- **Use Targeted Variable Tracking**: Filter to specific variables when possible
- **Consider Sampling for Large Files**: Use sampling option for better performance
- **Export Results for Team Sharing**: Use JSON output for sharing debug information
- **Check Context Boundaries First**: When variables aren't resolving, examine context boundaries as a common cause 