# Environment.ts Refactoring Plan

## Current State Analysis

The `interpreter/env/Environment.ts` file was originally **2,713 lines** with **87 methods**. Through Phase 1 refactoring, we've successfully extracted ~530 lines into 4 utility modules, reducing the monolithic nature while maintaining full functionality.

**Current Status**: ~2,180 lines remaining in Environment.ts after Phase 1 completion.

## Risk Assessment

**Complexity**: Medium-High  
**Risk Level**: Medium  

While this appears to be "just breaking up a monolithic file," there are several factors that increase complexity:

### Risk Factors:
1. **Circular Dependencies**: The Environment class is heavily referenced throughout the codebase
2. **Shared State**: 15+ private fields that may have complex interdependencies
3. **Method Coupling**: Methods may have hidden dependencies on internal state
4. **Import Chains**: Many modules import Environment directly
5. **Shadow Environments**: Complex VM-based Node.js execution context
6. **Caching Systems**: Multiple cache layers (URL, resolver, variable) with timing dependencies

### Mitigating Factors:
1. **Strong TypeScript**: Compilation will catch interface mismatches
2. **Comprehensive Tests**: Existing test suite will validate functionality
3. **Clear Architecture**: Interface-first design philosophy already established

## Proposed Modular Structure

### ✅ Phase 1 Complete - Utility Modules
**Status**: Successfully extracted and integrated

#### 1. Cache Management (`CacheManager.ts`) - ✅ Complete
- **Size**: ~100 lines
- **Responsibilities**: URL caching, resolver variable caching, TTL management
- **Key Methods**: `getURLCacheTTL()`, cache entry management, cache validation
- **Dependencies**: URLCache, ImmutableCache, ResolvedURLConfig

#### 2. Command Utilities (`CommandUtils.ts`) - ✅ Complete  
- **Size**: ~130 lines
- **Responsibilities**: Command validation, shell code enhancement for TTY/stderr
- **Key Methods**: `validateAndParseCommand()`, `enhanceShellCodeForCommandSubstitution()`
- **Dependencies**: None (pure static utilities)

#### 3. Debug Utilities (`DebugUtils.ts`) - ✅ Complete
- **Size**: ~150 lines  
- **Responsibilities**: Debug object creation, value truncation, variable formatting
- **Key Methods**: `createDebugObject()`, `truncateValue()`, statistics generation
- **Dependencies**: Variable types

#### 4. Error Management (`ErrorUtils.ts`) - ✅ Complete
- **Size**: ~150 lines
- **Responsibilities**: Error collection, processing, output management  
- **Key Methods**: `collectError()`, `processOutput()`, error reporting
- **Dependencies**: MlldCommandExecutionError types

### 🚧 Remaining Modules

#### 5. Core Environment (`Environment.ts`) 
- **Current Size**: ~2,180 lines (after Phase 1)
- **Target Size**: ~600-800 lines
- **Responsibilities**: Coordination, child environment management, core variable operations
- **Key Methods**: constructor, variable getters/setters, basic state management

#### 6. Command Execution Modules 
**Revised Architecture**: Language-specific executor pattern

##### 6a. Base Command Execution (`BaseCommandExecutor.ts`)
- **Estimated Size**: ~200-250 lines
- **Responsibilities**: Common execution patterns, shell command execution
- **Key Methods**: `executeCommand()`, timing, error handling, progress reporting
- **Dependencies**: Environment (for variable resolution), CommandUtils, ErrorUtils

##### 6b. Language-Specific Executors (`executors/`)
- **`JavaScriptExecutor.ts`**: ~150 lines - In-process JS execution + JS shadow environment
- **`NodeExecutor.ts`**: ~200 lines - VM/subprocess Node.js execution + Node shadow environment
- **`PythonExecutor.ts`**: ~75 lines - File-based Python execution
- **`BashExecutor.ts`**: ~200 lines - Environment-aware shell execution
- **`CommandExecutorFactory.ts`**: ~50 lines - Language detection and routing

##### 6c. Shadow Environment Framework (`shadow/`)
- **`ShadowEnvironment.ts`**: ~100 lines - Abstract base class for shadow environments
- **`JavaScriptShadowEnvironment.ts`**: ~100 lines - In-process function wrapper creation
- **`NodeShadowEnvironment.ts`**: ~150 lines - VM-based shadow environment (refactored)

**Total Module Size**: ~1,025 lines (distributed across focused files)

#### 7. Variable Management Module (`VariableManager.ts`)
- **Estimated Size**: ~500-600 lines
- **Responsibilities**: Variable CRUD, resolver variables, reserved variables
- **Key Methods**: variable resolution, parameter variables, resolver integration
- **Dependencies**: Environment (for context), CacheManager

