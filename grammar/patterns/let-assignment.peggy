// LET ASSIGNMENT - Local variable assignment pattern
// ==================================================
// Used in: when block entries (/when, /exe...when, /guard...when)
// Purpose: Local variable declarations that are scoped to the when block
//
// Syntax: let @varName = value
// The 'let' keyword is required to distinguish from condition expressions

LetAssignment "let assignment"
  = "let" __ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent {
      return helpers.createNode('LetAssignment', {
        identifier: id,
        value: Array.isArray(value) ? value : [value],
        location: location()
      });
    }
