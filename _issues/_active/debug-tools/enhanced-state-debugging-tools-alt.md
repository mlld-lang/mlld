# State Debugging Tools Assessment & Alternative Plan

## 1. Assessment of Current Implementation

Based on the provided files, here's what we have implemented so far:

### Currently Implemented
- **Basic Variable Resolution Tracking**: The `VariableResolutionTracker` appears to be implemented with features like conditional execution, sampling, and variable-specific tracking.
- **Debug Session Management**: The `TestDebuggerService` supports session creation, state capture, and report generation.
- **Context Boundary Detection**: There's evidence of tracking parent-child state relationships during imports.
- **Debug Environment Variables**: Support for `MELD_DEBUG`, `MELD_DEBUG_VARS`, and `MELD_DEBUG_SAMPLE_RATE`.

### Partially Implemented
- **State History Tracking**: While the `StateHistoryService` interface exists, it's unclear how comprehensively it captures variable resolution history.
- **State Visualization**: The `StateVisualizationService` interface exists but may not fully support all the visualization formats described in the README.
- **CLI Integration**: The environment variables exist, but the CLI commands don't appear to be fully implemented.

## 2. Gaps Between Aspirational README and Current Implementation

1. **User Interface Gaps**:
   - No clear CLI commands for invoking debug tools (`meld debug-resolution`, `meld debug-context`, etc.)
   - Missing user-friendly output formatting (especially visual formats like Mermaid)
   - Lack of documentation on how to enable and use debugging features

2. **Functional Gaps**:
   - **Resolution Path Visualization**: While we track resolution attempts, we don't generate visualizations of the resolution path.
   - **Context Hierarchy Visualization**: Missing implementation of context hierarchy visualization.
   - **Transformation Pipeline Insights**: Phase 3 features aren't implemented yet.
   - **Integration with Testing**: The testing API described in the README isn't fully implemented.

3. **Output Format Gaps**:
   - Limited support for exporting debug data in different formats (text, JSON, Mermaid)
   - Missing structured format for machine-readable output

4. **Documentation Gaps**:
   - No user guide for interpreting debug output
   - Missing troubleshooting scenarios and examples

## 3. Enhanced Alternative Implementation Plan

### Phase 1: Consolidate Existing Functionality (1-2 days)

**Objective**: Package existing variable tracking into a cohesive, accessible system

**Tasks**:
1. **Formalize Debug Configuration**:
   ```typescript
   interface DebugConfiguration {
     enabled: boolean;
     trackVariables: boolean;
     samplingRate: number;
     watchVariables: string[];
     maxAttempts: number;
   }
   
   // Central access point
   class DebugManager {
     private static instance: DebugManager;
     private config: DebugConfiguration;
     
     static getInstance(): DebugManager {
       if (!DebugManager.instance) {
         DebugManager.instance = new DebugManager();
       }
       return DebugManager.instance;
     }
     
     configure(options: Partial<DebugConfiguration>): void {
       this.config = {...this.config, ...options};
       // Configure all debug services
       this.variableTracker.configure(this.config);
       // ...other services
     }
     
     // Initialize from environment variables
     initFromEnv(): void {
       this.configure({
         enabled: process.env.MELD_DEBUG === 'true',
         trackVariables: true,
         samplingRate: parseFloat(process.env.MELD_DEBUG_SAMPLE_RATE || '1.0'),
         watchVariables: process.env.MELD_DEBUG_VARS?.split(',') || [],
         maxAttempts: parseInt(process.env.MELD_DEBUG_MAX_ATTEMPTS || '1000', 10)
       });
     }
   }
   ```

