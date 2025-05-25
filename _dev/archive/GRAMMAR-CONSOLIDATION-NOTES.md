# Grammar Consolidation Analysis

## Duplicate Patterns Found

### 1. Command Reference Pattern (exec.peggy:172-180, add.peggy:172-180)
**Duplicate Code:**
```peggy
CommandReference
  = name:BaseIdentifier _ args:CommandArgs? {
      return {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args: args || [],
        isCommandReference: true
      };
    }
```
**Consolidation:** Move to `patterns/command-base.peggy` or similar shared pattern file.

### 2. Quoted Content Rules (Multiple Files)
**Duplicate Pattern in add.peggy:409-416, text.peggy, and others:**
```peggy
QuotedContent
    = '"' content:$(!'"' .)* '"' {
        return [helpers.createNode(NodeType.Text, { content, location: location() })];
      }
  / "'" content:$(!"'" .)* "'" {
        return [helpers.createNode(NodeType.Text, { content, location: location() })];
      }
```
**Consolidation:** Already partially consolidated in `patterns/content.peggy` as `QuotedSectionTitle`, but name should be generalized.

### 3. Variable Reference Creation (add.peggy:400-407, duplicated pattern)
**Duplicate Code:**
```peggy
VariableReference
  = id:BaseIdentifier accessElements:AnyFieldAccess* {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(accessElements.length > 0 ? { fields: accessElements } : {})
      }, location());
    }
```
**Consolidation:** Already exists in `patterns/variables.peggy` but redefined locally. Should use the shared pattern.

### 4. Template/Command Args Pattern
**Similar patterns in add.peggy:444-462, exec.peggy:183-206, run.peggy:138-159:**
```peggy
// Template args in add.peggy
TemplateArgsList = first:TemplateArg rest:(_ "," _ arg:TemplateArg { return arg; })* { return [first, ...rest]; }

// Command args in exec.peggy
CommandArgsList = first:CommandArg rest:(_ "," _ arg:CommandArg { return arg; })* { return [first, ...rest]; }

// Run command args in run.peggy
RunCommandArgsList = first:RunCommandArg rest:(_ "," _ arg:RunCommandArg { return arg; })* { return [first, ...rest]; }
```
**Consolidation:** Create a generic `ArgsList` pattern that can be parameterized.

### 5. Section Extraction Pattern
**Duplicate in add.peggy:75-120 and text.peggy:59-106:**
Both handle section extraction with path and rename, but with slight variations.
**Consolidation:** Already partially consolidated in `core/section.peggy` but not fully utilized.

### 6. Bracketed Path Section Pattern
**Duplicate in add.peggy:24-74 and text.peggy:7-57:**
Both parse `[path/to/file.md # Section]` syntax with nearly identical logic.
**Consolidation:** Should be extracted to a shared pattern.

### 7. Parameter Lists
**Similar patterns in exec.peggy:221-234 and text.peggy:577-586:**
```peggy
ExecParamsList = first:ExecParam rest:(_ "," _ param:ExecParam { return param; })* { return [first, ...rest]; }
TextParamsList = first:TextParam rest:(_ "," _ param:TextParam { return param; })* { return [first, ...rest]; }
```
**Consolidation:** Generic parameter list pattern needed.

### 8. @add Directive Reference Pattern
**Repeated handling of @add directive in text.peggy (lines 179-314) with multiple similar blocks:**
- Lines 179-231: @add with bracketed path section
- Lines 233-281: @add with section extraction
- Lines 283-315: @add with path
**Consolidation:** Could use the AddCore abstraction more effectively.

### 9. AsNewTitle Pattern
**Defined in add.peggy:435-439 but also used in text.peggy:**
```peggy
AsNewTitle = _ "as" _ title:QuotedSectionTitle { return title; }
```
**Consolidation:** Should be in shared patterns.

### 10. Metadata Helpers
**Similar metadata creation patterns across directives:**
- Path metadata (hasVariables, isAbsolute, hasExtension, extension) repeated
- Command metadata (isMultiLine, hasVariables) repeated
- Template metadata (hasVariables, isTemplateContent) repeated
**Consolidation:** Create metadata helper functions in grammar utilities.

## Naming Inconsistencies

1. **Variable patterns:** `AtVar`, `PathVar`, `UnquotedPathVar`, `BracketVar` - all do similar things
2. **Content patterns:** `LiteralContent`, `QuotedContent`, `QuotedSectionTitle` - overlapping purposes
3. **Reference patterns:** `CommandReference`, `RunCommandReference`, `VariableReference` - could be unified

## Abstraction Opportunities

### 1. Generic List Pattern
Create a parameterized list pattern:
```peggy
GenericList(ItemRule, separator = ",")
  = first:ItemRule rest:(_ separator _ item:ItemRule { return item; })* {
      return [first, ...rest];
    }
```

### 2. Directive Reference Pattern
Many directives have similar "@directive" reference patterns that could be abstracted.

### 3. Content Processing Pattern
The pattern of:
1. Parse content
2. Check for variables
3. Create metadata
4. Return structured result

Is repeated across many directives and could be abstracted.

### 4. Quoted String Pattern Family
Create a family of quoted string patterns:
- `QuotedLiteral` - no interpolation
- `QuotedWithEscape` - escape sequences
- `QuotedPath` - path-specific handling

## Recommendations

1. **Create `patterns/lists.peggy`** for all list-related patterns
2. **Create `patterns/metadata.peggy`** for metadata helper patterns
3. **Consolidate variable patterns** in `patterns/variables.peggy` and remove local redefinitions
4. **Extract bracketed path section** to `patterns/path-section.peggy`
5. **Standardize naming conventions** according to `grammar/docs/NAMING-CONVENTIONS.md`
6. **Use core abstractions more consistently** - many directives reimplement what's already in core/
7. **Create generic argument parsing** pattern that can handle both positional and named arguments
8. **Consolidate quoted content patterns** into a single, well-organized pattern file

## Priority Consolidations

1. **High Priority:**
   - Remove duplicate `CommandReference` definitions
   - Consolidate all list patterns
   - Fix variable pattern usage (stop redefining `VariableReference`)

2. **Medium Priority:**
   - Extract bracketed path section pattern
   - Consolidate argument parsing patterns
   - Standardize metadata creation

3. **Low Priority:**
   - Naming convention cleanup
   - Documentation improvements
   - Helper function consolidation