# Architectural Debt Analysis - mlld

## Overview

This document identifies architectural patterns in mlld where functionality is duplicated, solved at the wrong abstraction level, or could benefit from consolidation. Each item includes impact assessment and refactoring recommendations.

## 1. Error Handling and Formatting (HIGH PRIORITY)

### Current State
- **Multiple error classes** with inconsistent structure
- **Error formatting logic scattered** across CLI, API, and evaluators
- **Context gathering** (source lines, location) duplicated in multiple places
- **User-friendly messages** generated differently in different contexts

### Problems
- Same error shows differently in CLI vs API
- Difficult to maintain consistent error messages
- Source context extraction duplicated
- No standard way to add suggestions/fixes

### Ideal Architecture
```typescript
// Single error enhancement pipeline
interface ErrorEnhancer {
  enhance(error: Error, context: ErrorContext): EnhancedError;
}

// Pluggable formatters
interface ErrorFormatter {
  format(error: EnhancedError, options: FormatOptions): string;
}

// Central error processor
class ErrorProcessor {
  constructor(
    private enhancers: ErrorEnhancer[],
    private formatter: ErrorFormatter
  ) {}
  
  process(error: Error, context: ErrorContext): FormattedError {
    let enhanced = error;
    for (const enhancer of this.enhancers) {
      enhanced = enhancer.enhance(enhanced, context);
    }
    return this.formatter.format(enhanced);
  }
}
```

### Impact
- **High** - Affects user experience directly
- **Effort** - Medium (2-3 days)
- **Risk** - Low (display only)

## 2. Path Resolution (MEDIUM PRIORITY)

### Current State
- Path resolution logic in:
  - `PathService` - Basic path operations
  - `Environment.resolvePathReference()` - Variable path resolution
  - `PathValueResolver` - Import path resolution
  - `add` evaluator - URL detection
  - `import` evaluator - Module vs file detection
  - Multiple places checking `isURL()`, `isAbsolute()`, etc.

### Problems
- Inconsistent URL detection (`https://` vs regex vs URL constructor)
- Special paths (`~`, `@`, `.`) handled differently
- Module resolution (@author/name) mixed with file resolution
- No central place to add new path types

### Ideal Architecture
```typescript
// Path type detection
enum PathType {
  Absolute, Relative, Home, Module, URL, ProjectRoot, Special
}

// Single source of truth for path resolution
class PathResolver {
  static detectType(path: string): PathType { }
  static resolve(path: string, context: PathContext): ResolvedPath { }
  static isURL(path: string): boolean { }
  static isModule(path: string): boolean { }
  static normalize(path: string): string { }
}

// Resolved path with metadata
interface ResolvedPath {
  absolute: string;
  type: PathType;
  isRemote: boolean;
  security?: SecurityOptions;
  metadata?: Record<string, any>;
}
```

### Impact
- **Medium** - Affects imports, file operations
- **Effort** - Medium (2 days)
- **Risk** - Medium (core functionality)

## 3. Variable Resolution and Scoping (HIGH PRIORITY)

### Current State
- Variable resolution happens in:
  - `Environment.getVariable()` - Basic lookup
  - `resolveVariableValue()` - Value extraction
  - `interpolate()` - Template variable resolution
  - `exec-invocation` - Parameter resolution
  - `namespace` handling - Field access
  - Various evaluators - Direct access

### Problems
- No consistent variable lifecycle
- Lazy evaluation happens at different times
- Field access (`@var.field.subfield`) logic duplicated
- Namespace variables handled specially in multiple places
- No clear scoping rules for imports/modules

### Ideal Architecture
```typescript
// Variable resolution pipeline
class VariableResolver {
  static async resolve(
    reference: VariableReference,
    scope: VariableScope
  ): Promise<ResolvedVariable> {
    // 1. Scope resolution (local -> imported -> global)
    // 2. Lazy evaluation if needed
    // 3. Field access resolution
    // 4. Type checking
    // 5. Access control
  }
}

// Clear scope hierarchy
class VariableScope {
  constructor(
    private local: Map<string, Variable>,
    private imported: Map<string, Variable>,
    private parent?: VariableScope
  ) {}
  
  lookup(name: string): Variable | undefined {
    return this.local.get(name) 
        || this.imported.get(name) 
        || this.parent?.lookup(name);
  }
}
```

