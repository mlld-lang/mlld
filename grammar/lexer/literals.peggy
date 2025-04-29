
StringLiteral "String Literal"
  = '"' chars:(!'"' char:. { return char; })* '"' { return chars.join(''); }
  / "'" chars:(!"'" char:. { return char; })* "'" { return chars.join(''); }
  / "`" chars:(!"`" char:. { return char; })* "`" { return chars.join(''); }

NumberLiteral "Number Literal"
  = "-"? digits:[0-9]+ decimal:("." [0-9]+)? {
    return parseFloat((text().startsWith("-") ? "-" : "") + digits.join('') + (decimal ? decimal[0] + decimal[1].join('') : ''));
  }

BooleanLiteral "Boolean Literal"
  = "true" { return true; }
  / "false" { return false; }

NullLiteral "Null Literal"
  = "null" { return null; }

MultilineTemplateLiteral "Multi-line Template Literal"
  = "[[" content:(!"]]" char:. { return char; })* "]]" { 
      return content.join(''); 
    }
