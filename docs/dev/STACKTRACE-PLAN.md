# mlld Stacktrace Implementation Plan - Final

## Overview
Implement optional mlld-aware stacktraces using smart data sampling and service composition. The system provides rich debugging context with minimal performance impact.

## Success Criteria
**Primary Goal**: Error messages that effectively help users understand and fix their mlld scripts
- Clear indication of what went wrong
- Sampled data context at point of failure  
- Actionable suggestions for fixes
- mlld-level operations, not JavaScript details

**Implementation Philosophy**: 
- Smart sampling prevents resource issues (200 chars, 5 items, etc.)
- Service composition keeps code clean
- Circuit breakers ensure production safety

---

## Phase 1: Foundation - Configuration & Infrastructure
**Goal**: Establish the toggleable stacktrace system without changing behavior

### Sub-phase 1.1: Configuration System
**Files to create/modify**:
- Create `core/types/config.ts` with `StacktraceConfig` interface
- Modify `interpreter/env/Environment.ts` constructor to accept config
- Add `isStacktraceEnabled()` method to Environment

**Implementation details**:
```typescript
interface StacktraceConfig {
  enabled: boolean;              // Default: true
  maxFrameDepth: number;         // Default: 50 (generous for complex scripts)
  truncateDataAt: number;        // Default: 10KB per variable
  verbosity: 'minimal' | 'standard' | 'verbose';
}
```

**Key decisions**:
- Store config in Environment (already passed everywhere)
- Default to enabled for better developer experience
- Use simple boolean checks for performance

### Sub-phase 1.2: Service Infrastructure
**Files to create**:
- Create `interpreter/services/StacktraceService.ts`
- Create `core/types/stacktrace.ts` for types

**Implementation**:
```typescript
interface MlldExecutionFrame {
  operation: string;
  nodeType: string;
  location?: SourceLocation;
  timestamp: number;
}

class StacktraceService {
  private frames: MlldExecutionFrame[] = [];
  private config: StacktraceConfig;
  
  pushFrame(frame: FrameInfo): void
  popFrame(): void
  captureContext(): ErrorContext
}
```

**Environment modifications**:
- Add `private stacktrace?: StacktraceService`
- Add delegation methods that no-op when service absent
- Service created only when enabled

### Sub-phase 1.3: Zero-Overhead Wrapper
**Create `trackExecution()` helper**:
```typescript
// Fast path when disabled
if (!env.isStacktraceEnabled()) {
  return fn();
}
// Tracking logic only when enabled
```

**Integration points**:
- Initially just add the infrastructure
- No behavior changes yet
- Add unit tests for toggle behavior

---

## Phase 2: Context Capture - Execution Tracking
**Goal**: Capture mlld execution flow when stacktraces are enabled

### Sub-phase 2.1: Operation Detection
**Modify `interpreter/core/interpreter.ts`**:
- Add `detectOperation()` to identify mlld operations
- Map AST node types to user-friendly operation names
- Extract directive types and parameters

**Operation mappings**:
```typescript
'Directive:text' → 'variable assignment'
'Directive:run' → 'command execution'
'Directive:data' → 'data transformation'
'FieldAccess' → 'field access'
```

### Sub-phase 2.2: Evaluate Integration
**Wrap key evaluation points**:
- Main `evaluate()` function
- `evaluateDirective()` 
- Specific evaluators that do heavy lifting

**Async handling**:
- Maintain stack integrity across await boundaries
- Consider AsyncLocalStorage for context propagation
- Handle Promise.all in foreach operations

**Practical decisions**:
- Don't wrap every tiny function
- Focus on user-visible operations
- Keep frame creation lightweight

### Sub-phase 2.3: Error Enhancement
**Modify error creation**:
- Capture stack when MlldError is constructed
- Add to error.details.executionStack
- Don't modify error interfaces

**Enhancement strategy**:
```typescript
catch (error) {
  if (env.isStacktraceEnabled()) {
    error.mlldStack = env.getExecutionStack();
    error.mlldOperation = getCurrentOperation();
  }
  throw error;
}
```

---

## Phase 3: Data Context - Variable State Capture  
**Goal**: Include relevant variable state in errors

### Sub-phase 3.1: Smart Variable Snapshots
**Smart sampling on error**:
- Sample data using consistent limits
- Capture variables referenced in failing operation
- Include parent scope variables when relevant

**Sampling limits**:
```typescript
text: First 200 chars + total length
arrays: First 5 items + total count
objects: Keys + shallow values (max 10 per level)  
paths: Full path (already short)
executables: Name and type only
LLM output: First/last 100 chars + size
```

### Sub-phase 3.2: Field Access Enhancement
**Special handling for FieldAccessError**:
- Capture object structure
- List available fields
- Show actual type vs expected
- Include did-you-mean suggestions

