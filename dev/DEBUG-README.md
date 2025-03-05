# Meld State Debugging Tools

> **NOTE**: This document is aspirational and serves as a specification for the state debugging tools interface. The features described here represent the target implementation.

## Overview

The Meld state debugging tools provide visibility into the transformation pipeline and variable resolution process, helping diagnose issues with imports, variable resolution, and directive processing.

## Quick Start

Enable state debugging:

```bash
# Enable basic debugging
export MELD_DEBUG=true

# Process a file with debugging enabled
meld process myfile.meld
```

Debug a specific variable resolution:

```bash
# Track resolution for a specific variable
export MELD_DEBUG_VARS=myVariable
meld process myfile.meld
```

Debug context boundaries during imports:

```bash
# View context hierarchy for a file
meld debug-context myfile.meld
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MELD_DEBUG` | Enable debug mode | `false` |
| `MELD_DEBUG_LEVEL` | Debug verbosity (1-3) | `1` |
| `MELD_DEBUG_SAMPLE_RATE` | Sampling rate for high-volume operations (0.0-1.0) | `1.0` |
| `MELD_DEBUG_VARS` | Comma-separated list of variables to track | None |
| `MELD_DEBUG_LOG` | Path to write debug logs | None |
| `MELD_DEBUG_MAX_ATTEMPTS` | Maximum number of resolution attempts to track | `1000` |

## CLI Commands

### `meld debug-resolution`

Debug variable resolution across context boundaries.

```bash
meld debug-resolution <file> [options]
```

Options:
- `--var <name>` - Track a specific variable
- `--output <format>` - Output format (text, json, mermaid)
- `--track-boundaries` - Include context boundary information
- `--show-values` - Include resolved variable values
- `--sample-rate <rate>` - Set sampling rate (0.0-1.0) for high-volume tracking
- `--max-attempts <number>` - Maximum number of resolution attempts to track

Example:
```bash
meld debug-resolution template.meld --var userData --track-boundaries
```

Example with sampling for performance optimization:
```bash
# Only track 10% of resolution attempts to reduce overhead
meld debug-resolution large-template.meld --var commonVar --sample-rate 0.1
```

### `meld debug-context`

Visualize context hierarchies and boundaries created during imports and embeds.

```bash
meld debug-context <file> [options]
```

Options:
- `--var <name>` - Highlight contexts containing this variable
- `--output <format>` - Output format (text, json, mermaid)
- `--include-files` - Show file paths in visualization

Example:
```bash
meld debug-context template.meld --include-files
```

### `meld debug-transform`

Track node transformations through the pipeline.

```bash
meld debug-transform <file> [options]
```

Options:
- `--directive <type>` - Focus on a specific directive type
- `--output <format>` - Output format (text, json, mermaid)
- `--include-content` - Include node content in output

Example:
```bash
meld debug-transform template.meld --directive import
```

## Common Debug Scenarios

### 1. Variable Not Resolving

If a variable isn't resolving as expected:

```bash
meld debug-resolution template.meld --var missingVar --track-boundaries
```

This will show:
- All resolution attempts for the variable
- Context boundaries the variable crosses
- Success/failure status of each resolution attempt
- Source file where each resolution was attempted

For variables with many resolution attempts, use sampling:

```bash
meld debug-resolution template.meld --var commonVar --sample-rate 0.1
```

### 2. Import Chain Issues

If you're having trouble with nested imports:

```bash
meld debug-context template.meld --include-files
```

This will show:
- The complete context hierarchy
- File paths for each context
- Parent-child relationships

### 3. Transformation Problems

If directives aren't transforming correctly:

```bash
meld debug-transform template.meld --directive import
```

This will show:
- Each transformation step for the directive
- Handler that processed each node
- Success/failure status of transformations

### 4. Tracking Variable Flow Across Boundaries

To see how variables cross context boundaries during imports:

```bash
meld debug-resolution template.meld --var userData --track-boundaries --show-values
```

