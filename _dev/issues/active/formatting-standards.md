# Formatting Standards for Variable Resolution and Markdown Output

This document defines the formatting standards for handling text formatting, variable substitution, and newline handling in the output pipeline.

## 1. Formatting Standards for Different Node Types

### Text Nodes
- Text nodes should always preserve internal formatting and whitespace
- In transformation mode, text nodes should preserve their exact newline pattern
- In standard mode, text nodes should end with either:
  - Double newline (`\n\n`) if the original content doesn't end with newlines
  - Single newline (`\n`) if the original content already ends with a newline

### TextVar Nodes
- TextVar nodes should preserve their exact text formatting
- In transformation mode, TextVar nodes should not add any additional newlines
- In standard mode, TextVar nodes should follow the same rules as Text nodes for trailing newlines
- When TextVar nodes contain object values, the specific property value should be output (not JSON)

### DataVar Nodes
- DataVar nodes with field access should extract the specific field value, not stringify the whole object
- Primitive values (string, number, boolean) should be output directly
- Complex values (objects, arrays) without specific field access should be serialized as:
  - Arrays: Comma-separated values (`value1, value2, value3`)
  - Objects: JSON string with proper formatting
- In transformation mode, DataVar nodes should not add additional newlines
- In standard mode, DataVar nodes should follow the same rules as Text nodes for trailing newlines

### CodeFence Nodes
- CodeFence nodes should always preserve their exact content including the code fence markers (```language)
- No additional newlines should be added before or after code fence content
- The content property already includes the fence markers and should be used as-is

### Directive Nodes
- Definition directives (`text`, `data`, `path`, `import`, `define`) should output empty string
- Execution directives (`run`, `embed`) in non-transformation mode should output placeholders with consistent newline handling
- Execution directives in transformation mode should use their transformed content with original newline handling

## 2. Variable Substitution Formatting

### Context-Aware Substitution
- Variable substitution should preserve the surrounding text context and line structure
- Variables at the start of a line should not introduce additional indentation
- Variables at the end of a line should preserve trailing newlines
- Variables in the middle of text should not split the line unless the variable value contains newlines

### Field Access in Variables
- When accessing fields using dot notation (`{{object.property}}`), only the specific property should be output
- Field access should work consistently across all node types
- Arrays should support numeric indices
- Nested objects should support multiple levels of property access

### Inline vs Block Variable Usage
- Inline variables (within a paragraph) should not introduce paragraph breaks
- Block variables (entire paragraph) should preserve paragraph structure
- Special handling required for variables that contain multiple paragraphs

## 3. Newline Handling

### Standard Newline Rules
- Single newline (`\n`) - Continues the current paragraph or line
- Double newline (`\n\n`) - Creates a paragraph break in standard markdown
- Leading/trailing whitespace within variables should be preserved

### Standardized Newline Handling
- Text content before a newline-containing variable should end at the same line
- Text content after a newline-containing variable should start on a new line
- Multiple consecutive newlines should be normalized to double newlines in standard mode
- In transformation mode, exact newline pattern should be preserved

### Special Cases
- Newlines after punctuation (colon, comma) should be handled consistently
- Lists should maintain proper indentation and formatting
- Tables should maintain column alignment

## 4. Context Preservation

### Variable Substitution Context Tracking
- The context in which a variable is used should be tracked:
  - Paragraph context (affects newline handling)
  - Inline context (affects whitespace preservation)
  - Block context (affects paragraph structure)
  - List/Table context (affects structural formatting)

### Priority Rules for Formatting Conflicts
1. Preserve original document structure (paragraphs, lists, tables)
2. Maintain line breaks from source content when in block context
3. Prevent unnecessary line breaks when in inline context
4. Always close open markdown elements (code blocks, list items, tables)

### Transformation Mode Considerations
- In transformation mode, formatting should exactly match the input structure
- In standard mode, formatting should follow markdown best practices
- Variable resolution should consider the appropriate context for formatting

## Implementation Guidelines

1. Create context object that tracks formatting context during nodeToMarkdown processing
2. Enhance field access to extract specific property values consistently
3. Modify variable substitution to preserve line structure and context
4. Create standard helpers for newline handling that are consistent across node types
5. Apply consistent rules for transformation mode vs standard mode