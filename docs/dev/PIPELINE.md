# Pipeline Architecture in mlld

This guide consolidates the key implementation details of mlld's pipeline and flow control features: `foreach`, `@when`, and `with` clauses. These features work together to create powerful data processing pipelines.

## Overview

mlld's pipeline architecture consists of three complementary features:

1. **`foreach`** - Iteration and data transformation over arrays
2. **`@when`** - Conditional execution and branching logic
3. **`with` clauses** - Pipeline transformations and dependency management

Together, they enable complex data flows while maintaining mlld's declarative philosophy.

## Shared Architecture Patterns

### Two-Phase Processing

All three features follow the same two-phase approach:

1. **Parsing Phase**: Grammar rules create AST nodes with type-safe structures
2. **Evaluation Phase**: Interpreters process AST nodes lazily on demand

### Environment Management

All pipeline features use child environments with parent access:

```typescript
// Pipeline steps create child environments
const pipelineEnv = env.createChild();
// Set @INPUT for pipeline data
pipelineEnv.setVariable('INPUT', inputVar);
// Child can access parent variables
const result = await evaluate(node, pipelineEnv);
```

This enables access to variables and functions defined in parent scopes.

### Lazy Evaluation

Features are stored as complex variables and evaluated only when accessed:

```typescript
// foreach stores as complex data variable
@data results = foreach @command(@array)  // Not executed yet

// @when evaluates only when reached
@when @condition => @action              // Condition not checked until here

// with pipelines execute in sequence
@run [cmd] with { pipeline: [@t1, @t2] } // Transformers run on demand
```

### Error Context

All features preserve source location for precise error reporting:
- Parser attaches location to AST nodes
- Evaluators pass location through to errors
- Errors show exact position in source file

## Pipeline Operator Syntax

mlld supports two equivalent syntaxes for pipeline transformations:

### Shorthand Syntax
```mlld
@data result = @input | @transformer1 | @transformer2
@text output = @message | @upper | @trim
```

### Longhand Syntax  
```mlld
@data result = @input with { pipeline: [@transformer1, @transformer2] }
@text output = @message with { pipeline: [@upper, @trim] }
```

Both syntaxes produce identical AST structures and should behave identically.

### Grammar Implementation

The pipeline operator is parsed in `grammar/patterns/tail-modifiers.peggy`:

```peggy
PipelineShorthand
  = first:PipelineCommand rest:(HWS &{ 
      // Check if we're still on the same line
      const pos = peg$currPos;
      const beforePos = input.lastIndexOf('\n', pos - 1);
      const afterPos = input.indexOf('\n', pos);
      const hasNewlineBefore = beforePos >= 0 && !input.substring(beforePos + 1, pos).trim();
      return !hasNewlineBefore;
    } "|" HWS ref:PipelineCommand { return ref; })* {
      return [first, ...rest];
    }
```

**Critical**: The `"|" HWS` sequence must be present to capture multiple pipe operators. Without it, only the first transformer is parsed.

### Variable References with Pipelines

To support pipelines in assignment contexts, we use `VariableReferenceWithTail`:

```typescript
// AST structure for @data result = @msg | @upper
{
  type: 'VariableReferenceWithTail',
  variable: { identifier: 'msg' },
  withClause: {
    pipeline: [
      { identifier: [{ identifier: 'upper' }], args: [], fields: [] }
    ]
  }
}
```

This pattern is defined in `grammar/patterns/variables.peggy` and used by both `@data` and `@text` directives.

## Built-in Transformers

As of version 1.4.2, mlld includes built-in transformers that integrate seamlessly with the pipeline system.

### Architecture

**File**: `interpreter/builtin/transformers.ts`

Transformers are implemented as special executable variables with metadata:

```typescript
interface TransformerDefinition {
  name: string;              // lowercase alias
  uppercase: string;         // canonical UPPERCASE name
  description: string;       // for help/documentation
  implementation: (input: string) => Promise<string> | string;
}
```