#### 8. Resolution & Import Module (`ImportResolver.ts`)
- **Estimated Size**: ~600-700 lines
- **Responsibilities**: Module resolution, import handling, URL resolution
- **Key Methods**: `resolveModule()`, import validation, URL fetching
- **Dependencies**: Environment (for security context), CacheManager

#### 9. Shadow Environment Module (`ShadowEnvironmentManager.ts`)
- **Estimated Size**: ~200-300 lines
- **Responsibilities**: Language-specific environments (Node.js, JS, etc.)
- **Key Methods**: shadow environment creation, function injection
- **Dependencies**: Environment (for variable context)

## Refactoring Strategy

### ✅ Phase 1: Extract Pure Utilities (Low Risk) - COMPLETE
**Status**: Successfully completed with 100% test pass rate
1. ✅ Extract cache management logic → `CacheManager.ts`
2. ✅ Extract command validation/parsing utilities → `CommandUtils.ts`  
3. ✅ Extract debug/logging utilities → `DebugUtils.ts`
4. ✅ Extract error handling utilities → `ErrorUtils.ts`

**Key Learnings**:
- Command validation/enhancement was more complex than expected (TTY detection, stderr capture)
- Interface design critical for avoiding circular dependencies
- Full regression testing essential for command substitution edge cases

### Phase 2: Extract Command Execution (Medium Risk)
**Revised Strategy**: Break into language-specific executors for better modularity and extensibility

#### Phase 2A: Base Command Execution (Low Risk)
1. Create `BaseCommandExecutor` abstract class
2. Move common execution patterns (timing, error handling, progress)
3. Move `executeCommand()` method (shell command execution)
4. Define interfaces for language-specific executors

#### Phase 2B: Language-Specific Executors (Medium Risk)
Create separate executor classes for each language context:

1. **`JavaScriptExecutor`** (~100-150 lines)
   - In-process execution using `new Function()`
   - Console output capture and shadow environment integration
   - Expression vs statement detection, Promise handling

2. **`NodeExecutor`** (~200-250 lines)  
   - Dual-path: NodeShadowEnvironment VM OR subprocess execution
   - Complex module resolution and dependency injection
   - Return value parsing with special markers

3. **`PythonExecutor`** (~50-75 lines)
   - File-based subprocess execution
   - Parameter injection as Python variables
   - Simple but extensible for future Python-specific features

4. **`BashExecutor`** (~150-200 lines)
   - Environment variable injection and text variable auto-injection
   - Command substitution enhancement integration
   - TTY detection and stderr handling

5. **`CommandExecutorFactory`** (~50 lines)
   - Language detection and executor selection
   - Executor instance management
   - Fallback handling

**Key Benefits**:
- Each language executor can evolve independently
- Easy to add new languages (Go, Rust, etc.)
- Shadow environment management becomes language-specific
- Better testing isolation for each execution context
- Future features (timeouts, resource limits) can be language-specific

### Phase 3: Extract Variable Management (Medium-High Risk)  
**Note**: May need to coordinate with Phase 4 due to tight coupling
1. Create `VariableManager` class
2. Move variable resolution logic (getVariable, setVariable, etc.)
3. Handle resolver variables and caching integration
4. Carefully manage state dependencies with import resolution

### Phase 4: Extract Import/Resolution (High Risk)
**Note**: Tightly coupled with variable management
1. Create `ImportResolver` class
2. Move module resolution logic (resolveModule, fetchURL, etc.)
3. Handle URL fetching and security validation
4. Integrate with CacheManager for URL and module caching
5. Handle circular import prevention

**Alternative**: Consider combining Phases 3 & 4 into single phase due to coupling

### Phase 5: Extract Shadow Environment Framework (Low Risk)
**Revised Strategy**: Create shadow environment abstraction with language-specific implementations
1. Create abstract `ShadowEnvironment` base class with common patterns
2. Refactor existing `NodeShadowEnvironment` to extend base class
3. Create `JavaScriptShadowEnvironment` extending base class
4. Integrate shadow environments into respective language executors
5. Remove shadow environment logic from core Environment class

**Key Benefits**:
- Common parameter binding, result formatting, and validation logic
- Language-specific optimization for wrapper creation and injection
- Easy extensibility for future languages (Python, Go, Rust shadow environments)
- Better testing isolation and maintainability

**Note**: This approach provides the best of both worlds - shared abstractions for common concerns while allowing language-specific optimizations

## Implementation Guidelines

