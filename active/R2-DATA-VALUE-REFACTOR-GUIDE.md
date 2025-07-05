# Data Value Evaluation System Refactoring Guide

## Executive Summary

The `interpreter/eval/data-value-evaluator.ts` file (962 lines) is a complex monolithic evaluator that handles all data value processing in mlld's variable system. This guide provides a comprehensive analysis of its intricate evaluation logic and presents a detailed refactoring strategy to extract it into focused, maintainable modules while preserving the sophisticated data processing semantics and performance optimizations.

## Current Analysis

### File Structure Overview

**Size**: 962 lines  
**Primary Function**: `evaluateDataValue` - Universal data value evaluation entry point  
**Key Dependencies**: Environment, Variable type system, AST evaluation, Template interpolation

### Core Responsibilities Identified

1. **Main Evaluation Dispatch** (Lines 55-449)
   - `evaluateDataValue` - Universal entry point for all data value types
   - Type-based routing using discriminated union type guards
   - Recursive evaluation with caching and error handling
   - Complex AST node type detection and processing

2. **Evaluation State Management** (Lines 15-18, 49, 71-108)
   - Global evaluation cache with Map-based memoization
   - EvaluationState interface with depth tracking capability
   - Cache hit/miss logic with error state preservation
   - Recursive evaluation depth management (unused but defined)

3. **Primitive & Collection Processing** (Lines 60-62, 309-349)
   - Primitive value pass-through optimization
   - Object property recursive evaluation with error isolation
   - Array element evaluation with error isolation  
   - AST-to-runtime conversion via ASTEvaluator integration

4. **Variable Reference Resolution** (Lines 131-301)
   - VariableReference AST node processing
   - VariableReferenceWithTail pipeline integration
   - Field access resolution with complex metadata handling
   - Executable variable lazy evaluation semantics

5. **Foreach Command Evaluation** (Lines 517-717)
   - `evaluateForeachCommand` - Cartesian product iteration over arrays
   - Parameter binding and child environment management
   - Command invocation with parameterized execution
   - Performance limit validation and error context preservation

6. **Foreach Section Evaluation** (Lines 759-962)
   - `evaluateForeachSection` - File section extraction with iteration
   - Markdown section parsing with llmxml integration
   - Template application with variable binding
   - Complex path resolution and section name interpolation

7. **Template & Pipeline Integration** (Lines 304-306, 159-253, 378-444)
   - Template value interpolation delegation
   - Pipeline execution with format specification
   - ExecInvocation pipeline handling with JSON parsing
   - Complex result type preservation and conversion

## Critical Complexities and Dependencies

### 1. **Recursive Evaluation with Multi-Type Dispatch**
The main `evaluateDataValue` function uses a complex type-based dispatch system:
- **Type Guards**: Uses discriminated union type guards for routing
- **AST Node Handling**: Direct AST node type checking (`value.type === 'Text'`)
- **Recursive Processing**: Self-recursive calls for nested data structures
- **Error Isolation**: Individual property/element error handling

### 2. **Evaluation State and Caching System**
Complex caching mechanism for performance optimization:
- **Global Cache**: Module-level Map for directive evaluation results
- **Cache Key Strategy**: Direct object reference as cache key
- **Error State Caching**: Preservation of both success and error states
- **Depth Tracking**: Unused depth tracking infrastructure (potential future use)

### 3. **Foreach Evaluation Complexity**
Sophisticated iteration logic with multiple variants:

**Foreach Commands** (Lines 517-717):
- **Cartesian Product**: Multi-array iteration with performance limits
- **Parameter Binding**: Dynamic variable creation in child environments
- **Command Types**: Support for template, command, and code executables
- **Error Context**: Rich error reporting with iteration context

**Foreach Sections** (Lines 759-962):
- **File Operations**: Dynamic file reading and section extraction
- **Path Resolution**: Complex path interpolation with variable binding
- **Section Parsing**: llmxml integration with fallback extraction
- **Template Application**: Header replacement and content manipulation

