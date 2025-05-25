# Complex Data Assignment Design

## Overview
Enable @data directives to contain embedded directives (@run, @add) and complex expressions as values within objects and arrays, allowing dynamic data structure creation.

## Design Goals
1. Allow directive results as values in data structures
2. Support both quoted and unquoted object keys (JSON5-style)
3. Support templates and variable references
4. Maintain backward compatibility
5. Clear differentiation between variables and directives

## Proposed Syntax

### Basic Examples
```meld
@data complexResults = {
  testresults: @run [npm test],
  readme: @add [@docs/README.md]
}

@data complexResults = {
  "testresults": @run [npm test],
  "readme": @add [@docs/README.md]
}
```

### Full Feature Set
```meld
@data mycomplexResults = {
  # Direct variable reference
  "docspath": @docs,
  
  # Template invocation
  "sometemplate": @add @myTemplate(@arg1, @arg2),
  
  # Run command invocation
  "output": @run @someCommand(@arg1, @arg2, @arg3),
  
  # Inline template
  "template": [[some template using a previously set {{variable}}]],
  
  # Multiline template
  "multilinetemplate": [[
    some multiline template 
    also using a previously set {{variable}}
  ]],
  
  # Field access
  "anotherdatavarfield": @datavar.field[0],
  
  # Nested objects with directives
  "nested": {
    "info": @run [git status],
    "count": @items.length
  },
  
  # Arrays with directives
  "results": [@run [test1], @run [test2], @run [test3]]
}
```

## Allowed Value Types

### In Objects and Arrays
1. **Literals**: strings, numbers, booleans, null
2. **Variable References**: `@varname`, `@varname.field[0]`
3. **Directives**: 
   - `@run [command]` or `@run @execVar(args)`
   - `@add [path]` or `@add @templateVar(args)` or `@add [[template]]`
4. **Templates**: `[[template content with {{vars}}]]`
5. **Nested structures**: objects and arrays containing any of the above

### Reserved Keywords
To avoid ambiguity, `@run` and `@add` become reserved keywords that cannot be used as variable names.

## AST Structure Design

### Current Structure
```json
{
  "type": "Directive",
  "kind": "data",
  "values": {
    "identifier": [...],
    "value": {
      "type": "object",
      "properties": {
        "key": "simple value"
      }
    }
  }
}
```

### Proposed Structure
```json
{
  "type": "Directive", 
  "kind": "data",
  "values": {
    "identifier": [...],
    "value": {
      "type": "object",
      "properties": {
        "key1": "simple value",
        "key2": {
          "type": "directive",
          "directive": {
            "type": "Directive",
            "kind": "run",
            "subtype": "runCommand",
            // ... full directive node
          }
        },
        "key3": {
          "type": "template",
          "content": [
            // ... template nodes
          ]
        },
        "key4": {
          "type": "variable",
          "reference": {
            "type": "VariableReference",
            // ... variable reference node
          }
        }
      }
    }
  }
}
```

### Value Wrapper Types
Each non-literal value needs a wrapper to indicate its type:
- `{ type: "literal", value: any }` - for simple values (could be implicit)
- `{ type: "directive", directive: DirectiveNode }` - for embedded directives
- `{ type: "variable", reference: VariableReferenceNode }` - for variable references
- `{ type: "template", content: Node[] }` - for inline templates

## Type System Changes

### Current Types
```typescript
interface DataVariable {
  type: 'data';
  name: string;
  value: JsonValue; // string | number | boolean | null | object | array
}
```

### Proposed Types
```typescript
// Value types that can appear in data structures
type DataValue = 
  | JsonValue                    // Simple literals
  | DirectiveValue              // Embedded directive
  | VariableReferenceValue      // Variable reference
  | TemplateValue              // Inline template
  | ObjectValue                // Object with DataValue properties
  | ArrayValue;                // Array of DataValue items

interface DirectiveValue {
  type: 'directive';
  directive: DirectiveNode;
  evaluated?: boolean;        // Track if directive has been evaluated
  result?: any;              // Cache the result after evaluation
}

interface VariableReferenceValue {
  type: 'variable';
  reference: VariableReferenceNode;
}

interface TemplateValue {
  type: 'template';
  content: Node[];
}

interface ObjectValue {
  type: 'object';
  properties: Record<string, DataValue>;
}

interface ArrayValue {
  type: 'array';
  elements: DataValue[];
}

// Updated DataVariable
interface DataVariable {
  type: 'data';
  name: string;
  value: DataValue;
  isFullyEvaluated: boolean;  // Track if all embedded directives are resolved
}
```

## Interpreter Implementation Strategy

