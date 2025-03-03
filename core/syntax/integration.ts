import { 
  createExample, 
  combineExamples,
  SyntaxExampleGroup 
} from './helpers';

/**
 * Collection of simple integration examples
 * 
 * These examples demonstrate basic combinations of different directive types
 */
export const atomic = {
  textAndData: createExample(
    'Text and data variables with interpolation',
    `@text greeting = "Hello"
@text subject = "World"
@data user = { "name": "Alice", "id": 123 }
@text message = \`{{greeting}}, {{user.name}}! Your ID is {{user.id}}.\`

{{message}}`
  ),
  
  textAndPathReferences: createExample(
    'Text variables referencing path variables',
    `@path docs = "$PROJECTPATH/docs"
@path config = "$./config"
@text docsText = "Docs are at $docs"
@text configText = "Config is at $config"

Documentation: {{docsText}}
Configuration: {{configText}}`
  ),
  
  dataAndArrayAccess: createExample(
    'Data array with access by index',
    `@data fruits = ["apple", "banana", "cherry"]
@data index = 1
@text selection = \`Selected fruit: {{fruits[index]}}\`

{{selection}}`
  )
};

/**
 * Collection of more complex integration examples
 * 
 * These examples demonstrate advanced combinations of different directive types
 */
export const combinations = {
  defineAndRun: combineExamples(
    'Define function and use it with run',
    createExample(
      'Define and run example',
      `@define greet(name) = "echo 'Hello, {{name}}!'"
@text user = "Alice"

@run $greet({{user}})`
    )
  ),
  
  pathAndEmbed: combineExamples(
    'Path variable with embed and section extraction',
    createExample(
      'Path and embed example',
      `@path docs = "$PROJECTPATH/docs"
@embed [$docs/README.md # Introduction]`
    )
  ),
  
  complexDataAccess: combineExamples(
    'Complex data structures with nested access',
    createExample(
      'Complex data access',
      `@data config = {
  "app": {
    "name": "Meld",
    "version": "1.0.0",
    "features": ["text", "data", "path"]
  },
  "env": "test"
}
@data users = [
  { name: "Alice", hobbies: ["reading", "hiking"] },
  { name: "Bob", hobbies: ["gaming", "cooking"] }
]

@text appInfo = \`{{config.app.name}} v{{config.app.version}}\`
@text features = \`Features: {{config.app.features}}\`
@text userHobby = \`{{users[0].name}}'s first hobby is {{users[0].hobbies[0]}}\`

Application: {{appInfo}}
{{features}}
{{userHobby}}`
    )
  ),
  
  defineDataAndRun: combineExamples(
    'Define, data, and run integration',
    createExample(
      'Define command with parameters',
      `@define greet(firstname, lastname) = "echo 'Hello, {{firstname}} {{lastname}}!'"`
    ),
    createExample(
      'Create data object',
      `@data person = { firstname: "Bob", lastname: "Smith" }`
    ),
    createExample(
      'Run with data object properties',
      `@run $greet({{person.firstname}}, {{person.lastname}})`
    )
  )
};

/**
 * Empty invalid section - integration examples are typically not invalid themselves
 * but may contain individual invalid components which would be covered in their
 * respective directive type files
 */
export const invalid = {};

/**
 * Complete collection of integration examples
 */
export const integrationExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  invalid
}; 