### 4. **Variable Type System Integration**
Deep integration with mlld's variable type system:
- **Type Guards**: Extensive use of `isExecutable`, `isTextLike`, `isObject`, etc.
- **Variable Resolution**: Complex `resolveVariableValue` integration
- **Field Access**: Nested field access with metadata-driven evaluation
- **Parameter Variables**: Child environment parameter binding patterns

### 5. **Pipeline and Command Integration**
Complex integration with pipeline and command execution:
- **Pipeline Processing**: Dynamic pipeline import and execution
- **Format Specification**: Pipeline format hint processing
- **Result Conversion**: JSON parsing for type preservation
- **ExecInvocation Handling**: Full command execution with pipeline support

### 6. **Circular Dependencies via Dynamic Imports**
Strategic use of dynamic imports to avoid circular dependencies:
```typescript
const { evaluateExecInvocation } = await import('./exec-invocation');
const { executePipeline } = await import('../eval/pipeline');
const { ASTEvaluator } = await import('../core/ast-evaluator');
```

## Proposed Refactoring Architecture

### Target Module Structure

```
interpreter/eval/data-values/
├── DataValueEvaluator.ts           # Main coordination & dispatch (~150 lines)
├── EvaluationStateManager.ts       # Caching & state management (~100 lines)
├── PrimitiveEvaluator.ts          # Primitive & simple value processing (~120 lines)
├── CollectionEvaluator.ts         # Object & array evaluation (~180 lines)
├── VariableReferenceEvaluator.ts  # Variable resolution & field access (~200 lines)
├── ForeachCommandEvaluator.ts     # Foreach command iteration (~180 lines)
├── ForeachSectionEvaluator.ts     # Foreach section processing (~200 lines)
└── TemplateIntegrationEvaluator.ts # Template & pipeline processing (~120 lines)
```

### Module Breakdown and Responsibilities

#### 1. DataValueEvaluator.ts (Main Coordinator)
**Responsibility**: Entry point coordination and evaluation dispatch

```typescript
export class DataValueEvaluator {
  constructor(
    private stateManager: EvaluationStateManager,
    private primitiveEvaluator: PrimitiveEvaluator,
    private collectionEvaluator: CollectionEvaluator,
    private variableRefEvaluator: VariableReferenceEvaluator,
    private foreachCommandEvaluator: ForeachCommandEvaluator,
    private foreachSectionEvaluator: ForeachSectionEvaluator,
    private templateEvaluator: TemplateIntegrationEvaluator
  ) {}

  async evaluateDataValue(value: DataValue, env: Environment): Promise<any> {
    // 1. Check cache via state manager
    // 2. Route to appropriate evaluator based on type guards
    // 3. Handle top-level error cases and caching
    // 4. Return processed results
  }
}
```

**Key Methods**:
- `evaluateDataValue()` - Main entry point (replaces current function)
- `determineValueType()` - Type classification using type guards
- `routeToEvaluator()` - Dispatch to appropriate specialized evaluator
- `handleEvaluationError()` - Centralized error handling and context

#### 2. EvaluationStateManager.ts (Caching & State Management)
**Responsibility**: Evaluation caching and state tracking

```typescript
export class EvaluationStateManager {
  private evaluationCache = new Map<any, EvaluationState>();

  getCachedResult(value: any): CacheResult | null {
    // Handle cache lookup with error state checking
  }

  setCachedResult(value: any, result: any, error?: Error): void {
    // Cache both successful results and error states
  }
}

interface EvaluationState {
  evaluated: boolean;
  result?: any;
  error?: Error;
  depth?: number;
  maxDepth?: number;
}

interface CacheResult {
  hit: boolean;
  result?: any;
  error?: Error;
}
```

**Key Methods**:
- `getCachedResult()` - Cache lookup with type safety
- `setCachedResult()` - Cache storage with error handling
- `clearCache()` - Cache invalidation utilities
- `getCacheStats()` - Cache performance monitoring

**Complex Areas**:
- **Cache Key Strategy**: Object reference-based caching
- **Error State Preservation**: Caching both success and failure states
- **Memory Management**: Cache cleanup and size management

