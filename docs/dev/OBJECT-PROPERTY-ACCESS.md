# Object Property Access and Variable Resolution Guide

## Overview

This document provides a detailed guide for handling object property access and variable resolution in Meld. It defines the standard approaches for:

1. Accessing nested object properties using the `{{object.property}}` syntax
2. Handling arrays and array indexing with `{{array.index}}`
3. Managing formatting when variable values contain newlines
4. Ensuring consistency across the transformation pipeline

## Property Access Patterns

### Basic Syntax

Variable references can access properties using dot notation:

```markdown
{{variable.property}}
```

For example:
```markdown
User name: {{user.name}}
Email: {{user.contact.email}}
```

### Nested Properties

You can access deeply nested properties by chaining dot notation:

```markdown
{{object.nestedObject.deeplyNested.property}}
```

For example:
```markdown
Theme color: {{project.settings.theme.colors.primary}}
```

### Array Access

Array elements are accessed using numeric indices:

```markdown
{{array.0}}  // First element
{{array.1}}  // Second element
```

For example:
```markdown
First fruit: {{fruits.0}}
Second fruit: {{fruits.1}}
```

### Combined Array and Object Access

You can combine array indexing with object property access:

```markdown
{{users.0.name}}  // Name of first user
{{users.1.profile.bio}}  // Bio from profile of second user
```

For example:
```markdown
Admin name: {{users.0.name}}
Admin email: {{users.0.email}}
```

## Standard Formatting Rules

### Strings

String values are rendered as-is, preserving their original format.

```markdown
{{greeting}}  // "Hello" → Hello
```

### Numbers and Booleans

Primitive values are converted to their string representation.

```markdown
{{age}}  // 30 → 30
{{isActive}}  // true → true
```

### Objects

Objects can be rendered in different ways based on context:

#### Block Context

In block context (standalone paragraphs), objects are pretty-printed as JSON with 2-space indentation:

```markdown
{{user}}
// Renders as:
{
  "name": "Alice",
  "age": 30,
  "contact": {
    "email": "alice@example.com"
  }
}
```

#### Inline Context

In inline context (within a sentence), objects are rendered as compact JSON:

```markdown
User data: {{user}}
// Renders as:
User data: {"name":"Alice","age":30,"contact":{"email":"alice@example.com"}}
```

### Arrays

Arrays are handled based on complexity and context:

#### Simple Arrays (Inline Context)

Simple arrays of primitives in inline context are rendered as comma-space separated values:

```markdown
Fruits: {{fruits}}
// Renders as:
Fruits: apple, banana, orange
```

#### Complex Arrays (Block Context)

Arrays containing objects or nested arrays in block context are pretty-printed as JSON:

```markdown
{{users}}
// Renders as:
[
  {
    "name": "Alice",
    "role": "admin"
  },
  {
    "name": "Bob",
    "role": "user"
  }
]
```

## Newline Handling

### In Variable Values

Newlines in variable values are preserved:

```markdown
{{multilineText}}
// Where multilineText = "Line 1\nLine 2\nLine 3"
// Renders as:
Line 1
Line 2
Line 3
```

### Around Variable References

Newlines immediately before or after variable references are preserved:

```markdown
Text before
{{variable}}
Text after

// Renders as:
Text before
[Variable value]
Text after
```

### Standardized Newline Rules

1. Consecutive newlines are preserved in standard mode (up to 2)
2. In transformation mode, consecutive newlines are normalized to a single newline
3. Colon-newline sequences in transformation mode are normalized to "colon-space"
4. Comma-newline sequences in transformation mode are normalized to "comma-space"

## Common Use Cases

### Table Formatting

```markdown
| Name | Email |
|------|-------|
| {{users.0.name}} | {{users.0.email}} |
| {{users.1.name}} | {{users.1.email}} |
```

### List Generation

```markdown
- {{users.0.name}}: {{users.0.role}}
- {{users.1.name}}: {{users.1.role}}
```

### Markdown in Variables

Markdown syntax in variables is interpreted when rendered:

```markdown
{{markdownContent}}
// Where markdownContent = "# Heading\n\n- List item 1\n- List item 2"
// Renders as:
# Heading

- List item 1
- List item 2
```

## Error Handling

### Missing Variables

- In strict mode: Throws an error
- In non-strict mode: Renders as empty string

### Missing Properties

- In strict mode: Throws an error
- In non-strict mode: Renders as empty string

### Invalid Array Indices

- In strict mode: Throws an error
- In non-strict mode: Renders as empty string

## Implementation Details

The implementation follows these principles:

1. **Type Preservation**: When accessing properties, original types are maintained until final rendering
2. **Context Awareness**: Variables are rendered differently based on their context (inline vs. block)
3. **Consistent Formatting**: Standardized formatting rules are applied across transformation pipeline
4. **Error Tolerance**: Graceful handling of missing properties and variables in non-strict mode

## Phase 2 Implementation

Phase 2 has enhanced the object property access and variable resolution with the following improvements:

### Enhanced Context Detection

- **Line Position Awareness**: Variables are now rendered with awareness of their position (start, middle, or end of line)
- **Special Markdown Context Detection**: Added recognition of tables, lists, and headings
- **Full Context Preservation**: Formatting decisions now take into account the full formatting context

### Improved Newline Handling

- **Block-specific Rules**: Different rules for newlines in block vs. inline contexts
- **Transformation Mode Awareness**: Special handling of newlines in transformation mode
- **Environment-based Normalization**: Newlines are handled appropriately for the current environment (markdown, XML, etc.)

### Type-specific Formatting Improvements

- **Array Content Analysis**: Arrays are now formatted based on their content complexity
- **Object Pretty-printing**: Enhanced object formatting with better readability
- **Complex Data Structure Handling**: Improved handling of deeply nested structures
- **Primitive Type Optimization**: Special handling for primitive types

### Architecture Improvements

- **FieldAccessHandler**: A dedicated class for handling field access with consistent error handling
- **FormattingContext**: A new structure for tracking and communicating formatting context
- **Client Factory Pattern**: Used to break circular dependencies while preserving functionality
- **Enhanced Error Recovery**: Better error handling and logging in non-strict mode

### Integration

The enhanced field access and formatting is integrated into:

1. **OutputService**: Uses FieldAccessHandler for formatting variables and tracks context for consistent formatting
2. **VariableReferenceResolver**: Provides standardized field access API and handles specific formatting cases
3. **Both components use the Client Factory pattern** to avoid circular dependencies

### Testing

Comprehensive tests now validate:
- Simple and complex object property access patterns
- Array access including nested arrays
- Context-aware formatting in different scenarios
- Newline preservation and normalization
- Error handling for missing fields/properties

These enhancements ensure a more consistent and reliable experience when working with object properties and variable resolution throughout the Meld system.