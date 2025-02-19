# llmxml

## Overview
llmxml is a specialized library in our codebase that handles the conversion between Markdown and LLM-friendly XML formats. It plays a crucial role in our output formatting system, particularly for preparing content for large language model consumption.

## Role in Our Codebase

### Core Integration Points

1. **OutputService**
   - Primary integration point for llmxml
   - Uses llmxml for converting processed Meld content to LLM-friendly XML
   - Handles format selection between markdown and LLM XML
   - Manages error handling and format conversion failures

2. **CLIService**
   - Provides format selection options ('markdown' | 'llm')
   - Routes output through OutputService for llmxml processing
   - Handles format aliases and defaults

3. **TestContext**
   - Provides testing utilities for XML conversion
   - Helps validate output formatting in tests
   - Supports snapshot testing of XML output

## Key Features We Use

1. **Bidirectional Conversion**
   - Markdown to LLM-XML conversion
   - XML to Markdown conversion (when needed)
   - Preservation of document structure

2. **Section Handling**
   - Fuzzy section matching capabilities
   - Precise heading level control
   - Section extraction for imports

3. **Format Preservation**
   - Maintains code blocks and their language specifications
   - Preserves text formatting and structure
   - Handles special characters and escaping

## Integration Details

### Output Service Implementation
```typescript
private async convertToLLMXML(
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
): Promise<string> {
  // First convert to markdown format
  const markdown = await this.convertToMarkdown(nodes, state, opts);
  
  // Use llmxml for XML conversion
  const { createLLMXML } = await import('llmxml');
  const llmxml = createLLMXML();
  return llmxml.toXML(markdown);
}
```

### CLI Format Options
```typescript
export interface CLIOptions {
  format?: 'markdown' | 'llm';  // llm uses llmxml for conversion
  // ... other options
}
```

## XML Format Specification

The XML format produced by llmxml follows these conventions:

1. **Document Structure**
   ```xml
   <Title>
   Content
   <Section hlevel="2">
   Content
   </Section>
   </Title>
   ```

2. **Section Attributes**
   - `hlevel`: Indicates heading level (1-6)
   - `title`: Original section title
   - Nested sections maintain hierarchy

3. **Content Handling**
   - Code blocks preserved with language attributes
   - Special characters properly escaped
   - Whitespace and formatting maintained

## Error Handling

We wrap llmxml errors in our custom error types:

1. **MeldLLMXMLError**
   - Handles section extraction failures
   - Provides context for conversion errors
   - Includes fuzzy matching details

2. **Error Recovery**
   - Fallback to plain text when conversion fails
   - Preservation of original content structure
   - Detailed error reporting

## Version and Compatibility

We use llmxml version ^1.1.2 as specified in our package.json. The library is dynamically imported when needed to optimize loading time.

## Important Notes

1. **Performance Considerations**
   - Dynamic import for on-demand loading
   - Section extraction adds minimal overhead
   - Efficient handling of large documents

2. **Format Selection**
   - 'llm' format is the default in most cases
   - Format selection available via CLI and API
   - Backward compatibility with markdown output

3. **Testing Considerations**
   - Don't validate the XML formatting -- just presevation of content