#### 3. PrimitiveEvaluator.ts (Primitive & Simple Value Processing)
**Responsibility**: Processing of primitive values and simple AST nodes

```typescript
export class PrimitiveEvaluator {
  async evaluatePrimitive(value: DataValue, env: Environment): Promise<any> {
    // Handle primitives, Text nodes, and simple directives
  }
}
```

**Key Methods**:
- `evaluatePrimitive()` - Primitive value processing
- `evaluateTextNode()` - Text AST node handling
- `evaluateDirectiveValue()` - Embedded directive evaluation
- `handleChildEnvironment()` - Child environment creation for directives

**Complex Areas**:
- **Type Guard Integration**: `isPrimitiveValue` usage
- **Text Node Processing**: `value.type === 'Text'` handling
- **Directive Evaluation**: Child environment management for embedded directives

#### 4. CollectionEvaluator.ts (Object & Array Evaluation)
**Responsibility**: Recursive evaluation of objects and arrays

```typescript
export class CollectionEvaluator {
  constructor(private dataValueEvaluator: DataValueEvaluator) {}

  async evaluateObject(value: DataObjectValue, env: Environment): Promise<Record<string, any>> {
    // Recursive object property evaluation with error isolation
  }

  async evaluateArray(value: DataArrayValue, env: Environment): Promise<any[]> {
    // Recursive array element evaluation with error isolation
  }
}
```

**Key Methods**:
- `evaluateObject()` - Object property recursive evaluation
- `evaluateArray()` - Array element recursive evaluation
- `isolatePropertyError()` - Error isolation for individual properties
- `convertToRuntime()` - AST-to-runtime conversion integration

**Complex Areas**:
- **Error Isolation**: Individual property/element error handling
- **Recursive Evaluation**: Self-referential evaluation calls
- **ASTEvaluator Integration**: Runtime conversion for arrays

#### 5. VariableReferenceEvaluator.ts (Variable Resolution & Field Access)
**Responsibility**: Variable reference resolution and field access processing

```typescript
export class VariableReferenceEvaluator {
  async evaluateVariableReference(
    value: VariableReferenceValue, 
    env: Environment
  ): Promise<any> {
    // Handle variable resolution, field access, and pipeline integration
  }

  async evaluateVariableWithTail(
    value: VariableReferenceWithTail, 
    env: Environment
  ): Promise<any> {
    // Handle complex variable references with pipelines
  }
}
```

**Key Methods**:
- `evaluateVariableReference()` - Simple variable reference handling
- `evaluateVariableWithTail()` - Complex variable references with pipelines
- `resolveVariableValue()` - Variable value extraction using type guards
- `applyFieldAccess()` - Field access with metadata handling
- `executePipeline()` - Pipeline integration for variable references

**Complex Areas**:
- **Variable Type Integration**: Extensive use of variable type guards
- **Field Access Logic**: Complex metadata-driven evaluation
- **Pipeline Processing**: Dynamic pipeline import and execution
- **Executable Handling**: Lazy evaluation semantics for executable variables

#### 6. ForeachCommandEvaluator.ts (Foreach Command Iteration)
**Responsibility**: Foreach command evaluation with cartesian product iteration

```typescript
export class ForeachCommandEvaluator {
  async evaluateForeachCommand(
    foreachExpr: any, 
    env: Environment
  ): Promise<any[]> {
    // Handle cartesian product iteration with parameterized commands
  }
}
```

**Key Methods**:
- `evaluateForeachCommand()` - Main foreach command processing
- `validateForeachExpression()` - Early validation without execution
- `generateCartesianProduct()` - Multi-array iteration logic
- `invokeParameterizedCommand()` - Command execution with parameter binding
- `validatePerformanceLimits()` - Performance limit checking

**Complex Areas**:
- **Cartesian Product**: Multi-array iteration with performance limits
- **Parameter Binding**: Dynamic variable creation in child environments
- **Command Type Support**: Template, command, and code executable handling
- **Error Context**: Rich error reporting with iteration context

#### 7. ForeachSectionEvaluator.ts (Foreach Section Processing)
**Responsibility**: Foreach section evaluation with file operations

