import { 
  MeldParseError, 
  ErrorSeverity 
} from '@core/errors';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/syntax/helpers';

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