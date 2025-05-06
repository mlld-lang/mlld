# Interpolation Patterns Audit

This document provides a comprehensive audit of interpolation patterns defined in `interpolation.peggy` and `interpolation-patterns.peggy`.

## Patterns in interpolation.peggy

### Pattern: LiteralStringContent
- **Description**: Captures the content within quoted strings without the quotes
- **Uses**: None (base pattern)
- **Input Selection**: Any characters that aren't quote markers or escape sequences
- **Output Structure**: Array with a single Text node containing the string content
- **Example Input**: `abc123` (content inside quotes)
- **Example Output**: `[{ type: "Text", content: "abc123" }]`
- **Location**: interpolation.peggy:11-15

### Pattern: LiteralString
- **Description**: Matches quoted strings and extracts the content
- **Uses**: LiteralStringContent (custom implementation in latest version)
- **Input Selection**: Text within quotes (`"..."`, `'...'`, `...`)
- **Output Structure**: Array with a single Text node containing the string content (excluding quotes)
- **Example Input**: `"hello world"`
- **Example Output**: `[{ type: "Text", content: "hello world" }]`
- **Location**: interpolation.peggy:18-29

### Pattern: BracketLiteralSegment
- **Description**: Captures literal text segments within brackets
- **Uses**: None (base pattern)
- **Input Selection**: Any characters within brackets that aren't `]` or `@`
- **Output Structure**: Single Text node containing the string content
- **Example Input**: `some text` (content inside brackets)
- **Example Output**: `{ type: "Text", content: "some text" }`
- **Location**: interpolation.peggy:28-32

### Pattern: PathSeparator
- **Description**: Captures path separator characters
- **Uses**: None (base pattern)
- **Input Selection**: Forward slash `/`
- **Output Structure**: Single PathSeparator node
- **Example Input**: `/`
- **Example Output**: `{ type: "PathSeparator", value: "/" }`
- **Location**: interpolation.peggy:35-39

### Pattern: BracketContent
- **Description**: Captures content inside single brackets, allowing @var interpolation
- **Uses**: AtVar, BracketLiteralSegment, PathSeparator
- **Input Selection**: Text and variables within brackets `[...]`
- **Output Structure**: Array of Text, VariableReference, and PathSeparator nodes
- **Example Input**: `[path/to/@var]` (content including brackets)
- **Example Output**: `[{ type: "Text", content: "path" }, { type: "PathSeparator", value: "/" }, { type: "Text", content: "to" }, { type: "PathSeparator", value: "/" }, { type: "VariableReference", identifier: "var" }]`
- **Location**: interpolation.peggy:42-46

### Pattern: BracketContainer
- **Description**: Matches single brackets and processes their content
- **Uses**: BracketContent
- **Input Selection**: Content wrapped in brackets `[...]`
- **Output Structure**: Array of nodes from BracketContent
- **Example Input**: `[path/to/@var]`
- **Example Output**: Same as BracketContent
- **Location**: interpolation.peggy:49-50

### Pattern: DoubleBracketLiteralSegment
- **Description**: Captures literal text segments within double brackets
- **Uses**: None (base pattern)
- **Input Selection**: Any characters within double brackets that aren't `]]` or `{{`
- **Output Structure**: Single Text node containing the string content
- **Example Input**: `some text` (content inside double brackets)
- **Example Output**: `{ type: "Text", content: "some text" }`
- **Location**: interpolation.peggy:54-60

### Pattern: DoubleBracketContent
- **Description**: Captures content inside double brackets, allowing {{var}} interpolation
- **Uses**: InterpolationVar, DoubleBracketLiteralSegment
- **Input Selection**: Text and variables within double brackets `[[...]]`
- **Output Structure**: Array of Text and VariableReference nodes
- **Example Input**: `[[text with {{var}}]]` (content including brackets)
- **Example Output**: `[{ type: "Text", content: "text with " }, { type: "VariableReference", identifier: "var" }]`
- **Location**: interpolation.peggy:63-67

### Pattern: DoubleBracketContainer
- **Description**: Matches double brackets and processes their content
- **Uses**: DoubleBracketContent
- **Input Selection**: Content wrapped in double brackets `[[...]]`
- **Output Structure**: Array of nodes from DoubleBracketContent
- **Example Input**: `[[text with {{var}}]]`
- **Example Output**: Same as DoubleBracketContent
- **Location**: interpolation.peggy:70-71

### Pattern: UnquotedPath
- **Description**: Captures paths without quotes or brackets
- **Uses**: AtVar, UnquotedPathSegment, PathSeparator
- **Input Selection**: Unquoted path text with potential @var interpolation
- **Output Structure**: Array of Text, VariableReference, and PathSeparator nodes
- **Example Input**: `path/to/@var`
- **Example Output**: `[{ type: "Text", content: "path" }, { type: "PathSeparator", value: "/" }, { type: "Text", content: "to" }, { type: "PathSeparator", value: "/" }, { type: "VariableReference", identifier: "var" }]`
- **Location**: interpolation.peggy:77-82

### Pattern: UnquotedPathSegment
- **Description**: Captures segments of unquoted paths
- **Uses**: None (base pattern)
- **Input Selection**: Characters that aren't whitespace, path separators, or variable markers
- **Output Structure**: Single Text node containing the segment
- **Example Input**: `segment`
- **Example Output**: `{ type: "Text", content: "segment" }`
- **Location**: interpolation.peggy:84-87