```typescript
export class ForeachSectionEvaluator {
  async evaluateForeachSection(
    foreachExpr: any, 
    env: Environment
  ): Promise<any[]> {
    // Handle file section extraction with iteration
  }
}
```

**Key Methods**:
- `evaluateForeachSection()` - Main foreach section processing
- `extractFileSection()` - File reading and section extraction
- `applyTemplate()` - Template application with variable binding
- `processPathResolution()` - Complex path interpolation
- `handleSectionParsing()` - llmxml integration with fallback

**Complex Areas**:
- **File Operations**: Dynamic file reading and path resolution
- **Section Extraction**: llmxml integration with markdown parsing
- **Template Application**: Header replacement and content manipulation
- **Variable Binding**: Complex child environment management

#### 8. TemplateIntegrationEvaluator.ts (Template & Pipeline Processing)
**Responsibility**: Template evaluation and pipeline integration

```typescript
export class TemplateIntegrationEvaluator {
  async evaluateTemplate(value: TemplateValue, env: Environment): Promise<string> {
    // Handle template interpolation delegation
  }

  async evaluateExecInvocation(
    value: ExecInvocationValue, 
    env: Environment
  ): Promise<any> {
    // Handle command execution with pipeline support
  }
}
```

**Key Methods**:
- `evaluateTemplate()` - Template value interpolation
- `evaluateExecInvocation()` - Command execution with pipeline integration
- `executePipeline()` - Pipeline processing with format specification
- `handleResultConversion()` - JSON parsing and type preservation

**Complex Areas**:
- **Pipeline Integration**: Dynamic pipeline import and execution
- **Format Processing**: Pipeline format hint handling
- **Result Conversion**: JSON parsing for type preservation
- **Dynamic Imports**: Circular dependency avoidance

## Implementation Strategy

### Phase 1: Extract State Management (Low Risk)
**Target**: EvaluationStateManager.ts  
**Timeline**: 0.5 days

1. Extract evaluation cache and state management logic
2. Create clear caching interface with type safety
3. Update main evaluator to use new state manager
4. Test cache behavior and performance

**Benefits**:
- Isolated caching logic for better testing
- Clear cache management interface
- Better memory management capabilities

### Phase 2: Extract Primitive Processing (Low Risk)
**Target**: PrimitiveEvaluator.ts  
**Timeline**: 0.5 days

1. Extract primitive value and Text node processing
2. Move directive evaluation with child environment logic
3. Create simple, focused evaluator interface
4. Test primitive value processing

**Benefits**:
- Clear separation of simple vs complex evaluation
- Better testing of primitive value handling
- Reduced complexity in main evaluator

### Phase 3: Extract Collection Processing (Medium Risk)
**Target**: CollectionEvaluator.ts  
**Timeline**: 1 day

1. Extract object and array recursive evaluation logic
2. Preserve error isolation patterns
3. Integrate with main evaluator via dependency injection
4. Test recursive evaluation scenarios

**Benefits**:
- Isolated collection processing logic
- Better error handling testing
- Clearer recursive evaluation patterns

### Phase 4: Extract Variable Reference Processing (Medium-High Risk)
**Target**: VariableReferenceEvaluator.ts  
**Timeline**: 1.5 days

1. Extract variable reference resolution logic
2. Move field access and pipeline integration
3. Preserve complex metadata handling
4. Test variable type integration

**Benefits**:
- Centralized variable reference handling
- Better pipeline integration testing
- Clearer variable type system integration

### Phase 5: Extract Foreach Evaluators (Medium Risk)
**Target**: ForeachCommandEvaluator.ts & ForeachSectionEvaluator.ts  
**Timeline**: 2 days

1. Extract foreach command evaluation logic
2. Extract foreach section evaluation logic
3. Preserve cartesian product and file operation complexity
4. Test iteration scenarios and performance limits

**Benefits**:
- Isolated foreach complexity
- Better testing of iteration logic
- Clearer separation of foreach variants

### Phase 6: Extract Template Integration (Medium Risk)
**Target**: TemplateIntegrationEvaluator.ts  
**Timeline**: 1 day

