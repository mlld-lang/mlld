# Complex Data Assignment - Interpreter Implementation Plan

## Overview
This plan outlines the interpreter and type system changes needed to support embedded directives in @data directives, to be implemented after the grammar work is complete.

## Prerequisites
- Grammar implementation complete (see COMPLEX-DATA-GRAMMAR-PLAN.md)
- AST structure follows the proposed format with DirectiveValue, VariableReferenceValue, and TemplateValue nodes

## Implementation Steps

### Phase 1: Type System Updates

#### Step 1.1: Define New Value Types
**File**: `/core/types/data.ts` (new file)

```typescript
// Value types that can appear in data structures
export type DataValue = 
  | LiteralValue
  | DirectiveValue
  | VariableReferenceValue
  | TemplateValue
  | ObjectValue
  | ArrayValue;

export interface LiteralValue {
  type: 'literal';
  value: string | number | boolean | null;
}

export interface DirectiveValue {
  type: 'directive';
  kind: 'run' | 'add';
  directive: DirectiveNode;
  evaluated?: boolean;
  result?: any;
  error?: Error;
}

export interface VariableReferenceValue {
  type: 'variableReference';
  reference: VariableReferenceNode;
}

export interface TemplateValue {
  type: 'template';
  content: ASTNode[];
}

export interface ObjectValue {
  type: 'object';
  properties: Record<string, DataValue>;
}

export interface ArrayValue {
  type: 'array';
  elements: DataValue[];
}
```

#### Step 1.2: Update Variable Types
**File**: `/core/types/variables.ts`

Add new variable type for complex data:

```typescript
export interface ComplexDataVariable {
  type: 'data';
  name: string;
  identifier: string;
  value: DataValue;  // Changed from JsonValue
  isFullyEvaluated: boolean;
  evaluationErrors?: Record<string, Error>;
}
```

### Phase 2: Data Evaluator Updates

#### Step 2.1: Create Data Value Parser
**File**: `/interpreter/eval/data-value-parser.ts` (new file)

```typescript
import type { DataValue } from '@core/types/data';

export function parseDataValue(node: ASTNode): DataValue {
  switch (node.type) {
    case 'DirectiveValue':
      return {
        type: 'directive',
        kind: node.kind,
        directive: node.directive,
        evaluated: false
      };
      
    case 'VariableReferenceValue':
      return {
        type: 'variableReference',
        reference: node.reference
      };
      
    case 'TemplateValue':
      return {
        type: 'template',
        content: node.content
      };
      
    case 'object':
      const properties: Record<string, DataValue> = {};
      for (const [key, value] of Object.entries(node.properties)) {
        properties[key] = parseDataValue(value);
      }
      return { type: 'object', properties };
      
    case 'array':
      return {
        type: 'array',
        elements: node.elements.map(parseDataValue)
      };
      
    default:
      // Literal value
      return { type: 'literal', value: node };
  }
}
```

#### Step 2.2: Create Data Value Evaluator
**File**: `/interpreter/eval/data-value-evaluator.ts` (new file)

```typescript
import type { DataValue } from '@core/types/data';
import type { Environment } from '../env/Environment';
import { evaluateDirective } from './directive';
import { interpolate } from '../core/interpreter';

export async function evaluateDataValue(
  value: DataValue,
  env: Environment
): Promise<any> {
  switch (value.type) {
    case 'literal':
      return value.value;
      
    case 'directive':
      // Check cache
      if (value.evaluated && !value.error) {
        return value.result;
      }
      
      try {
        // Evaluate the embedded directive
        const result = await evaluateDirective(value.directive, env);
        value.result = result.value;
        value.evaluated = true;
        return value.result;
      } catch (error) {
        value.error = error;
        value.evaluated = true;
        throw error;
      }
      
    case 'variableReference':
      // Resolve variable reference including field access
      const varName = value.reference.identifier;
      const variable = env.getVariable(varName);
      if (!variable) {
        throw new Error(`Variable not found: ${varName}`);
      }
      
      // Apply field access if present
      let result = variable.value;
      if (value.reference.fields) {
        for (const field of value.reference.fields) {
          result = accessField(result, field);
        }
      }
      return result;
      
    case 'template':
      // Interpolate template content
      return await interpolate(value.content, env);
      
    case 'object':
      // Recursively evaluate all properties
      const evaluatedObj: Record<string, any> = {};
      for (const [key, val] of Object.entries(value.properties)) {
        try {
          evaluatedObj[key] = await evaluateDataValue(val, env);
        } catch (error) {
          // Store error but continue evaluating other properties
          evaluatedObj[key] = { __error: error.message };
        }
      }
      return evaluatedObj;
      
    case 'array':
      // Evaluate all elements
      return Promise.all(
        value.elements.map(elem => evaluateDataValue(elem, env))
      );
      
    default:
      throw new Error(`Unknown data value type: ${(value as any).type}`);
  }
}
```

