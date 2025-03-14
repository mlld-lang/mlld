import { 
  MeldParseError, 
  MeldResolutionError,
  ErrorSeverity 
} from '@core/errors/index.js';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/syntax/helpers/index.js';

/**
 * Collection of atomic @data directive examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 */
export const atomic = {
  simpleObject: createExample(
    'Simple data object definition',
    `@data user = { "name": "Alice", "id": 123 }`
  ),
  
  primitiveNumber: createExample(
    'Data directive with primitive number',
    `@data count = 42`
  ),
  
  person: createExample(
    'Person object with nested address',
    `@data person = {
  name: "John Doe",
  age: 30,
  address: {
    street: "123 Main St",
    city: "Anytown"
  }
}`
  ),
  
  simpleArray: createExample(
    'Simple array definition',
    `@data fruits = ["apple", "banana", "cherry"]`
  ),
  
  index: createExample(
    'Numeric index for array access',
    `@data index = 1`
  ),
  
  complexObject: createExample(
    'Complex object with mixed types',
    `@data complex = {
  string: "text value",
  number: 42,
  boolean: true,
  array: [1, 2, 3],
  nested: {
    key: "value",
    list: ["a", "b", "c"]
  }
}`
  ),
  
  multidimensionalArray: createExample(
    'Multi-dimensional array',
    `@data matrix = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9]
]`
  ),
  
  arrayOfObjects: createExample(
    'Array of objects',
    `@data items = [
  { id: 1, name: "Item 1", tags: ["important", "new"] },
  { id: 2, name: "Item 2", tags: ["archived"] },
  { id: 3, name: "Item 3", tags: ["important", "featured"] }
]`
  ),
  
  objectWithSpecialTypes: createExample(
    'Object with special types',
    `@data special = {
  withNewlines: "Line 1\\nLine 2\\nLine 3",
  withQuotes: "Text with \\"quoted\\" content",
  withTabs: "Column 1\\tColumn 2\\tColumn 3",
  withHTML: "<div>Some <strong>HTML</strong> content</div>"
}`
  )
};

/**
 * Collection of combined @data directive examples
 * 
 * These examples demonstrate more complex data structures and combinations
 */
export const combinations = {
  nestedObject: combineExamples(
    'Complex nested data object',
    createExample(
      'Config with nested properties and arrays',
      `@data config = {
  "app": {
    "name": "Meld",
    "version": "1.0.0",
    "features": ["text", "data", "path"]
  },
  "env": "test"
}`
    )
  ),
  
  objectArray: combineExamples(
    'Array of objects with nested arrays',
    createExample(
      'Users array with nested hobbies arrays',
      `@data users = [
  { name: "Alice", hobbies: ["reading", "hiking"] },
  { name: "Bob", hobbies: ["gaming", "cooking"] }
]`
    )
  ),
  
  arrayAccess: combineExamples(
    'Array access examples with indexes',
    atomic.simpleArray,
    atomic.index,
    createExample(
      'Text referencing array elements',
      `@text selection = \`Selected fruit: {{fruits[index]}}\``
    )
  ),
  
  propertyAccess: combineExamples(
    'Object property access patterns',
    atomic.person,
    createExample(
      'Accessing simple properties',
      `@text name = \`Name: {{person.name}}\``
    ),
    createExample(
      'Accessing nested properties',
      `@text address = \`Address: {{person.address.street}}, {{person.address.city}}\``
    )
  ),
  
  complexPropertyAccess: combineExamples(
    'Complex property access patterns',
    atomic.complexObject,
    createExample(
      'Accessing various property types',
      `@text properties = \`
String: {{complex.string}}
Number: {{complex.number}}
Boolean: {{complex.boolean}}
Array: {{complex.array}}
Nested object: {{complex.nested}}
Nested property: {{complex.nested.key}}
Nested array: {{complex.nested.list}}
\``
    )
  ),
  
  arrayIndexAccess: combineExamples(
    'Array index access patterns',
    atomic.multidimensionalArray,
    createExample(
      'Accessing matrix elements',
      `@text matrixElements = \`
First element: {{matrix.0.0}}
Middle element: {{matrix.1.1}}
Last element: {{matrix.2.2}}
First row: {{matrix.0}}
Middle row: {{matrix.1}}
\``
    )
  ),
  
  complexArrayAccess: combineExamples(
    'Complex array access with objects',
    atomic.arrayOfObjects,
    createExample(
      'Accessing array objects and their properties',
      `@text itemDetails = \`
First item: {{items.0}}
First item name: {{items.0.name}}
Second item ID: {{items.1.id}}
Third item tags: {{items.2.tags}}
First tag of first item: {{items.0.tags.0}}
\``
    )
  ),
  
  formattingWithPropertyAccess: combineExamples(
    'Formatting with property access',
    atomic.person,
    createExample(
      'Inline formatting with property access',
      `@text greeting = \`Hello, {{person.name}}! Your address is {{person.address.street}}.\``
    ),
    createExample(
      'Multi-line formatting with property access',
      `@text profile = \`
# Profile for {{person.name}}

**Age:** {{person.age}}
**Address:** {{person.address.street}}, {{person.address.city}}
\``
    )
  ),
  
  specialFormattingCases: combineExamples(
    'Special formatting cases with property access',
    atomic.objectWithSpecialTypes,
    createExample(
      'Handling special formatting in property values',
      `@text specialFormatting = \`
Text with newlines: {{special.withNewlines}}
Text with quotes: {{special.withQuotes}}
Text with tabs: {{special.withTabs}}
Text with HTML: {{special.withHTML}}
\``
    )
  )
};

/**
 * Collection of invalid @data directive examples
 * 
 * These examples demonstrate invalid syntax that should be rejected
 */
export const invalid = {
  unclosedObject: createInvalidExample(
    'Unclosed object literal',
    `@data bad = { "unclosed": "object"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Unclosed object literal'
    }
  ),
  
  invalidJson: createInvalidExample(
    'Invalid JSON syntax',
    `@data bad = { name: "Missing quotes", trailing-comma, }`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid JSON syntax'
    }
  ),
  
  invalidPropertyName: createInvalidExample(
    'Invalid property name',
    `@data invalid = { 123-invalid: "value" }`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid property name'
    }
  ),
  
  nonExistentProperty: createInvalidExample(
    'Accessing non-existent property',
    `@data obj = { "name": "Alice" }
@text invalid = \`Value: {{obj.nonexistent}}\``,
    {
      type: MeldResolutionError,
      severity: ErrorSeverity.Recoverable,
      code: 'PROPERTY_NOT_FOUND',
      message: 'Property "nonexistent" not found on object'
    }
  ),
  
  invalidArrayIndex: createInvalidExample(
    'Invalid array index access',
    `@data arr = [1, 2, 3]
@text invalid = \`Value: {{arr.5}}\``,
    {
      type: MeldResolutionError,
      severity: ErrorSeverity.Recoverable,
      code: 'INDEX_OUT_OF_BOUNDS',
      message: 'Array index 5 is out of bounds'
    }
  ),
  
  accessingPrimitiveAsObject: createInvalidExample(
    'Trying to access property on primitive',
    `@data num = 42
@text invalid = \`Value: {{num.toString}}\``,
    {
      type: MeldResolutionError,
      severity: ErrorSeverity.Recoverable,
      code: 'NOT_AN_OBJECT',
      message: 'Cannot access property on non-object value'
    }
  )
};

/**
 * Complete collection of @data directive examples
 */
export const dataDirectiveExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 