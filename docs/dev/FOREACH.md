# Foreach Development Guide

This guide covers the technical implementation details for the `foreach` operator in mlld, which enables iteration over arrays with parameterized commands and templates.

## Overview

The `foreach` operator provides:
1. **Single Array Iteration**: Apply a parameterized command to each element
2. **Cartesian Product**: Generate all combinations from multiple arrays
3. **Type Safety**: Validate inputs and parameter matching
4. **Error Reporting**: Clear error messages with iteration context

## Implementation Status

✅ **Fully Implemented** - The foreach feature is complete and functional.

## Architecture

### Core Components

1. **Grammar**: `grammar/directives/data.peggy` - ForeachCommandExpression rules
2. **Types**: `core/types/data.ts` - TypeScript definitions  
3. **Evaluator**: `interpreter/eval/data-value-evaluator.ts` - Execution logic
4. **Utilities**: `interpreter/utils/cartesian-product.ts` - Array processing

### Data Flow

```
@data result = foreach @command(@arrays)
                  ↓
            Parse in grammar
                  ↓
         Create ForeachCommandExpression AST
                  ↓
         Store as complex data variable
                  ↓
         Lazy evaluation on first access
                  ↓
         Resolve arrays → Generate tuples → Execute command
```

## Grammar Implementation

### Core Grammar Rules

Located in `grammar/directives/data.peggy`:

```peggy
// Foreach command expression for iterating over arrays with parameterized commands
ForeachCommandExpression
  = "foreach" _ cmd:ForeachCommandRef _ "(" _ arrays:ForeachArrayArgumentList _ ")" {
      helpers.debug('ForeachCommandExpression matched', { cmd, arrays });
      
      return {
        type: "foreach-command",
        value: {
          type: 'foreach-command',
          command: cmd,
          arrays: arrays
        },
        rawText: text()
      };
    }

// Command reference for foreach expressions
ForeachCommandRef
  = "@" identifier:BaseIdentifier fields:AnyFieldAccess* {
      return {
        type: 'commandRef',
        identifier: identifier,
        fields: fields || []
      };
    }

// List of array arguments separated by commas
ForeachArrayArgumentList
  = first:ForeachVariableRef rest:(_ "," _ arr:ForeachVariableRef { return arr; })* {
      return [first].concat(rest || []);
    }

// Variable reference for array arguments
ForeachVariableRef
  = "@" identifier:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(identifier);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
```

### Integration Points

The `foreach` expression is integrated into the data value hierarchy:

```peggy
// In DataValue rule
DataValue
  = ForeachCommandExpression  // Highest priority
  / DirectiveValue
  / TemplateValue  
  / VariableReferenceValue
  / object:DataObjectLiteral
  // ... other value types
```

## Type System

### Core Types

Located in `core/types/data.ts`:

```typescript
/**
 * A foreach command expression for iterating over arrays with parameterized commands
 */
export interface ForeachCommandExpression {
  type: 'foreach-command';
  command: CommandReference;
  arrays: VariableReference[];
}

/**
 * Command reference for foreach expressions
 */
export interface CommandReference {
  type: 'commandRef';
  identifier: string;
  fields: FieldAccess[];
}

/**
 * Variable reference for foreach array arguments
 */
export interface VariableReference {
  type: 'VariableReference';
  nodeId: string;
  location: SourceLocation;
  valueType: string;
  identifier: string;
  fields?: FieldAccess[];
}

/**
 * Type guard for foreach command expressions
 */
export function isForeachCommandExpression(value: DataValue): value is ForeachCommandExpression {
  return typeof value === 'object' && 
         value !== null && 
         !Array.isArray(value) && 
         'type' in value && 
         value.type === 'foreach-command';
}
```

### Field Access Support

Foreach supports field access on both commands and array references:

```meld
@data results = foreach @utils.process(@data.items, @config.settings)
```

The `FieldAccess` interface handles dot notation and bracket notation:

```typescript
export interface FieldAccess {
  type: 'field' | 'index';
  name?: string;
  value?: string | number;
}
```

## Evaluation Logic

### Main Evaluator

Located in `interpreter/eval/data-value-evaluator.ts`:

