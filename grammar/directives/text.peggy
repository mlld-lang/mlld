TextDirective
  = textAssignment / textBracketed

textAssignment
  = "text" _ id:Identifier _ "=" _ value:TextValue HWS DirectiveEOL {
    helpers.debug('TEXT', { type: 'assignment', identifier: id, valueSource: value.type });
    return helpers.createDirective('text', {
      identifier: id,
      source: value.type,
      values: value.values,
      ...(value.type === "embed" ? { embed: value.embed } :
          value.type === "run" ? { run: value.run } :
          value.type === "call" ? { call: value.value } :
          { values: value.values })
    }, location());
  }

textBracketed
  = "text" _ "[" content:BracketInterpolatableContent "]" HWS DirectiveEOL {
    helpers.debug('TEXT', { type: 'bracketed', content });
    return helpers.createDirective('text', {
      values: content
    }, location());
  }

TextValue
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
  / "@call" _ api:Identifier "." method:Identifier _ content:DirectiveContent {
    return {
      type: "call",
      value: {
        kind: "call",
        api,
        method,
        path: content
      }
    };
  }
  / value:InterpolatedStringLiteral {
    return {
      type: "literal",
      values: value
    };
  }
  / value:InterpolatedMultilineTemplate {
    return {
      type: "literal",
      values: value
    };
  }
