import { 
  MeldParseError
} from '@core/errors/index';
import { 
  DirectiveError,
  DirectiveErrorCode
} from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/index';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/syntax/helpers/index';

/**
 * Collection of atomic @run directive examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 */
export const atomic = {
  simple: createExample(
    'Basic run directive',
    `@run [echo test]`
  ),
  
  withQuotes: createExample(
    'Run directive with quotes',
    `@run [echo "This is a simple example"]`
  ),
  
  textInterpolation: createExample(
    'Run directive with variable interpolation',
    `@text greeting = "Hello"
@run [echo {{greeting}}]`
  ),
  
  multipleVariables: createExample(
    'Run directive with multiple variables',
    `@text greeting = "Hello"
@text name = "World"
@run [echo {{greeting}}, {{name}}!]`
  ),
  
  outputCapture: createExample(
    'Run with output capture',
    `@text variable_name = @run [echo test]`
  ),
  
  functionCallSyntax: createExample(
    'Run with function-call syntax for defined commands',
    `@define echo(value) = @run [echo {{value}}]
@run $echo("Hello, World!")`
  ),
  
  functionCallWithVariable: createExample(
    'Run with function-call syntax using variable',
    `@define echo(value) = @run [echo {{value}}]
@text message = "Hello from variable"
@run $echo({{message}})`
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
      `@define greet = "echo 'Hello World!'"`
    ),
    createExample(
      'Run the defined command',
      `@run $greet`
    )
  ),
  
  commandWithParams: combineExamples(
    'Command with parameters',
    createExample(
      'Define a parameterized command',
      `@define greet(name) = "echo 'Hello, {{name}}!'"`
    ),
    createExample(
      'Run with user variable',
      `@text user = "John"
@run $greet({{user}})`
    ),
    createExample(
      'Run with direct parameter',
      `@run $greet("John Doe")`
    ),
    createExample(
      'Run with mixed parameters',
      `@data bob = { lastname: "Smith" }
@run $greet("Bob", {{bob.lastname}})`
    )
  ),
  
  dataInterpolation: combineExamples(
    'Command with data object interpolation',
    createExample(
      'Define data',
      `@data user = { 
  name: "Alice", 
  role: "Admin" 
}`
    ),
    createExample(
      'Run command with data interpolation',
      `@run [echo "{{user.name}} is an {{user.role}}"]`
    )
  )
};

/**
 * Collection of invalid @run directive examples
 * 
 * These examples demonstrate invalid @run syntax that should be rejected
 */
export const invalid = {
  unbalancedQuotes: createInvalidExample(
    'Unbalanced quotes in run directive',
    `@run [echo test`,
    {
      type: ErrorSeverity,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Expected closing bracket after command'
    }
  ),
  
  emptyCommand: createInvalidExample(
    'Empty command in run directive',
    `@run []`,
    {
      type: ErrorSeverity,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Command cannot be empty'
    }
  ),
  
  undefinedCommand: createInvalidExample(
    'Reference to undefined command',
    `@run $undefinedCommand`,
    {
      type: ErrorSeverity,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VARIABLE_NOT_FOUND,
      message: 'Cannot resolve reference to undefined command'
    }
  ),
  
  unclosedInterpolation: createInvalidExample(
    'Unclosed interpolation in run directive',
    `@define greet(name) = "echo 'Hello, {{name}}!'"
@run $greet("John", "Doe")`,
    {
      type: ErrorSeverity,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Unclosed interpolation'
    }
  )
};

/**
 * Complete collection of @run directive examples
 */
export default {
  atomic,
  combinations,
  invalid
}; 