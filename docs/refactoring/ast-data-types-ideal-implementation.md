# AST Data Types: Ideal Implementation Plan

## Overview

This document outlines a comprehensive plan to fix the AST inconsistencies described in `ast-data-types-current-workarounds.md`. The goal is to have a consistent, typed representation for all data values in the mlld AST.

## Design Principles

1. **Every value has a type**: No more plain JS objects in the AST
2. **Consistent structure**: All nodes follow the same pattern
3. **Clear phase separation**: AST phase (typed nodes) vs Runtime phase (evaluated values)
4. **Preserve mlld expressiveness**: Support all current mlld-in-data features

## Target AST Structure

### Consistent Node Interface

```typescript
interface DataNode {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  location: SourceLocation;
  evaluated?: boolean;  // Track evaluation state
}

interface ObjectNode extends DataNode {
  type: 'object';
  properties: Record<string, ValueExpression>;
}

interface ArrayNode extends DataNode {
  type: 'array';
  items: ValueExpression[];
}

interface StringNode extends DataNode {
  type: 'string';
  value: string;
  wrapperType: 'singleQuote' | 'doubleQuote' | 'backtick' | 'doubleBracket';
}

interface NumberNode extends DataNode {
  type: 'number';
  value: number;
}

interface BooleanNode extends DataNode {
  type: 'boolean';
  value: boolean;
}

interface NullNode extends DataNode {
  type: 'null';
  value: null;
}

// Value expressions can be data nodes OR mlld expressions
type ValueExpression = 
  | DataNode
  | VariableReference
  | ExecInvocation
  | CommandExpression
  | PathExpression
  | TemplateExpression
  | SectionExpression;
```

### Example Transformations

#### Before (Current Inconsistent State)
```javascript
// Object in array - no type
{
  type: 'array',
  items: [
    {"name": "alice", "id": 1}  // Plain object
  ]
}
```

#### After (Consistent AST)
```javascript
{
  type: 'array',
  location: { line: 1, column: 12 },
  items: [
    {
      type: 'object',
      location: { line: 1, column: 13 },
      properties: {
        name: {
          type: 'string',
          location: { line: 1, column: 20 },
          value: 'alice',
          wrapperType: 'doubleQuote'
        },
        id: {
          type: 'number',
          location: { line: 1, column: 35 },
          value: 1
        }
      }
    }
  ]
}
```

## Implementation Phases

### Phase 1: Grammar Refactoring

#### 1.1 Create Data Context Rules

```peggy
// New semantic context for data values
DataContext = SemanticFork<"data">

// Entry point for data values
DataValue = DataContext (
    DataObject
  / DataArray
  / DataString
  / DataNumber
  / DataBoolean
  / DataNull
  / MlldExpression  // Variable refs, exec calls, etc.
)
```

#### 1.2 Wrap All Data Types

```peggy
DataObject = "{" __ props:DataProperties? __ "}" {
  return {
    type: 'object',
    properties: props || {},
    location: location()
  };
}

DataArray = "[" __ items:DataItems? __ "]" {
  return {
    type: 'array',
    items: items || [],
    location: location()
  };
}

DataString = (DoubleQuotedString / SingleQuotedString) {
  return {
    type: 'string',
    value: extractStringValue($0),
    wrapperType: $0.wrapperType,
    location: location()
  };
}

DataNumber = NumberLiteral {
  return {
    type: 'number',
    value: parseFloat(text()),
    location: location()
  };
}

DataBoolean = ("true" / "false") {
  return {
    type: 'boolean',
    value: text() === 'true',
    location: location()
  };
}

DataNull = "null" {
  return {
    type: 'null',
    value: null,
    location: location()
  };
}
```

#### 1.3 Handle mlld Expressions in Data

```peggy
// Within data context, these remain as AST nodes
MlldExpression = DataContext (
    VariableReference    // @var, @obj.field
  / ExecInvocation      // @exec(), @transform(@data)
  / CommandExpression   // run {echo "hello"}
  / PathExpression      // [file.md] or [file.md # section]
  / TemplateExpression  // `template @var` or [[template {{var}}]]
)

// Single-line constraint for object values
ObjectProperty = key:ObjectKey __ ":" __ value:DataValueSingleLine {
  return { key, value };
}

DataValueSingleLine = (!LineBreak DataValue) {
  return $1;
}
```

### Phase 2: Parser Infrastructure

#### 2.1 Update Type Definitions

