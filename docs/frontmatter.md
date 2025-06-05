# Frontmatter Support

mlld supports YAML frontmatter at the beginning of documents, providing metadata that can be accessed throughout your content.

## Basic Usage

```mlld
---
title: My Document
author: John Doe
version: 1.0.0
tags:
  - documentation
  - tutorial
---

@add [[# {{fm.title}}]]

@add [[Written by {{fm.author}}, version {{fm.version}}]]
```

## Accessing Frontmatter

Frontmatter data is available through two aliases:
- `@fm` - Short form
- `@frontmatter` - Long form

Both can be used interchangeably:

```mlld
@add [[Title: {{fm.title}}]]
@add [[Author: {{frontmatter.author}}]]
```

## Array Access

Use dot notation with numeric indices to access array elements:

```mlld
---
tags:
  - first
  - second
  - third
---

@add [[First tag: {{fm.tags.0}}]]
@add [[Second tag: {{fm.tags.1}}]]
@add [[Third tag: {{fm.tags.2}}]]
```

## Nested Objects

Access nested properties with dot notation:

```mlld
---
metadata:
  created: 2024-01-01
  author:
    name: Jane Smith
    email: jane@example.com
---

@add [[Created: {{fm.metadata.created}}]]
@add [[Author: {{fm.metadata.author.name}}]]
@add [[Email: {{fm.metadata.author.email}}]]
```

## Import Isolation

Each file's frontmatter is isolated. When importing files, their frontmatter doesn't affect the parent scope:

```mlld
---
title: Main Document
---

@add [[# {{fm.title}}]]

@import { fm as otherFm } from "other.mld"

@add [[Main title: {{fm.title}}]]
@add [[Other title: {{otherFm.title}}]]
```

## Special Handling

### Date Preservation
Dates in frontmatter are preserved as strings rather than being converted to JavaScript Date objects:

```mlld
---
date: 2024-01-15
---

@add [[Date: {{fm.date}}  # Output: "2024-01-15" (not ISO format)]]
```

### Missing Properties
Accessing undefined properties returns empty values without errors:

```mlld
@add [[{{fm.nonexistent}}]] << Returns empty string
@add [[{{fm.nested.missing.property}}]] << Returns empty string
```

## Error Handling

Invalid YAML in frontmatter will produce a parse error with line/column information:

```mlld
---
title: Missing Quote
author: John
tags:
  - one
  - two"  # Invalid YAML
---

# Error: Invalid YAML frontmatter: unexpected end of stream
```

## Best Practices

1. **Keep frontmatter simple** - Use it for metadata, not complex data structures
2. **Use consistent naming** - Stick to either camelCase or snake_case
3. **Document required fields** - Make it clear what frontmatter your templates expect
4. **Validate early** - Check for required fields at the start of your document

## Examples

See the examples directory for complete working examples:
- `frontmatter-basic.mld` - Basic frontmatter usage
- `frontmatter-import.mld` - Frontmatter with imports
