import { 
  createExample, 
  createInvalidExample,
  combineExamples,
  SyntaxExampleGroup 
} from '@core/syntax/helpers/index.js';
import { 
  MeldParseError, 
  ErrorSeverity 
} from '@core/errors/index.js';

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
  invalid
}; 