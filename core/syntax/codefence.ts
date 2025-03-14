import { 
  MeldParseError, 
  ErrorSeverity 
} from '@core/errors.js';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/syntax/helpers.js';

/**
 * Collection of atomic code fence examples
 * 
 * These are the most basic examples that serve as building blocks for more complex examples
 */
export const atomic = {
  simpleCodeFence: createExample(
    'Simple code fence',
    "```js\nconst greeting = 'Hello, world!';\nconsole.log(greeting);\n```"
  ),
  
  withLanguage: createExample(
    'Code fence with language',
    "```python\ndef greet(name):\n    return f'Hello, {name}!'\n\nprint(greet('world'))\n```"
  ),
  
  withoutLanguage: createExample(
    'Code fence without language',
    "```\nThis is a code block without a language specified.\n```"
  ),
  
  withAttributes: createExample(
    'Code fence with attributes',
    "```js {title=\"Greeting Example\", highlight=\"1,3\"}\nconst greeting = 'Hello, world!';\nconst name = 'User';\nconsole.log(greeting);\n```"
  ),
  
  indentedCodeFence: createExample(
    'Indented code fence',
    "   ```js\n   const greeting = 'Hello, world!';\n   console.log(greeting);\n   ```"
  )
};

/**
 * Collection of combined code fence examples
 * 
 * These examples demonstrate more complex code fence scenarios
 */
export const combinations = {
  multipleFences: createExample(
    'Multiple code fences in sequence',
    "# Code Examples\n\nJavaScript:\n```js\nconsole.log('Hello from JavaScript');\n```\n\nPython:\n```python\nprint('Hello from Python')\n```"
  ),
  
  nestedFences: createExample(
    'Nested code fences representation',
    "````markdown\nHere's a code fence:\n```js\nconsole.log('Hello');\n```\n````"
  ),
  
  withDirectives: combineExamples(
    'Code fence with directives',
    createExample(
      'Variable definition',
      `@text language = "javascript"`
    ),
    createExample(
      'Using variables in code fence',
      "```{{language}}\nconsole.log('Using variable for language');\n```"
    )
  ),
  
  equalBacktickCounts: createExample(
    'Code fences with equal backtick counts',
    "```\nouter\n```\ninner\n```\n```"
  )
};

/**
 * Collection of invalid code fence examples
 * 
 * These examples demonstrate invalid code fence syntax that should be rejected
 */
export const invalid = {
  unclosedFence: createInvalidExample(
    'Unclosed code fence',
    "```js\nconst greeting = 'Hello, world!';\nconsole.log(greeting);",
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Unclosed code fence'
    }
  ),
  
  invalidAttributes: createInvalidExample(
    'Invalid attributes format',
    "```js {title: \"Missing quotes\"}\nconsole.log('Hello');\n```",
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid attributes format'
    }
  ),
  
  mismatchedDelimiters: createInvalidExample(
    'Mismatched fence delimiters',
    "```js\nconsole.log('Hello');\n~~~",
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Mismatched code fence delimiters'
    }
  )
};

/**
 * Complete collection of code fence examples
 */
export const codefenceExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 