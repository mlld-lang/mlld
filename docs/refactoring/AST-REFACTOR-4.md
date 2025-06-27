# AST Refactor Phase 4: Update Grammar

## Goal

Update the PEG grammar to produce consistent type information for all data values, as defined by the tests in Phase 3.

## Approach

Use semantic fork context to parse data values differently than regular mlld content. Within data context, parse JSON-like structures but allow mlld expressions.

## Key Grammar Changes

### 1. Create Data Context

```peggy
// Define semantic context for data parsing
DataContext = SemanticFork<"data">

// In var directive and similar contexts, switch to data mode
VarDirective = VarKeyword _ variable:VarIdentifier _ "=" _ value:DataValue {
  return {
    type: 'Directive',
    subtype: 'var',
    values: { variable, value },
    location: location()
  };
}
```

### 2. Data Value Rules

```peggy
// Entry point for data values
DataValue = DataContext (
    DataObject
  / DataArray
  / DataString
  / DataNumber
  / DataBoolean
  / DataNull
  / MlldDataExpression  // Variable refs, exec calls, etc.
)

// Primitive types with consistent structure
DataNumber = Number {
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

DataString = (DoubleQuotedString / SingleQuotedString) {
  return {
    type: 'string',
    value: extractStringContent($0),
    wrapperType: $0.wrapperType,
    location: location()
  };
}
```

### 3. Complex Types

```peggy
// Arrays with typed items
DataArray = "[" _ items:DataArrayItems? _ "]" {
  return {
    type: 'array',
    items: items || [],
    location: location()
  };
}

DataArrayItems = first:DataValue rest:(_ "," _ DataValue)* {
  return [first, ...rest.map(r => r[3])];
}

// Objects with typed properties
DataObject = "{" _ props:DataObjectProperties? _ "}" {
  return {
    type: 'object',
    properties: props || {},
    location: location()
  };
}

DataObjectProperties = first:DataObjectProperty rest:(_ "," _ DataObjectProperty)* {
  const properties = {};
  [first, ...rest.map(r => r[3])].forEach(prop => {
    properties[prop.key] = prop.value;
  });
  return properties;
}
```

### 4. Single-Line Constraint for Object Values

To handle mlld expressions in objects, enforce single-line values:

```peggy
DataObjectProperty = key:ObjectKey _ ":" _ value:DataValueSingleLine {
  return { key, value };
}

// Value must be on same line as key
DataValueSingleLine = &(!(Newline / ",")) value:DataValue {
  return value;
}
```

### 5. mlld Expressions in Data

```peggy
// These remain as AST nodes, not evaluated
MlldDataExpression = DataContext (
    VariableReference    // @var
  / ExecInvocation      // @func()
  / RunExpression       // run {cmd}
  / PathExpression      // [file.md]
  / TemplateExpression  // `template`
)

// Example: Variable reference stays as AST node
DataVariableReference = "@" id:Identifier fields:FieldAccess* {
  return {
    type: 'VariableReference',
    identifier: id,
    fields: fields,
    location: location()
  };
}
```

## Implementation Notes

1. **Backwards Compatibility**: Add feature flag to enable new grammar rules
2. **Error Messages**: Update parser error messages for data context
3. **Performance**: Benchmark parsing performance with new rules
4. **Edge Cases**: Handle nested data structures, escape sequences

## Testing

Use the test suite from Phase 3 to verify grammar output matches expectations.

## Next Steps

Once grammar is updated and tests pass, move to Phase 5 (ASTEvaluator becomes passthrough).