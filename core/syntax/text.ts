import { 
  MeldParseError, 
  MeldResolutionError,
  ErrorSeverity
} from '@core/errors.js';
import { 
  createExample, 
  createInvalidExample, 
  combineExamples,
  SyntaxExampleGroup 
} from '@core/syntax/helpers.js';

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
  ),

  withEmbedValue: createExample(
    'Text directive with embed value',
    `@text instructions = @embed [$./path.md]`
  ),

  withEmbedValueAndSection: createExample(
    'Text directive with embed value and section',
    `@text instructions = @embed [$./path.md # Instructions]`
  ),

  withRunValue: createExample(
    'Text directive with run value',
    `@text result = @run [echo "Hello World"]`
  ),

  withRunValueAndVariables: createExample(
    'Text directive with run value and variables',
    `@text result = @run [oneshot "What's broken here? {{tests}}"]`
  ),
  
  multilineText: createExample(
    'Multi-line text with various formatting',
    `@text formatted = \`# Heading

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2
- List item 3

> This is a blockquote
\``
  ),
  
  textWithNewlines: createExample(
    'Text with explicit newlines',
    `@text newlines = "First line\\nSecond line\\nThird line"`
  ),
  
  markdownText: createExample(
    'Text with markdown formatting',
    `@text markdown = "# Heading\\n\\n**Bold text** and *italic text*\\n\\n- List item"`
  ),
  
  inlineFormatting: createExample(
    'Text with inline formatting',
    `@text inline = "This text has **bold**, *italic*, and \`code\` formatting"`
  ),
  
  blockFormatting: createExample(
    'Text with block-level formatting',
    `@text blocks = \`
# Heading

Paragraph with text.

\`\`\`
Code block
\`\`\`

> Blockquote text
\``
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
  ),
  
  variableSubstitutionInlineFormatting: combineExamples(
    'Variable substitution with inline formatting',
    atomic.simpleString,
    atomic.subject,
    createExample(
      'Inline formatting with variable substitution',
      `@text formatted = \`The {{greeting}} is for {{subject}}. This is **bold** with {{greeting}} inside.\``
    )
  ),
  
  variableSubstitutionBlockFormatting: combineExamples(
    'Variable substitution with block formatting',
    atomic.simpleString,
    atomic.subject,
    createExample(
      'Block formatting with variable substitution',
      `@text formatted = \`# {{greeting}} {{subject}}

This is a paragraph about {{subject}}.

- List item with {{greeting}}
- Another item

> Blockquote with {{subject}} mentioned
\``
    )
  ),
  
  lineEdgeCases: combineExamples(
    'Variable substitution at line edges',
    atomic.simpleString,
    atomic.subject,
    createExample(
      'Variables at start, middle, and end of lines',
      `@text edges = \`{{greeting}} is at the beginning of the line
This line has {{greeting}} in the middle
This line ends with {{greeting}}
{{greeting}}
Just text without variables
{{greeting}} {{subject}} consecutive variables
\``
    )
  ),
  
  multilineVariables: combineExamples(
    'Complex multiline with variable substitution',
    createExample(
      'Multi-line text with variable values',
      `@data multiline = {
  title: "Multi-line Example",
  content: "Line 1\\nLine 2\\nLine 3",
  items: [
    "First item",
    "Second item with\\nnewline",
    "Third item"
  ]
}`
    ),
    createExample(
      'Text with multiline variables',
      `@text document = \`# {{multiline.title}}

{{multiline.content}}

Items:
{{multiline.items}}
\``
    )
  ),
  
  newlineHandling: combineExamples(
    'Newline handling in different contexts',
    createExample(
      'Text with explicit and implicit newlines',
      `@text combined = \`First line
Second line
Third line with explicit\\nnewline
Fourth line\``
    ),
    createExample(
      'Text with variable containing newlines',
      `@data content = "Line 1\\nLine 2\\nLine 3"
@text withVar = \`Before
{{content}}
After\``
    )
  ),
  
  complexDynamicFormatting: combineExamples(
    'Complex dynamic formatting with variables',
    createExample(
      'Data for dynamic formatting',
      `@data dynamic = {
  title: "Dynamic Document",
  sections: [
    { heading: "Section 1", content: "Content for section 1" },
    { heading: "Section 2", content: "Content with\\nmultiple\\nlines" },
    { heading: "Section 3", content: "Final content section" }
  ],
  footer: "© 2023"
}`
    ),
    createExample(
      'Dynamic document with formatting',
      `@text document = \`# {{dynamic.title}}

{{dynamic.sections.0.heading}}
{{dynamic.sections.0.content}}

{{dynamic.sections.1.heading}}
{{dynamic.sections.1.content}}

{{dynamic.sections.2.heading}}
{{dynamic.sections.2.content}}

---
{{dynamic.footer}}
\``
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
  ),

  invalidEmbedFormat: createInvalidExample(
    'Invalid embed format without brackets',
    `@text instructions = @embed path.md`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid embed format'
    }
  ),

  invalidRunFormat: createInvalidExample(
    'Invalid run format without brackets',
    `@text result = @run echo "Hello"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR', 
      message: 'Invalid run format'
    }
  ),
  
  invalidVariableFormatting: createInvalidExample(
    'Invalid variable substitution in formatting',
    `@text brokenFormat = \`# Heading with **{{unclosed_bold}}\``,
    {
      type: MeldResolutionError,
      severity: ErrorSeverity.Recoverable,
      code: 'UNDEFINED_VARIABLE',
      message: 'Variable "unclosed_bold" is not defined'
    }
  ),
  
  malformedNewline: createInvalidExample(
    'Malformed newline escape',
    `@text broken = "Line 1\\Line 2"`,
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Invalid escape sequence'
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