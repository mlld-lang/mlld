# Environment.ts Refactoring Plan

## Current State Analysis

The `interpreter/env/Environment.ts` file is currently **2,713 lines** with **87 methods**, making it a monolithic class that handles multiple responsibilities. This violates the Single Responsibility Principle and makes the code harder to maintain, test, and understand.

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

### 1. Core Environment (`Environment.ts`)
- **Size**: ~400-500 lines
- **Responsibilities**: Coordination, child environment management, core variable operations
- **Key Methods**: constructor, variable getters/setters, basic state management

### 2. Command Execution Module (`CommandExecutor.ts`)
- **Size**: ~600-800 lines  
- **Responsibilities**: Command execution, shell operations, code execution
- **Key Methods**: `executeCommand()`, `executeCode()`, command validation
- **Dependencies**: Environment (for variable resolution)

### 3. Variable Management Module (`VariableManager.ts`)
- **Size**: ~400-500 lines
- **Responsibilities**: Variable CRUD, resolver variables, reserved variables
- **Key Methods**: variable resolution, parameter variables, resolver integration
- **Dependencies**: Environment (for context)

### 4. Resolution & Import Module (`ImportResolver.ts`)
- **Size**: ~500-600 lines
- **Responsibilities**: Module resolution, import handling, URL resolution
- **Key Methods**: `resolveModule()`, import validation, caching
- **Dependencies**: Environment (for security context)

### 5. Shadow Environment Module (`ShadowEnvironmentManager.ts`)
- **Size**: ~300-400 lines
- **Responsibilities**: Language-specific environments (Node.js, JS, etc.)
- **Key Methods**: shadow environment creation, function injection
- **Dependencies**: Environment (for variable context)

### 6. Cache Management Module (`CacheManager.ts`)
- **Size**: ~200-300 lines
- **Responsibilities**: URL caching, resolver caching, cache invalidation
- **Key Methods**: cache operations, TTL management
- **Dependencies**: Minimal (mostly self-contained)

## Refactoring Strategy

### Phase 1: Extract Pure Utilities (Low Risk)
1. Extract cache management logic
2. Extract command validation/parsing utilities
3. Extract debug/logging utilities

### Phase 2: Extract Command Execution (Medium Risk)
1. Create `CommandExecutor` class with Environment dependency injection
2. Move all command execution methods
3. Update imports in evaluators

### Phase 3: Extract Variable Management (Medium-High Risk)  
1. Create `VariableManager` class
2. Move variable resolution logic
3. Carefully handle state dependencies

### Phase 4: Extract Import/Resolution (High Risk)
1. Create `ImportResolver` class
2. Move module resolution logic
3. Handle circular import prevention

### Phase 5: Extract Shadow Environments (Medium Risk)
1. Create `ShadowEnvironmentManager`
2. Move VM-based execution logic
3. Test language-specific execution

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

- **Phase 1**: 1-2 days (utilities extraction)
- **Phase 2**: 2-3 days (command execution)
- **Phase 3**: 2-3 days (variable management)  
- **Phase 4**: 3-4 days (import resolution)
- **Phase 5**: 1-2 days (shadow environments)
- **Testing & Polish**: 2-3 days

**Total**: 11-17 days of focused development work

## Validation Criteria

- [ ] All existing tests pass
- [ ] No performance regression (< 5% slowdown)
- [ ] Memory usage remains stable
- [ ] No breaking changes to public API
- [ ] Code coverage maintained or improved
- [ ] Each module has clear, single responsibility