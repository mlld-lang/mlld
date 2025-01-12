@import[partials/meld-architect.md]

We are building out the meld interpreter, cli, and sdk in this typescript codebase. We want to ensure our codebase is well-tested and 100% spec-compliant (`meld-spec`) interpreter for the meld language. Consider that this is a first version which has not yet been released, but also that we want to provide a solid foundation for early users and ensure long-term maintainability.

With the directives implement, we are ready to complete the cli and sdk. In addition, we would like to incorporate `llmxml` (an llm-friendly pseudoxml text format using the `.llm` extension) as a default build format for both the meld cli and sdk. (markdown is also a valid, but optional build target.) We want the `meld ` command from the cli to interpret `.meld`, `.meld.md`, `.mll`, and `.mll.md` as valid meld files for purposes of importing and running, with the common recommended formats being `.mll` or `.meld`.

Because the point of interpreting markdown in embedded files is to make them available for compiling, we should use our `md-llm` for reading markdown files and selecting the specific segments we want. 

I am going to provide you with some context:
- Target UX
- Progress and plans
- Current codebase 
- llm-md README
- llm-md integration notes

=== TARGET UX ===

@import[../UX.md]

=== END TARGET UX ===

Currently, we have implemented all of the directives. You can see our progress and presumptive high-level plans here:

=== PROGRESS & PLANS ===

@import[../ARCH-PLAN.md]

=== END PROGRESS & PLANS ===

Here is the current codebase:

=== CURRENT CODEBASE ===

@cmd[cpai ../src --stdout]

=== END CURRENT CODEBASE ===

=== MD-LLM === 

@import[../../meld-lib/md-llm/README.md]

=== END MD-LLM ===

=== INTEGRATING MD-LLM ===

When Meld encounters `@embed [$./README.md # Installation]`:

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

=== END INTEGRATING MD-LLM ===

=== YOUR TASK ===

Create a step-by-step plan for completing the meld interpreter, cli, and sdk based on the above context and current codebase, dividing the work into phases that can each be completed by a single AI developer managing their context window.

Write the changes needed in explicitly clear atomic detail.

BE SPECIFIC AND DECISIVE. DO NOT PROVIDE ANYTHING HAND-WAVY OR GENERAL.