### Impact
- **High** - Core language feature
- **Effort** - High (3-4 days)
- **Risk** - High (could change semantics)

## 4. Command/Code Execution (MEDIUM PRIORITY)

### Current State
- Command execution in:
  - `Environment.executeCommand()` - Shell commands
  - `Environment.executeCode()` - JS/Node code
  - `CodeExecutionService` - JS evaluation
  - `NodeExecutor` - Node.js execution
  - `run` evaluator - Command parsing
  - `exe` evaluator - Executable definition

### Problems
- Shell escaping logic duplicated
- No consistent error handling
- Output capture varies by executor
- No unified way to add new languages
- Security controls scattered

### Ideal Architecture
```typescript
// Unified execution interface
interface Executor {
  canExecute(type: ExecutionType): boolean;
  execute(code: string, context: ExecutionContext): Promise<ExecutionResult>;
}

// Execution manager with plugins
class ExecutionManager {
  private executors = new Map<ExecutionType, Executor>();
  
  register(type: ExecutionType, executor: Executor) {
    this.executors.set(type, executor);
  }
  
  async execute(
    code: string,
    type: ExecutionType,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const executor = this.executors.get(type);
    if (!executor) throw new Error(`No executor for ${type}`);
    
    // Apply security policies
    // Set up environment
    // Execute with timeout
    // Capture output
    // Handle errors consistently
  }
}
```

### Impact
- **Medium** - Affects run/exe directives
- **Effort** - High (3-4 days)
- **Risk** - Medium (security implications)

## 5. Output Generation and Formatting (LOW PRIORITY)

### Current State
- Output handling in:
  - `Environment.addNode()` - AST nodes
  - `OutputBuilder` - Text accumulation
  - XML formatter - Special XML output
  - Markdown formatter - Prettier integration
  - Various evaluators - Direct output
  - Template interpolation - Inline output

### Problems
- No clear output pipeline
- Formatting happens at different stages
- Hard to add new output formats
- Markdown formatting issues (JSON protection hack)
- No streaming support

### Ideal Architecture
```typescript
// Output pipeline
interface OutputStage {
  process(content: OutputContent): OutputContent;
}

class OutputPipeline {
  constructor(private stages: OutputStage[]) {}
  
  async process(content: OutputContent): Promise<string> {
    let result = content;
    for (const stage of this.stages) {
      result = await stage.process(result);
    }
    return result.toString();
  }
}

// Pluggable formatters
const markdownPipeline = new OutputPipeline([
  new ASTFlattener(),
  new MarkdownFormatter(),
  new PrettierFormatter({ protectJSON: true })
]);
```

### Impact
- **Low** - Mostly internal
- **Effort** - Medium (2-3 days)
- **Risk** - Low (output only)

## 6. Import System and Module Resolution (HIGH PRIORITY)

### Current State
- Import handling in:
  - Multiple `ImportResolver` implementations
  - Registry/module resolution
  - File import logic
  - URL import logic
  - Namespace creation
  - Variable extraction

### Problems
- Each resolver duplicates similar logic
- No unified module system
- Namespace creation is ad-hoc
- Security controls scattered
- Cache implementation duplicated

### Ideal Architecture
```typescript
// Unified import system
interface ImportSource {
  canHandle(spec: ImportSpec): boolean;
  resolve(spec: ImportSpec): Promise<ImportedModule>;
}

class ImportSystem {
  private sources: ImportSource[] = [];
  private cache = new ModuleCache();
  
  async import(spec: ImportSpec): Promise<ImportedModule> {
    // Check cache
    // Find appropriate source
    // Apply security policies
    // Load and parse
    // Extract exports
    // Create namespace if needed
    // Cache result
  }
}
```

### Impact
- **High** - Core feature
- **Effort** - High (4-5 days)
- **Risk** - High (breaking changes possible)

