Let me explain the intended user experience and importance of the `markdown -> {md-llm} -> [markdown, llm]` flow:

# Core Use Case

Authors write documentation and content in standard Markdown because it's:
- Familiar 
- Well-supported by editors
- Easy to preview
- Natural for technical writing

But they need to:
1. Extract specific sections for reuse in prompts/templates
2. Convert those sections into structured `.llm` format for LLM consumption
3. Sometimes keep the original Markdown formatting instead

# The md-llm Bridge

The key insight is that extracting sections from Markdown is hard to do reliably - you need:
- Proper header nesting logic
- Content boundary detection  
- Reference/footnote handling
- Preservation of formatting and metadata

By building this once in md-llm, we get:

1. **Section Selection**
```markdown
# Documentation
Some intro...

## Installation
npm install my-pkg

## Usage
...
```

Authors can reference `# Installation` and get just that section, with all its content properly bounded.

2. **Dual Output**
The same section can be output as either:

```xml
<Installation>
npm install my-pkg
</Installation>
```

or preserved as Markdown:
```markdown
## Installation
npm install my-pkg
```

3. **Round-Trip Support**
Since we're not losing information in the transformation, content can flow:
- Markdown -> .llm -> Markdown
- Or stay as Markdown throughout
- While still enabling section selection

# Why This Matters

1. **Author Experience**
- Write in familiar Markdown
- Don't worry about XML/LLM formats
- Natural organization with headers
- Standard tooling support

2. **Integration Experience**
- Single source of truth for content
- Reliable section extraction
- Format-appropriate output
- Preservation of formatting and metadata

3. **LLM Interaction**
- Structured input when needed (.llm)
- Preserved formatting when needed (md)
- Consistent section handling
- Clean prompt composition

The goal is to let authors work in a familiar format (Markdown) while enabling reliable section extraction and format conversion, making it easier to compose prompts and templates without losing information or requiring manual format conversion.

This bridges the gap between:
- Human-friendly authoring (Markdown)
- Machine-friendly structuring (.llm)
- Content reuse (section selection)
- Format preservation (round-trip)

Making it much easier to maintain and reuse documentation in both human and LLM contexts.

# When Meld encounters `@embed [$./README.md # Installation]`:

1. Parse Initial Input
```typescript
const embedPath = '{insertpathhere}/README.md';
const sectionTitle = 'Installation';

// Read markdown file
const content = await fs.readFile(embedPath, 'utf8');
```

2. Process with md-llm
```typescript
// For .llm output (default)
const result = await mdToLlm(content, {
  section: sectionTitle,
  includeParent: false
});

// For markdown output
const mdResult = await mdToMarkdown(content, {
  section: sectionTitle,
  includeParent: false
});
```

3. Integration Example
```typescript
class MeldInterpreter {
  async processEmbed(path: string, section?: string, outputFormat: 'llm' | 'md' = 'llm') {
    const content = await this.readFile(path);
    
    if (outputFormat === 'llm') {
      return mdToLlm(content, { section });
    } else {
      return mdToMarkdown(content, { section });
    }
  }
}
```

4. Usage in Meld Directives

For .llm output, we wrap the content in an EmbeddedContent tag that preserves the source info
For markdown output, we:
- Add a reference comment
- Handle indentation preservation
- Keep the markdown formatting intact

This makes more sense as it preserves the source information in both formats but in format-appropriate ways.

```typescript
// @embed directive handler
async handleEmbed(path: string, section?: string) {
  const format = this.outputFormat; // 'llm' or 'md'
  const content = await this.interpreter.processEmbed(path, section, format);
  
  if (format === 'llm') {
    // Content is already in .llm format, wrap in appropriate tags
    return `<EmbeddedContent source="${path}"${section ? ` section="${section}"` : ''}>\n${content}\n</EmbeddedContent>`;
  } else {
    // For markdown output, we need to:
    // 1. Preserve the original indentation level
    // 2. Add a reference comment
    const reference = `<!-- Embedded from ${path}${section ? ` section: ${section}` : ''} -->`;
    const indented = this.currentIndentLevel > 0 
      ? content.split('\n').map(line => ' '.repeat(this.currentIndentLevel) + line).join('\n')
      : content;
    return `${reference}\n${indented}`;
  }
}
```

The key benefits of this approach:
1. Single source of truth for markdown processing
2. Consistent section selection logic
3. Format-aware output handling
4. Clean integration with Meld's directive system
5. Maintainable section management
6. Round-trip support between formats