### Dependency Injection Pattern
```typescript
export class Environment {
  private commandExecutor: CommandExecutor;
  private variableManager: VariableManager;
  private importResolver: ImportResolver;
  // ...
  
  constructor(options: EnvironmentOptions) {
    this.commandExecutor = new CommandExecutor(this);
    this.variableManager = new VariableManager(this);
    // ...
  }
}
```

### Interface Segregation
- Define narrow interfaces for each module's needs from Environment
- Avoid passing entire Environment object where possible
- Use dependency injection for testability

### Testing Strategy
- Unit tests for each extracted module
- Integration tests for module interactions  
- Regression tests for existing functionality
- Performance tests for command execution

## Migration Path

1. **Create Interfaces First**: Define contracts before implementation
2. **Extract Bottom-Up**: Start with utilities, work up to core logic
3. **Maintain Compatibility**: Keep existing public API during transition
4. **Incremental Testing**: Test each extraction independently
5. **Monitor Performance**: Ensure no regression in execution speed

## Expected Benefits

- **Maintainability**: Smaller, focused classes
- **Testability**: Isolated components with clear dependencies
- **Performance**: Potential for better caching and optimization
- **Readability**: Clear separation of concerns
- **Extensibility**: Easier to add new capabilities

## Timeline Estimate

### Completed
- **✅ Phase 1**: ~4 hours (utilities extraction) - **COMPLETE**
  - *Original Estimate*: 1-2 days  
  - *Actual*: Much faster due to utilities being more isolated than expected
  - *Key Success Factor*: Pure utility functions with minimal state dependencies

### Revised Estimates Based on Phase 1 Learnings
- **Phase 2A**: 0.5-1 day (base command execution) - **NEW**
  - *Rationale*: `executeCommand()` is well-isolated, similar to Phase 1 utilities
  - *Risk*: Minimal - mostly moving existing functionality

- **Phase 2B**: 1.5-2 days (language-specific executors) - **NEW**  
  - *Rationale*: Each executor is focused and testable in isolation
  - *Risk*: NodeExecutor complexity with shadow environment integration

- **Phase 3**: 2-3 days (variable management) - **UNCHANGED**
  - *Rationale*: Variable resolution has complex state dependencies
  - *Risk*: Tight coupling with import resolution

- **Phase 4**: 3-4 days (import resolution) - **UNCHANGED**  
  - *Rationale*: URL fetching, module resolution, security validation remain complex
  - *Risk*: May need to coordinate with Phase 3

- **Phase 5**: 0.5 day (shadow environments) - **REVISED DOWN SIGNIFICANTLY**
  - *Rationale*: Shadow environments integrate naturally into language executors
  - *Risk*: Minimal - becomes part of executor-specific logic

- **Testing & Polish**: 1-2 days per phase - **REVISED**
  - *Rationale*: Continuous testing approach proven effective in Phase 1

**Revised Total**: 7.5-10.5 days of focused development work (down from 11-17 days)
- *Additional Benefits*: Language-specific executors provide better foundation for future extensibility

## Validation Criteria

### ✅ Phase 1 Results
- [x] All existing tests pass (351/351 tests passing)
- [x] No performance regression (< 5% slowdown)
- [x] Memory usage remains stable  
- [x] No breaking changes to public API
- [x] Code coverage maintained
- [x] Each module has clear, single responsibility

### Ongoing Validation for Future Phases
- [ ] All existing tests continue to pass
- [ ] No performance regression in command execution
- [ ] Memory usage remains stable during refactoring
- [ ] No breaking changes to public API
- [ ] Code coverage maintained or improved
- [ ] Each extracted module has clear, single responsibility
- [ ] **New**: Command substitution edge cases continue to work (TTY detection, stderr capture)
- [ ] **New**: All language-specific execution contexts remain functional (bash, sh, node, js, python)
- [ ] **New**: Variable resolution performance not degraded
- [ ] **New**: Import/module resolution security not compromised

### Success Metrics from Phase 1
- **Line Count Reduction**: 530 lines extracted from Environment.ts (20% reduction)
- **Modular Responsibility**: 4 focused utility classes created
- **Zero Regressions**: All functionality preserved
- **Interface Clarity**: Clean dependency injection pattern established
- **Test Coverage**: 100% test pass rate maintained

### Lessons Learned for Future Phases
1. **Test-Driven Extraction**: Run targeted tests immediately after each method extraction
2. **Interface-First Design**: Define clear interfaces before implementation
3. **Preserve Complex Logic**: Don't simplify sophisticated algorithms (e.g., command substitution)
4. **Dependency Mapping**: Carefully map state dependencies before extraction
5. **Regression Detection**: Focus on edge cases and complex integration scenarios