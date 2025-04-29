DataDirective
  = "data" _ id:Identifier  _ "=" _ value:DataValue HWS DirectiveEOL {
    return helpers.createDirective('data', {
      identifier: id,
      source: value.type,
      ...(value.type === "embed" ? { embed: value.value } :
          value.type === "run" ? { run: value.value } :
          value.type === "call" ? { call: value.value } :
          { value: value.value })
    }, location());
  }

DataValue
  = "@embed" embedResult:_EmbedRHS {
      return {
        type: "embed",
        embed: embedResult
      };
    }
  / "@run" runResult:_RunRHS {
      return {
        type: "run",
        run: runResult
      };
    }
  / value:DataObjectLiteral {
    return {
      type: "literal",
      value
    };
  }
  / value:ArrayLiteral {
    return {
      type: "literal",
      value
    };
  }

DataObjectLiteral
  = "{{" _ props:ObjectProperties? _ "}}" {
    return props ? Object.fromEntries(props) : {};
  }
  / "{" _ props:ObjectProperties? _ "}" {
    return props ? Object.fromEntries(props) : {};
  }

ObjectProperties
  = first:ObjectProperty rest:(_ "," _ p:ObjectProperty { return p; })* {
    return [first, ...rest];
  }

ObjectProperty
  = key:PropertyKey _ ":" _ value:PropertyValue {
    return [key, value];
  }

PropertyKey
  = id:Identifier { return id; }
  / str:StringLiteral { return str; }

PropertyValue
  = InterpolatedStringLiteral
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral
  / DataObjectLiteral
  / ArrayLiteral
  / varExpr:Variable { return varExpr; }
  / EmbedValue
  / RunValue

EmbedValue
  = "@embed" _ content:DirectiveContent {
    return {
      kind: "embed",
      path: content
    };
  }

RunValue
  = "@run" _ content:DirectiveContent {
    return {
      kind: "run",
      command: content,
      ...(content.startsWith("$") ? { isReference: true } : {})
    };
  }

ArrayLiteral
  = "[" _ items:ArrayItems? _ "]" {
    return items || [];
  }
  / "[[" _ items:ArrayItems? _ "]]" {
    return items || [];
  }

ArrayItems
  = first:PropertyValue rest:(_ "," _ v:PropertyValue { return v; })* trailingComma:(_ ",")? {
    return [first, ...rest];
  }

FieldAccess
  = "." field:Identifier {
    return { type: 'field', value: field };
  }

NumericFieldAccess
  = "." index:NumericIndentifier {
    return { type: 'index', value: parseInt(index, 10) };
  }

NumericIndentifier
  = digits:[0-9]+ {
    return digits.join('');
  }

ArrayAccess
  = "[" index:(NumberLiteral / StringLiteral / Identifier) "]" {
    return { type: 'index', value: index };
  }
