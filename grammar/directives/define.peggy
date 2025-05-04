DefineDirective
  = "define" _ id:DefineIdentifier params:DefineParams? _ "=" _ value:DefineValue HWS DirectiveEOL {
    if (value.type === "run") {
      helpers.validateRunContent(value.value.command);
    } else if (typeof value.value === "string") {
      helpers.validateDefineContent(value.value);
    }
    
    if (value.type === "run") {
      return helpers.createDirective('define', {
        name: id.name,
        ...(id.field ? { field: id.field } : {}),
        ...(params ? { parameters: params } : {}),
        command: value.value
      }, location());
    } else {
      return helpers.createDirective('define', {
        name: id.name,
        ...(id.field ? { field: id.field } : {}),
        ...(params ? { parameters: params } : {}),
        value: value.value
      }, location());
    }
  }

DefineIdentifier
  = name:Identifier field:DefineField? {
    return { name, ...(field ? { field } : {}) };
  }

DefineField
  = "." field:(
      "risk.high"
    / "risk.med"
    / "risk.low"
    / "risk"
    / "about"
    / "meta"
  ) {
    return field;
  }

DefineParams
  = _ "(" _ params:IdentifierList _ ")" {
    return params;
  }

IdentifierList
  = first:Identifier rest:(_ "," _ id:Identifier { return id; })* {
    return [first, ...rest];
  }

DefineValue
  = "@run" _ "[" content:BracketInterpolatableContentOrEmpty "]" {
      const raw = content.map(n => {
        if (n.type === 'Text') return n.content;
        if (n.type === 'VariableReference') return `{{${n.identifier}}}`;
        return '';
      }).join('');
      return {
        type: "run",
        value: {
          subtype: 'runCommand',
          raw,
          values: content
        }
      };
    }
  / "@run" runResult:_RunRHS {
      return {
        type: "run",
        value: runResult
      };
    }
  / value:InterpolatedStringLiteral {
    return {
      type: "string",
      value
    };
  }