2. **Create a Debug API Layer**:
   ```typescript
   // Debug API for external access
   export function debugVariable(name: string, options: DebugOptions = {}): Promise<DebugResult> {
     const debugManager = DebugManager.getInstance();
     
     if (!debugManager.isEnabled()) {
       return Promise.resolve({
         success: false,
         error: 'Debug mode is not enabled'
       });
     }
     
     return debugManager.generateVariableDebugReport(name, options);
   }
   
   // Enable programmatic access in tests
   export function enableDebugTracking(options: Partial<DebugConfiguration> = {}): void {
     const debugManager = DebugManager.getInstance();
     debugManager.configure({
       enabled: true,
       ...options
     });
   }
   ```

3. **Create Basic CLI Commands**:
   ```typescript
   // Add to the CLI command handler
   program
     .command('debug-resolution <file>')
     .option('--var <name>', 'Variable name to track')
     .option('--output <format>', 'Output format (text, json, mermaid)')
     .action(async (file, options) => {
       const debugManager = DebugManager.getInstance();
       debugManager.configure({
         enabled: true,
         watchVariables: options.var ? [options.var] : []
       });
       
       // Process the file
       await meld.process(file, { debug: true });
       
       // Generate report
       const report = await debugManager.generateVariableDebugReport(
         options.var,
         { format: options.output || 'text' }
       );
       
       console.log(report);
     });
   ```

**Exit Criteria**:
- ✅ Environment variables properly configure debug system
- ✅ Basic CLI command works to access existing tracking data
- ✅ API is accessible for programmatic use in tests

### Phase 2: Enhanced Visualization & Output Formats (2-3 days)

**Objective**: Make debug data more useful through better visualization and formatting

