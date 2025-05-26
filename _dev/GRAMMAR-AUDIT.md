# Mlld Grammar Audit Report

This document identifies specific duplication, abstraction violations, and consolidation opportunities in the Mlld grammar system.

## 1. Duplicate CommandReference Pattern

**Issue**: Identical `CommandReference` rule defined in multiple files.

**Files**:
- `grammar/directives/exec.peggy` (lines 169-174)
- `grammar/directives/add.peggy` (lines 169-174)

**Duplicate Code**:
```peggy
CommandReference
  = name:BaseIdentifier _ args:CommandArgsList? {
      helpers.debug('CommandReference matched', { name, args });
      return { name, args: args || [] };
    }
```

**Impact**: Maintenance burden, potential for inconsistent updates.

## 2. Repeated List Parsing Patterns

**Issue**: Similar comma-separated list patterns implemented independently across files.

**Instances**:
1. **TextParamsList** in `grammar/directives/text.peggy` (lines 577-580)
2. **ImportSelectedList** in `grammar/directives/import.peggy` (lines 124-127)
3. **CommandArgsList** in:
   - `grammar/directives/exec.peggy` (lines 176-179)
   - `grammar/directives/add.peggy` (lines 176-179)
4. **DataProperties** in `grammar/patterns/rhs.peggy` (lines 106-109)
5. **DataItems** in `grammar/patterns/rhs.peggy` (lines 121-124)
6. **TemplateOptionsList** in `grammar/core/template.peggy` (lines 92-104)

**Pattern**:
```peggy
// Same structure, different names and item types
SomeList
  = first:Item rest:(_ "," _ item:Item { return item; })* {
      return [first, ...rest];
    }
```

**Impact**: ~50+ lines of duplicated parsing logic.

## 3. Inconsistent Variable Reference Usage

**Issue**: Multiple implementations of variable references instead of using shared `AtVar` pattern.

**Violations**:
1. **BracketVar** in `grammar/patterns/content.peggy` (lines 65-73)
   - Reimplements `AtVar` logic for bracket context
2. **UnquotedPathVar** in `grammar/patterns/content.peggy` (lines 112-121)
   - Reimplements `AtVar` logic for unquoted paths
3. **Local variable patterns** in various directives instead of importing

**Shared Pattern Available**: `grammar/patterns/variables.peggy` - `AtVar` (lines 15-35)

**Impact**: Inconsistent variable handling, harder to maintain variable syntax.

## 4. Duplicate Bracketed Path Section Parsing

**Issue**: Identical bracketed path section parsing in multiple directives.

**Duplicate Code**:
```peggy
'[' pathText:$([^#\]]+) '#' _ sectionText:$([^\]]+) ']'
```

**Files**:
1. `grammar/directives/add.peggy` (line 25)
2. `grammar/directives/text.peggy` (line 7)
3. `grammar/directives/text.peggy` (line 180) - for @add variant

**Impact**: Triple implementation of the same parsing logic.

## 5. Overlapping Quoted Content Patterns

**Issue**: Multiple patterns handling quoted strings with slight variations.

**Patterns**:
1. **LiteralContent** in `grammar/patterns/content.peggy` (lines 36-46)
   - Handles double, single, and backtick quotes
2. **QuotedSectionTitle** in `grammar/patterns/content.peggy` (lines 49-56)
   - Duplicates double and single quote handling
3. **QuotedContent** referenced but not defined in current files
4. **StringLiteral** in `grammar/base/literals.peggy`

**Impact**: Confusing API, unclear which pattern to use when.

## 6. Metadata Creation Duplication

**Issue**: Repeated metadata creation patterns across directives.

**Example - Path Metadata**:
```peggy
const meta = {
  path: {
    hasVariables: false,
    isAbsolute: rawPath.startsWith('/'),
    hasExtension: /\.[a-zA-Z0-9]+$/.test(rawPath),
    extension: rawPath.match(/\.([a-zA-Z0-9]+)$/)?.[1] || null
  }
};
```

**Found In**:
- `grammar/directives/add.peggy` (lines 55-63)
- Similar patterns in other path-handling directives

**Other Metadata Patterns**:
- Command metadata (hasVariables, isMultiLine)
- Template metadata (hasVariables, isTemplateContent)
- Section metadata (hasRename)

**Impact**: Inconsistent metadata structure, repeated regex patterns.

## 7. Incomplete Core Pattern Usage

**Issue**: Core patterns exist but directives reimplement their logic.

**Examples**:
1. **TemplateCore** exists in `grammar/core/template.peggy` but:
   - Text directive has inline template handling
   - Add directive reimplements template parsing

2. **CommandCore** exists in `grammar/core/command.peggy` but:
   - Run directive has inline command parsing
   - Exec directive duplicates command logic

3. **SectionExtractionCore** exists in `grammar/core/section.peggy` but:
   - Only partially used in text.peggy
   - Add directive doesn't use it for section extraction

**Impact**: Core abstractions aren't providing value, duplicate implementations.

## 8. Naming Convention Violations

**Issue**: Inconsistent naming despite documented conventions in `NAMING-CONVENTIONS.md`.

**Violations**:
1. **Legacy Patterns Still Present**:
   - `PathVar` in `grammar/patterns/variables.peggy` (lines 67-75) marked as legacy
   - Should be removed in favor of `AtVar`

2. **Inconsistent Variable Naming**:
   - `AtVar` (correct pattern)
   - `BracketVar` (should be part of AtVar with context)
   - `UnquotedPathVar` (should use AtVar)
   - `InterpolationVar` (correct for different syntax)

3. **Content Pattern Naming**:
   - `LiteralContent` vs `QuotedContent` vs `QuotedSectionTitle`
   - No clear hierarchy or naming pattern

4. **Missing Prefixes/Suffixes**:
   - `CommandArgsList` should be `CommandArgumentList`
   - `TextParamsList` should be `TextParameterList`

**Impact**: Harder to understand pattern hierarchy, inconsistent developer experience.

## 9. Missing Abstraction Opportunities

**Issue**: Common patterns that could be abstracted but aren't.

**Opportunities**:
1. **Generic List Parser**: Could replace all list patterns
2. **Path Section Parser**: Could handle all `[path # section]` patterns
3. **Metadata Builders**: Could standardize metadata creation
4. **Wrapper Patterns**: Could consolidate content wrapping logic

## Summary Statistics

- **Files with duplication**: 8+ files
- **Duplicate code blocks**: 15+ instances
- **Lines that could be removed**: ~200-300 lines
- **Patterns that could be consolidated**: 10+ patterns
- **Naming violations**: 8+ instances

## Recommendation

A systematic refactoring following the phased plan in `GRAMMAR-UPDATE.md` could reduce the grammar size by approximately 20-30% while improving maintainability and consistency.