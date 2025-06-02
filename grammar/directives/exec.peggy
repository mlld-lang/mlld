// EXEC DIRECTIVE
// Implementation of the @exec directive for defining executable commands and code

/* 
# Exec Directive

The exec directive defines named commands or code blocks that can be executed
by the @run directive. It can be used in these forms:
1. @exec cmdName (param1, param2) = @run command-string   - Define a shell command
2. @exec fnName (param1) = @run js [code-block]           - Define a code function
3. @exec alias (param1) = @run @otherCmd                  - Define a command reference
*/

// Core content handlers (context, tokens, whitespace, variables, command, code)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL EXEC DIRECTIVE
// -------------------------------------------------------------

// Primary @exec directive - unified approach with RHS delegation
AtExec
  = DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@run" _ content:ExecRHS withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('AtExec matched with unified RHS delegation', { id, params, content, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      
      // Build values and raw objects based on content type
      const values = {
        identifier: [identifierNode],
        params: processedParams
      };
      
      const raw = {
        identifier: id,
        params: processedParams
      };
      
      // Add content-specific fields and determine subtype
      let subtype, source, metaObj;
      
      if (content.type === 'command') {
        // Command content with variable interpolation
        values.command = content.command;
        raw.command = content.raw;
        subtype = 'execCommand';
        source = 'command';
        metaObj = {
          parameterCount: processedParams.length,
          commandType: 'command',
          ...helpers.createSecurityMeta({ trust })
        };
      } else if (content.type === 'code') {
        // Code content (language + code blob, no interpolation)
        values.lang = content.lang;
        values.args = content.args || [];
        values.code = content.code;
        raw.lang = content.rawLang;
        raw.args = content.rawArgs || [];
        raw.code = content.raw;
        subtype = 'execCode';
        source = 'code';
        metaObj = {
          parameterCount: processedParams.length,
          language: content.rawLang,
          isMultiLine: content.raw.includes('\n'),
          hasVariables: false,  // Code blocks don't support variable interpolation
          ...helpers.createSecurityMeta({ trust })
        };
      } else {
        throw new Error(`Unknown exec content type: ${content.type}`);
      }
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta, location: location() })];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      // Add with clause if present
      if (withClause) {
        values.withClause = withClause;
        raw.withClause = withClause;
        metaObj.withClause = withClause;
      }
      
      return helpers.createStructuredDirective(
        'exec',
        subtype,
        values,
        raw,
        metaObj,
        location(),
        source
      );
    }
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@run" _ "@" commandRef:CommandReference withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('AtExec matched command reference', { id, params, commandRef, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams; // params are now strings
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        commandRef: Array.isArray(commandRef.identifier) ? commandRef.identifier : [helpers.createNode(NodeType.Text, { content: commandRef.identifier, location: location() })],
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
        isCommandRef: true,
        ...helpers.createSecurityMeta({ trust })
      };
      
      // Add metadata if present
      if (meta) {
        values.metadata = [helpers.createNode(NodeType.Text, { content: meta, location: location() })];
        raw.metadata = meta;
        metaObj.metadata = { type: meta };
      }
      
      // Add with clause if present
      if (withClause) {
        values.withClause = withClause;
        raw.withClause = withClause;
        metaObj.withClause = withClause;
      }
      
      return helpers.createStructuredDirective(
        'exec',
        'execCommand',
        values,
        raw,
        metaObj,
        location(),
        'reference'  // Added source parameter
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------
// CommandReference and related rules have been moved to patterns/command-reference.peggy

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
ExecParameters
  = _ "(" _ params:ExecParameterList? _ ")" {
      return params || [];
    }

ExecParameterList
  = first:ExecParameter rest:(_ "," _ param:ExecParameter { return param; })* {
      return [first, ...rest];
    }

ExecParameter
  = paramName:BaseIdentifier {
      return paramName; // Just return the parameter name as a string
    }