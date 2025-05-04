ExecDirective
  = "exec" _ id:ExecIdentifier params:ExecParams? _ "=" _ value:ExecValue HWS DirectiveEOL {
    if (value.type === "run") {
      helpers.validateRunContent(value.command);
      
      // Create run command node
      const nameNode = helpers.createNode(NodeType.Text, { content: id.name }, location());
      
      // Create the values object
      const values = {
        name: [nameNode],
        command: value.content
      };
      
      // Add field if present
      if (id.field) {
        const fieldNode = helpers.createNode(NodeType.Text, { content: id.field }, location());
        values.field = [fieldNode];
      }
      
      // Add parameters if present
      if (params) {
        values.parameters = params.map(param => {
          return [helpers.createNode(NodeType.VariableReference, { identifier: param }, location())];
        });
      }
      
      // Create the raw object
      const raw = {
        name: id.name,
        command: value.raw
      };
      
      // Add field to raw if present
      if (id.field) {
        raw.field = id.field;
      }
      
      // Add parameters to raw if present
      if (params) {
        raw.parameters = params;
      }
      
      // Create the meta object
      const meta = {
        isCommand: true
      };
      
      // Add field metadata if present
      if (id.field) {
        meta.field = {
          type: id.field
        };
      }
      
      return helpers.createDirective('exec', {
        subtype: 'execCommand',
        values,
        raw,
        meta
      }, location());
    } else if (typeof value.value === "string") {
      helpers.validateDefineContent(value.value);
      
      // Create text value node
      const nameNode = helpers.createNode(NodeType.Text, { content: id.name }, location());
      const valueNode = helpers.createNode(NodeType.Text, { content: value.value }, location());
      
      // Create the values object
      const values = {
        name: [nameNode],
        value: [valueNode]
      };
      
      // Add field if present
      if (id.field) {
        const fieldNode = helpers.createNode(NodeType.Text, { content: id.field }, location());
        values.field = [fieldNode];
      }
      
      // Add parameters if present
      if (params) {
        values.parameters = params.map(param => {
          return [helpers.createNode(NodeType.VariableReference, { identifier: param }, location())];
        });
      }
      
      // Create the raw object
      const raw = {
        name: id.name,
        value: value.value
      };
      
      // Add field to raw if present
      if (id.field) {
        raw.field = id.field;
      }
      
      // Add parameters to raw if present
      if (params) {
        raw.parameters = params;
      }
      
      // Create the meta object
      const meta = {
        isCommand: false
      };
      
      // Add field metadata if present
      if (id.field) {
        meta.field = {
          type: id.field
        };
      }
      
      return helpers.createDirective('exec', {
        subtype: 'execValue',
        values,
        raw,
        meta
      }, location());
    }
  }

ExecIdentifier
  = name:Identifier field:ExecField? {
    return { name, ...(field ? { field } : {}) };
  }

ExecField
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

ExecParams
  = _ "(" _ params:ExecIdentifierList _ ")" {
    return params;
  }

ExecIdentifierList
  = first:Identifier rest:(_ "," _ id:Identifier { return id; })* {
    return [first, ...rest];
  }

ExecValue
  = "@run" _ "[" content:BracketInterpolatableContentOrEmpty "]" {
      const raw = helpers.reconstructRawString(content);
      return {
        type: "run",
        content,
        raw,
        command: raw
      };
    }
  / "@run" runResult:_RunRHS {
      return {
        type: "run",
        content: runResult.values.command,
        raw: runResult.raw.command,
        command: runResult.raw.command
      };
    }
  / value:InterpolatedStringLiteral {
    return {
      type: "string",
      value
    };
  }