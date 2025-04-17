> **Note on Current Status (As of Phase 0 Debugging - YYYY-MM-DD):**
> 
> Following recent refactoring, the status of these debug tools is as follows:
> 
> *   **CLI Commands (`meld debug-*`):** Likely **non-functional** or outdated. Do not rely on them.
> *   **Programmatic Use (via DI):**
>     *   `StateTrackingService`, `StateHistoryService`, `StateVisualizationService`: Verified to be instantiable via DI and basic visualization generation (e.g., `visualizeContextHierarchy`) works programmatically within tests (see `api/debug-tools.integration.test.ts`). This is the recommended way to use these tools.
>     *   `VariableResolutionTracker`: Known issues with integration; attempts may not be recorded correctly in all test setups. Use with caution or defer.
> *   **API Details:** Refer to the service interfaces (e.g., `IStateVisualizationService.ts`) for the most up-to-date method signatures and options, as the examples below might be outdated.
> *   **ASCII Visualization:** Still only partially implemented.

# Meld Debugging Tools

This document describes the comprehensive debugging tools available in Meld for troubleshooting variable resolution, state management, and transformation issues.

## Implementation Status

> **Note:** Meld's debugging tools are under active development, and some features may be partially implemented or planned for future releases.

| Feature | Status | Notes |
|---------|--------|-------|
| State Debugging (core) | ✅ Implemented | StateDebuggerService, history and tracking services |
| Variable Resolution Tracking | ✅ Implemented | Basic tracking for resolution attempts |
| Mermaid/DOT Visualizations | ✅ Implemented | All visualization types support these formats |
| ASCII Visualizations | 🔶 Partial | Interface defined, proof-of-concept implementation |
| CLI Debug Commands | ✅ Implemented | All commands are functional |
| TestContext Integration | ✅ Implemented | Debug tools available through TestContext |
| Automated Issue Detection | 🔄 Planned | Coming in a future release |

## Overview of Debugging Architecture

The Meld debugging system consists of several integrated components that work together to provide a comprehensive debugging experience:

1. **StateDebuggerService**: The central debugging service that integrates other specialized services
2. **StateHistoryService**: Tracks chronological state operations and transformations
3. **StateTrackingService**: Monitors relationships between states, including parent-child relationships
4. **StateVisualizationService**: Generates visualizations in multiple formats (Mermaid, DOT, JSON, and planned ASCII)
5. **VariableResolutionTracker**: Monitors variable resolution attempts and context boundaries

This architecture provides multiple ways to debug issues in Meld projects, from high-level visualizations to detailed tracking of specific variables.

## Command-Line Debugging Tools

Meld provides several CLI commands for debugging:

### Debug Resolution Command

```bash
meld debug-resolution <file> [options]
```

This command focuses on variable resolution issues, tracking when and how variables are resolved.

#### Options

```
--var <varName>           Filter resolution tracking to specific variable(s)
--output-format <format>  Output format (json, text)
--watch, -w               Watch mode: monitor file changes
--verbose, -v             Show detailed resolution information
--help, -h                Show help information
```

#### Examples

```bash
# Debug all variables in a file
meld debug-resolution myfile.mld

# Debug a specific variable
meld debug-resolution myfile.mld --var userData

# Get JSON output for programmatic processing
meld debug-resolution myfile.mld --output-format json > debug.json

# Watch a file for changes
meld debug-resolution myfile.mld --var userData --watch
```

### Debug Transform Command

```bash
meld debug-transform <file> [options]
```

This command provides insights into the transformation process, showing how the Meld file is processed through the pipeline.

#### Options

```
--directive-type <type>   Focus on a specific directive type
--output-format <format>  Output format (text, json, mermaid)
--output-file <path>      Write output to file instead of stdout
--include-content         Include node content in output
--help, -h                Show help information
```

#### Examples

```bash
# Debug transformation of a file
meld debug-transform myfile.mld

# Focus on specific directive type
meld debug-transform myfile.mld --directive-type embed

# Generate visualization output
meld debug-transform myfile.mld --output-format mermaid --output-file transform.md
```

### Debug Context Command

```bash
meld debug-context <file> [options]
```

This command focuses on the context and state management across files, especially useful for debugging imports and embeds.

#### Options

```
--visualization-type <type>  Type of visualization (hierarchy, variable-propagation, 
                            combined, timeline)
--root-state-id <id>         Start visualization from specific state ID
--output-format <format>     Output format (mermaid, dot, json)
--output-file <path>         Write output to file instead of stdout
--include-vars               Include variable details in visualization
--include-timestamps         Include timestamp information
--include-file-paths         Include file paths in visualization
--help, -h                   Show help information
```

#### Examples

```bash
# Debug context of a file
meld debug-context myfile.mld

# Generate hierarchy visualization
meld debug-context myfile.mld --visualization-type hierarchy --output-format mermaid
```

## Variable Resolution Debugging

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
Variable Resolution Debug for myfile.mld
=====================================

VARIABLE: userData (3 resolution attempts)

Attempt #1:
  Context: /project/myfile.mld
  Success: false
  Error: Variable not found
  
Attempt #2:
  Context: /project/imported.mld
  Success: true
  Value: {"name":"John","age":30}
  Context Boundary: 
    Type: child-to-parent
    Source: state_347829
    Target: state_347830
    
Attempt #3:
  Context: /project/myfile.mld
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

## State Visualization

The `StateVisualizationService` supports multiple visualization formats:

### Hierarchy View

Shows the parent-child relationships between states:

```
RootState
├── ImportState (file1.mld)
│   └── EmbedState (nested-content)
└── ImportState (file2.mld)
```

### Transition Diagram

Shows how states transform over time:

```
State_1 --> State_2 [label="import directive"]
State_2 --> State_3 [label="variable resolution"]
State_2 --> State_4 [label="embed directive"]
```

### Variable Flow Diagram

Shows how variables move between states:

```
State_1 -- userData --> State_2
State_2 -- config --> State_3
State_3 -- result --> State_1
```

### ASCII Format Support

> **Note:** ASCII format support is currently partially implemented. While the interfaces support ASCII as a format option, the full implementation is in progress.

When fully implemented, visualizations will be renderable in ASCII format for terminal-friendly output:

```
+----------------+      +----------------+
|   Root State   |----->| Import State   |
+----------------+      +----------------+
        |                      |
        v                      v
+----------------+      +----------------+
| Transform State|<-----| Embed State    |
+----------------+      +----------------+
```

## TestContext Integration

The debugging tools are fully integrated into the `TestContext` class, making them easy to use in tests without requiring additional setup:

```typescript
import { TestContext } from '@tests/utils/TestContext';

// Create and initialize test context
const context = new TestContext();
await context.initialize();

// Start a debug session with custom configuration
const sessionId = await context.startDebugSession({
  captureConfig: {
    capturePoints: ['pre-transform', 'post-transform', 'error'],
    includeFields: ['variables', 'nodes', 'transformedNodes'],
  },
  visualization: {
    format: 'mermaid',
    includeMetadata: true
  }
});

// Run your test code...

// Visualize state
const visualization = await context.visualizeState('mermaid');
console.log(visualization);

// End debug session and get results
const results = await context.endDebugSession(sessionId);
```

Methods available through TestContext:
- `startDebugSession(config?)`: Start a new debug session
- `endDebugSession(sessionId)`: End a session and get results
- `visualizeState(format?)`: Generate visualization of current state
- `enableDebug()`: Enable debug features
- `disableDebug()`: Disable debug features

## Programmatic Debugging

For programmatic debugging in code or tests, you can also use the debugging services directly:

```typescript
import { initializeContextDebugger } from '@tests/utils/debug/StateDebuggerService';
import { VariableResolutionTracker } from '@services/resolution/ResolutionService/tracking/VariableResolutionTracker';

// Initialize the debug services
const debugger = initializeContextDebugger();

// Create a session for tracking a debugging session
const sessionId = debugger.startSession({
  captureConfig: {
    capturePoints: ['pre-transform', 'post-transform', 'error'],
    includeFields: ['variables', 'nodes'],
    format: 'full'
  },
  visualization: {
    format: 'mermaid',
    includeVariables: true,
    showTimeline: true
  },
  traceOperations: true
});

// Track variable resolution
const tracker = new VariableResolutionTracker();
tracker.configure({ enabled: true });

// ...perform operations...

// Generate visualization or report
const report = await debugger.generateDebugReport(sessionId);
console.log(report);

// End the session
const result = await debugger.endSession(sessionId);
console.log(result.visualization);
```

## StateDebuggerService API

The `StateDebuggerService` is the central component for debugging. It provides the following key methods:

- `startSession(config)`: Begin a debugging session with specific configuration
- `endSession(sessionId)`: End a session and get results
- `analyzeState(stateId)`: Analyze a state for potential issues
- `traceOperation(stateId, operation)`: Execute and trace an operation
- `getStateSnapshot(stateId, format)`: Get a snapshot of state
- `generateDebugReport(sessionId)`: Generate a text report
- `registerAnalyzer(analyzer)`: Add custom analysis functionality

## VariableResolutionTracker API

The `VariableResolutionTracker` provides specialized tracking for variable resolution:

- `configure(config)`: Enable/disable tracking and set options
- `trackResolutionAttempt(...)`: Record a resolution attempt
- `getAttempts()`: Get all tracked resolution attempts
- `getAttemptsForVariable(name)`: Filter attempts by variable name
- `clearAttempts()`: Clear all tracking data
- `isEnabled()`: Check if tracking is enabled

## Environment Variables

Some debugging behaviors can be controlled with environment variables, though these may vary by implementation:

- `MELD_DEBUG`: Enable/disable general debugging features (1/0)
- `MELD_DEBUG_VARS`: Comma-separated list of variables to track (e.g., "var1,var2")
- `MELD_DEBUG_SAMPLE_RATE`: Sampling rate for tracking (0.0-1.0)
- `MELD_DEBUG_LEVEL`: Set debug verbosity (error, warn, info, debug, trace)

Example:
```bash
MELD_DEBUG=1 MELD_DEBUG_VARS=userData,config meld debug-resolution myfile.mld
```

## Best Practices

- **Keep Debugging Disabled in Production**: Only enable debugging when needed
- **Use Targeted Variable Tracking**: Filter to specific variables when possible
- **Consider Sampling for Large Files**: Use sampling option for better performance
- **Export Results for Team Sharing**: Use JSON output for sharing debug information
- **Check Context Boundaries First**: When variables aren't resolving, examine context boundaries as a common cause
- **Use TestContext Integration**: Leverage the built-in debug tools when writing tests
- **Leverage Visualization Options**: Use the most appropriate visualization format for your terminal environment

## Future Development

The Meld debugging tools are continuously evolving. Upcoming features may include:
- Full implementation of ASCII visualization for terminal-friendly output
- Automated issue detection for common problems
- Performance profiling for optimization
- Integration with IDE extensions
- Interactive debugging sessions