1. Extract template and pipeline processing
2. Move ExecInvocation handling
3. Preserve dynamic import patterns
4. Test template and pipeline integration

**Benefits**:
- Centralized template processing
- Better pipeline integration testing
- Clearer command execution handling

### Phase 7: Create Main Coordinator (Low Risk)
**Target**: DataValueEvaluator.ts  
**Timeline**: 0.5 days

1. Create main coordinator with dependency injection
2. Implement type-based routing logic
3. Move error handling to coordinator
4. Update main entry point

**Benefits**:
- Clear separation of coordination vs implementation
- Better error handling and context
- Easier to add new data value types

## Critical Implementation Details

### 1. **Interface Design Principles**

**Clear Type-Based Routing**:
```typescript
// Each evaluator handles specific data value types
interface PrimitiveEvaluator {
  canHandle(value: DataValue): boolean;
  evaluate(value: DataValue, env: Environment): Promise<any>;
}

interface CollectionEvaluator {
  canHandle(value: DataValue): boolean;
  evaluate(value: DataValue, env: Environment): Promise<any>;
}
```

**Dependency Injection Pattern**:
```typescript
// Clear dependency relationships without circular imports
export class DataValueEvaluator {
  constructor(
    private stateManager: EvaluationStateManager,
    private primitiveEvaluator: PrimitiveEvaluator,
    // ... other evaluators
  ) {}
}
```

### 2. **Preserving Complex Logic**

**Critical Areas to Preserve Exactly**:

1. **Type Guard Usage** (Lines 60, 70, 256, 304):
   ```typescript
   // Must preserve exact type guard integration
   if (isPrimitiveValue(value)) return value;
   if (isDirectiveValue(value)) { /* complex caching logic */ }
   ```

2. **Evaluation Cache Logic** (Lines 71-108):
   ```typescript
   // Must preserve exact caching behavior and error state handling
   const cached = evaluationCache.get(value);
   if (cached?.evaluated && !cached.error) return cached.result;
   ```

3. **Foreach Cartesian Product** (Lines 561-612):
   ```typescript
   // Must preserve exact performance limit checking and iteration logic
   if (!isWithinPerformanceLimit(evaluatedArrays)) { /* error handling */ }
   const tuples = cartesianProduct(evaluatedArrays);
   ```

4. **Pipeline Integration** (Lines 206-239, 384-427):
   ```typescript
   // Must preserve exact pipeline execution and result conversion
   const pipelineResult = await executePipeline(stringResult, pipeline, env, undefined, format);
   ```

### 3. **Circular Dependency Management**

**Preserve Dynamic Import Pattern**:
```typescript
// Current pattern for avoiding circular dependencies
const { evaluateExecInvocation } = await import('./exec-invocation');
const { executePipeline } = await import('../eval/pipeline');
const { ASTEvaluator } = await import('../core/ast-evaluator');
```

**Alternative Dependency Injection**:
```typescript
// New pattern using dependency injection
export class VariableReferenceEvaluator {
  constructor(
    private execInvocationEvaluator: ExecInvocationEvaluator,
    private pipelineExecutor: PipelineExecutor
  ) {}
}
```

### 4. **Error Handling Strategy**

**Preserve Error Isolation**:
```typescript
// Current error isolation for collections
try {
  evaluatedObj[key] = await evaluateDataValue(propValue, env);
} catch (error) {
  evaluatedObj[key] = {
    __error: true,
    __message: error instanceof Error ? error.message : String(error),
    __property: key
  };
}
```

**Enhanced Error Context**:
```typescript
// New error handling with component context
class DataValueEvaluationError extends Error {
  constructor(
    public valueType: string,
    public evaluator: string,
    message: string,
    public originalError?: Error
  ) {
    super(`DataValue evaluation failed in ${evaluator} for ${valueType}: ${message}`);
  }
}
```

### 5. **Performance Considerations**

**Maintain Cache Efficiency**:
- Preserve object reference-based cache keys
- Keep cache hit/miss performance characteristics
- Maintain error state caching for failed evaluations

