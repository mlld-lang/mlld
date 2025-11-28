// LOCAL ASSIGNMENT PATTERNS
// =========================
// Used in: when block entries (/when, /exe...when, /guard...when)
// Purpose: Local variable declarations and mutations scoped to the when block
//
// Patterns:
//   let @varName = value   - Creates a new local variable
//   @varName += value      - Augmented assignment (array concat, string append, object merge)

// LET ASSIGNMENT - Create a new local variable
// Syntax: let @varName = value
LetAssignment "let assignment"
  = "let" __ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent {
      return helpers.createNode('LetAssignment', {
        identifier: id,
        value: Array.isArray(value) ? value : [value],
        location: location()
      });
    }

// AUGMENTED ASSIGNMENT - Modify an existing local variable
// Syntax: @varName += value
// Supports: arrays (concat), strings (append), objects (shallow merge)
AugmentedAssignment "augmented assignment"
  = "@" id:BaseIdentifier _ "+=" _ value:VarRHSContent {
      return helpers.createNode('AugmentedAssignment', {
        identifier: id,
        operator: '+=',
        value: Array.isArray(value) ? value : [value],
        location: location()
      });
    }

// Combined pattern for when entries that need local assignment
LocalAssignment "local assignment"
  = LetAssignment
  / AugmentedAssignment
