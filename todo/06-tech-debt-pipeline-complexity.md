# Technical Debt: Simplify Pipeline Variable Handling

## Priority: Low

## Summary
The pipeline handling code in `interpreter/eval/pipeline.ts` has grown complex with multiple ways to handle pipeline input variables, complex parameter binding logic, and extensive debug logging indicating ongoing complexity issues.

## Current State
The pipeline code exhibits several complexity issues:

1. **Multiple Pipeline Input Handling Patterns**:
   ```typescript
   // Lines 52-83: Complex PipelineInput creation
   const pipelineInputObj = createPipelineInput(currentOutput, format || 'text');
   const inputVar = createPipelineInputVariable(/*...*/);
   
   // Lines 456-524: Different handling for pipeline parameters
   if (isPipelineParam) {
     // Special pipeline parameter logic
   } else {
     // Regular parameter handling
   }
   ```

2. **Complex Parameter Binding** (lines 437-559):
   - Different logic for pipeline vs regular parameters
   - Format-dependent parameter creation
   - Legacy compatibility code

3. **Extensive Debug Logging**:
   - 15+ debug statements indicate ongoing complexity
   - Suggests the code is still being debugged/refined

## Proposed Solution
Extract pipeline-specific Variable handling into a separate module:

```typescript
// New file: interpreter/eval/pipeline-variables.ts
export class PipelineVariableManager {
  createPipelineInput(output: string, format: string): PipelineInputVariable;
  bindParameters(execDef: any, args: any[], env: Environment): Environment;
  handlePipelineParam(paramName: string, value: any, format?: string): Variable;
  handleRegularParam(paramName: string, value: any): Variable;
}
```

## Affected Files
- `/Users/adam/dev/mlld/interpreter/eval/pipeline.ts` - Lines 16-268 (main pipeline execution)
- `/Users/adam/dev/mlld/interpreter/eval/pipeline.ts` - Lines 437-559 (parameter binding)
- `/Users/adam/dev/mlld/interpreter/eval/pipeline.ts` - Lines 325-427 (command execution)

## Specific Issues to Address

### 1. Parameter Binding Complexity
Lines 437-559 contain complex logic for:
- Pipeline context detection
- Format-dependent variable creation
- Legacy compatibility handling

### 2. Multiple Input Creation Patterns
Lines 52-83 and 485-523 have different patterns for creating pipeline inputs.

### 3. Debug Statement Overuse
15+ debug statements suggest the code is still being refined:
```typescript
if (process.env.MLLD_DEBUG === 'true') {
  logger.debug('Parameter binding check:', {/*...*/});
}
```

## Benefits
1. **Reduced Complexity**: Separate concerns into focused modules
2. **Better Testability**: Pipeline variable logic can be tested independently
3. **Improved Maintainability**: Less complex main pipeline function
4. **Cleaner Code**: Reduce debug statement noise

## Implementation Steps
1. **Extract PipelineVariableManager** class from pipeline.ts
2. **Consolidate parameter binding** logic into clear, single-purpose methods
3. **Reduce debug logging** to essential statements only
4. **Add unit tests** for pipeline variable handling
5. **Refactor executePipeline()** to use the new manager

## Risk Assessment
- **Very Low Risk**: This is internal refactoring with no API changes
- **Medium Impact**: Will improve code maintainability significantly
- **No Breaking Changes**: All existing functionality preserved

## Success Metrics
- Reduce pipeline.ts file size by 30-40%
- Eliminate redundant debug statements
- Improve test coverage for pipeline variable handling
- Cleaner separation between pipeline execution and variable management

## Related Issues
- Field access consolidation (may interact with pipeline field access)
- Variable resolution consistency (pipeline uses multiple resolution patterns)