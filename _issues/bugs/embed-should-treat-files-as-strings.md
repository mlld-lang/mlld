# Bug: Embed Directive Should Treat Files as Strings, Not Meld Code

## Issue Description

When using the `@embed` directive to include content from markdown files (particularly documentation), the system attempts to parse the embedded content as Meld code rather than treating it as literal text. This causes parsing errors when the embedded markdown contains text that looks like Meld syntax.

For example, when embedding documentation that describes Meld syntax with examples like `${var}` or `#{var}`, the parser tries to interpret these as actual Meld syntax elements rather than as literal text examples.

## Reproducible Example

In `examples/example.meld`, there's an embed directive:
```
@embed [$./docs/UX.md]
```

The UX.md file contains documentation that includes text explaining syntax:
```
UPDATE: The syntax below for ${var} and #{var} is outdated. Text and data variables are expressed as {{variable}} and path variables remain $path style.
```

When processed, this fails with:
```
Error executing embed directive: Parse error: Parse error: Expected "$", ">>", "`", "{{", or end of input but "{" found. at line 5, column 31
```

The parser is getting confused by the `${var}` text in the documentation.

## Root Cause

The `EmbedDirectiveHandler.execute()` method currently processes all embedded content by:
1. Reading the file content
2. Passing the content to the parser service
3. Interpreting the parsed nodes

This approach assumes all embedded content should be treated as executable Meld code, which is inappropriate for documentation files.

## Proposed Solution

Modify the `EmbedDirectiveHandler.execute()` method to:

1. Detect file type based on extension (particularly `.md` files)
2. For markdown or documentation files:
   - Skip the parsing and interpretation steps
   - Treat the content as literal text
   - Apply any requested transformations (headingLevel, section extraction, etc.) directly
3. For other file types (or optionally with a new `interpret: true` parameter):
   - Continue with the current behavior of parsing and interpreting

## Implementation Suggestion

```typescript
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  try {
    // ... existing validation and resolution code ...
    
    // Read the content
    let content = await this.fileSystemService.readFile(resolvedFile.resolvedPath);
    
    // Check if this is a markdown file
    const isMarkdownDoc = resolvedFile.resolvedPath.toLowerCase().endsWith('.md');
    
    if (isMarkdownDoc) {
      // For markdown files, skip parsing and treat as literal text
      this.logger.debug(`Embedding markdown file as literal text: ${resolvedFile.resolvedPath}`);
      
      // Apply transformations directly to the content
      // ... (section extraction, heading level, etc.)
      
      return {
        type: 'success',
        newState: context.state,
        content: processedContent
      };
    } else {
      // For non-markdown files, continue with parsing and interpretation
      // ... (existing code)
    }
  } catch (error) {
    // ... existing error handling ...
  }
}
```

## Benefits

1. Documentation with syntax examples can be embedded without errors
2. Maintains backward compatibility for embedding Meld files
3. Provides a clearer separation between documentation and executable content

## Related Issues

This may also reveal issues with source mapping of errors in embedded content, but addressing the fundamental parsing approach will solve the immediate problem. 