**Smart truncation**:
- For objects: Show all keys, sample values
- For arrays: Length + first/last elements
- For LLM JSON: Pretty structure, truncated strings

### Sub-phase 3.3: Circular Reference Safety
**Detection and handling**:
- Use WeakSet during traversal
- Replace circular refs with "[Circular]"
- Maintain object identity for display

---

## Phase 4: Display - User-Friendly Formatting
**Goal**: Present mlld stacktraces in readable format

### Sub-phase 4.1: mlld Trace Formatter
**Extend ErrorDisplayFormatter**:
- Add `formatMlldTrace()` method
- Show directive flow, not JS functions
- Include line numbers and files

**Format example**:
```
📍 mlld execution trace:
   @data items = @run [curl api.example.com/items]  (main.mld:5)
   └─ @data results = foreach @process(@items)      (main.mld:8)
      └─ foreach iteration 42 of 150
         └─ @exec process(item)                      (lib.mld:12)
            └─ field access: @item.metadata.tags     (lib.mld:15)
               ❌ "metadata" not found
```

### Sub-phase 4.2: Data Context Display
**Variable snapshot formatting**:
- Syntax highlight mlld variables
- Pretty-print JSON structures
- Show truncation clearly
- Include type information

**Adaptive detail level**:
- Minimal: Just operation and location
- Standard: Key variables and structure
- Verbose: Full snapshots (with truncation)

### Sub-phase 4.3: Integration
**Modify existing error display**:
- Add mlld trace after error details
- Before suggestions section
- Conditional based on config

---

## Phase 5: Intelligence - Smart Suggestions
**Goal**: Provide actionable fixes based on patterns

### Sub-phase 5.1: Error Pattern Catalog
**Common patterns**:
- Field on non-object → suggest @data
- Missing variable → show similar names
- Type mismatches → show conversion
- Async timing → suggest await patterns

### Sub-phase 5.2: Context-Aware Suggestions
**Use execution context**:
- Suggest based on actual data types
- Reference successful similar operations
- Show working examples from same file

### Sub-phase 5.3: Suggestion Refinement
**Iterative improvement**:
- Start with basic patterns
- Add new patterns from real usage
- Test with actual error scenarios

---

## Phase 6: Testing & Documentation
**Goal**: Ensure reliability and usability

### Sub-phase 6.1: Test Coverage
**Test scenarios**:
- Toggle on/off behavior
- Deep recursion handling
- Large data handling
- Async operation tracking
- Error enhancement

**Fixture additions**:
- Add error cases with expected traces
- Test with real-world sized data
- Verify truncation behavior

### Sub-phase 6.2: Performance Validation
**Benchmarks**:
- Baseline with stacktraces off
- Measure overhead when on
- Test with large foreach operations
- Memory usage monitoring

### Sub-phase 6.3: Documentation
**User docs**:
- How to read mlld traces
- Configuration options
- Performance considerations

**Developer docs**:
- Architecture overview
- Extension points
- Debugging the debugger

---

## Implementation Notes

### Key Implementation Details

#### New Files
1. `interpreter/services/StacktraceService.ts` - Core service
2. `core/types/stacktrace.ts` - Type definitions
3. `core/utils/CircularReferenceDetector.ts` - Reusable utility
4. `core/utils/DataSampler.ts` - Smart sampling logic

#### Modified Files
1. `interpreter/env/Environment.ts` - Add service + delegation
2. `interpreter/core/interpreter.ts` - Add frame tracking
3. `core/errors/MlldError.ts` - Add context capture
4. `core/utils/errorDisplayFormatter.ts` - Add trace display

#### Integration Pattern
```typescript
// In evaluate()
env.pushFrame('evaluate', node);
try {
  // existing logic
} catch (error) {
  if (env.hasStacktrace()) {
    error.mlldContext = env.captureErrorContext();
  }
  throw error;
} finally {
  env.popFrame();
}
```

### Risk Mitigations
- **Performance**: Feature flag allows disable
- **Memory**: Bounded stacks, smart truncation  
- **Complexity**: Incremental implementation
- **Breaking changes**: Preserve all interfaces

### Final Design Decisions
1. **Smart Sampling**: 200 chars/5 items limits solve resource concerns
2. **Service Composition**: Clean separation via StacktraceService
3. **No AOP**: Direct integration is simpler and clearer
4. **Circuit Breakers**: Auto-disable on performance issues
5. **Default On**: Better developer experience
6. **Manual Async**: Simpler than AsyncLocalStorage

### Testing Strategy
- Unit tests for each component
- Integration tests for full traces
- Fixture tests for error formatting
- Manual testing with real mlld scripts
- Performance regression tests

---

## Success Validation
The implementation succeeds when:
1. Users can understand what their mlld script was doing when it failed
2. Error messages show the actual data that caused issues
3. Suggestions lead to successful fixes
4. The feature doesn't slow down normal execution
5. Complex scripts with massive data still provide useful debugging info