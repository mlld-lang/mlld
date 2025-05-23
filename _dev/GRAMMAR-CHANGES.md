# Grammar Changes Log

This document tracks grammar changes made and their implications for type updates.

## Pending Changes

### 1. Complex Data Assignment Support
**Status**: 📋 Planned
**Issue**: Enable @data directives to contain embedded directives and complex expressions as values
**Proposed Changes**:
- Add all directive names (@data, @text, @run, @add, @path, @import, @exec, @define) as reserved keywords
- Extend object/array value rules to support DirectiveValue, VariableReferenceValue, and TemplateValue
- Support both quoted and unquoted object keys (JSON5-style)
- Enable directive embedding: `{ test: @run [npm test], docs: @add [@README.md] }`
- Enable variable references: `{ path: @myVar.field[0] }`
- Enable inline templates: `{ msg: [[Hello {{name}}!]] }`
- Extend grammar to support mixed dot/bracket notation in all contexts (currently only works in templates)
**Type Implications**:
- New DataValue union type to replace simple JsonValue
- DirectiveValue, VariableReferenceValue, TemplateValue wrapper types
- ComplexDataVariable type with lazy evaluation support
**Implementation Plans**:
- Grammar: `_dev/COMPLEX-DATA-GRAMMAR-PLAN.md`
- Interpreter: `_dev/COMPLEX-DATA-INTERPRETER-PLAN.md`

### 2. Optional Brackets for Path Values
**Status**: 📋 Planned
**Priority**: Low
**Issue**: Allow paths to be specified without brackets, with variable interpolation
**Current State**:
- `@text file = [README.md]` - Works (path with @var interpolation)
- `@text file = "README.md"` - Works (literal string, no interpolation)
- `@text file = README.md` - Doesn't work (parse error)
**Proposed Changes**:
- Allow unquoted/unbracket path values in assignment contexts
- Treat unquoted paths the same as single-bracket paths (with @var interpolation)
- This would enable cleaner syntax: `@text file = path/to/@version/file.md`
**Type Implications**: None - just grammar parsing changes
**Examples**:
```meld
# These should be equivalent:
@text file1 = [path/to/@version/file.md]
@text file2 = path/to/@version/file.md

# Both should interpolate @version but not {{version}}
```

## Notes

When new grammar changes are made:
1. Document the change with clear before/after examples
2. Note any type implications
3. Indicate if interpreter changes are needed
4. Mark as completed once incorporated