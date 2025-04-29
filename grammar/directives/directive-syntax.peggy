
DirectiveContent
  = "[" content:BracketContent "]" {
    return content;
  }

BracketContent
  = parts:(BracketText / BracketVariable)+ {
      return parts;
    }

BracketText
  = value:$(!([\\\]/.#{}] / '{{' / '$' / '\\') .)+ { // REVERTED: Restore original complex lookahead definition
      return helpers.createNode(NodeType.Text, { content: value }, location());
    }

BracketVariable
  = "{{" _ name:Identifier _ "}}" {
      return helpers.createVariableReferenceNode('text', { identifier: name }, location());
    }

QuotedString
  = '"' chars:DoubleQuotedChars '"' { return '"' + chars + '"'; }
  / "'" chars:SingleQuotedChars "'" { return "'" + chars + "'"; }
  / "`" chars:BracketText "`" { return "`" + chars + "`"; }

DoubleQuotedChars
  = chars:[^"]* { return chars.join(''); }

SingleQuotedChars
  = chars:[^']* { return chars.join(''); }

NestedBrackets
  = "[[" content:BracketContent "]]" {
    return content;
  }

MultilineContent
  = content:TextUnMultilineContent { return content; }

TextUnMultilineContent
  = content:([^\]]*) { 
    const text = content.join('');
    return [{ type: 'Text', content: text }];
  }

TextUntilNewline
  = chars:[^\n]+ { return chars.join(''); }

DirectiveOptions
  = _ options:DirectiveOption+ {
    return options.reduce((acc, opt) => ({ ...acc, ...opt }), {});
  }

DirectiveOption
  = _ key:Identifier _ "=" _ value:StringLiteral {
    return { [key]: value };
  }