#### Step 2.3: Update Data Evaluator
**File**: `/interpreter/eval/data.ts`

Update the existing data evaluator to use the new parsing:

```typescript
import { parseDataValue } from './data-value-parser';
import { evaluateDataValue } from './data-value-evaluator';

export async function evaluateData(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const identifier = directive.raw?.identifier;
  if (!identifier) {
    throw new Error('Data directive missing identifier');
  }
  
  // Parse the value into our DataValue structure
  const rawValue = directive.values?.value;
  const dataValue = parseDataValue(rawValue);
  
  // Create the variable with unevaluated data
  const variable: ComplexDataVariable = {
    type: 'data',
    name: identifier,
    identifier,
    value: dataValue,
    isFullyEvaluated: false
  };
  
  env.setVariable(identifier, variable);
  
  // Return empty - data directives produce no output
  return { value: '', env };
}
```

### Phase 3: Variable Resolution Updates

#### Step 3.1: Update Variable Access
**File**: `/interpreter/core/interpreter.ts`

Update variable resolution to handle lazy evaluation:

```typescript
export async function resolveVariable(
  varName: string,
  env: Environment
): Promise<any> {
  const variable = env.getVariable(varName);
  if (!variable) {
    throw new Error(`Variable not found: ${varName}`);
  }
  
  // Handle complex data variables
  if (variable.type === 'data' && !isPrimitive(variable.value)) {
    const complexVar = variable as ComplexDataVariable;
    
    // Lazy evaluation - evaluate on first access
    if (!complexVar.isFullyEvaluated) {
      const evaluated = await evaluateDataValue(complexVar.value, env);
      // Update the variable with evaluated value
      env.updateVariable(varName, {
        ...complexVar,
        value: { type: 'literal', value: evaluated },
        isFullyEvaluated: true
      });
      return evaluated;
    }
  }
  
  return variable.value;
}
```

### Phase 4: Error Handling

#### Step 4.1: Create Specialized Errors
**File**: `/core/errors/DataEvaluationError.ts` (new file)

```typescript
export class DataEvaluationError extends MeldError {
  constructor(
    public dataPath: string,
    public originalError: Error
  ) {
    super(`Failed to evaluate data at ${dataPath}: ${originalError.message}`);
  }
}
```

#### Step 4.2: Add Error Recovery
Update evaluators to handle partial failures gracefully, storing error information in the data structure.

### Phase 5: Testing

#### Step 5.1: Unit Tests
**File**: `/interpreter/eval/data.test.ts`

Test each feature individually:
- Simple directive embedding
- Variable references with field access  
- Template interpolation
- Nested structures
- Error cases

#### Step 5.2: Integration Tests
**File**: `/tests/e2e/complex-data.test.ts`

Test complex scenarios:
- Multiple directives in one object
- Nested evaluations
- Circular dependency detection
- Performance with deep nesting

### Phase 6: Performance Optimization

#### Step 6.1: Add Memoization
Cache evaluation results to avoid re-executing directives.

#### Step 6.2: Add Depth Limits
Implement configurable depth limits to prevent stack overflow.

```typescript
const MAX_NESTING_DEPTH = 100;
```

### Phase 7: Documentation Updates

#### Step 7.1: Update Directive Documentation
**File**: `/docs/directives/data.md`

Add new sections:
- Complex Value Assignment
- Embedded Directives
- Lazy Evaluation
- Error Handling

#### Step 7.2: Add Examples
Create example files demonstrating the new features.

## Implementation Order

1. **Week 1**: Type system updates and basic parsing
2. **Week 2**: Evaluation logic and variable resolution
3. **Week 3**: Error handling and testing
4. **Week 4**: Performance optimization and documentation

## Testing Checklist

- [ ] Basic directive embedding works
- [ ] Variable references resolve correctly
- [ ] Templates interpolate properly
- [ ] Nested objects evaluate recursively
- [ ] Arrays with directives work
- [ ] Errors are handled gracefully
- [ ] Circular dependencies are detected
- [ ] Performance is acceptable
- [ ] Backward compatibility maintained

## Migration Guide

For users with existing @data directives:
1. No changes needed for literal values
2. Variables named "run" or "add" must be renamed
3. New features are opt-in

## Success Metrics

1. All test cases pass
2. No performance regression for simple data
3. Clear error messages for failures
4. Documentation is comprehensive
5. Feature works intuitively for users