import { 
  MeldParseError
} from '@core/errors';
import { 
  DirectiveError,
  DirectiveErrorCode
} from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/constants/syntax/helpers';

/**
 * Collection of atomic @run directive examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 */
export const atomic = {
  simple: createExample(
    'Basic run directive',
    `@run "echo test"`
  ),
  
  withQuotes: createExample(
    'Run directive with quotes',
    `@run 'echo "This is a simple example"'`
  ),
  
  textInterpolation: createExample(
    'Run directive with variable interpolation',
    `@text greeting = "Hello"
@run "echo {{greeting}}"`
  ),
  
  multipleVariables: createExample(
    'Run directive with multiple variables',
    `@text greeting = "Hello"
@text name = "World"
@run "echo {{greeting}}, {{name}}!"`
  ),
  
  withOutput: createExample(
    'Run with output capture',
    `@run { command = "echo test", output = "variable_name" }`
  )
};

/**
 * Collection of combined @run directive examples
 * 
 * These examples demonstrate more complex @run scenarios
 */
export const combinations = {
  definedCommand: combineExamples(
    'Using defined command',
    createExample(
      'Define a command',
      `@define greet = "echo 'Hello'"`
    ),
    createExample(
      'Run the defined command',
      `@run $greet`
    )
  ),
  
  definedCommandWithParams: combineExamples(
    'Using defined command with parameters',
    createExample(
      'Define a command with parameter',
      `@define greet(name) = "echo 'Hello, {{name}}!'"`
    ),
    createExample(
      'Text variable',
      `@text user = "Alice"`
    ),
    createExample(
      'Run with parameter',
      `@run $greet({{user}})`
    )
  ),
  
  complexCommand: combineExamples(
    'Complex command with multiple parameters',
    createExample(
      'Define complex command',
      `@define greet(first, last) = "echo 'Hello {{first}} {{last}}'"`
    ),
    createExample(
      'Run with multiple parameters',
      `@run $greet("John", "Doe")`
    )
  ),
  
  dataInterpolation: combineExamples(
    'Using data with command parameters',
    createExample(
      'Define command with parameters',
      `@define greet(firstname, lastname) = "echo 'Hello, {{firstname}} {{lastname}}!'"`
    ),
    createExample(
      'Define data object',
      `@data bob = { lastname: "Smith" }`
    ),
    createExample(
      'Run with mixed parameters',
      `@run $greet("Bob", {{bob.lastname}})`
    )
  )
};

/**
 * Collection of invalid @run directive examples
 * 
 * These examples demonstrate invalid @run syntax that should be rejected
 */
export const invalid = {
  unclosedQuote: createInvalidExample(
    'Unclosed quote',
    `@run "echo test`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Unclosed quote'
    }
  ),
  
  missingCommand: createInvalidExample(
    'Missing command',
    `@run ""`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Empty command'
    }
  ),
  
  undefinedReference: createInvalidExample(
    'Reference to undefined command',
    `@run $undefinedCommand`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VARIABLE_NOT_FOUND,
      message: 'Undefined command'
    }
  ),
  
  wrongParameterCount: createInvalidExample(
    'Wrong parameter count for defined command',
    `@define greet(name) = "echo 'Hello, {{name}}!'"
@run $greet("John", "Doe")`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Invalid parameter count'
    }
  )
};

/**
 * Complete collection of @run directive examples
 */
export const runDirectiveExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 