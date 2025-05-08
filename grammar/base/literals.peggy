// MELD BASE LITERALS
// Literal value abstractions used throughout the grammar

/* 
# Literal Value Abstractions

This file defines patterns for literal values (strings, numbers, booleans, etc.)
used throughout the Meld grammar.
*/

// -------------------------------------------------------------
// STRING LITERALS
// -------------------------------------------------------------

// String literal with all quotes types (double, single, backtick)
StringLiteral "String Literal"
  = '"' chars:(!'"' char:. { return char; })* '"' { return chars.join(''); }
  / "'" chars:(!"'" char:. { return char; })* "'" { return chars.join(''); }
  / "`" chars:(!"`" char:. { return char; })* "`" { return chars.join(''); }

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

// Multiline template with double brackets
MultilineTemplateLiteral "Multi-line Template Literal"
  = "[[" content:(!"]]" char:. { return char; })* "]]" { 
      return content.join(''); 
    }