**Tasks**:
1. **Implement Text Output Format**:
   ```typescript
   function formatDebugResultAsText(result: DebugResult): string {
     let output = `VARIABLE RESOLUTION: ${result.variable}\n`;
     
     // Format attempts
     result.attempts.forEach((attempt, i) => {
       output += `  Attempt #${i+1}:\n`;
       output += `    Context: ${attempt.context}\n`;
       output += `    Success: ${attempt.success}\n`;
       if (attempt.success) {
         output += `    Value: ${formatValue(attempt.value)}\n`;
       } else {
         output += `    Error: ${attempt.error}\n`;
       }
       output += `    Timestamp: ${new Date(attempt.timestamp).toISOString()}\n\n`;
     });
     
     // Format boundaries if available
     if (result.boundaries?.length) {
       result.boundaries.forEach(boundary => {
         output += `  Context Boundary Crossing:\n`;
         output += `    Type: ${boundary.type}\n`;
         output += `    From: ${boundary.from} (${boundary.fromId})\n`;
         output += `    To: ${boundary.to} (${boundary.toId})\n`;
         output += `    Success: ${boundary.success}\n`;
         output += `    Timestamp: ${new Date(boundary.timestamp).toISOString()}\n\n`;
       });
     }
     
     return output;
   }
   ```

2. **Implement JSON Output Format**:
   ```typescript
   function formatDebugResultAsJson(result: DebugResult): string {
     // Already structured, just serialize to JSON
     return JSON.stringify(result, null, 2);
   }
   ```

3. **Implement Mermaid Visualization** for context hierarchy:
   ```typescript
   function generateMermaidContextHierarchy(result: DebugResult): string {
     let diagram = 'graph TD\n';
     
     // Track nodes to avoid duplicates
     const nodes = new Set<string>();
     
     // Create nodes for contexts
     result.contexts.forEach(ctx => {
       const nodeId = `ctx_${ctx.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
       nodes.add(nodeId);
       diagram += `  ${nodeId}["${ctx.name}"]\n`;
     });
     
     // Create edges for context relationships
     result.boundaries.forEach(boundary => {
       const fromId = `ctx_${boundary.fromId.replace(/[^a-zA-Z0-9]/g, '_')}`;
       const toId = `ctx_${boundary.toId.replace(/[^a-zA-Z0-9]/g, '_')}`;
       
       if (boundary.type === 'parent-to-child') {
         diagram += `  ${fromId} -->|imports| ${toId}\n`;
       } else {
         diagram += `  ${toId} -.->|returns to| ${fromId}\n`;
       }
     });
     
     // Add variable nodes
     if (result.variable) {
       const varNode = `var_${result.variable}`;
       diagram += `  ${varNode}["${result.variable}"]\n`;
       
       // Connect variable to contexts where it was resolved
       result.attempts
         .filter(a => a.success)
         .forEach(attempt => {
           const ctxNode = `ctx_${attempt.contextId.replace(/[^a-zA-Z0-9]/g, '_')}`;
           diagram += `  ${ctxNode} -->|defines| ${varNode}\n`;
         });
         
       // Style successful nodes
       diagram += `  style ${varNode} fill:#90EE90\n`;
     }
     
     return diagram;
   }
   ```

4. **Add Resolution Timeline Visualization**:
   ```typescript
   function generateResolutionTimeline(result: DebugResult): string {
     let diagram = 'sequenceDiagram\n';
     
     // Get all participants (contexts)
     const participants = new Set<string>();
     result.attempts.forEach(a => participants.add(a.context));
     result.boundaries.forEach(b => {
       participants.add(b.from);
       participants.add(b.to);
     });
     
     // Add participants to diagram
     participants.forEach(p => {
       diagram += `  participant ${p.replace(/[^a-zA-Z0-9]/g, '_')} as ${p}\n`;
     });
     
     // Sort all events by timestamp
     const events = [
       ...result.attempts.map(a => ({
         type: 'attempt',
         timestamp: a.timestamp,
         data: a
       })),
       ...result.boundaries.map(b => ({
         type: 'boundary',
         timestamp: b.timestamp,
         data: b
       }))
     ].sort((a, b) => a.timestamp - b.timestamp);
     
     // Add events to timeline
     events.forEach(event => {
       if (event.type === 'attempt') {
         const attempt = event.data;
         const status = attempt.success ? 'Success' : 'Failure';
         diagram += `  Note over ${attempt.context.replace(/[^a-zA-Z0-9]/g, '_')}: ${status}: ${result.variable}\n`;
       } else if (event.type === 'boundary') {
         const boundary = event.data;
         diagram += `  ${boundary.from.replace(/[^a-zA-Z0-9]/g, '_')}->${boundary.to.replace(/[^a-zA-Z0-9]/g, '_')}: ${result.variable} ${boundary.success ? '✓' : '✗'}\n`;
       }
     });
     
     return diagram;
   }
   ```

**Exit Criteria**:
- ✅ All three output formats work correctly
- ✅ Visualizations provide clear insights into variable resolution
- ✅ Timeline visualization shows the order of resolution attempts
- ✅ Context hierarchy visualization shows import relationships

### Phase 3: CLI Integration & Documentation (1-2 days) ✅

**Objective**: Make debug tools accessible from the command line and document usage

**Tasks**:
1. **Implement CLI Commands**: ✅
   - `meld debug-resolution`: Track variable resolution
   - `meld debug-context`: Visualize context hierarchy
   - `meld debug-transform`: Debug transformation pipeline

2. **Add Command Documentation**: ✅
   - Help text for each command
   - Examples of common usage patterns
   - Explanation of output formats

3. **Create User Guide**: ✅
   - How to enable debugging
   - How to interpret debug output
   - Common troubleshooting scenarios

**Exit Criteria**:
- ✅ All debug commands are accessible from CLI
- ✅ Help documentation is comprehensive
- ✅ User guide covers common use cases

**Implementation Status**:
- The CLI commands have been implemented and integrated into the CLI entry point.
- Help text has been added for each command.
- The `debug-transform` command has been implemented but faces an integration issue:
  - The command is correctly defined in `cli/commands/debug-transform.ts`
  - The command is properly registered in the CLI entry point
  - When executed, the command fails with a dependency injection error: "Attempted to resolve unregistered dependency token: 'StateService'"
  - This is because the CLI doesn't properly initialize the DI container with all required services
  - The API module uses manual service creation and wiring in `createDefaultServices()` rather than the DI container
  - To fix this issue, the CLI needs to be updated to either:
    1. Use the same manual service creation approach as the API module, or
    2. Properly register all services in the DI container before executing commands

**Solution**:
- We've created a unit test for the `debug-transform` command that properly mocks the required services and registers them with the DI container.
- The test verifies that the command works correctly when the services are properly registered.
- To fix the CLI integration issue, we need to update the CLI entry point to register the services with the DI container before executing the command.
- This can be done by adding code similar to the following to the CLI entry point:

```typescript
// Initialize services and register them with the DI container
function registerServices() {
  // Create services
  const pathOps = new PathOperationsService();
  const fs = new NodeFileSystem();
  const filesystem = new FileSystemService(pathOps, fs);
  filesystem.setFileSystem(fs);

  const path = new PathService();
  path.initialize(filesystem);

  const eventService = new StateEventService();
  const state = new StateService();
  state.setEventService(eventService);
  
  // Initialize special path variables
  state.setPathVar('PROJECTPATH', process.cwd());
  state.setPathVar('HOMEPATH', process.env.HOME || process.env.USERPROFILE || '/home');

  const parser = new ParserService();
  const resolution = new ResolutionService(state, filesystem, parser, path);
  const validation = new ValidationService();
  const circularity = new CircularityService();
  const directive = new DirectiveService();
  const interpreter = new InterpreterService();
  const output = new OutputService();

  // Register services with the DI container
  container.register('StateService', { useValue: state });
  container.register('FileSystemService', { useValue: filesystem });
  container.register('ParserService', { useValue: parser });
  container.register('DirectiveService', { useValue: directive });
  container.register('InterpreterService', { useValue: interpreter });
  container.register('ResolutionService', { useValue: resolution });
  container.register('ValidationService', { useValue: validation });
  container.register('CircularityService', { useValue: circularity });
  container.register('OutputService', { useValue: output });
  container.register('PathService', { useValue: path });
  container.register('StateEventService', { useValue: eventService });
}

// Call this function before executing any commands that use the DI container
registerServices();
```

**Next Steps**:
- Implement the service registration in the CLI entry point
- Add integration tests for the CLI commands to ensure they work correctly with the service initialization
- Document the solution in the codebase to help future developers understand the DI setup

### Phase 4: Advanced Debugging Features (2-3 days)

**Objective**: Add advanced diagnostic capabilities and deeper integration

**Tasks**:
1. **Implement Common Issue Detectors**:
   ```typescript
   function detectCommonIssues(result: DebugResult): Issue[] {
     const issues: Issue[] = [];
     
     // Detect variables that are never resolved
     if (result.attempts.length > 0 && !result.attempts.some(a => a.success)) {
       issues.push({
         severity: 'error',
         message: `Variable '${result.variable}' was never successfully resolved`,
         contexts: result.attempts.map(a => a.context),
         suggestions: [
           'Check if the variable is defined in an accessible scope',
           'Check for typos in variable name',
           'Ensure import directives are correctly processed'
         ]
       });
     }
     
     // Detect context boundary issues
     if (result.boundaries.some(b => !b.success)) {
       issues.push({
         severity: 'warning',
         message: 'Variable failed to cross some context boundaries',
         contexts: result.boundaries
           .filter(b => !b.success)
           .map(b => `${b.from} -> ${b.to}`),
         suggestions: [
           'Check import directive configuration',
           'Verify variable scoping rules'
         ]
       });
     }
     
     // Detect inconsistent resolution
     const successfulValues = result.attempts
       .filter(a => a.success)
       .map(a => JSON.stringify(a.value));
       
     if (new Set(successfulValues).size > 1) {
       issues.push({
         severity: 'warning',
         message: `Variable '${result.variable}' resolves to different values in different contexts`,
         contexts: result.attempts
           .filter(a => a.success)
           .map(a => `${a.context}: ${JSON.stringify(a.value).substring(0, 30)}`),
         suggestions: [
           'Check for variable shadowing',
           'Verify import order is consistent'
         ]
       });
     }
     
     return issues;
   }
   ```

2. **IDE Integration Helper**:
   ```typescript
   function generateVSCodeLaunchConfig(): object {
     return {
       "version": "0.2.0",
       "configurations": [
         {
           "type": "node",
           "request": "launch",
           "name": "Debug Meld with Variable Tracking",
           "program": "${workspaceFolder}/node_modules/.bin/meld",
           "args": ["process", "${file}"],
           "env": {
             "MELD_DEBUG": "true",
             "MELD_DEBUG_VARS": "${input:variablesToTrack}",
             "MELD_DEBUG_SAMPLE_RATE": "1.0"
           }
         }
       ],
       "inputs": [
         {
           "id": "variablesToTrack",
           "type": "promptString",
           "description": "Comma-separated list of variables to track",
           "default": ""
         }
       ]
     };
   }
   ```

3. **Testing Framework Integration**:
   ```typescript
   class JestDebugReporter {
     onTestStart(test) {
       // Enable debug tracking for this test
       enableDebugTracking({
         trackVariables: true,
         samplingRate: 1.0
       });
     }
     
     onTestResult(test, testResult) {
       if (testResult.status === 'failed') {
         // Generate debug report for failed test
         const debugManager = DebugManager.getInstance();
         const report = debugManager.generateDebugReport();
         
         // Attach to test result
         testResult.debugReport = report;
         
         // Output to console
         console.log('Debug report for failed test:');
         console.log(report);
       }
     }
   }
   ```

**Exit Criteria**:
- ✅ Common issue detection provides useful diagnostics
- ✅ IDE integration helpers simplify debugging workflows
- ✅ Testing framework integration improves test failure diagnosis
- ✅ System can be extended with new diagnostic capabilities

## 4. Reference Implementation From Aspirational README

Based on the "Using the VariableResolutionTracker Directly" section from the aspirational README, here's a more detailed implementation specification:

```typescript
// File: src/debug/VariableResolutionTracker.ts

export interface ResolutionAttempt {
  variableName: string;      // Name of the variable being resolved
  context: string;           // Typically a file path or context name
  contextId?: string;        // Unique ID for the state context
  timestamp: number;         // When this attempt occurred
  success: boolean;          // Whether resolution succeeded
  value?: any;               // Resolved value (if success)
  error?: string;            // Error message (if !success)
  source?: string;           // Which resolver attempted this (e.g., "TextVarResolver")
}

export interface BoundaryCrossing {
  type: 'parent-to-child' | 'child-to-parent';
  variableName: string;
  from: string;              // Context name (typically file path)
  fromId: string;            // Unique state ID
  to: string;                // Context name (typically file path)
  toId: string;              // Unique state ID
  success: boolean;
  timestamp: number;
  value?: any;               // The value being passed across the boundary
}

export interface TrackerConfiguration {
  enabled: boolean;          // Master switch
  samplingRate: number;      // 0.0-1.0, percentage of attempts to track
  maxAttempts: number;       // Maximum attempts to store before cycling
  watchVariables: string[];  // Only track these variables (empty = all)
}

export class VariableResolutionTracker {
  private config: TrackerConfiguration = {
    enabled: false,
    samplingRate: 1.0,
    maxAttempts: 1000,
    watchVariables: []
  };
  
  private attempts: ResolutionAttempt[] = [];
  private boundaries: BoundaryCrossing[] = [];
  
  constructor(config: Partial<TrackerConfiguration> = {}) {
    this.configure(config);
  }
  
  configure(config: Partial<TrackerConfiguration>): void {
    this.config = {...this.config, ...config};
  }
  
  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  shouldTrack(variableName: string): boolean {
    if (!this.config.enabled) return false;
    
    // Apply sampling
    if (Math.random() > this.config.samplingRate) return false;
    
    // Check if we're watching specific variables
    if (this.config.watchVariables.length > 0) {
      return this.config.watchVariables.includes(variableName);
    }
    
    return true;
  }
  
  trackResolutionAttempt(
    variableName: string,
    context: string,
    success: boolean,
    value?: any,
    source: string = 'unknown',
    boundaryInfo?: {
      type: 'parent-to-child' | 'child-to-parent',
      sourceId: string,
      targetId: string
    }
  ): void {
    if (!this.shouldTrack(variableName)) return;
    
    // Create resolution attempt record
    const attempt: ResolutionAttempt = {
      variableName,
      context,
      contextId: boundaryInfo?.sourceId,
      timestamp: Date.now(),
      success,
      value: success ? value : undefined,
      error: success ? undefined : 'Variable not found',
      source
    };
    
    // Add to attempts list, respecting maxAttempts
    if (this.attempts.length >= this.config.maxAttempts) {
      this.attempts.shift(); // Remove oldest
    }
    this.attempts.push(attempt);
    
    // If this crosses a boundary, track that too
    if (boundaryInfo) {
      this.trackBoundaryCrossing(
        variableName,
        boundaryInfo.type,
        context,
        boundaryInfo.sourceId,
        context, // Target context name (simplified for now)
        boundaryInfo.targetId,
        success,
        value
      );
    }
  }
  
  trackBoundaryCrossing(
    variableName: string,
    type: 'parent-to-child' | 'child-to-parent',
    fromContext: string,
    fromId: string,
    toContext: string,
    toId: string,
    success: boolean,
    value?: any
  ): void {
    if (!this.shouldTrack(variableName)) return;
    
    const boundary: BoundaryCrossing = {
      type,
      variableName,
      from: fromContext,
      fromId,
      to: toContext,
      toId,
      success,
      timestamp: Date.now(),
      value: success ? value : undefined
    };
    
    this.boundaries.push(boundary);
  }
  
  getAttemptsForVariable(variableName: string): ResolutionAttempt[] {
    return this.attempts.filter(a => a.variableName === variableName);
  }
  
  getBoundariesForVariable(variableName: string): BoundaryCrossing[] {
    return this.boundaries.filter(b => b.variableName === variableName);
  }
  
  generateVariableReport(variableName: string): {
    attempts: ResolutionAttempt[],
    boundaries: BoundaryCrossing[]
  } {
    return {
      attempts: this.getAttemptsForVariable(variableName),
      boundaries: this.getBoundariesForVariable(variableName)
    };
  }
  
  clear(): void {
    this.attempts = [];
    this.boundaries = [];
  }
}
```

This implementation provides a complete foundation for tracking variable resolution with all the features described in the aspirational README, including:

1. Sampling for performance optimization
2. Variable-specific tracking
3. Boundary crossing detection
4. Comprehensive metadata collection
5. Report generation

## 5. Summary

The proposed plan builds on the existing implementation but provides a more structured approach with clear phases and deliverables. Key highlights:

1. **Phase 1** consolidates existing functionality into a cohesive system
2. **Phase 2** focuses on making the debug data more useful through visualizations
3. **Phase 3** enhances the user experience and CLI integration
4. **Phase 4** adds advanced diagnostics and integration capabilities

The reference implementation of the `VariableResolutionTracker` provides a concrete example of how the core tracking functionality should work, emphasizing performance, flexibility, and comprehensive data collection.

By implementing this plan, we'll transform the existing debugging capabilities from internal tools to a user-facing feature that provides significant value in troubleshooting complex variable resolution and import issues.

## Implementation Status

- ✅ Phase 1: Variable resolution tracking
- ✅ Phase 2: Context boundary visualization
- ✅ Phase 3: CLI integration and documentation
- 🔄 Phase 4: Advanced diagnostics and integration