```typescript
// grammar/types/data-nodes.ts
export enum DataNodeType {
  Object = 'object',
  Array = 'array',
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Null = 'null'
}

export interface BaseDataNode {
  type: DataNodeType;
  location: SourceLocation;
  evaluated?: boolean;
}
```

#### 2.2 Create Type Guards

```typescript
// core/types/guards.ts
export function isDataNode(node: any): node is DataNode {
  return node && 
         typeof node === 'object' && 
         'type' in node &&
         Object.values(DataNodeType).includes(node.type);
}

export function isObjectNode(node: any): node is ObjectNode {
  return isDataNode(node) && node.type === DataNodeType.Object;
}

// ... similar guards for other types
```

### Phase 3: Interpreter Refactoring

#### 3.1 Simplify Evaluation

```typescript
// interpreter/eval/data-evaluator.ts
export async function evaluateDataNode(
  node: DataNode | ValueExpression, 
  env: Environment
): Promise<any> {
  // No more checking if type exists!
  switch (node.type) {
    case 'object':
      return evaluateObjectNode(node as ObjectNode, env);
    case 'array':
      return evaluateArrayNode(node as ArrayNode, env);
    case 'string':
      return node.value;  // Already evaluated
    case 'number':
      return node.value;
    case 'boolean':
      return node.value;
    case 'null':
      return null;
    case 'VariableReference':
      return evaluateVariableReference(node, env);
    case 'ExecInvocation':
      return evaluateExecInvocation(node, env);
    // ... etc
  }
}
```

#### 3.2 Remove Workarounds

- Delete defensive type checking in `evaluateArrayItem`
- Remove special cases in JSON replacers
- Simplify `lazy-eval.ts` 
- Remove `hasComplexArrayItems` guessing

### Phase 4: Migration Strategy

#### 4.1 Compatibility Layer

```typescript
// Temporary during migration
export function normalizeDataValue(value: any): DataNode | ValueExpression {
  if (isDataNode(value)) return value;
  
  // Convert old format to new
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.map(normalizeDataValue),
      location: unknownLocation()
    };
  }
  
  if (typeof value === 'object' && value !== null) {
    return {
      type: 'object',
      properties: normalizeObjectProperties(value),
      location: unknownLocation()
    };
  }
  
  // ... handle other cases
}
```

#### 4.2 Incremental Updates

1. Add new grammar rules alongside old ones
2. Update evaluators to handle both formats
3. Migrate test fixtures incrementally
4. Remove old code paths once stable

### Phase 5: Testing & Validation

#### 5.1 Test Categories

1. **Unit tests** for each data type parser rule
2. **Integration tests** for mlld expressions in data
3. **Migration tests** comparing old vs new AST
4. **Performance tests** to ensure no regression
5. **Error message tests** for better diagnostics

#### 5.2 Fixture Migration

```bash
# Script to update fixtures with new AST format
scripts/migrate-data-fixtures.js
```

## Benefits of This Approach

### 1. Consistency
- Every value has a predictable structure
- No more defensive programming
- TypeScript can properly type-check

### 2. Better Error Messages
- Precise location information for all values
- Can point to exact character in nested structures
- Clear error context

### 3. Simpler Code
- Remove all workarounds and special cases
- Single evaluation path for all data
- Cleaner separation of concerns

### 4. Future Features
- Easier to add data validation
- Can implement schema checking
- Better IDE support possible

## Challenges & Solutions

### Challenge 1: Grammar Complexity
**Solution**: Use semantic forks and clear rule separation

### Challenge 2: Breaking Changes
**Solution**: Compatibility layer and incremental migration

### Challenge 3: Performance Impact
**Solution**: Lazy evaluation flags, optimize hot paths

### Challenge 4: Testing Burden
**Solution**: Automated fixture migration, comprehensive test suite

## Timeline Estimate

1. **Grammar Refactoring**: 2-3 weeks
2. **Parser Infrastructure**: 1 week
3. **Interpreter Refactoring**: 2-3 weeks
4. **Migration & Testing**: 2 weeks
5. **Documentation & Cleanup**: 1 week

**Total**: 8-10 weeks for complete implementation

## Success Criteria

1. All data values have consistent type information
2. No defensive type checking in evaluators
3. All existing tests pass
4. Performance within 10% of current
5. Improved error messages for data-related errors

## Next Steps

1. Get buy-in on the design
2. Create proof-of-concept for one data type
3. Set up migration infrastructure
4. Begin incremental implementation

## Related Documents

- `ast-data-types-current-workarounds.md` - Current state documentation
- `ast-evaluation-consolidation.md` - Related refactoring effort