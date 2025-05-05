ExecDirective
  = execCommand / execCode / execRunExec

// @exec identifier (param1, param2) = @run [command]
execCommand
  = "exec" _ identifier:Identifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" _ "[" command:BracketInterpolatableContent "]" HWS DirectiveEOL {
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: identifier }, location());
      
      // Calculate raw strings
      const rawIdentifier = identifier;
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(param => {
        if (param.type === 'VariableReference') return param.identifier;
        return '';
      });
      
      // Process command
      const rawCommand = command.map(n => {
        if (n.type === 'Text') return n.content;
        if (n.type === 'VariableReference') {
          return n.valueType === 'path' ? `$${n.identifier}` : `{{${n.identifier}}}`;
        }
        return '';
      }).join('');
      
      // Create values object
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        command: command
      };
      
      // Create raw object
      const raw = {
        identifier: rawIdentifier,
        params: rawParams,
        command: rawCommand
      };
      
      // Create meta object
      const metaObj = {
        parameterCount: processedParams.length
      };
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta }, location())];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      return helpers.createStructuredDirective('exec', 'execCommand', values, raw, metaObj, location());
    }

// @exec identifier (param1, param2) = @run language [code]
execCode
  = "exec" _ identifier:Identifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" _ language:Identifier _ "[" code:CodeBlockContent "]" HWS DirectiveEOL {
      // Create nodes
      const identifierNode = helpers.createNode(NodeType.Text, { content: identifier }, location());
      const languageNode = helpers.createNode(NodeType.Text, { content: language }, location());
      
      // Calculate raw strings
      const rawIdentifier = identifier;
      const rawLanguage = language;
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(param => {
        if (param.type === 'VariableReference') return param.identifier;
        return '';
      });
      
      // Process code
      const rawCode = code.map(n => {
        if (n.type === 'Text') return n.content;
        if (n.type === 'VariableReference') {
          return n.valueType === 'path' ? `$${n.identifier}` : `{{${n.identifier}}}`;
        }
        return '';
      }).join('');
      
      // Create values object
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        lang: [languageNode],
        code: code
      };
      
      // Create raw object
      const raw = {
        identifier: rawIdentifier,
        params: rawParams,
        lang: rawLanguage,
        code: rawCode
      };
      
      // Create meta object
      const metaObj = {
        parameterCount: processedParams.length
      };
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta }, location())];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      return helpers.createStructuredDirective('exec', 'execCode', values, raw, metaObj, location());
    }

// @exec identifier (param1, param2) = @run runExec variant
execRunExec
  = "exec" _ identifier:Identifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" runExec:_RunRHS {
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: identifier }, location());
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(param => {
        if (param.type === 'VariableReference') return param.identifier;
        return '';
      });
      
      // Create values object and raw object based on runExec subtype
      let values, raw, metaObj;
      let subtype = 'execCommand'; // Default subtype
      
      if (runExec.subtype === 'runExec') {
        // Handle the case for runExec
        values = {
          identifier: [identifierNode],
          params: processedParams,
          commandRef: runExec.values.identifier,
          args: runExec.values.args
        };
        
        raw = {
          identifier: identifier,
          params: rawParams,
          commandRef: runExec.raw.identifier,
          args: runExec.raw.args
        };
        
        metaObj = {
          parameterCount: processedParams.length,
          argumentCount: runExec.meta.argumentCount
        };
      } else if (runExec.subtype === 'runCode') {
        // Handle the case for runCode
        values = {
          identifier: [identifierNode],
          params: processedParams,
          lang: runExec.values.lang,
          code: runExec.values.code
        };
        
        raw = {
          identifier: identifier,
          params: rawParams,
          lang: runExec.raw.lang,
          code: runExec.raw.code
        };
        
        metaObj = {
          parameterCount: processedParams.length,
          isMultiLine: runExec.meta.isMultiLine
        };
        
        subtype = 'execCode';
      } else {
        // Default to runCommand
        values = {
          identifier: [identifierNode],
          params: processedParams,
          command: runExec.values.command
        };
        
        raw = {
          identifier: identifier,
          params: rawParams,
          command: runExec.raw.command
        };
        
        metaObj = {
          parameterCount: processedParams.length,
          isMultiLine: runExec.meta.isMultiLine
        };
      }
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta }, location())];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      return helpers.createStructuredDirective('exec', subtype, values, raw, metaObj, location());
    }

// Helper rules for exec metadata (.risk.high, .meta, etc.)
ExecMetadata
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

// Helper rules for exec parameters
ExecParams
  = _ "(" _ params:ExecParamsList? _ ")" {
      return params || [];
    }

ExecParamsList
  = first:ExecParam rest:(_ "," _ param:ExecParam { return param; })* {
      return [first, ...rest];
    }

ExecParam
  = paramName:Identifier {
      return helpers.createVariableReferenceNode('text', { identifier: paramName }, location());
    }