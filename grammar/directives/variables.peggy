// See also text.peggy, data.peggy, path.peggy, define.peggy

Variable
  = TextVar
  / DataVar
  / PathVar

TextVar
  = "{{" _ id:Identifier format:VarFormat? _ "}}" {
      // helpers.debug('TEXTVAR_MATCH', `Matched TextVar: {{${id}}}`); // REMOVED DEBUG LOG
      const node = helpers.createVariableReferenceNode('text', {
        identifier: id,
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'TextVar', node }); // <<< ADD DEBUG LOG
      helpers.debug('VAR_CREATE', `Created {{${id}}} node`, JSON.stringify(node)); // <<< ADDED DEBUG LOG
      return node;
  }

DataVar
  = "{{" _ id:Identifier accessElements:(FieldAccess / NumericFieldAccess / ArrayAccess)* format:VarFormat? _ "}}" {
    const node = helpers.createVariableReferenceNode('data', {
      identifier: id,
      fields: accessElements || [],
      ...(format ? { format } : {})
    }, location());
    helpers.debug('CreateVAR', { rule: 'DataVar', node }); // <<< ADD DEBUG LOG
    return node;
  }

PathVar
  = "$" id:(SpecialPathChar / Identifier) {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('path', {
        identifier: normalizedId,
      }, location());
      helpers.debug('CreateVAR', { rule: 'PathVar', node }); // <<< ADD DEBUG LOG
      return node;
    }

VarDirective
  = "var" _ id:Identifier _ "=" _ value:VarValue DirectiveEOL {
    return helpers.createDirective('var', {
      identifier: id,
      value: {
        type: typeof value === 'string' ? 'string' :
              typeof value === 'number' ? 'number' :
              typeof value === 'boolean' ? 'boolean' :
              value === null ? 'null' :
              Array.isArray(value) ? 'array' :
              'object',
        value
      }
    }, location());
  }

VarValue
  = StringLiteral
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral
  / DataObjectLiteral
  / ArrayLiteral

VarFormat
  = ">>" format:Identifier {
    return format;
  }
