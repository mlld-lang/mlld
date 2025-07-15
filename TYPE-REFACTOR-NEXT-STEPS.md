# Type Refactor: Next Steps for Phase 3 Completion & Phase 4

## Current State (After Phase 3 Foundation)

### What's Working
- Resolution context infrastructure exists and works
- Enhanced array evaluation preserves Variables (behind feature flag)
- Circular dependencies resolved with dynamic imports
- All 858 tests passing, build succeeds

### What's Not Yet Implemented
- Feature flags not enabled by default
- Core interpolation still extracts values
- Most evaluators don't use enhanced resolution
- Performance impact not measured

## Immediate Next Steps (Phase 3 Completion)

### 1. Enable Enhanced Mode in More Places
The infrastructure exists but isn't widely used. Need to:

#### a. Update Template Evaluation
**File**: `interpreter/eval/add.ts` (evaluateTemplateDefinition)
```typescript
// Current: Templates always extract values
// Needed: Preserve Variables in template AST until final interpolation
```

#### b. Update Command Execution Context
**File**: `interpreter/eval/run.ts`
```typescript
// Current: Commands receive extracted values
// Needed: Pass Variables to shadow environments for better type info
```

#### c. Update Object Property Evaluation
**File**: `interpreter/eval/var.ts` (object evaluation section)
```typescript
// Current: Object properties extract Variable values
// Needed: Preserve Variables as property values
```

### 2. Performance Validation
Before making enhanced mode default, measure:
- Variable creation overhead
- Memory usage with Variable wrappers
- Resolution performance with context checks

Create benchmark script:
```bash
# Create tests/performance/variable-preservation-benchmark.ts
# Compare enhanced vs normal mode on:
# - Large arrays (1000+ elements)
# - Deep nesting (10+ levels)
# - Many variable references
```

### 3. Integration Test Coverage
Add tests for edge cases:
- Circular Variable references
- Variables containing Variables containing Variables
- Mixed enhanced/normal mode scenarios
- Import/export with Variables

## Phase 4 Planning: System-Wide Variable Flow

### Goal
Make Variables the primary data type throughout mlld, with extraction only at system boundaries.

### Step 1: Update Show/Output System
**Files**: `interpreter/eval/show.ts`, `interpreter/eval/output.ts`

Make output formatting Variable-aware:
```typescript
function formatForOutput(value: Variable | any): string {
  if (isVariable(value)) {
    // Format based on Variable type
    switch (value.type) {
      case 'path':
        return value.metadata?.isURL ? formatURL(value) : formatPath(value);
      case 'array':
        return formatArray(value);
      // ... etc
    }
  }
  // Fall back to current formatting
}
```

### Step 2: Update Import/Export System
**File**: `interpreter/eval/import/ImportDirectiveEvaluator.ts`

Preserve Variables through module boundaries:
```typescript
// Instead of extracting values for export
export function getExports(): Record<string, Variable> {
  // Return Variables directly
}
```

### Step 3: Update Error System
**Files**: `core/errors/`

Make errors Variable-aware:
```typescript
class MlldTypeError extends MlldError {
  constructor(
    expected: Variable['type'],
    received: Variable | any,
    context: string
  ) {
    const actualType = isVariable(received) 
      ? `Variable<${received.type}>` 
      : typeof received;
    // Better error messages with actual types
  }
}
```

### Step 4: Shadow Environment Integration
**Files**: `interpreter/eval/exec/`, `interpreter/eval/run.ts`

Pass Variables to JavaScript/Python/shell environments:
```typescript
// In shadow environment
globalThis.mlldGetVariable = (name: string): Variable => {
  return env.getVariable(name); // Return Variable, not value
};

// User code can introspect types
const pathVar = mlldGetVariable('myPath');
if (pathVar.type === 'path' && pathVar.metadata?.isURL) {
  // Handle URL differently than file path
}
```

## Migration Strategy

### Phase 3 Completion Timeline
1. **Week 1**: Enable enhanced mode in templates and commands
2. **Week 2**: Performance validation and optimization
3. **Week 3**: Extended testing with real mlld scripts
4. **Week 4**: Make enhanced mode default (with env var to disable)

### Phase 4 Timeline
1. **Month 1**: Update output and error systems
2. **Month 2**: Update import/export and shadow environments
3. **Month 3**: Remove legacy code paths
4. **Month 4**: Documentation and optimization

## Testing Strategy

### Critical Test Scenarios
1. **Type Preservation Chain**
   ```mlld
   /var @path = <./file.md>
   /var @array = [@path, "literal"]
   /var @obj = {path: @array[0]}
   /show @obj.path  >> Should know this is a path Variable
   ```

2. **Cross-File Type Flow**
   ```mlld
   # file1.mld
   /var @typed = <./data.json> as json
   
   # file2.mld
   /import { typed } from "./file1.mld"
   /show @typed  >> Should preserve JSON type metadata
   ```

3. **Shadow Environment Types**
   ```mlld
   /var @data = {users: [{name: "Alice", age: 30}]}
   /exe @process(data) = js {
     // Should receive Variable with type info
     if (data.type === 'object') {
       return data.value.users.length;
     }
   }
   ```

## Risk Mitigation

### Performance Risks
- **Risk**: Variable wrappers add overhead
- **Mitigation**: Lazy Variable creation, object pooling
- **Monitoring**: Add performance metrics to test suite

### Compatibility Risks
- **Risk**: External tools expect raw values
- **Mitigation**: Extract at system boundaries
- **Testing**: Test with popular mlld modules

### Complexity Risks
- **Risk**: Developers confused by Variable vs value
- **Mitigation**: Clear documentation, helper functions
- **Education**: Examples showing benefits

## Success Criteria

### Phase 3 Complete When:
- [ ] Enhanced mode enabled in 80%+ of evaluators
- [ ] Performance overhead < 5%
- [ ] All tests pass with enhanced mode as default
- [ ] No user-visible behavior changes

### Phase 4 Complete When:
- [ ] Variables flow through entire system
- [ ] Type errors show Variable types
- [ ] Shadow environments receive Variables
- [ ] Legacy extraction code removed

## Quick Start for Next Developer

1. **Enable enhanced mode for testing**:
   ```bash
   export MLLD_ENHANCED_ARRAYS=true
   export MLLD_ENHANCED_RESOLUTION=true
   npm test
   ```

2. **Find next evaluation point to update**:
   ```bash
   grep -r "resolveVariableValue\|extractValue" interpreter/eval/
   # Pick one that doesn't use enhanced resolution yet
   ```

3. **Update to use ResolutionContext**:
   ```typescript
   // Before:
   const value = await resolveVariableValue(variable, env);
   
   // After:
   import { ResolutionContext } from '@interpreter/utils/variable-resolution';
   const value = await resolveVariableValue(
     variable, 
     env, 
     ResolutionContext.ArrayElement // or appropriate context
   );
   ```

4. **Test the change**:
   ```bash
   npm test path/to/changed/file.test.ts
   npm run build
   ```

## Questions to Answer

1. **When should Variables be extracted?**
   - Only at system boundaries (file I/O, console output, network)
   - When building final strings for display
   - When passing to external tools

2. **How to handle Variable cycles?**
   - Track resolution depth
   - Detect cycles during resolution
   - Provide clear error messages

3. **What about backwards compatibility?**
   - Feature flags for gradual migration
   - Keep extraction functions but deprecate
   - Document migration path for module authors