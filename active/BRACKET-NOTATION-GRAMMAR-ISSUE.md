# Bracket Notation Grammar Issue - Comprehensive Analysis

## Problem Summary

Bracket notation for object property access (e.g., `@obj["key"]`, `@obj[@variable]`) is **parsed correctly** but **not passed through** to directive evaluators in many contexts. The issue is in the grammar's variable reference patterns, not in the evaluation logic.

## What Works vs What Doesn't

### ✅ Working Contexts
- **Individual AST parsing**: `npm run ast -- '/var @result = @obj["key"]'` shows correct AST with `fields: [{type: 'stringIndex', value: 'key'}]`
- **Template interpolation**: `` `Value: @obj["key"]` `` works correctly
- **Function arguments**: `@func(@obj["key"])` works correctly (confirmed by existing tests)

### ❌ Broken Contexts  
- **Show directive**: `/show @obj["key"]` - bracket notation fields not included in VariableReference node
- **Variable assignment**: `/var @result = @obj["key"]` - likely broken (needs testing)
- **Other directives**: Likely broken in `/when`, `/output`, etc. wherever VariableReference is used

## Root Cause Analysis

### Evidence from Debug Output

**Working case** (`/show @obj.Alice`):
```json
{
  "identifier": "test", 
  "fields": [{"type": "field", "value": "Alice"}]
}
```

**Broken case** (`/show @obj["Alice"]`):
```json
{
  "identifier": "test"
  // NO fields property at all!
}
```

### Grammar Architecture Issue

The problem appears to be in the **directive-specific variable reference patterns**. Different parts of the grammar may be using different variable reference patterns, and some don't properly include field access.

From `grammar/docs/README.md`, the grammar emphasizes finding "the One True Abstraction" and keeping patterns DRY. This suggests we need to:

1. **Identify the canonical variable reference pattern** that properly includes field access
2. **Find all places** where variable references are used in directives  
3. **Unify them** to use the same pattern that preserves bracket notation

## Investigation Plan

### Phase 1: Map the Problem
1. **Test all directive contexts** to confirm which ones are broken:
   ```bash
   # Test variable assignment
   /var @result = @obj["key"]
   
   # Test when directive  
   /when @obj["key"] => /show "matched"
   
   # Test output directive
   /output @obj["key"] to stdout
   
   # Test other contexts...
   ```

2. **Find grammar patterns** used for variable references in different contexts:
   - Search for patterns that handle `@variable` references
   - Identify which ones include field access vs which don't
   - Map which directives use which patterns

### Phase 2: Find the One True Pattern
1. **Locate the working pattern** (likely used in templates/function args)
2. **Identify the broken patterns** (likely used in directive values)
3. **Understand the grammar hierarchy** per `grammar/docs/README.md`

### Phase 3: Unify and Fix
1. **Create/identify unified VariableReference pattern** that always includes field access
2. **Update all directive patterns** to use the unified pattern
3. **Test comprehensively** across all contexts
4. **Add regression tests** for bracket notation in all directive types

## Expected Locations to Investigate

Based on the grammar structure:
- `grammar/patterns/variables.peggy` - Variable reference patterns
- `grammar/directives/*.peggy` - Individual directive patterns  
- `grammar/patterns/fields.peggy` - Field access patterns (confirmed working)
- Look for patterns like `AtVar`, `VariableReference`, etc.

## Technical Details

### Field Access Types (from AST)
- `field`: Dot notation (`.property`)
- `stringIndex`: Bracket notation with string (`["key"]`)  
- `arrayIndex`: Bracket notation with number (`[0]`)
- `numericField`: Numeric dot notation (`.123`)

### Parser vs Evaluator
- **Parser**: Grammar correctly generates field access nodes
- **Evaluator**: Field access utility works correctly when fields are present
- **Pipeline Issue**: Bracket notation fields lost between parsing and evaluation

## Fix Validation

After implementing the grammar fix, verify:
1. All directive contexts support bracket notation
2. Existing tests still pass (no regressions)
3. Both string and variable bracket notation work (`@obj["key"]` and `@obj[@var]`)
4. Nested bracket notation works (`@obj["key"]["subkey"]`)
5. Mixed notation works (`@obj.field["key"].subfield`)

## Success Criteria

```mlld
# All of these should work identically:
/var @obj = {"my-key": "value", "other": {"nested": "data"}}
/var @key = "my-key"

# Direct access
/show @obj.my-key        # Error: invalid identifier
/show @obj["my-key"]     # Should work: "value"
/show @obj[@key]         # Should work: "value"

# In all contexts
/var @result = @obj["my-key"]      # Should work
/when @obj["my-key"] => /show "found"  # Should work  
/output @obj["my-key"] to stdout   # Should work
```

## Next Session Action Items

1. **Test systematically** - Create test cases for bracket notation in every directive type
2. **Map grammar patterns** - Find all VariableReference patterns and their relationships
3. **Follow grammar/README.md guidance** - Apply DRY principles to unify patterns
4. **Implement unified fix** - Update grammar to consistently support field access
5. **Add comprehensive tests** - Prevent future regressions

The goal is to make bracket notation work universally across all mlld contexts, just like dot notation currently does.