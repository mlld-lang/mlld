// MLLD BASE LITERALS
// Literal value abstractions used throughout the grammar

/* 
# Literal Value Abstractions

This file defines patterns for literal values (strings, numbers, booleans, etc.)
used throughout the Mlld grammar.
*/

// -------------------------------------------------------------
// STRING LITERALS
// -------------------------------------------------------------

// String literal with all quotes types (double, single, backtick) - now with escape support
StringLiteral "String Literal"
  = '"' content:EscapedStringContent '"' { return content; }
  / "'" content:EscapedSingleStringContent "'" { return content; }
  / "`" content:EscapedBacktickStringContent "`" { return content; }

// -------------------------------------------------------------
// NUMBER LITERALS
// -------------------------------------------------------------

// Number literal - integer or decimal
NumberLiteral "Number Literal"
  = "-"? digits:[0-9]+ decimal:("." [0-9]+)? {
    return parseFloat((text().startsWith("-") ? "-" : "") + digits.join('') + (decimal ? decimal[0] + decimal[1].join('') : ''));
  }

// -------------------------------------------------------------
// BOOLEAN & NULL LITERALS
// -------------------------------------------------------------

// Boolean values
BooleanLiteral "Boolean Literal"
  = "true" { return true; }
  / "false" { return false; }

// Null value
NullLiteral "Null Literal"
  = "null" { return null; }

// -------------------------------------------------------------
// TEMPLATE LITERALS
// -------------------------------------------------------------

// Multiline template with double brackets - now with escape support
MultilineTemplateLiteral "Multi-line Template Literal"
  = "[[" chars:MultilineTemplateChar* "]]" { 
      return chars.join(''); 
    }

MultilineTemplateChar
  = StringEscapeSequence  // Process string escapes first
  / EscapeSequence       // Then mlld syntax escapes
  / !"]]" char:. { return char; }