### Evaluation Process
1. **Parse Phase**: Grammar creates AST with embedded directives
2. **First Pass**: Store data variable with unevaluated directives
3. **Resolution Phase**: When data is accessed, recursively evaluate embedded directives
4. **Caching**: Store evaluated results to avoid re-execution

### Lazy vs Eager Evaluation
**Recommendation**: Lazy evaluation
- Directives are only executed when the data is accessed
- Avoids unnecessary command execution
- Allows circular dependencies to work in some cases
- More predictable performance

### Evaluation Algorithm
```typescript
function evaluateDataValue(value: DataValue, env: Environment): any {
  switch (value.type) {
    case 'directive':
      if (value.evaluated) return value.result;
      value.result = await evaluateDirective(value.directive, env);
      value.evaluated = true;
      return value.result;
      
    case 'variable':
      return resolveVariableReference(value.reference, env);
      
    case 'template':
      return interpolate(value.content, env);
      
    case 'object':
      const result = {};
      for (const [key, val] of Object.entries(value.properties)) {
        result[key] = await evaluateDataValue(val, env);
      }
      return result;
      
    case 'array':
      return Promise.all(value.elements.map(el => evaluateDataValue(el, env)));
      
    default:
      return value; // literal
  }
}
```

## Grammar Implementation Requirements

### Parser Changes Needed
1. **Object/Array Value Rules**: Extend to recognize directive syntax
2. **Keyword Reservation**: Add @run and @add to reserved words
3. **Template Recognition**: Support [[...]] in value position
4. **Variable References**: Support @var syntax in value position
5. **Precedence Rules**: Ensure proper parsing order

### Grammar Rules (Conceptual)
```peggy
DataValue
  = ObjectLiteral
  / ArrayLiteral  
  / DirectiveValue
  / TemplateValue
  / VariableReference
  / LiteralValue

DirectiveValue
  = "@run" _ expr:RunExpression { return { type: 'directive', directive: expr } }
  / "@add" _ expr:AddExpression { return { type: 'directive', directive: expr } }

ObjectValue
  = "{" _ props:ObjectProperties? _ "}" {
      return { type: 'object', properties: props || {} }
    }

ObjectProperty
  = key:PropertyKey _ ":" _ value:DataValue {
      return { key, value }
    }
```

## Error Handling

### Validation Errors
- Reserved keyword usage (@run/@add as variable names)
- Circular dependencies in directive evaluation
- Invalid directive syntax within data structures

### Runtime Errors
- Command execution failures
- File not found errors
- Template interpolation errors
- Variable resolution errors

### Error Recovery
- Partial evaluation: Continue evaluating other properties if one fails
- Error placeholders: Store error information in place of failed values
- Clear error messages indicating which property failed

## Backward Compatibility

### Breaking Changes
- @run and @add become reserved keywords
- Cannot have variables named "run" or "add" that are referenced with @ syntax

### Migration Path
1. Detect usage of @run/@add as variable names
2. Provide clear error messages
3. Suggest renaming variables (e.g., @runCommand, @addDirective)

## Implementation Phases

### Phase 1: Grammar Updates
1. Extend object/array value rules
2. Add directive recognition
3. Add test cases
4. Validate AST structure

### Phase 2: Type System
1. Define new type interfaces
2. Update DataVariable type
3. Update related types

### Phase 3: Interpreter
1. Implement lazy evaluation
2. Add directive execution in data context
3. Handle caching and memoization
4. Error handling

### Phase 4: Testing & Refinement
1. Comprehensive test suite
2. Performance testing
3. Error case handling
4. Documentation updates

## Open Questions

1. **Evaluation Timing**: Should we support explicit eager evaluation syntax?
2. **Async Handling**: How to handle async directives in synchronous contexts?
3. **Debugging**: Should we provide ways to inspect unevaluated vs evaluated state?
4. **Performance**: Should we limit nesting depth to prevent performance issues?

## Example Use Cases

### Configuration with Dynamic Values
```meld
@data config = {
  version: @run [git describe --tags],
  buildTime: @run [date -u +"%Y-%m-%dT%H:%M:%SZ"],
  environment: {
    nodeVersion: @run [node --version],
    npmVersion: @run [npm --version]
  }
}
```

### Document Assembly
```meld
@data document = {
  title: "Project Report",
  sections: {
    intro: @add [@docs/intro.md],
    metrics: @run @generateMetrics(),
    conclusion: [[
## Conclusion
This project achieved {{metrics.successRate}}% success rate.
    ]]
  }
}
```

### Test Results Collection
```meld
@data testResults = {
  unit: @run [npm run test:unit -- --json],
  integration: @run [npm run test:integration -- --json],
  summary: [[
Total tests: {{unit.total + integration.total}}
Passed: {{unit.passed + integration.passed}}
Failed: {{unit.failed + integration.failed}}
  ]]
}
```