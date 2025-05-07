ExecDirective
  = execCommand / execCode / execRunExec

// @exec identifier (param1, param2) = @run [command]
execCommand
  = "exec" _ identifier:Identifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" _ core:RunCommandCore HWS DirectiveEOL {
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
      
      // Get command content from the core rule
      const rawCommand = core.raw.command;
      
      // Create values object
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        command: core.values.command
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
      
      return helpers.createStructuredDirective('exec', 'execCommand', values, raw, metaObj, location(), 'command');
    }

// @exec identifier (param1, param2) = @run language [code]
execCode
  = "exec" _ identifier:Identifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" _ core:RunCodeCore HWS DirectiveEOL {
      // Create nodes
      const identifierNode = helpers.createNode(NodeType.Text, { content: identifier }, location());
      
      // Calculate raw strings
      const rawIdentifier = identifier;
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(param => {
        if (param.type === 'VariableReference') return param.identifier;
        return '';
      });
      
      // Create values object - using core values
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        lang: core.values.lang,
        code: core.values.code
      };
      
      // Create raw object - using core raw values
      const raw = {
        identifier: rawIdentifier,
        params: rawParams,
        lang: core.raw.lang,
        code: core.raw.code
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
      
      return helpers.createStructuredDirective('exec', 'execCode', values, raw, metaObj, location(), 'code');
    }

// @exec identifier (param1, param2) = @run runExec variant
execRunExec
  = "exec" _ identifier:Identifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" _ core:RunExecCore {
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: identifier }, location());
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(param => {
        if (param.type === 'VariableReference') return param.identifier;
        return '';
      });
      
      // Using the RunExecCore directly, which is guaranteed to be a runExec subtype
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        commandRef: core.values.identifier,
        args: core.values.args
      };
      
      const raw = {
        identifier: identifier,
        params: rawParams,
        commandRef: core.raw.identifier,
        args: core.raw.args
      };
      
      const metaObj = {
        parameterCount: processedParams.length,
        argumentCount: core.meta.argumentCount
      };
      
      // We know the subtype is execCommand with command reference
      const subtype = 'execCommand';
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta }, location())];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      // Determine source based on the subtype
      const source = subtype === 'execCode' ? 'code' : 'command';
      
      return helpers.createStructuredDirective('exec', subtype, values, raw, metaObj, location(), source);
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
      return helpers.createVariableReferenceNode('variable', { identifier: paramName }, location());
    }