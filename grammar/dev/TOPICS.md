# Grammar Refactoring Topics

## TOPIC 1: Updating Directive Files
We need to carefully go through each grammar/directive/*.peggy file and update them to use our new interpolation abstractions. This requires careful coordination to ensure each directive properly handles the new variable access patterns.

## TOPIC 2: Subtype Inference from Interpolation Syntax
We have identified four primary interpolation pattern types:
1. Literal quotes (`"..."`, `'...'`, `` `...` ``) - No interpolation
2. Brackets (`[...]`) - @var interpolation
3. Implied brackets (no wrapper) - @var interpolation (e.g., unquoted paths)
4. Double brackets (`[[...]]`) - {{var}} interpolation

**Key insight**: Subtypes should be inferred from the interpolation syntax provided, rather than having explicit syntax for each subtype.

### Directive-Specific Pattern Requirements

| Directive | Subtype | Pattern Types | Notes |
|-----------|---------|---------------|-------|
| import | all | 1, 2, 3 | For all import subtypes, specifically for paths |
| text | textTemplate | 1, 4 | Merge textTemplate and textAssignment; assignment becomes template without variables |
| text | textPath | 2, 3 | **NEW** - For path-specific text assignments |
| text | textValue | N/A | Defined by RHS assignment to another directive's value |
| path | pathAssignment | 1, 2, 3 | |
| exec | execCommand | 1, 2, 3, 4 | |
| exec | execCode | Special | Needs CodeBlocks pattern without interpolation; disambiguated by language parameter |
| run | runCommand | 1, 2, 3, 4 | |
| run | runCode | Special | Same as execCode, no interpolation in code blocks |
| add | addTemplate | 1, 4 | |
| add | addPath | 2, 3 | |
| add | addVariable | Special | Expects a single variable |
| data | | Special | See TOPIC 3 |

### Required Reusable Interpolation Abstractions
Based on this analysis, we should create these pattern abstractions:
- One to handle all types (1, 2, 3, 4)
- One to handle literals, brackets, implied brackets (1, 2, 3)
- One to handle brackets and implied brackets only (2, 3)
- One to handle literals and double brackets (1, 4)

### Note on Path Syntax
- Paths should be required to be in brackets to disambiguate them
- Need to support escaping @ character (`\@`) for literal @ in paths

## TOPIC 3: Data Interpolation
Data directives present a special case for interpolation:

- How do we handle variable interpolation inside JSON objects and arrays?
- Do we allow @var references in object keys?
- Do we allow both @var and {{var}} inside data values?
- Special syntax considerations for data structures

This requires dedicated thought and careful design.

## TOPIC 4: Add textPath Subtype
We should add a `textPath` subtype to allow:
```
@text myvar = @docs/file.md
```

Benefits:
- More intuitive for path-based text assignments
- Eliminates need for embed on RHS
- Makes @run the only directive possible for RHS assignment
- Clearly distinguishes between text and path variables