### Pattern: UnquotedCommand
- **Description**: Captures commands without quotes
- **Uses**: AtVar, UnquotedCommandSegment
- **Input Selection**: Unquoted command text with potential @var interpolation
- **Output Structure**: Array of Text and VariableReference nodes
- **Example Input**: `ls -la @dir`
- **Example Output**: `[{ type: "Text", content: "ls -la " }, { type: "VariableReference", identifier: "dir" }]`
- **Location**: interpolation.peggy:94-97

### Pattern: UnquotedCommandSegment
- **Description**: Captures segments of unquoted commands
- **Uses**: None (base pattern)
- **Input Selection**: Characters that aren't whitespace, semicolons, or variable markers
- **Output Structure**: Single Text node containing the segment
- **Example Input**: `ls -la`
- **Example Output**: `{ type: "Text", content: "ls -la" }`
- **Location**: interpolation.peggy:99-103

## Patterns in interpolation-patterns.peggy

### Pattern: AllInterpolationTypes
- **Description**: Composite pattern that matches all interpolation patterns
- **Uses**: DoubleBracketContainer, BracketContainer, UnquotedPath, LiteralString
- **Input Selection**: Any text matching any of its component patterns
- **Output Structure**: Output of the matched pattern
- **Location**: interpolation-patterns.peggy:10-14

### Pattern: PathStyleInterpolation
- **Description**: Matches path-specific interpolation patterns
- **Uses**: BracketContainer, UnquotedPath, LiteralString
- **Input Selection**: Paths in brackets, unquoted paths, or quoted paths
- **Output Structure**: Output of the matched pattern
- **Location**: interpolation-patterns.peggy:17-20

### Pattern: BracketStyleInterpolation
- **Description**: Matches only bracketed interpolation patterns
- **Uses**: BracketContainer, UnquotedPath
- **Input Selection**: Paths in brackets or unquoted paths
- **Output Structure**: Output of the matched pattern
- **Location**: interpolation-patterns.peggy:23-25

### Pattern: TemplateStyleInterpolation
- **Description**: Matches template-specific interpolation patterns
- **Uses**: DoubleBracketContainer, LiteralString
- **Input Selection**: Content in double brackets or quoted strings
- **Output Structure**: Output of the matched pattern
- **Location**: interpolation-patterns.peggy:28-30

### Pattern: WrappedTemplateContent
- **Description**: Wraps template content with raw string reconstruction
- **Uses**: TemplateStyleInterpolation
- **Input Selection**: Templates matching TemplateStyleInterpolation
- **Output Structure**: Object with `parts` (original nodes) and `raw` (reconstructed string)
- **Example Output**: `{ parts: [...nodes], raw: "reconstructed string" }`
- **Location**: interpolation-patterns.peggy:37-43

### Pattern: WrappedPathContent
- **Description**: Wraps path content with raw string reconstruction
- **Uses**: PathStyleInterpolation
- **Input Selection**: Paths matching PathStyleInterpolation
- **Output Structure**: Object with `parts` (original nodes) and `raw` (reconstructed string)
- **Example Output**: `{ parts: [...nodes], raw: "reconstructed string" }`
- **Location**: interpolation-patterns.peggy:46-61

### Pattern: WrappedPurePath
- **Description**: Wraps pure path content with raw string reconstruction
- **Uses**: BracketStyleInterpolation
- **Input Selection**: Paths matching BracketStyleInterpolation
- **Output Structure**: Object with `parts` (original nodes) and `raw` (reconstructed string)
- **Example Output**: `{ parts: [...nodes], raw: "reconstructed string" }`
- **Location**: interpolation-patterns.peggy:64-78

### Pattern: WrappedCommandContent
- **Description**: Wraps command content with raw string reconstruction
- **Uses**: AllInterpolationTypes
- **Input Selection**: Commands matching AllInterpolationTypes
- **Output Structure**: Object with `parts` (original nodes) and `raw` (reconstructed string)
- **Example Output**: `{ parts: [...nodes], raw: "reconstructed string" }`
- **Location**: interpolation-patterns.peggy:81-88

### Pattern: WrappedCodeContent
- **Description**: Special pattern for code blocks without interpolation
- **Uses**: None (custom implementation)
- **Input Selection**: Code within brackets or unbracketed code
- **Output Structure**: Object with `parts` (Text node) and `raw` (code string)
- **Example Output**: `{ parts: [{ type: "Text", content: "code" }], raw: "code" }`
- **Location**: interpolation-patterns.peggy:91-103

## Issues Identified

1. **Quote Handling in LiteralString**:
   - Despite having logic to remove quotes, LiteralString seems to still include quote characters in the AST.
   - The quotes are showing up in the final output.

2. **Complex Pattern Layering**:
   - Multiple layers of pattern matching (basic patterns → composite patterns → wrapped patterns) makes debugging difficult.
   - Patterns built on other patterns may not properly handle edge cases from their components.

3. **Quote Stripping in WrappedPathContent**:
   - WrappedPathContent attempts to strip quotes from raw strings but this isn't working in the compiled parser.
   - This isn't being applied during the reconstruction process.

4. **AST Node Structure**:
   - Text nodes containing quotes are being created separately rather than removing the quotes during parsing.
   - This leads to unwanted quotes in the reconstructed strings.

5. **Path Test Failures**:
   - Tests are expecting raw paths without quotes, but the current implementation preserves the quotes.
   - The issue is primarily with how quoted strings in paths are handled.