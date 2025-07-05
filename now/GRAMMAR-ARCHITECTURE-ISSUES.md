# Grammar Architecture Issues

## Issue 1: AST Structure Inconsistency (CRITICAL)

### Problem
The grammar produces **inconsistent AST structures** that violate the architectural principle that all directive `values` should contain arrays.

### Current Inconsistencies

**❌ Violates Architecture**:
```javascript
// Import directive
values: { namespace: 'file' }                    // ← String, not array

// Var directive  
values: { identifier: VariableReferenceNode }    // ← Object, not array
```

**✅ Follows Architecture**:
```javascript
// Path directive
values: { identifier: [VariableReferenceNode] }  // ← Array ✅

// Exe directive  
values: { identifier: [VariableReferenceNode] }  // ← Array ✅

// Show directive
values: { content: [TextNode] }                  // ← Array ✅
```

### Implications
1. **Fragile interpreter code** - Some code expects arrays, some expects objects
2. **Type safety broken** - TypeScript types become unreliable  
3. **Developer confusion** - Must remember which fields are arrays vs objects
4. **Maintenance burden** - Different traversal patterns needed throughout codebase
5. **Test failures** - Architecture validation tests fail

### Root Cause
Grammar evolution without updating all directive patterns to follow the array-based architecture.

### Solution Required
**Option A**: Update grammar to make ALL directive values arrays:
```javascript
// Fix import
values: { namespace: ['file'] }

// Fix var  
values: { identifier: [VariableReferenceNode] }
```

**Option B**: Update architecture test to allow specific exceptions:
```javascript
// Add to special cases
const isSpecialCase = 
  (node.kind === 'import' && key === 'namespace') ||
  (node.kind === 'var' && key === 'identifier');
```

**Recommendation**: Option A (fix grammar) for consistency.

---

## Issue 2: Bracket Notation Parsing Bug (HIGH PRIORITY)

### Problem
Bracket notation field access `@data["key"]` is parsed as **two separate nodes** instead of a single VariableReference with field access.

### Current Behavior (WRONG)
```mlld
/show @data["key"]
```

**Parsed as**:
```javascript
[
  {
    type: 'Directive',
    values: {
      variable: [{
        type: 'VariableReference',
        identifier: 'data'        // ← Missing field access
      }]
    }
  },
  {
    type: 'Text',
    content: '["key"]'            // ← Should be part of VariableReference
  }
]
```

### Expected Behavior (CORRECT)
```javascript
[
  {
    type: 'Directive', 
    values: {
      variable: [{
        type: 'VariableReference',
        identifier: 'data',
        fields: [{                // ← Should include field access
          type: 'FieldAccess',
          value: 'key'
        }]
      }]
    }
  }
]
```

### Impact
1. **Syntax errors**: `/show @data["key"]` fails with "Invalid /show syntax"
2. **User-facing bug**: Bracket notation doesn't work in directives
3. **Inconsistent behavior**: Bracket notation may work in some contexts but not others
4. **Test failures**: `bracket-notation-working` test fails

### Root Cause
Grammar rule for VariableReference doesn't include bracket notation as part of the variable parsing pattern.

### Files Likely Affected
- `grammar/patterns/variable-reference.peggy` (or similar)
- Grammar rules that define variable reference parsing
- Any code that expects field access to work

### Investigation Needed
1. Find grammar rule that defines VariableReference parsing
2. Check if bracket notation is defined but not connected properly
3. Determine if this is a regression or missing feature
4. Test bracket notation in other contexts (templates, function arguments)

### Solution Required
Update grammar to recognize bracket notation as part of VariableReference parsing:
```peggy
VariableReference = 
  "@" identifier:Identifier fields:FieldAccess*

FieldAccess = 
  / "[" key:StringLiteral "]"     // ← Add bracket notation
  / "." key:Identifier            // ← Existing dot notation
```

---

## Priority Assessment

1. **Issue 2 (Bracket notation)**: HIGH - User-facing functionality broken
2. **Issue 1 (AST consistency)**: MEDIUM - Technical debt, affects maintainability

## Next Steps

1. **Immediate**: Fix bracket notation parsing (Issue 2)
2. **Follow-up**: Address AST structure consistency (Issue 1)
3. **Enable architecture tests**: Uncomment the `throw error;` line in directive-base.test.ts once issues are resolved

Both issues represent real problems that should be fixed rather than worked around with disabled tests.