```typescript
async function evaluateForeachCommand(
  foreachExpr: any,
  env: Environment
): Promise<any[]> {
  const { command, arrays } = foreachExpr.value || foreachExpr;
  
  // 1. Resolve the command variable
  const cmdVariable = env.getVariable(command.identifier);
  if (!cmdVariable) {
    throw new Error(`Command not found: ${command.identifier}`);
  }
  
  if (!isCommandVariable(cmdVariable) && cmdVariable.type !== 'textTemplate') {
    throw new Error(`Variable ${command.identifier} is not a command or text template. Got type: ${cmdVariable.type}`);
  }
  
  // 2. Evaluate all array arguments
  const evaluatedArrays: any[][] = [];
  for (let i = 0; i < arrays.length; i++) {
    const arrayVar = arrays[i];
    const arrayValue = await evaluateDataValue(arrayVar, env);
    
    if (!Array.isArray(arrayValue)) {
      throw new Error(`Argument ${i + 1} to foreach must be an array, got ${typeof arrayValue}`);
    }
    
    evaluatedArrays.push(arrayValue);
  }
  
  // 3. Validate array inputs and performance limits
  validateArrayInputs(evaluatedArrays);
  
  if (!isWithinPerformanceLimit(evaluatedArrays)) {
    const totalCombinations = evaluatedArrays.reduce((total, arr) => total * arr.length, 1);
    throw new Error(`Foreach operation would generate ${totalCombinations} combinations, which exceeds the performance limit. Consider reducing array sizes or using more specific filtering.`);
  }
  
  // 4. Check parameter count matches array count
  const paramCount = cmdVariable.value.paramNames?.length || cmdVariable.value.params?.length || 0;
  if (evaluatedArrays.length !== paramCount) {
    throw new Error(`Command ${command.identifier} expects ${paramCount} parameters, got ${evaluatedArrays.length} arrays`);
  }
  
  // 5. Generate cartesian product
  const tuples = cartesianProduct(evaluatedArrays);
  
  // 6. Execute command for each tuple
  const results: any[] = [];
  for (let i = 0; i < tuples.length; i++) {
    const tuple = tuples[i];
    
    try {
      // Create argument map for parameter substitution
      const argMap: Record<string, any> = {};
      const params = cmdVariable.value.paramNames || cmdVariable.value.params || [];
      params.forEach((param: string, index: number) => {
        argMap[param] = tuple[index];
      });
      
      // Invoke the parameterized command with arguments
      const result = await invokeParameterizedCommand(cmdVariable, argMap, env);
      results.push(result);
    } catch (error) {
      // Include iteration context in error message
      const params = cmdVariable.value.paramNames || cmdVariable.value.params || [];
      const iterationContext = params.map((param: string, index: number) => 
        `${param}: ${JSON.stringify(tuple[index])}`
      ).join(', ');
      
      throw new Error(
        `Error in foreach iteration ${i + 1} (${iterationContext}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  return results;
}
```

### Command Invocation

The `invokeParameterizedCommand` function handles different command types:

```typescript
async function invokeParameterizedCommand(
  cmdVariable: any,
  argMap: Record<string, any>,
  env: Environment
): Promise<any> {
  // Create a child environment with parameter bindings
  const childEnv = env.createChild();
  
  // Bind arguments to parameter names
  for (const [paramName, paramValue] of Object.entries(argMap)) {
    // Create appropriate variable type based on the parameter value
    if (typeof paramValue === 'string') {
      childEnv.setVariable(paramName, {
        type: 'text',
        name: paramName,
        value: paramValue,
        definedAt: null
      });
    } else {
      childEnv.setVariable(paramName, {
        type: 'data',
        name: paramName,
        value: paramValue,
        definedAt: null,
        isFullyEvaluated: true
      });
    }
  }
  
  const commandDef = cmdVariable.value;
  
  if (commandDef.type === 'command') {
    // Execute command template with bound parameters
    const command = await interpolate(commandDef.commandTemplate, childEnv);
    return await env.executeCommand(command);
  } else if (commandDef.type === 'code') {
    // Execute code template with bound parameters
    const code = await interpolate(commandDef.codeTemplate, childEnv);
    return await env.executeCode(code, commandDef.language);
  } else if (commandDef.type === 'textTemplate') {
    // Execute text template with bound parameters
    const text = await interpolate(commandDef.content, childEnv);
    return text;
  } else {
    throw new Error(`Unsupported command type: ${commandDef.type}`);
  }
}
```

## Cartesian Product Utilities

### Core Algorithm

Located in `interpreter/utils/cartesian-product.ts`:

```typescript
/**
 * Generates the cartesian product of multiple arrays
 */
export function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return arrays[0].map(item => [item]);
  
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  
  const result: T[][] = [];
  for (const firstItem of first) {
    for (const restTuple of restProduct) {
      result.push([firstItem, ...restTuple]);
    }
  }
  
  return result;
}

/**
 * Validates that all inputs are non-empty arrays
 */
export function validateArrayInputs(arrays: any[][]): void {
  for (let i = 0; i < arrays.length; i++) {
    const array = arrays[i];
    if (!Array.isArray(array)) {
      throw new Error(`Argument ${i + 1} is not an array`);
    }
    if (array.length === 0) {
      throw new Error(`Argument ${i + 1} is an empty array`);
    }
  }
}

