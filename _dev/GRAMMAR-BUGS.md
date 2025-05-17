# Grammar Bugs and Parser Issues

This document lists known issues with the current Meld grammar and parser implementation.

## Nested Property Notation in Data Directives

**Error:** Expected "=" or whitespace but "." found

**Examples:**
```
@data greeting.text = "Hello, world!"
@data number.count = 42
@data isEnabled.value = true
```

**Description:**
The parser is having trouble with the nested property notation in data directives. It's expecting the identifier to be a simple name without dots, but our examples use dot notation to define nested properties.

**Files affected:**
- `/core/examples/data/primitive/example.md`
- `/core/examples/data/primitive/example-number.md`
- `/core/examples/data/primitive/example-boolean.md`

## Nested Directives

**Error:** helpers.isInRunCodeBlockContext is not a function

**Examples:**
```
@data result = @run echo "Command output"
```

**Description:**
The parser is having issues with directives that contain other directives. This is likely due to a missing helper function `isInRunCodeBlockContext` in the parser implementation.

**Files affected:**
- `/core/examples/data/directive/example.md`

## Language Specifiers in Exec Directives

**Error:** Expected "@run" or whitespace but "j" or "e" found

**Examples:**
```
@exec sum (a, b) = javascript [console.log(Number(a) + Number(b));]
@exec format (name) = javascript [
  // Format the name with title case
  const words = name.split(' ');
  const titled = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1).toUpperCase();
  });
  return titled.join(' ');
]
```

**Description:**
The parser is having trouble with the language specificity in exec directives. It's expecting a run directive but finding the language specifier (like "javascript").

**Files affected:**
- `/core/examples/exec/code/example.md`
- `/core/examples/exec/code/example-multiline.md`
- `/core/examples/run/exec/example.md`

## Directives in Markdown Code Blocks

**Error:** Expected "\n" or [^`\r\n] but end of input found

**Description:**
These errors occur when trying to parse directives contained within markdown code blocks in documentation files. The parser is trying to interpret the example code blocks as actual directives, but they're just examples shown in markdown.

**Files affected:**
- `/core/examples/EXAMPLES.md`

## Suggested Fixes

1. **Nested Property Notation:**
   - Update the parser grammar to support dot notation in identifiers for data directives
   - Consider adding specific rules for data property paths

2. **Nested Directives:**
   - Implement the missing `isInRunCodeBlockContext` helper function
   - Ensure the parser can properly handle directives nested within other directives

3. **Language Specifiers:**
   - Enhance the parser to recognize language specifiers in exec directives
   - Add specific grammar rules for different language constructs

4. **Markdown Code Blocks:**
   - Enhance the directive extractor to ignore content within markdown code blocks
   - Consider adding a flag to control whether to parse examples in documentation