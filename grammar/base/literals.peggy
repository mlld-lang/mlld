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

// String literal - supports single or double quotes without interpolation
StringLiteral "String Literal"
  = "'" content:EscapedSingleStringContent "'" { return content; }
  / '"' content:EscapedStringContent '"' { return content; }

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

// Wildcard literal - always true in conditional contexts
WildcardLiteral "Wildcard Literal"
  = "*" { return "*"; }

// None literal - matches when no prior conditions in when block have matched
NoneLiteral "none literal"
  = "none" ![a-zA-Z0-9_] {
      return helpers.createNode('Literal', {
        value: 'none',
        valueType: 'none',
        location: location()
      });
    }

DeniedLiteral "denied literal"
  = "denied" ![a-zA-Z0-9_] {
      return helpers.createNode('Literal', {
        value: 'denied',
        valueType: 'denied',
        location: location()
      });
    }

// Retry literal - signals pipeline retry
RetryLiteral "Retry Literal"
  = "retry" { 
      return helpers.createNode('Literal', { 
        value: 'retry', 
        valueType: 'retry',
        location: location() 
      }); 
    }

// -------------------------------------------------------------
// TIME DURATION LITERALS
// -------------------------------------------------------------

// Time duration literals for relative time comparisons (e.g., 90m, 12h, 7d)
TimeDurationLiteral "Time Duration Literal"
  = num:NumberLiteral unit:TimeUnit {
      return {
        type: 'TimeDuration',
        value: num,
        unit: unit,
        location: location()
      };
    }

TimeUnit "Time Unit"
  = "ms" { return 'milliseconds'; }
  / "s" { return 'seconds'; }
  / "m" { return 'minutes'; }
  / "h" { return 'hours'; }
  / "d" { return 'days'; }
  / "w" { return 'weeks'; }
  / "y" { return 'years'; }

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