**Preserve Performance Limits**:
- Keep cartesian product performance validation
- Maintain foreach iteration limits
- Preserve early termination logic

## Risk Mitigation

### High-Risk Areas

1. **Recursive Evaluation Logic**
   - **Risk**: Breaking recursive evaluation patterns
   - **Mitigation**: Preserve exact self-recursive call patterns
   - **Validation**: Test deeply nested data structures

2. **Foreach Command Processing**
   - **Risk**: Breaking cartesian product iteration or parameter binding
   - **Mitigation**: Preserve exact iteration logic and child environment creation
   - **Validation**: Test complex foreach scenarios with multiple arrays

3. **Variable Type System Integration**
   - **Risk**: Breaking variable resolution or field access
   - **Mitigation**: Preserve exact type guard usage and `resolveVariableValue` calls
   - **Validation**: Test all variable types and field access patterns

4. **Pipeline Integration**
   - **Risk**: Breaking pipeline execution or result conversion
   - **Mitigation**: Preserve exact dynamic import patterns and pipeline calls
   - **Validation**: Test pipeline scenarios with format specifications

### Medium-Risk Areas

1. **Evaluation Cache**: Well-isolated caching logic
2. **Template Processing**: Clear delegation patterns
3. **Collection Evaluation**: Recursive but well-defined logic

### Low-Risk Areas

1. **Primitive Processing**: Simple pass-through logic
2. **State Management**: Isolated caching functionality
3. **Error Handling**: Additive improvements

## Success Metrics

### Quantitative Goals
- **Line count reduction**: 962 → ~1,250 lines across 8 focused modules
- **Function count reduction**: Eliminate 10+ complex nested functions
- **Test coverage**: Maintain 99%+ data evaluation test coverage
- **Performance**: No regression in evaluation performance

### Qualitative Goals
- **Single responsibility**: Each module handles one data value concern
- **Better error attribution**: Errors clearly identify failing evaluator
- **Improved testability**: Evaluators can be tested independently
- **Enhanced maintainability**: Easier to modify specific evaluation aspects

## Expected Benefits

### Development Experience
- **Easier debugging**: Failures isolated to specific evaluators
- **Better testing**: Unit tests for individual evaluation types
- **Clearer code navigation**: Find evaluation logic quickly
- **Safer modifications**: Changes isolated to specific responsibilities

### System Architecture
- **Better separation of concerns**: Clear evaluator boundaries
- **Improved error handling**: Better error context and attribution
- **Enhanced extensibility**: Easy to add new data value types
- **Cleaner interfaces**: Clear contracts between evaluators

### Long-term Maintainability
- **Reduced complexity**: Smaller, focused evaluators
- **Better documentation**: Self-documenting through organization
- **Easier onboarding**: Clear data evaluation architecture
- **Future-proof design**: Easy to extend for new data value requirements

## Conclusion

The data value evaluation system refactoring represents a high-value architectural improvement that addresses one of mlld's most complex evaluation components. By carefully extracting the monolithic data-value-evaluator.ts into focused evaluators while preserving the sophisticated evaluation semantics, caching mechanisms, and performance optimizations, this refactoring will significantly improve the maintainability and extensibility of mlld's data processing system.

The phased approach ensures manageable risk while delivering incremental value, and the focus on preserving complex logic ensures that the sophisticated data evaluation behavior that users depend on remains intact.

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "1", "content": "Read and analyze data-value-evaluator.ts file structure and responsibilities", "status": "completed", "priority": "high"}, {"id": "2", "content": "Examine evaluation state management and caching mechanisms", "status": "completed", "priority": "high"}, {"id": "3", "content": "Identify primitive vs collection evaluation complexity", "status": "completed", "priority": "high"}, {"id": "4", "content": "Map template and interpolation processing patterns", "status": "completed", "priority": "medium"}, {"id": "5", "content": "Document circular dependency and performance concerns", "status": "completed", "priority": "medium"}, {"id": "6", "content": "Create comprehensive data value refactoring guide", "status": "completed", "priority": "high"}]