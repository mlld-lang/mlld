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

## Multiline Template Parsing in Add Directives

**Error:** Parser incorrectly interprets multiline templates as paths

**Examples:**
```
@add [[
Content with {{variable}}

And some more content

Hey, here's the same variable again: {{variable}}
]]
```

**Description:**
The parser is incorrectly parsing `@add [[` as the start of a path directive (addPath) instead of recognizing it as the beginning of a multiline template (addTemplate). The fixture shows the AST has `subtype: "addPath"` with `content: "[["` when it should be `subtype: "addTemplate"`.

**Files affected:**
- `/core/examples/add/template/example-multiline.md`
- `/core/ast/fixtures/add-template-multiline.fixture.json`

**Current behavior:**
- The parser creates an `addPath` node with `path` value of `"[["`
- Subsequent template content is parsed as separate Text and VariableReference nodes
- The directive is not properly recognized as a template

**Expected behavior:**
- Should create an `addTemplate` node
- The template content should be parsed as part of the directive's `content` value
- Variables within the template should be properly recognized

## Section Extraction Syntax Not Parsed

**Error:** Section extraction using `#` syntax is not properly parsed

**Examples:**
```
@add [file.md # Section 1]
```

**Description:**
The parser is not correctly parsing the section extraction syntax. When using the `#` symbol to specify a section, the parser includes it as part of the path string instead of creating a separate `section` property in the values. The handler expects `values.section` to contain the section name, but the AST shows it's all in `values.path` as "file.md # Section 1".

**Files affected:**
- `/core/examples/add/path/example-section.md`
- `/core/ast/fixtures/add-path-section.fixture.json`

**Current behavior:**
- The parser creates `values.path` containing "file.md # Section 1"
- No `values.section` property is created

**Expected behavior:**
- Should create `values.path` containing "file.md"
- Should create `values.section` containing "Section 1"
- The handler can then use both properties to properly extract the section

## Text Node Position Calculation

**Error:** Parser returns incorrect end positions for text nodes

**Examples:**
```
# Test Document

This is a simple paragraph of text.
```

**Description:**
The parser is incorrectly calculating end positions for text nodes. All text nodes are returning `end: { line: 1, column: 1, offset: 0 }` regardless of their actual end position. This affects position reporting and error messages.

**Files affected:**
- `/services/pipeline/ParserService/ParserService.test.ts`
- Any code relying on accurate position information from text nodes

**Current behavior:**
- Text node end positions always show `{ line: 1, column: 1, offset: 0 }`
- This happens regardless of the actual text length or position

**Expected behavior:**
- End position should reflect the actual end of the text content
- For "This is a simple paragraph of text.", end should be `{ line: 1, column: 36 }`

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

5. **Multiline Template Parsing:**
   - Fix the grammar rule for `@add` directives to prioritize template detection over path detection
   - Ensure the parser correctly identifies `[[` as the start of a template rather than a path
   - Update the lookahead logic to properly distinguish between templates and paths

6. **Text Node Position Calculation:**
   - Fix the position calculation logic in the parser to correctly compute end positions
   - Ensure offset values are properly calculated for all node types