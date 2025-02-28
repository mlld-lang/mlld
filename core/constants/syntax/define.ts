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
 * Collection of atomic @define directive examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 */
export const atomic = {
  simpleCommand: createExample(
    'Simple command definition',
    `@define greet = @run [echo "Hello"]`
  ),
  
  stringLiteral: createExample(
    'String literal definition',
    `@define hello = "echo 'Hello, World!'"`
  ),
  
  withParameter: createExample(
    'Command with a parameter',
    `@define greet(name) = @run [echo "Hello, {{name}}!"]`
  ),
  
  multipleParameters: createExample(
    'Command with multiple parameters',
    `@define greet(first, last) = @run [echo "Hello {{first}} {{last}}"]`
  ),
  
  complexData: createExample(
    'Complex object definition',
    `@define complex = { "command": "find", "args": ["-name", "*.js"] }`
  )
};

/**
 * Collection of combined @define directive examples
 * 
 * These examples demonstrate more complex @define scenarios
 */
export const combinations = {
  defineAndUse: combineExamples(
    'Define and use a command',
    atomic.simpleCommand,
    createExample(
      'Using the defined command',
      `@run [$greet]`
    )
  ),
  
  parameterizedCommand: combineExamples(
    'Parameterized command with variable',
    atomic.withParameter,
    createExample(
      'Text variable',
      `@text user = "Alice"`
    ),
    createExample(
      'Use command with variable parameter',
      `@run [$greet({{user}})]`
    )
  ),
  
  multiParamCommand: combineExamples(
    'Command with multiple parameters',
    atomic.multipleParameters,
    createExample(
      'Use with multiple parameters',
      `@run [$greet("John", "Doe")]`
    )
  ),
  
  nestedCommands: combineExamples(
    'Nested command definitions',
    createExample(
      'Base command',
      `@define say(message) = @run [echo "{{message}}"]`
    ),
    createExample(
      'Command using another command',
      `@define greet(name) = @run [$say("Hello, {{name}}!")]`
    ),
    createExample(
      'Using the nested command',
      `@run [$greet("Alice")]`
    )
  )
};

/**
 * Collection of invalid @define directive examples
 * 
 * These examples demonstrate invalid @define syntax that should be rejected
 */
export const invalid = {
  invalidSyntax: createInvalidExample(
    'Invalid define syntax',
    `@define invalid-name = "value"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid identifier'
    }
  ),
  
  duplicateParameter: createInvalidExample(
    'Duplicate parameter names',
    `@define bad(name, name) = @run [echo "{{name}}"]`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.VALIDATION_FAILED,
      message: 'Duplicate parameter name'
    }
  ),
  
  recursiveDefinition: createInvalidExample(
    'Recursive command definition',
    `@define recursive = @run [$recursive]`,
    {
      type: DirectiveError,
      severity: ErrorSeverity.Fatal,
      code: DirectiveErrorCode.CIRCULAR_REFERENCE,
      message: 'Circular reference in command definition'
    }
  ),
  
  missingBody: createInvalidExample(
    'Missing command body',
    `@define empty =`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Missing command body'
    }
  )
};

/**
 * Complete collection of @define directive examples
 */
export const defineDirectiveExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 