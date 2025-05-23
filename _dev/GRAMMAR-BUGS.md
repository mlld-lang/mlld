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

### Root Cause
The grammar rule for `@data` identifiers relies on `BaseIdentifier`, which only
allows alphanumeric characters and underscores. Dotted property paths like
`greeting.text` do not match this pattern, so the parser fails before reaching
the assignment.

### Potential Fix
Introduce a new identifier rule that accepts dotted paths or parse the property
path into separate nodes. Update the `@data` directive to use this rule so that
nested properties can be assigned directly.

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

### Root Cause
The parser calls a helper named `isInRunCodeBlockContext` when determining
context for nested directives. This function is referenced in the generated
parser but does not exist in `grammar-core.ts`, resulting in a runtime error
whenever nested directives are encountered.

### Potential Fix
Implement the missing `helpers.isInRunCodeBlockContext` function in the grammar
helpers module. It should analyze the input around the current position to
detect `@run` code block patterns. Rebuild the parser after adding the helper so
that nested directives parse correctly.

### New approach (just added after all this diagnostic above)
We can actually get rid of RHS @run by just making @exec definitions work without requiring @run. Then we don't have to do @exec var (param1, param2) = @run [echo "@param1 @param2"] we can just do @exec var (param1, param2) = [echo "@param1 @param2"]. This simplifies a lot and lets us get rid of the need for any RHS assignment in meld (at least I believe this is the case, as we've gotten rid of @add RHS assignment by consolidating said features into @text directly without requiring @add)

## Directives in Markdown Code Blocks

**Error:** Expected "\n" or [^`\r\n] but end of input found

**Description:**
These errors occur when trying to parse directives contained within markdown code blocks in documentation files. The parser is trying to interpret the example code blocks as actual directives, but they're just examples shown in markdown.

**Files affected:**
- `/core/examples/EXAMPLES.md`

### Root Cause
The directive extractor currently scans entire Markdown files and attempts to
parse every `@` symbol as a real directive. Code examples inside fenced blocks
use the same syntax but should be ignored. Because the extractor does not skip
code fences, it feeds these examples directly to the parser, which then fails.

### Potential Fix
Enhance the extraction logic to detect fenced code blocks and omit their
contents from parsing. A flag could allow processing of examples when desired.

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

### Root Cause
`@add` uses several alternatives in order of precedence. The path variant can
match bracketed content, and because PEG.js selects the first successful match,
`[[` is consumed by the path rule before the template rule gets a chance. The
remaining template body then becomes regular text nodes.

### Potential Fix
Add a lookahead so the path rule fails when the next characters are `[[`. This
ensures the template rule is chosen for multiline templates. Reordering alone is
not sufficient without the explicit check.

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

### Root Cause
`@add` uses the generic `PathCore` rule, which does not recognise the `#`
section syntax. As a result the entire string is treated as a single path value
and the section portion is lost.

### Potential Fix
Use `SectionPathCore` (or a new helper rule) when a `#` marker is present.
This will split the file path and section name into separate AST properties so
handlers can easily extract the desired section.

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

### Root Cause
Node creation defaults to a zeroed location when no explicit location data is
provided. Several grammar rules create text nodes without passing `location()`
to `helpers.createNode`, so every text node inherits the default end position of
`{ line: 1, column: 1, offset: 0 }`.

### Potential Fix
Audit the grammar for all `createNode` calls and ensure `location()` (or the
appropriate computed location) is supplied. After rebuilding the parser, text
nodes should report accurate start and end offsets.
