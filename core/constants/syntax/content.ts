import { 
  createExample, 
  createInvalidExample,
  combineExamples,
  SyntaxExampleGroup 
} from './helpers';
import { 
  MeldParseError, 
  ErrorSeverity 
} from '../../errors';

/**
 * Collection of atomic content examples
 * 
 * These are the most basic examples of Markdown content
 */
export const atomic = {
  simpleParagraph: createExample(
    'Simple paragraph',
    `This is a simple paragraph of text.`
  ),
  
  heading: createExample(
    'Heading',
    `# Heading Level 1
## Heading Level 2
### Heading Level 3`
  ),
  
  list: createExample(
    'Unordered list',
    `- Item 1
- Item 2
- Item 3`
  ),
  
  orderedList: createExample(
    'Ordered list',
    `1. First item
2. Second item
3. Third item`
  ),
  
  link: createExample(
    'Link',
    `[Example link](https://example.com)`
  ),
  
  image: createExample(
    'Image',
    `![Alt text](image.png "Image Title")`
  ),
  
  blockquote: createExample(
    'Blockquote',
    `> This is a blockquote
> It can span multiple lines`
  ),
  
  horizontalRule: createExample(
    'Horizontal rule',
    `---`
  ),
  
  inlineFormatting: createExample(
    'Inline formatting',
    `**Bold text**, *italic text*, ~~strikethrough~~, and \`inline code\``
  ),
  
  table: createExample(
    'Table',
    `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |`
  )
};

/**
 * Collection of combined content examples
 * 
 * These examples demonstrate more complex content scenarios
 */
export const combinations = {
  mixedContent: createExample(
    'Mixed content',
    `# Document Title

This is a paragraph with **bold** and *italic* text.

## Section Title

- List item 1
- List item 2
  - Nested list item
  - Another nested item
- List item 3

> This is a blockquote
> With multiple lines

\`\`\`js
// Code example
console.log('Hello, world!');
\`\`\`

[Link to example](https://example.com)`
  ),
  
  withFrontmatter: createExample(
    'Content with frontmatter',
    `---
title: Document Title
author: Example Author
date: 2023-01-01
---

# {{title}}

Written by {{author}} on {{date}}.

This is the main content of the document.`
  ),
  
  withDirectives: combineExamples(
    'Content with directives interspersed',
    createExample(
      'Initial content',
      `# Document Title

This is the introduction.`
    ),
    createExample(
      'Variable definition',
      `@text name = "Example User"`
    ),
    createExample(
      'Content using variable',
      `## Hello, {{name}}!

Welcome to this document.`
    ),
    createExample(
      'Path definition',
      `@path images = "./assets/images"`
    ),
    createExample(
      'Content with image using path variable',
      `Here's an image:

![Example Image]({{images}}/example.png)`
    )
  )
};

/**
 * Collection of examples with directives within Markdown content
 * 
 * These examples demonstrate how directives can be embedded within regular Markdown content
 */
export const withEmbeddedDirectives = {
  inlineParagraph: createExample(
    'Inline directive in paragraph',
    `This paragraph contains a @text variable = "dynamic value" that is defined inline.`
  ),
  
  adjacentElements: combineExamples(
    'Directives adjacent to Markdown elements',
    createExample(
      'Heading and directive',
      `# Heading
@text variable = "value"`
    ),
    createExample(
      'List with directive',
      `- Item 1
- @text item = "Dynamic item"
- Item using {{item}}`
    )
  ),
  
  embeddedCodeVariables: createExample(
    'Code with embedded variables',
    `\`\`\`js
const greeting = "{{greetingText}}";
console.log(greeting);
\`\`\``
  )
};

/**
 * Collection of invalid content examples
 * 
 * These examples demonstrate content that should result in parsing errors
 */
export const invalid = {
  unknownDirective: createInvalidExample(
    'Unknown directive type',
    '@invalid xyz',
    {
      type: MeldParseError,
      severity: ErrorSeverity.Fatal,
      code: 'SYNTAX_ERROR',
      message: 'Unknown directive type'
    }
  )
};

/**
 * Complete collection of content examples
 */
export const contentExamples: SyntaxExampleGroup = {
  atomic,
  combinations,
  withEmbeddedDirectives,
  invalid
}; 