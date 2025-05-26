---
layout: docs.njk
title: "Mlld Output Formatting Guide"
---

---
layout: docs.njk
title: "Mlld Output Formatting Guide"
---

# Mlld Output Formatting Guide

This guide explains how output formatting works in Mlld and how to control it using the available options.

## Default Output Behavior

By default, Mlld preserves the exact formatting of your document, including:

- Whitespace and indentation
- Newlines between paragraphs
- Line breaks within text
- Spacing around elements

When directives are processed, they are replaced with their output while maintaining the surrounding document structure.

```mlld
This is a paragraph.

@text greeting = "Hello"
@text name = "World"

@add [[{{greeting}}, {{name}}!]]

Another paragraph.
```

Output:
```
This is a paragraph.

Hello, World!

Another paragraph.
```

## Pretty Formatting with Prettier

If you want more consistent markdown formatting, you can use the `--pretty` flag in the CLI or the `pretty` option in the API to apply Prettier formatting to the output.

### CLI Usage

```bash
# Standard output (preserves exact formatting)
mlld input.mlld

# Pretty formatting with Prettier
mlld --pretty input.mlld
```

### API Usage

```typescript
// Standard output (preserves exact formatting)
const result = await runMlld(content);

// Pretty formatting with Prettier
const prettyResult = await runMlld(content, { pretty: true });
```

## How Prettier Formatting Works

When you enable the `pretty` option, Mlld applies Prettier formatting to the output after all directives have been processed. This provides:

- Consistent spacing
- Standardized indentation
- Normalized newlines
- Proper list formatting
- Table alignment
- And other markdown formatting improvements

### Prettier Configuration

Mlld uses a standard Prettier configuration for markdown:

- `proseWrap: 'preserve'` - Preserves existing line wraps
- `printWidth: 80` - Sets the line width to 80 characters
- `tabWidth: 2` - Uses 2 spaces for indentation
- `useTabs: false` - Uses spaces instead of tabs
- `semi: true` - Adds semicolons when necessary
- `singleQuote: true` - Uses single quotes
- `trailingComma: 'es5'` - Adds trailing commas where valid in ES5
- `bracketSpacing: true` - Adds spaces between brackets

## Output Format Options

Mlld supports multiple output formats:

```bash
# Markdown output (default)
mlld -f markdown input.mlld

# XML output
mlld -f xml input.mlld
```

In the API:

```typescript
// Markdown output
const markdownResult = await runMlld(content, { format: 'markdown' });

// XML output
const xmlResult = await runMlld(content, { format: 'xml' });
```

## How Newlines Are Handled

### Within Text Content

Mlld preserves newlines exactly as they appear in the source content:

```mlld
This is a paragraph
with a line break.

This is another paragraph.
```

Output:
```
This is a paragraph
with a line break.

This is another paragraph.
```

### Around Directives

When directives are processed, their output replaces the directive while maintaining proper context:

```mlld
Before directive.
@run[echo "Command output"]
After directive.
```

Output:
```
Before directive.
Command output
After directive.
```

### With Variables

Variables maintain their format when substituted:

```mlld
@text multiline = "Line 1
Line 2
Line 3"

The text is:
@add @multiline
End of text.
```

Output:
```
The text is:
Line 1
Line 2
Line 3
End of text.
```

## Tips for Consistent Formatting

1. **Use the `--pretty` flag** for standardized formatting when the exact layout isn't critical.

2. **For precise control**, arrange your source document exactly as you want the output to appear.

3. **Take advantage of multiline variables** for content that needs to maintain its structure.

4. **Consider the context** when using directives—their output will replace the directive while maintaining surrounding content.

5. **For JSON or code**, use code fences to ensure proper formatting is preserved:

```mlld
@data config = { "key": "value", "nested": { "prop": 1 } }

My configuration is:
\`\`\`json
@add @config
\`\`\`
```