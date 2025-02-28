import { 
  MeldParseError, 
  MeldResolutionError,
  ErrorSeverity
} from '@core/errors';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/constants/syntax/helpers';

/**
 * Collection of atomic @text directive examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 */
export const atomic = {
  simpleString: createExample(
    'Basic text directive with string literal',
    `@text greeting = "Hello"`
  ),
  
  subject: createExample(
    'Basic second variable for interpolation',
    `@text subject = "World"`
  ),
  
  templateLiteral: createExample(
    'Text directive with template literal',
    `@text message = \`Template content\``
  ),
  
  escapedCharacters: createExample(
    'Text directive with escaped characters',
    `@text escaped = "Line 1\\nLine 2\\t\\"Quoted\\""`
  ),
  
  user: createExample(
    'User variable for integration examples',
    `@text user = "Alice"`
  ),
  
  simpleText: createExample(
    'Simple text example from audit',
    `@text simple_text = "Hello, world!"`
  ),
  
  var1: createExample(
    'Variable with numeric name',
    `@text var1 = "Value 1"`
  )
};

/**
 * Collection of combined @text directive examples
 * 
 * These examples demonstrate how text directives can be used together
 * and with variable interpolation
 */
export const combinations = {
  basicInterpolation: combineExamples(
    'Basic text interpolation example',
    atomic.simpleString,
    atomic.subject,
    createExample(
      'Interpolated message with two variables',
      `@text message = \`{{greeting}}, {{subject}}!\``
    )
  ),
  
  objectInterpolation: combineExamples(
    'Text interpolation with object properties',
    createExample(
      'Object definition',
      `@data user = { "name": "Alice", "id": 123 }`
    ),
    createExample(
      'Text using object properties',
      `@text greeting = \`Hello, {{user.name}}! Your ID is {{user.id}}.\``
    )
  ),
  
  configInterpolation: combineExamples(
    'Text interpolation with nested object properties',
    createExample(
      'Complex config object',
      `@data config = { 
  "app": {
    "name": "Meld",
    "version": "1.0.0",
    "features": ["text", "data", "path"]
  },
  "env": "test"
}`
    ),
    createExample(
      'Text using nested object properties',
      `@text appInfo = \`{{config.app.name}} v{{config.app.version}}\``
    ),
    createExample(
      'Text using array from nested object',
      `@text features = \`Features: {{config.app.features}}\``
    )
  ),
  
  pathReferencing: combineExamples(
    'Text referencing path variables',
    createExample(
      'Path definitions',
      `@path docs = "$PROJECTPATH/docs"
@path config = "$./config"
@path home = "$HOMEPATH/meld"
@path data = "$~/data"`
    ),
    createExample(
      'Text referencing path variables',
      `@text docsText = "Docs are at $docs"
@text configText = "Config is at $config"
@text homeText = "Home is at $home"
@text dataText = "Data is at $data"`
    )
  )
};

/**
 * Collection of invalid @text directive examples
 * 
 * These examples demonstrate invalid syntax that should be rejected
 */
export const invalid = {
  unclosedString: createInvalidExample(
    'Missing closing quotation mark',
    `@text greeting = "unclosed string`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Unclosed string literal'
    }
  ),
  
  undefinedVariable: createInvalidExample(
    'Reference to undefined variable',
    `@text message = \`Hello, {{undefined_var}}!\``,
    {
      type: MeldResolutionError,
      severity: ErrorSeverity.Recoverable,
      code: 'UNDEFINED_VARIABLE',
      message: 'Variable "undefined_var" is not defined'
    }
  ),
  
  invalidVarName: createInvalidExample(
    'Invalid variable name with special characters',
    `@text invalid-name = "Value"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid variable name'
    }
  )
};

/**
 * Complete collection of @text directive examples
 */
export const textDirectiveExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 