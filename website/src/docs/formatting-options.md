---
layout: docs.njk
title: "Meld Output Formatting Guide"
---

---
layout: docs.njk
title: "Meld Output Formatting Guide"
---

# Meld Output Formatting Guide

This guide explains how output formatting works in Meld and how to control it using the available options.

## Default Output Behavior

By default, Meld preserves the exact formatting of your document, including:

- Whitespace and indentation
- Newlines between paragraphs
- Line breaks within text
- Spacing around elements

When directives are processed, they are replaced with their output while maintaining the surrounding document structure.

```meld
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
meld input.meld

# Pretty formatting with Prettier
meld --pretty input.meld
```

### API Usage

```typescript
// Standard output (preserves exact formatting)
const result = await runMeld(content);

// Pretty formatting with Prettier
const prettyResult = await runMeld(content, { pretty: true });
```

## How Prettier Formatting Works

When you enable the `pretty` option, Meld applies Prettier formatting to the output after all directives have been processed. This provides:

- Consistent spacing
- Standardized indentation
- Normalized newlines
- Proper list formatting
- Table alignment
- And other markdown formatting improvements

### Prettier Configuration

Meld uses a standard Prettier configuration for markdown:

- `proseWrap: 'preserve'` - Preserves existing line wraps
- `printWidth: 80` - Sets the line width to 80 characters
- `tabWidth: 2` - Uses 2 spaces for indentation
- `useTabs: false` - Uses spaces instead of tabs
- `semi: true` - Adds semicolons when necessary
- `singleQuote: true` - Uses single quotes
- `trailingComma: 'es5'` - Adds trailing commas where valid in ES5
- `bracketSpacing: true` - Adds spaces between brackets

## Output Format Options

Meld supports multiple output formats:

```bash
# Markdown output (default)
meld -f markdown input.meld

# XML output
meld -f xml input.meld
```

In the API:

```typescript
// Markdown output
const markdownResult = await runMeld(content, { format: 'markdown' });

// XML output
const xmlResult = await runMeld(content, { format: 'xml' });
```

## How Newlines Are Handled

### Within Text Content

Meld preserves newlines exactly as they appear in the source content:

```meld
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

```meld
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

```meld
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

```meld
@data config = { "key": "value", "nested": { "prop": 1 } }

My configuration is:
\`\`\`json
@add @config
\`\`\`
```