### Registration

Built-in transformers are registered in the root Environment:

```typescript
// In Environment constructor
if (!parent) {
  this.initializeBuiltinTransformers();
}

// Creates both UPPERCASE and lowercase versions
// @XML and @xml both work identically
```

### Pipeline Integration

Transformers work as executable variables in pipelines:

```typescript
// Special handling in pipeline.ts
if (commandVar?.metadata?.isBuiltinTransformer) {
  const result = await commandVar.metadata.transformerImplementation(input);
  return String(result);
}
```

### Available Transformers

1. **@XML / @xml** - Uses llmxml for SCREAMING_SNAKE_CASE conversion
2. **@JSON / @json** - Pretty-prints JSON with 2-space indentation
3. **@CSV / @csv** - Converts JSON arrays to CSV format
4. **@MD / @md** - Formats markdown using prettier

### Error Context

All features provide detailed error messages with execution context:

```typescript
// foreach includes iteration details
"Error in foreach iteration 3 (topic: 'security', model: 'claude'): ..."

// @when includes modifier context
"MlldConditionError: Failed in 'all' modifier at condition 2..."

// with includes pipeline step
"Pipeline step 2 (@validate_json) failed: Invalid JSON"
```

## Integration Patterns

### Combining Features

The features are designed to work together seamlessly:

```meld
# Complex pipeline example
@data topics = ["security", "performance", "scalability"]
@data models = ["gpt-4", "claude"]

# Parameterized command with dependencies
@exec analyze(topic, model) = @run [
  python analyze.py --topic @topic --model @model
] with {
  needs: { "python": { "openai": ">=1.0.0", "anthropic": ">=0.5.0" } }
}

# Conditional iteration with pipeline
@data results = foreach @analyze(@topics, @models)

@when @results all: [
  @result => @text summary = @run [(echo "@result")] with {
    pipeline: [@extract_summary(@input), @format_markdown(@input)]
  }
]
```

### Shared Type System

All features use common type definitions:

```typescript
// Variable references used by all features
export interface VariableReference {
  type: 'VariableReference';
  identifier: string;
  fields?: FieldAccess[];
}

// Command references for foreach and with
export interface CommandReference {
  type: 'commandRef';
  identifier: string;
  fields?: FieldAccess[];
}

// Field access supports dot notation
export interface FieldAccess {
  type: 'field' | 'index';
  name?: string;
  value?: string | number;
}
```

## Data Flow Architecture

### Pipeline Execution Model

```
Input → foreach → @when → with pipeline → Output
         ↓          ↓           ↓
    Iteration   Branching  Transformation
```

1. **foreach** generates data streams
2. **@when** filters and routes data
3. **with pipelines** transform results

### Variable Binding Flow

Each feature introduces variables into child scopes:

```meld
# foreach binds iteration parameters
@exec process(item, index) = ...
@data results = foreach @process(@items, @indices)
# 'item' and 'index' are bound in process scope

# @when binds condition results
@when @check_status first: [
  @status => @add Status is @status  # 'status' bound here
]

# with pipeline binds @input
@run [cmd] with { pipeline: [@transform(@input)] }
# '@input' available in transform scope
```

## Implementation Components

### Grammar Organization

```
grammar/
├── directives/
│   ├── data.peggy      # foreach expressions
│   ├── when.peggy      # @when conditionals
│   └── run.peggy       # with clause extensions
└── patterns/
    ├── with-clause.peggy
    └── command-reference.peggy
```

### Interpreter Structure

```
interpreter/
├── eval/
│   ├── data-value-evaluator.ts  # foreach execution
│   ├── when.ts                  # conditional logic
│   ├── run.ts                   # with clause handling
│   └── lazy-eval.ts             # shared lazy evaluation
└── utils/
    ├── cartesian-product.ts     # foreach utilities
    └── dependency-validator.ts  # with clause deps
```

