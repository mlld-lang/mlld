# Complex Document

This document tests various edge cases and complex markdown features.

## Getting Started (Quick Guide)

This section has a title with parentheses and spaces.

## Section with `code` in title

This tests how we handle inline code in headings.

## Multiple Levels

### First Level

#### Second Level

##### Third Level

###### Fourth Level

Testing deep nesting.

## Special Characters: !@#$%^&*

Testing special characters in headings.

## Code Blocks

```typescript
// Comment with special chars: !@#$%
function test() {
  return {
    nested: {
      object: true
    }
  };
}
```

```python
def python_func():
    """
    Docstring with *special* formatting
    """
    pass
```

## Lists and Tables

1. Numbered list
2. With sub-points
   * Mixed bullet
   * Another bullet
3. Back to numbers

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |

## [Section with Brackets]

Testing brackets in heading.

## Ambiguous Section Names

### About

Content about something.

### About the Project

Similar but different section.

### About Development

Yet another similar section. 