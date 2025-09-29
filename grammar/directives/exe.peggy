// EXE DIRECTIVE  
// Implementation of the /exe directive for defining executable commands and code
// Replaces: /exec directive - DELETED with no backward compatibility

/* 
# Exe Directive

The exe directive defines named commands or code blocks that can be executed
by the /run directive. It uses a unified LHS/RHS pattern where:
- LHS: Handles identifier, metadata, and parameters
- RHS: Delegates to ExeRHSContent for all value patterns
*/

// Core content handlers (context, tokens, whitespace, variables, command, code)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL EXEC DIRECTIVE
// -------------------------------------------------------------

// Primary /exe directive - unified LHS parsing with RHS delegation
SlashExe
  = DirectiveContext "/exe" _ "@"? id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ content:ExeRHSContent withClause:WithClause? ending:StandardDirectiveEnding {
      helpers.debug('SlashExe matched with ExeRHSContent', { id, params, content });
      
      // Create identifier node  
      const identifierNode = helpers.createVariableReferenceNode('varIdentifier', { identifier: id }, location());
      
      // Process parameters
      const processedParams = params || [];
      
      // Handle WhenExpression nodes directly
      if (content.type === 'WhenExpression') {
        const values = {
          identifier: [identifierNode],
          params: processedParams,
          content: [content]
        };
        
        const raw = {
          identifier: id,
          params: processedParams.map(p => p.name),
          content: 'when: [...]'  // Simplified representation
        };
        
        const metaObj = {
          parameterCount: processedParams.length,
          isWhenExpression: true,
          ...(meta ? { riskLevel: meta } : {})
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
          DirectiveKind.exe,
          'exeWhen',
          values,
          raw,
          metaObj,
          location(),
          'when'
        );
      }
      
      // Handle ForExpression nodes directly
      if (content.type === 'ForExpression') {
        const values = {
          identifier: [identifierNode],
          params: processedParams,
          content: [content]
        };
        
        const raw = {
          identifier: id,
          params: processedParams.map(p => p.name),
          content: 'for ... => ...'  // Simplified representation
        };
        
        const metaObj = {
          parameterCount: processedParams.length,
          isForExpression: true,
          ...(meta ? { riskLevel: meta } : {})
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
          DirectiveKind.exe,
          'exeFor',
          values,
          raw,
          metaObj,
          location(),
          'for'
        );
      }
      
      // Extract subtype and source from content
      const subtype = content.subtype;
      const source = content.source;
      
      // Build values based on content type
      const values = {
        identifier: [identifierNode],
        ...(subtype !== 'environment' ? { params: processedParams } : {}),
        ...content.values
      };
      
      // Build raw based on content type
      const raw = {
        identifier: id,
        ...(subtype !== 'environment' ? { params: processedParams.map(p => p.name) } : {}),
        ...content.raw
      };
      
      // Build metadata
      const metaObj = {
        ...(subtype !== 'environment' ? { parameterCount: processedParams.length } : {}),
        ...content.meta,
        ...(meta ? { riskLevel: meta } : {})
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
        DirectiveKind.exe,
        subtype,
        values,
        raw,
        metaObj,
        location(),
        source
      );
    }
  // Special case: environment declaration without @ prefix
  / DirectiveContext "/exe" _ id:BaseIdentifier _ "=" _ content:ExeRHSContent withClause:WithClause? ending:StandardDirectiveEnding {
      // Only allow environment declarations without @
      if (content.subtype !== 'environment') {
        helpers.mlldError("Invalid /exe syntax. Variable names must start with '@'. Use: /exe @" + id + " = ...", "@", location());
      }
      
      helpers.debug('SlashExe matched environment declaration (no @)', { id, content });
      
      // Create identifier node  
      const identifierNode = helpers.createVariableReferenceNode('varIdentifier', { identifier: id }, location());
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        ...content.values
      };
      
      const raw = {
        identifier: id,
        ...content.raw
      };
      
      // Metadata
      const metaObj = {
        ...content.meta
      };
      
      // Add with clause if present
      if (withClause) {
        values.withClause = withClause;
        raw.withClause = withClause;
        metaObj.withClause = withClause;
      }
      
      return helpers.createStructuredDirective(
        DirectiveKind.exe,
        'environment',
        values,
        raw,
        metaObj,
        location(),
        'environment'
      );
    }
  // Error recovery: Missing @ before identifier (non-environment)
  / DirectiveContext "/exe" _ id:BaseIdentifier _ "=" _ !"{" {
      helpers.mlldError("Invalid /exe syntax. Variable names must start with '@'. Use: /exe @" + id + " = ...", "@", location());
    }
  // Error recovery: Missing = after identifier with parameters
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier _ "(" [^)]* ")" _ !"=" {
      helpers.mlldError("Invalid /exe syntax. Expected '=' after parameters. Use: /exe @" + id + "(params) = ...", "=", location());
    }
  // Error recovery: Unclosed parameters
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier _ "(" &{
      // Check if we hit newline or EOF before closing paren
      let i = peg$currPos;
      let parenDepth = 1;
      while (i < input.length && parenDepth > 0) {
        if (input[i] === '(') parenDepth++;
        else if (input[i] === ')') parenDepth--;
        else if (input[i] === '\n' && parenDepth > 0) return true;
        i++;
      }
      return parenDepth > 0;
    } {
      helpers.mlldError("Unclosed parameters in /exe directive. Expected ')' to close the parameter list.", ")", location());
    }
  // Error recovery: Missing value after =
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier params:ExecParameters? _ "=" _ !. {
      helpers.mlldError("Missing value in /exe directive. Expected command, code, template, or reference after '='.", "value", location());
    }
  // Error recovery: Generic catch-all
  / DirectiveContext "/exe" {
      helpers.mlldError("Invalid /exe syntax. Examples:\n" +
            "  /exe @cmd(param) = {echo @param}\n" +
            "  /exe @greet(name) = `Hello @name!`\n" +
            "  /exe @calc(x) = js {return @x * 2}\n" +
            "  /exe @alias() = @otherCommand\n" +
            "  /exe @msg() = \"a string value\"", "@", location());
    }

// -------------------------------------------------------------
// LHS HELPER RULES
// -------------------------------------------------------------

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
  = "@"? paramName:BaseIdentifier {
      // Create a proper Parameter node
      // Accept both @param and param syntax for consistency
      return helpers.createNode(NodeType.Parameter, {
        name: paramName,
        location: location()
      });
    }
