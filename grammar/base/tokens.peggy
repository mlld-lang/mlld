// MELD BASE TOKENS
// Core token abstractions used throughout the grammar

/* 
# Token Abstractions

This file contains the most fundamental token patterns used by the Meld grammar,
including identifiers, separators, and special characters. These are the atomic
building blocks for all higher-level grammar components.
*/

// -------------------------------------------------------------
// IDENTIFIER PATTERNS
// -------------------------------------------------------------

// Base identifier pattern - variable/directive names, keywords
BaseIdentifier "Identifier"
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* {
      return first + rest.join('');
    }

// Special path characters (.~) that act like identifiers in path contexts
SpecialPathChar "Special Path Character"
  = "." / "~"

// -------------------------------------------------------------
// SEPARATOR TOKENS
// -------------------------------------------------------------

// Path separator as a distinct node
PathSeparatorToken "Path Separator"
  = "/" { 
      return helpers.createNode(NodeType.PathSeparator, { value: "/", location: location() });
    }

// Dot separator for field access
DotSeparatorToken "Dot Separator"
  = "." { 
      return helpers.createNode(NodeType.DotSeparator, { value: ".", location: location() });
    }

// Section marker for content sections
SectionMarkerToken "Section Marker"
  = [ \t]* "#" { 
      return helpers.createNode(NodeType.SectionMarker, { value: "#", location: location() });
    }

// -------------------------------------------------------------
// MARKER SEQUENCES
// -------------------------------------------------------------

// Backtick sequence for code blocks (3-5 backticks)
BacktickSequence "Backtick Sequence"
  = backticks:"`"+ &{
      return backticks.length >= 3 && backticks.length <= 5;
    } { 
      return backticks;
    }

// -------------------------------------------------------------
// RESERVED KEYWORDS
// -------------------------------------------------------------

// Reserved directive names that cannot be used as variable names
ReservedDirective "Reserved Directive Name"
  = "@data" / "@text" / "@run" / "@add" / "@path" 
  / "@import" / "@exec" / "@define"