This will visualize:
- Parent-to-child variable copying (during import processing)
- Child-to-parent variable copying (when import completes)
- Success/failure of each boundary crossing

## Output Formats

### Text Format (Default)

Simple text output for terminal viewing:

```
VARIABLE RESOLUTION: userData
  Attempt #1:
    Context: main.meld
    Success: false
    Error: Variable not found
    Timestamp: 2023-03-10T14:32:45.123Z
  
  Attempt #2:
    Context: imported.meld
    Success: true
    Value: { name: "John" }
    Timestamp: 2023-03-10T14:32:45.128Z
    
  Context Boundary Crossing:
    Type: child-to-parent
    From: imported.meld (state_123)
    To: main.meld (state_456)
    Success: true
    Timestamp: 2023-03-10T14:32:45.130Z
```

### JSON Format

Structured output for programmatic processing:

```json
{
  "variable": "userData",
  "attempts": [
    {
      "id": 1,
      "context": "main.meld",
      "success": false,
      "error": "Variable not found",
      "timestamp": 1645536345435
    },
    {
      "id": 2,
      "context": "imported.meld",
      "success": true,
      "value": { "name": "John" },
      "timestamp": 1645536345440
    }
  ],
  "boundaries": [
    {
      "type": "child-to-parent",
      "from": "imported.meld",
      "fromId": "state_123",
      "to": "main.meld",
      "toId": "state_456",
      "success": true,
      "timestamp": 1645536345445
    }
  ]
}
```

### Mermaid Format

Visual diagrams for complex relationships:

```
graph TD
  A[main.meld] -->|imports| B[imported.meld]
  B -->|defines| C[userData]
  C -->|crosses boundary| A
  style C fill:#90EE90
```

## Integrating with Testing

For automated tests, use the testing debug API:

```typescript
import { enableDebugTracking, getDebugReport } from '@meld/debug';

test('should resolve variables across imports', async () => {
  // Enable tracking for this test with specific variables to watch
  enableDebugTracking({ 
    trackVariables: true,
    watchVariables: ['userData', 'config'],
    samplingRate: 1.0 
  });
  
  // Run your test
  const result = await processFile('test.meld');
  
  // Get debug report if test fails
  if (!result.includes('expectedValue')) {
    const debugReport = await getDebugReport();
    console.log(debugReport);
    
    // Get specific variable resolution info
    const userDataResolution = await getVariableResolutionInfo('userData');
    console.log('userData resolution attempts:', userDataResolution.attempts);
    console.log('userData boundary crossings:', userDataResolution.boundaries);
  }
  
  expect(result).toContain('expectedValue');
});
```

## Using the VariableResolutionTracker Directly

For advanced debugging within custom code, you can directly use the `VariableResolutionTracker`:

```typescript
import { VariableResolutionTracker } from '@meld/resolution';

// Create a tracker instance
const tracker = new VariableResolutionTracker();

// Configure the tracker
tracker.configure({
  enabled: true,
  samplingRate: 0.5,       // Only track 50% of attempts
  maxAttempts: 2000,       // Store up to 2000 attempts
  watchVariables: ['user'] // Only track 'user' variable
});

// Track resolution attempts in your code
function resolveVariable(name, context) {
  // Attempt resolution
  const success = true; // or false
  const value = { /* resolved value */ };
  
  // Track the attempt
  tracker.trackResolutionAttempt(
    name,                  // Variable name
    context,               // Context (e.g., file path)
    success,               // Success status
    value,                 // Resolved value
    'myResolver',          // Source of resolution
    {                      // Context boundary info (if applicable)
      type: 'parent-to-child',
      sourceId: 'parentStateId',
      targetId: 'childStateId'
    }
  );
  
  return value;
}

// Later, get tracking information
const attempts = tracker.getAttemptsForVariable('user');
console.log('Resolution attempts:', attempts);
```

## Implementation Status

- ✅ Phase 1: Variable resolution tracking
- ✅ Phase 2: Context boundary visualization
- 🔄 Phase 3: Transformation pipeline insights
- 🔄 Phase 4: CLI integration and documentation 