## 7. AST Node Creation and Validation (MEDIUM PRIORITY)

### Current State
- AST nodes created:
  - By parser (main source)
  - Manually in evaluators (synthetic nodes)
  - In test utilities
  - During transformation

### Problems
- No validation when creating nodes manually
- Missing required fields cause runtime errors
- No type safety for node creation
- Location info often incorrect for synthetic nodes

### Ideal Architecture
```typescript
// AST node factory with validation
class ASTFactory {
  static createText(content: string, location?: Location): TextNode {
    return this.validate({
      type: 'Text',
      nodeId: this.generateId(),
      content,
      location: location || this.syntheticLocation()
    });
  }
  
  private static validate<T extends MlldNode>(node: T): T {
    // Validate required fields
    // Ensure valid structure
    // Add debug info if needed
    return node;
  }
}
```

### Impact
- **Medium** - Affects reliability
- **Effort** - Low (1-2 days)
- **Risk** - Low (additive)

## 8. Test Infrastructure (MEDIUM PRIORITY)

### Current State
- Test utilities scattered:
  - `MemoryFileSystem` in tests
  - Fixture generation scripts
  - Mock services in various tests
  - Different test helpers per test file

### Problems
- Lots of boilerplate in tests
- Inconsistent mocking strategies
- Hard to test specific scenarios
- No standard test environment

### Ideal Architecture
```typescript
// Test environment builder
class TestEnvironment {
  static create(): TestEnvironmentBuilder {
    return new TestEnvironmentBuilder();
  }
}

class TestEnvironmentBuilder {
  withFile(path: string, content: string): this { }
  withModule(name: string, exports: any): this { }
  withEnvVar(key: string, value: string): this { }
  withMockCommand(pattern: string, output: string): this { }
  
  build(): Environment { }
}

// Usage
const env = TestEnvironment.create()
  .withFile('/test.mld', '/var @x = "hello"')
  .withMockCommand('echo *', (args) => args.join(' '))
  .build();
```

### Impact
- **Medium** - Developer experience
- **Effort** - Medium (2-3 days)
- **Risk** - None (test only)

## Recommendations

### Immediate Priorities (Do First)
1. **AST Evaluation Consolidation** (already documented)
2. **Error Handling Consolidation** - High user impact, low risk
3. **Variable Resolution Pipeline** - Core feature, needs clarity

### Medium Term (Next Quarter)
4. **Path Resolution Unification** - Widespread impact
5. **Import System Refactor** - Complex but important
6. **Command Execution Pipeline** - Security and extensibility

### Long Term (As Needed)
7. **Output Pipeline** - Nice to have
8. **AST Factory** - Reliability improvement
9. **Test Infrastructure** - Developer productivity

## Implementation Strategy

For each refactoring:
1. **Document current state** (like this doc)
2. **Design ideal architecture**
3. **Create new abstraction** without integration
4. **Write comprehensive tests**
5. **Gradually migrate** existing code
6. **Remove old code** once stable
7. **Update documentation**

## Success Metrics

- **Code Reduction**: Aim for 30-40% less code overall
- **Bug Reduction**: Fewer edge cases and inconsistencies
- **Test Coverage**: Easier to test with clear abstractions
- **Development Speed**: New features easier to add
- **Maintainability**: Clear where to make changes

## Anti-Patterns to Avoid

1. **Big Bang Refactor** - Change everything at once
2. **Abstraction Astronaut** - Over-engineering
3. **Breaking Changes** - Unless absolutely necessary
4. **Performance Regression** - Profile before/after
5. **Lost Functionality** - Preserve all current behavior

## Conclusion

The mlld codebase has grown organically and now has several areas where consolidation would significantly improve maintainability and reliability. The patterns identified here are common in growing codebases - functionality gets implemented where needed, then later we see the patterns and can consolidate.

The key is to refactor strategically:
- High impact + Low risk = Do immediately
- High impact + High risk = Plan carefully
- Low impact + Low risk = Do when convenient
- Low impact + High risk = Don't do

Each refactoring should make the codebase simpler, not more complex.