### Error Hierarchy

```
MlldError
├── MlldDirectiveError
│   ├── MlldConditionError     # @when failures
│   └── MlldWithClauseError    # with clause errors
│       ├── MlldDependencyError
│       └── MlldPipelineError
└── MlldIterationError         # foreach failures
```

## Performance Considerations

### Execution Strategies

1. **Sequential by Default**: Features execute in order, not parallel
2. **Short-Circuit Evaluation**: `@when first` and `any` stop early
3. **Lazy Loading**: Complex operations defer until needed
4. **Memory Limits**: Cartesian products capped at 10,000 combinations

### Optimization Opportunities

```typescript
// Future parallel execution
@data results = foreach @analyze(@topics, @models) with { parallel: 4 }

// Pipeline streaming for large data
@run [cat huge.json] with { 
  pipeline: [@stream_parse(@input), @stream_filter(@input)],
  streaming: true
}

// Conditional caching
@when @expensive_check => @cached_action with { cache: "1h" }
```

## Security Model

### Execution Isolation

- Child environments prevent variable pollution
- Command execution through controlled interfaces
- No direct code evaluation in conditions

### Validation Layers

1. **Grammar**: Syntax validation at parse time
2. **Type Checking**: Parameter/array count validation
3. **Runtime**: Dependency and security checks

## Best Practices

### Design Patterns

1. **Named Operations**: Define reusable commands with `@exec`
```meld
@exec validate_json(data) = @run [(jq . <<< "@data")]
@exec extract_field(data, field) = @run [(jq .@field <<< "@data")]
```

2. **Composable Pipelines**: Build complex flows from simple parts
```meld
@text result = @run [fetch_data] with {
  pipeline: [@validate_json(@input), @extract_field(@input, "users")]
}
```

3. **Error Boundaries**: Use @when for error handling
```meld
@when @risky_operation first: [
  @success => @add Operation succeeded: @success,
  true => @add Operation failed, using fallback
]
```

### Performance Guidelines

1. **Limit Cartesian Products**: Keep array combinations reasonable
2. **Pipeline Depth**: Avoid deeply nested transformations
3. **Early Termination**: Use empty output to stop pipelines

## Testing Strategy

### Fixture Organization

```
tests/cases/valid/
├── data/foreach-*/         # foreach iterations
├── when/*/                 # conditional logic
├── with/*/                 # pipeline tests
└── integration/*/          # combined features
```

### Test Patterns

1. **Isolated Feature Tests**: Test each feature independently
2. **Integration Tests**: Verify feature combinations
3. **Error Scenarios**: Validate error messages and context
4. **Performance Tests**: Check limits and optimizations

## Future Enhancements

### Planned Features

1. **Parallel Execution**: Multi-threaded foreach and pipelines
2. **Streaming Support**: Process large data without loading
3. **Advanced Conditionals**: Boolean operators in @when
4. **Pipeline Composition**: Reusable pipeline definitions

### Extension Points

Each feature provides clear extension points:

- **foreach**: Custom iterator types, streaming support
- **@when**: New condition types, else clauses
- **with**: Additional clause types, custom validators

## Implementation Checklist

When implementing new pipeline features:

1. **Grammar First**: Define AST structure and parsing rules
2. **Type Safety**: Create TypeScript interfaces and guards
3. **Environment Handling**: Use child environments for isolation
4. **Error Context**: Include execution details in errors
5. **Lazy Evaluation**: Defer expensive operations
6. **Test Coverage**: Add grammar, unit, and integration tests
7. **Documentation**: Update user guides and examples

## Summary

mlld's pipeline architecture provides a cohesive system for data processing through:

- **Iteration** with foreach for bulk operations
- **Branching** with @when for conditional flows  
- **Transformation** with pipelines for data processing
- **Validation** with dependency checking

These features share common patterns while maintaining distinct responsibilities, creating a powerful yet understandable system for building complex data pipelines in a declarative way.