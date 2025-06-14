// EXEC DIRECTIVE
// Implementation of the @exec directive for defining executable commands and code

/* 
# Exec Directive

The exec directive defines named commands or code blocks that can be executed
by the @run directive. It can be used in these forms:
1. @exec cmdName (param1, param2) = @run command-string   - Define a shell command
2. @exec fnName (param1) = @run js [code-block]           - Define a code function
3. @exec alias (param1) = @run @otherCmd                  - Define a command reference

# Unified Executable Syntax (Phase 2 Implementation)

The exec directive is being extended to support unified executable syntax:
1. @exec greeting(name) = [[Hello {{name}}!]]       - Template executable with {{var}} interpolation
2. @exec greeting(name) = `Hello @name!`            - Template executable with @var interpolation
3. @exec build(env) = [(npm run build:@env)]        - Command executable
4. @exec calculate(x) = js [(return @x * 2)]        - Code executable
5. @exec getSection(file, section) = [@file # @section] - Section executable
6. @exec getSection(file, section, newheader) = [@file # @section] as @newheader - Section with rename
7. @exec fetchData(endpoint, parameter) = @resolver/api/@endpoint/@parameter - Resolver executable
*/

// Core content handlers (context, tokens, whitespace, variables, command, code)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL EXEC DIRECTIVE
// -------------------------------------------------------------

// Primary @exec directive - supporting command, code, and environment syntax
AtExec
  = DirectiveContext "@exec" _ id:BaseIdentifier _ "=" _ "{" _ envVars:EnvironmentVarList _ "}" {
      // Environment declaration syntax: @exec js = { helperA, helperB }
      helpers.debug('AtExec matched environment declaration', { id, envVars });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        environment: envVars
      };
      
      const raw = {
        identifier: id,
        environment: envVars.map(v => v.identifier)
      };
      
      // Metadata
      const metaObj = {
        environmentCount: envVars.length
      };
      
      return helpers.createStructuredDirective(
        'exec',
        'environment',
        values,
        raw,
        metaObj,
        location(),
        'environment'
      );
    }
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@run" _ lang:RunCodeLanguage _ args:RunCodeArguments? _ code:UnifiedCodeBrackets withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      // Language + code syntax: @exec fn() = @run language [(code)]
      helpers.debug('AtExec matched with language + code', { id, params, lang, code, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      
      // Build values and raw objects
      const langNode = helpers.createNode(NodeType.Text, { content: lang, location: location() });
      const codeNode = helpers.createNode(NodeType.Text, { content: code.content, location: location() });
      
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        lang: [langNode],
        args: args || [],
        code: [codeNode]
      };
      
      const raw = {
        identifier: id,
        params: processedParams.map(p => p.name),  // Extract parameter names for raw field
        lang: lang,
        args: args ? args.map(arg => arg.identifier || '') : [],
        code: code.content
      };
      
      // Metadata
      const metaObj = {
        isMultiLine: code.content.includes('\n'),
        language: lang,
        hasVariables: false, // Code blocks don't support variable interpolation
        parameterCount: processedParams.length,
        ...helpers.createSecurityMeta({ trust }),
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
        'exec',
        'execCode',
        values,
        raw,
        metaObj,
        location(),
        'code'
      );
    }
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@run" _ content:UnifiedCommandBrackets withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      // Command syntax: @exec cmd() = @run [(command)]
      helpers.debug('AtExec matched with command', { id, params, content, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        command: content.values.command,
        commandBases: content.values.commandBases
      };
      
      const raw = {
        identifier: id,
        params: processedParams.map(p => p.name),  // Extract parameter names for raw field
        command: content.raw.command,
        commandBases: content.raw.commandBases
      };
      
      // Metadata
      const metaObj = {
        ...content.meta,
        parameterCount: processedParams.length,
        ...helpers.createSecurityMeta({ trust }),
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
        'exec',
        'execCommand',
        values,
        raw,
        metaObj,
        location(),
        'command'
      );
    }
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@run" _ "@" commandRef:CommandReference withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('AtExec matched command reference', { id, params, commandRef, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      const rawParams = processedParams.map(p => p.name); // Extract parameter names for raw field
      
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
        args: commandRef.args ? commandRef.args.map(arg => {
          // Extract value from Argument node
          if (arg.value && arg.value.type === 'Text') {
            return arg.value.content;
          } else if (arg.value && arg.value.type === 'VariableReference') {
            return '@' + arg.value.identifier;
          }
          return '';
        }) : []
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
  // Template executable: @exec name(params) = [[template]] or `template`
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ template:TemplateCore withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('AtExec matched template executable', { id, params, template, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        template: template.values.content
      };
      
      const raw = {
        identifier: id,
        params: processedParams.map(p => p.name),
        template: template.raw.content
      };
      
      // Metadata
      const metaObj = {
        ...template.meta,
        parameterCount: processedParams.length,
        ...helpers.createSecurityMeta({ trust }),
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
        'exec',
        'execTemplate',
        values,
        raw,
        metaObj,
        location(),
        'template'
      );
    }
  // Section executable: @exec name(params) = [@file # @section] [as @newheader]
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "[" _ "@" pathParam:BaseIdentifier fields:AnyFieldAccess* _ "#" _ section:SectionIdentifier _ "]" rename:ExecAsNewTitle? withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('AtExec matched section executable', { id, params, pathParam, section, rename, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      
      // Create variable reference node for path
      const pathVar = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: pathParam,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        path: [pathVar],
        section: Array.isArray(section) ? section : [section]
      };
      
      // Add rename if present
      if (rename) {
        values.rename = rename;
      }
      
      const raw = {
        identifier: id,
        params: processedParams.map(p => p.name),
        path: '@' + pathParam + (fields.length > 0 ? '.' + fields.map(f => f.name || f.index).join('.') : ''),
        section: section.type === 'VariableReference' ? '@' + section.identifier : (section.content || section)
      };
      
      // Add rename to raw if present
      if (rename) {
        raw.rename = rename[0].type === 'VariableReference' ? '@' + rename[0].identifier : rename[0].content;
      }
      
      // Metadata
      const metaObj = {
        parameterCount: processedParams.length,
        hasRename: !!rename,
        ...helpers.createSecurityMeta({ trust }),
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
        'exec',
        'execSection',
        values,
        raw,
        metaObj,
        location(),
        'section'
      );
    }
  // Resolver executable: @exec name(params) = @resolver/path
  / DirectiveContext "@exec" _ id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@" resolver:$([a-zA-Z0-9_/@-]+) withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('AtExec matched resolver executable', { id, params, resolver, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        resolver: [helpers.createNode(NodeType.Text, { content: resolver, location: location() })]
      };
      
      const raw = {
        identifier: id,
        params: processedParams.map(p => p.name),
        resolver: resolver
      };
      
      // Metadata
      const metaObj = {
        parameterCount: processedParams.length,
        ...helpers.createSecurityMeta({ trust }),
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
        'exec',
        'execResolver',
        values,
        raw,
        metaObj,
        location(),
        'resolver'
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
      // Create a proper Parameter node
      return helpers.createNode(NodeType.Parameter, {
        name: paramName,
        location: location()
      });
    }

// AsNewTitle pattern for exec section renaming - supports both literals and variables
ExecAsNewTitle
  = _ "as" _ title:LiteralContent {
      return title;
    }
  / _ "as" _ "@" varName:BaseIdentifier fields:AnyFieldAccess* {
      return [helpers.createVariableReferenceNode('varIdentifier', {
        identifier: varName,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location())];
    }