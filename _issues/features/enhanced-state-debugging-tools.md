# Enhanced State Debugging Tools for Transformation and Variable Resolution

## Implementation Context

When implementing this feature, review the following documentation to understand the system architecture and existing debugging tools:

### Required Documentation

1. **docs/ARCHITECTURE.md**
   - Provides the high-level architecture of Meld
   - Explains service relationships and initialization order
   - Critical for understanding how services interact

2. **docs/PIPELINE.md**
   - Details the transformation pipeline flow
   - Explains variable resolution process
   - Shows how state propagates across boundaries

3. **docs/STATEVIS.md**
   - Documents the existing state visualization system
   - Shows current APIs and capabilities
   - Provides foundation for the enhancements

### Code Areas to Examine

1. **tests/utils/debug/**
   - Explore existing debugging infrastructure
   - Review StateTrackingService, StateHistoryService, and StateVisualizationService implementations

2. **services/resolution/ResolutionService/**
   - Review variable resolution implementation
   - Identify key points for instrumentation

3. **services/pipeline/DirectiveService/handlers/**
   - Examine ImportDirectiveHandler and EmbedDirectiveHandler
   - Understand context boundary creation

4. **services/pipeline/InterpreterService/**
   - Review node transformation logic
   - Identify transformation tracking points

## Problem Statement

We've encountered significant challenges with the import/embed directive processing, particularly around variable resolution across context boundaries and during transformation. Our current approach to debugging these issues has been inefficient and led to suboptimal workarounds (such as hardcoding expected values in production code).

These challenges stem from limited visibility into:
- How variables are resolved across different contexts
- When and why transformations are applied to nodes
- Why variable references sometimes fail to resolve
- How the pipeline coordinates variable resolution across multiple services

## Proposed Solution

Extend our existing state debugging tools to provide deeper insights into the transformation pipeline and variable resolution process. This will allow us to:
1. Visually track nodes through the transformation process
2. Follow variable references from creation to resolution
3. Monitor context boundaries and variable propagation
4. Generate comprehensive resolution timelines
5. Identify exactly where and why variable resolution fails

## Technical Approach

Rather than building new tools from scratch, we'll extend our existing state visualization debugging system with new capabilities focused on transformation and variable resolution. We'll use a phased approach with clear exit criteria for each phase to ensure we maintain stability while adding new capabilities.

### Core Components to Enhance

1. **StateTrackingService**: Add transformation and resolution-specific tracking
2. **StateVisualizationService**: Add visualizations for transformation flow and variable resolution paths
3. **StateHistoryService**: Add context boundary tracking
4. **StateDebuggerService**: Add resolution-specific capture points and timeline generation

### Key Design Principles

1. **Zero Impact When Disabled**: Debug tools should have no performance impact on normal operation
2. **Minimal Impact When Enabled**: Use lightweight tracking with sampling where appropriate
3. **Opt-in Activation**: Debug features only active when explicitly enabled
4. **Targeted Data Collection**: Only capture what's needed, not full state copies
5. **Focus on Real Problems**: Prioritize features that address immediate pain points first

## Implementation Phases

### Phase 1: Focused Variable Resolution Tracking (1-2 days)

Focus on the most immediate pain point: variable resolution across context boundaries.

**Tasks:**
- Add lightweight resolution attempt tracking to ResolutionService
- Instrument ImportDirectiveHandler for context boundary tracking
- Create a basic CLI command to debug variable resolution issues
- Implement conditional execution to prevent performance impact

**Code Example:**
```typescript
// Add to ResolutionService with minimal performance impact
private trackResolutionAttempt(
  variableName: string, 
  context: string,
  success: boolean, 
  value?: any
) {
  // Only track if debugging is enabled
  if (!this.debugEnabled) return;
  
  this.trackingService?.trackVariableResolutionAttempt(
    variableName,
    context,
    success,
    value
  );
}
```

**Exit Criteria:**
- ✅ All 728 existing tests still pass with no regression
- ✅ Successfully track variable resolution attempts across context boundaries
- ✅ Basic CLI command works to debug a specific variable resolution
- ✅ Verified zero performance impact when debugging is disabled
- ✅ Successfully diagnose at least one real-world variable resolution issue

### Phase 2: Context Boundary Visualization (1-2 days)

Build on Phase 1 to add visualizations of context boundaries and variable propagation.

**Tasks:**
- Track state parent-child relationships during imports
- Record variable copying between contexts
- Create basic visualization of context hierarchy
- Show variable propagation across contexts
- Develop resolution path timeline visualization

**Code Example:**
```typescript
// Example extension to StateVisualizationService
visualizeContextHierarchy(rootStateId: string) {
  const states = this.trackingService.getStateDescendants(rootStateId);
  const relationships = this.trackingService.getStateRelationships(states);
  
  // Generate simplified context hierarchy visualization
  return this.generateContextGraph(states, relationships, {
    format: 'mermaid',
    includeVars: true,
    filterToRelevantVars: true
  });
}
```

**Exit Criteria:**
- ✅ All tests still pass with no regression
- ✅ Context hierarchy visualization correctly shows state relationships
- ✅ Variable propagation tracking correctly identifies cross-context movement
- ✅ Performance impact is acceptable when debugging is enabled
- ✅ Successfully diagnose at least one complex import/embed scenario

### Phase 3: Transformation Pipeline Insights (2-3 days)

Once Phase 1 & 2 are working well, add tracking for the transformation pipeline.

**Tasks:**
- Track key directive nodes through transformation
- Record transformations with minimal context (not full node copies)
- Create node transformation flow visualization
- Implement simple diagnostics for common transformation issues

**Code Example:**
```typescript
// Lightweight transformation tracking
trackNodeTransformation(nodeId: string, handlerName: string, transformationType: string) {
  if (!this.debugEnabled) return;
  
  this.transformationEvents.push({
    nodeId,
    handlerName,
    transformationType,
    timestamp: Date.now()
  });
}
```

**Exit Criteria:**
- ✅ All tests still pass with no regression
- ✅ Node transformation tracking correctly identifies transformation points
- ✅ Transformation flow visualization shows clear directive processing path
- ✅ Performance impact remains within acceptable limits
- ✅ Successfully diagnose at least one transformation pipeline issue

### Phase 4: Integration and Documentation (1-2 days)

Integrate the tools into the CLI and provide comprehensive documentation.

**Tasks:**
- Add debug commands to Meld CLI
- Create exportable reports for sharing with team
- Update documentation with examples
- Create troubleshooting guide for common issues

**Exit Criteria:**
- ✅ All debug commands work correctly from CLI
- ✅ Reports can be exported in multiple formats
- ✅ Documentation is comprehensive and includes examples
- ✅ Troubleshooting guide covers common issues
- ✅ No additional test failures introduced

## Key Technical Details

### 1. Performance-First Instrumentation

```typescript
// Lightweight tracking with sampling
class ResolutionTracker {
  private enabled = false;
  private samplingRate = 1.0; // 1.0 = track everything, 0.1 = 10% sampling

  trackResolutionAttempt(variableName: string, context: string) {
    if (!this.enabled) return;
    
    // Apply sampling for high-volume scenarios
    if (Math.random() > this.samplingRate) return;
    
    // Use lightweight records with minimal memory footprint
    this.attempts.push({
      var: variableName,
      ctx: context,
      ts: Date.now()
    });
  }
}
```

### 2. Unified Debug Control

```typescript
// Central debug configuration
interface DebugOptions {
  enabled: boolean;
  trackVariables: boolean;
  trackTransformations: boolean;
  trackContexts: boolean;
  watchVariables: string[];
  samplingRate: number;
}

// Set at startup or via CLI
const debugOptions: DebugOptions = {
  enabled: process.env.MELD_DEBUG === 'true',
  trackVariables: true,
  trackTransformations: false,
  trackContexts: true,
  watchVariables: ['specificVar'],
  samplingRate: 1.0
};
```

### 3. Conditional Visualization Generation

Generate visualizations only when needed to avoid unnecessary computation:

```typescript
// On-demand visualization
async function debugVariable(variableName: string) {
  if (!this.debugOptions.enabled) {
    return { error: 'Debug mode not enabled' };
  }
  
  const attempts = this.getResolutionAttempts(variableName);
  
  if (attempts.length === 0) {
    return { error: 'No resolution attempts recorded for this variable' };
  }
  
  // Only generate visualization when needed
  const visualization = await this.visualizationService.generateResolutionGraph(
    variableName, 
    attempts
  );
  
  return {
    attempts,
    visualization,
    summary: this.generateSummary(attempts)
  };
}
```

## Integration with Existing Services

### 1. StateTrackingService Extensions

```typescript
// Add to IStateTrackingService interface
trackVariableResolutionAttempt(
  variableName: string, 
  reference: string, 
  source: string, 
  success: boolean, 
  value?: any
): void;

trackContextBoundary(
  parentStateId: string, 
  childStateId: string, 
  boundaryType: 'import' | 'embed'
): void;
```

### 2. CLI Integration

```typescript
// New CLI commands
commands
  .command('debug variable <variableName>')
  .description('Debug variable resolution issues')
  .option('-i, --input <file>', 'Input file to process')
  .option('-w, --watch', 'Watch for changes')
  .action(async (variableName, options) => {
    // Enable debug mode for this run
    const result = await meld.debugVariable(variableName, options.input);
    console.log(result.summary);
    
    if (options.watch) {
      // Setup file watching
    }
  });
```

## Expected Benefits

1. **Faster Debugging**: Pinpoint exactly where variable resolution fails
2. **Better Solutions**: Develop targeted fixes instead of workarounds
3. **Documentation**: Generate visual documentation of how the pipeline works
4. **Prevention**: Catch resolution issues before they reach production
5. **Knowledge Sharing**: Help new team members understand the system

## Success Criteria

1. No additional test failures introduced by any phase
2. Successfully diagnose and fix at least one complex variable resolution issue
3. Eliminate the need for hardcoded test case workarounds
4. Reduce debugging time for transformation issues by at least 50%
5. Generate clear visual documentation of the variable resolution flow

## Next Steps

1. Review and approve this revised proposal
2. Implement Phase 1 with focus on variable resolution tracking
3. Test with known problematic cases like import/embed directive processing
4. Only proceed to Phase 2 after meeting all Phase 1 exit criteria
5. Evaluate after each phase to determine if further enhancements are needed 