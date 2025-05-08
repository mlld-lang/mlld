// EXEC DIRECTIVE
// Implementation of the @exec directive for defining executable commands and code

/* 
# Exec Directive

The exec directive defines named commands or code blocks that can be executed
by the @run directive. It can be used in these forms:
1. @exec cmdName (param1, param2) = command-string   - Define a shell command
2. @exec fnName (param1) = js [code-block]           - Define a code function
3. @exec alias (param1) = @run @otherCmd             - Define a command reference
*/

// Core content handlers (context, tokens, whitespace, variables, command, code)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL EXEC DIRECTIVE
// -------------------------------------------------------------

// Primary @exec directive - all variants
AtExec
  = DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" _ command:CommandCore {
      helpers.debug('AtExec matched command definition', { id, params, command });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id }, location());
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(param => {
        if (param.type === NodeType.VariableReference) return param.identifier;
        return '';
      });
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        ...command.values
      };
      
      const raw = {
        identifier: id,
        params: rawParams,
        ...command.raw
      };
      
      // Create meta object
      const metaObj = {
        ...command.meta,
        parameterCount: processedParams.length
      };
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta }, location())];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      return helpers.createStructuredDirective(
        'exec',
        'execCommand',
        values,
        raw,
        metaObj,
        location()
      );
    }
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" _ language:CodeLanguage _ code:CodeCore {
      helpers.debug('AtExec matched code definition', { id, params, language, code });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id }, location());
      
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language }, location());
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(param => {
        if (param.type === NodeType.VariableReference) return param.identifier;
        return '';
      });
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        lang: [langNode],
        ...code.values
      };
      
      const raw = {
        identifier: id,
        params: rawParams,
        lang: language,
        ...code.raw
      };
      
      // Create meta object
      const metaObj = {
        ...code.meta,
        parameterCount: processedParams.length,
        language: language
      };
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta }, location())];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      return helpers.createStructuredDirective(
        'exec',
        'execCode',
        values,
        raw,
        metaObj,
        location()
      );
    }
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParams? _ "=" _ "@run" _ "@" commandRef:CommandReference {
      helpers.debug('AtExec matched command reference', { id, params, commandRef });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id }, location());
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(param => {
        if (param.type === NodeType.VariableReference) return param.identifier;
        return '';
      });
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        commandRef: commandRef.identifier,
        args: commandRef.args || []
      };
      
      const raw = {
        identifier: id,
        params: rawParams,
        commandRef: commandRef.name,
        args: commandRef.args ? commandRef.args.map(arg => arg.value || '') : []
      };
      
      // Create meta object
      const metaObj = {
        parameterCount: processedParams.length,
        argumentCount: commandRef.args ? commandRef.args.length : 0,
        isCommandRef: true
      };
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta }, location())];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      return helpers.createStructuredDirective(
        'exec',
        'execCommand',
        values,
        raw,
        metaObj,
        location()
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------


// Helper rule for command reference
CommandReference
  = name:BaseIdentifier _ args:CommandArgs? {
      return {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name }, location())],
        args: args || [],
        isCommandReference: true
      };
    }

// Arguments for command references
CommandArgs
  = "(" _ args:CommandArgsList? _ ")" {
      return args || [];
    }

CommandArgsList
  = first:CommandArg rest:(_ "," _ arg:CommandArg { return arg; })* {
      return [first, ...rest];
    }

CommandArg
  = str:StringLiteral {
      return { type: 'string', value: str };
    }
  / varRef:Variable {
      return { type: 'variable', value: varRef };
    }
  / chars:RawArgChar+ {
      return { type: 'raw', value: chars.join('').trim() };
    }

RawArgChar
  = !("," / ")") char:. { return char; }

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
  = paramName:BaseIdentifier {
      return helpers.createVariableReferenceNode('variable', { identifier: paramName }, location());
    }