/**
 * Checks if the cartesian product size is within performance limits
 */
export function isWithinPerformanceLimit(arrays: any[][]): boolean {
  const PERFORMANCE_LIMIT = 10000; // Maximum combinations
  const totalCombinations = arrays.reduce((total, arr) => total * arr.length, 1);
  return totalCombinations <= PERFORMANCE_LIMIT;
}
```

### Performance Considerations

The cartesian product can grow exponentially:
- 2 arrays of 10 elements = 100 combinations
- 3 arrays of 10 elements = 1,000 combinations  
- 4 arrays of 10 elements = 10,000 combinations

The current limit is 10,000 combinations to prevent performance issues.

## Integration with Data System

### Lazy Evaluation

Foreach expressions are stored as complex data variables and evaluated lazily:

```typescript
// In interpreter/eval/data.ts
if (isComplex) {
  // Create a complex data variable that supports lazy evaluation
  const variable = createComplexDataVariable(varName, dataValue, {
    definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
  });
  env.setVariable(varName, variable);
}
```

### Validation

Early validation occurs during data directive processing:

```typescript
// Validate foreach expressions early to provide immediate feedback
if (dataValue && typeof dataValue === 'object' && dataValue.type === 'foreach-command') {
  await validateForeachExpression(dataValue, env);
}
```

The `validateForeachExpression` function checks:
1. Command exists and is parameterized
2. Parameter count matches array count
3. Arrays will be validated during lazy evaluation

## Error Handling

### Error Types

Foreach provides detailed error messages with context:

```typescript
// Parameter mismatch
`Command ${command.identifier} expects ${paramCount} parameters, got ${evaluatedArrays.length} arrays`

// Type validation
`Argument ${i + 1} to foreach must be an array, got ${typeof arrayValue}`

// Performance limits
`Foreach operation would generate ${totalCombinations} combinations, which exceeds the performance limit`

// Iteration failures
`Error in foreach iteration ${i + 1} (${iterationContext}): ${error.message}`
```

### Iteration Context

When individual iterations fail, the error includes parameter values:

```
Error in foreach iteration 3 (topic: "security", model: "claude"):
Command failed with exit code 1
```

## Testing Infrastructure

### Grammar Tests

Located in `grammar/tests/`:

```typescript
describe('Foreach Grammar', () => {
  test('parses single array foreach', () => {
    const input = '@data results = foreach @process(@items)';
    const ast = parseDataDirective(input);
    
    expect(ast.values.value).toMatchObject({
      type: 'foreach-command',
      value: {
        command: { identifier: 'process' },
        arrays: [{ identifier: 'items' }]
      }
    });
  });
  
  test('parses multiple array foreach', () => {
    const input = '@data results = foreach @test(@models, @prompts)';
    const ast = parseDataDirective(input);
    
    expect(ast.values.value.value.arrays).toHaveLength(2);
  });
});
```

### Integration Tests

Located in `tests/cases/valid/data/`:

```markdown
<!-- Example test case -->
@data topics = ["security", "performance"]
@exec analyze(topic) = @run [(echo "Analyzing @topic")]
@data results = foreach @analyze(@topics)
@add @results
```

```markdown
<!-- Expected output -->
Analyzing security
Analyzing performance
```

## Performance Optimizations

### Current Optimizations

1. **Lazy Evaluation**: Only executes when results are accessed
2. **Early Validation**: Validates structure before expensive operations
3. **Performance Limits**: Prevents excessive memory usage
4. **Efficient Cartesian Product**: Uses iterative algorithm

### Future Optimizations

1. **Parallel Execution**: Execute independent iterations concurrently
2. **Streaming Results**: Process large datasets without loading everything into memory
3. **Caching**: Cache results for identical parameter combinations
4. **Memory Limits**: Implement memory usage monitoring

## Extension Points

### Custom Command Types

The `invokeParameterizedCommand` function can be extended to support new command types:

```typescript
} else if (commandDef.type === 'customType') {
  // Handle custom command type
  return await executeCustomCommand(commandDef, childEnv);
} else {
```

### Additional Validation

The `validateForeachExpression` function can be extended with additional checks:

```typescript
// Check for recursive foreach calls
// Validate array element types
// Check for security constraints
```

### Integration with Other Features

Foreach integrates well with:
- **@when**: Conditional foreach execution
- **@import**: Foreach over imported data
- **With clauses** (planned): Pipeline processing of foreach results

## Debugging Support

### AST Explorer

Use the AST explorer to debug foreach parsing:

```bash
npm run ast -- '@data results = foreach @cmd(@arr)'
```

### Debug Logging

Enable debug logging in the grammar:

```peggy
helpers.debug('ForeachCommandExpression matched', { cmd, arrays });
```

### Error Tracing

The error messages include full context for debugging iteration failures.