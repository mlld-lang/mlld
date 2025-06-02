// DIRECTIVE PATTERN
// Combines all directive rules into a single Directive rule

/* 
# Directive Pattern

This file defines the main Directive rule that combines all individual
directive implementations (AtRun, AtText, etc.) into a single rule used
by the main grammar.
*/

// -------------------------------------------------------------
// MAIN DIRECTIVE RULE
// -------------------------------------------------------------

// Main directive rule that combines all directive types
Directive "Directive"
  = DirectiveContext (
      AtRun
    / AtText  
    / AtData
    / AtPath
    / AtImport
    / AtExec
    / AtAdd
    / AtOutput
    / AtWhen
  )