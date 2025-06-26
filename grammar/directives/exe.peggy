// EXE DIRECTIVE  
// Implementation of the /exe directive for defining executable commands and code
// Replaces: /exec directive - DELETED with no backward compatibility

/* 
# Exe Directive

The exe directive defines named commands or code blocks that can be executed
by the /run directive. It can be used in these forms:
1. /exe cmdName (param1, param2) = @run command-string   - Define a shell command
2. /exe fnName (param1) = @run js [code-block]           - Define a code function
3. /exe alias (param1) = @run @otherCmd                  - Define a command reference

# Unified Executable Syntax

The exe directive supports unified executable syntax:
1. /exe greeting(name) = [[Hello {{name}}!]]       - Template executable with {{var}} interpolation
2. /exe greeting(name) = `Hello @name!`            - Template executable with @var interpolation
3. /exe build(env) = {npm run build:@env}        - Command executable
4. /exe calculate(x) = js {return @x * 2}        - Code executable
5. /exe getSection(file, section) = [@file # @section] - Section executable
6. /exe getSection(file, section, newheader) = [@file # @section] as @newheader - Section with rename
7. /exe fetchData(endpoint, parameter) = @resolver/api/@endpoint/@parameter - Resolver executable
*/

// Core content handlers (context, tokens, whitespace, variables, command, code)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL EXEC DIRECTIVE
// -------------------------------------------------------------

// Primary /exec directive - supporting command, code, and environment syntax
SlashExe
  = DirectiveContext "/exe" _ id:BaseIdentifier _ "=" _ "{" _ envVars:EnvironmentVarList _ "}" comment:InlineComment? {
      // Environment declaration syntax: /exec js = { helperA, helperB }
      helpers.debug('SlashExe matched environment declaration (no @)', { id, envVars });
      
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
        DirectiveKind.exe,
        'environment',
        values,
        raw,
        metaObj,
        location(),
        'environment'
      );
    }
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier _ "=" _ "{" _ envVars:EnvironmentVarList _ "}" comment:InlineComment? {
      // Environment declaration syntax: /exec @js = { helperA, helperB }
      helpers.debug('SlashExe matched environment declaration (with @)', { id, envVars });
      
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
        DirectiveKind.exe,
        'environment',
        values,
        raw,
        metaObj,
        location(),
        'environment'
      );
    }
  // Code executable: /exec name(params) = js {code}
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ codeCore:RunLanguageCodeCore withClause:WithClause? trust:(_ t:TrustOption { return t; })? comment:InlineComment? {
      // Code syntax: /exec fn() = language {code}
      helpers.debug('SlashExe matched with RunLanguageCodeCore', { id, params, codeCore, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      
      // Use values and raw from the core pattern
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        lang: codeCore.values.lang,
        args: codeCore.values.args,
        code: codeCore.values.code
      };
      
      const raw = {
        identifier: id,
        params: processedParams.map(p => p.name),
        lang: codeCore.raw.lang,
        args: codeCore.raw.args,
        code: codeCore.raw.code
      };
      
      // Merge metadata from core with exec-specific metadata
      const metaObj = {
        ...codeCore.meta,
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
        DirectiveKind.exe,
        'exeCode',
        values,
        raw,
        metaObj,
        location(),
        'code'
      );
    }
  // Command executable: /exec name(params) = {command}
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ content:UnifiedCommandBrackets withClause:WithClause? trust:(_ t:TrustOption { return t; })? comment:InlineComment? {
      // Command syntax: /exec cmd() = {command}
      helpers.debug('SlashExe matched with command', { id, params, content, trust });
      
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
        DirectiveKind.exe,
        'exeCommand',
        values,
        raw,
        metaObj,
        location(),
        'command'
      );
    }
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@"? "/"? "run" _ content:UnifiedCommandBrackets withClause:WithClause? trust:(_ t:TrustOption { return t; })? comment:InlineComment? {
      // Command syntax: /exec cmd() = @run {command}
      helpers.debug('SlashExe matched with command', { id, params, content, trust });
      
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
        DirectiveKind.exe,
        'exeCommand',
        values,
        raw,
        metaObj,
        location(),
        'command'
      );
    }
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@"? "/"? "run" _ "@" commandRef:CommandReference withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('SlashExe matched command reference', { id, params, commandRef, trust });
      
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
        DirectiveKind.exe,
        'exeCommand',
        values,
        raw,
        metaObj,
        location(),
        'reference'  // Added source parameter
      );
    }
  // Template executable: /exec name(params) = [[template]] or `template`
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ template:TemplateCore withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('SlashExe matched template executable', { id, params, template, trust });
      
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
        DirectiveKind.exe,
        'exeTemplate',
        values,
        raw,
        metaObj,
        location(),
        'template'
      );
    }
  // Section executable: /exec name(params) = [@file # @section] [as @newheader]
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "[" _ "@" pathParam:BaseIdentifier fields:AnyFieldAccess* _ "#" _ section:SectionIdentifier _ "]" rename:ExecAsNewTitle? withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('SlashExe matched section executable', { id, params, pathParam, section, rename, trust });
      
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
        DirectiveKind.exe,
        'exeSection',
        values,
        raw,
        metaObj,
        location(),
        'section'
      );
    }
  // Resolver executable: /exec name(params) = @resolver/path [{ @payload }]
  // Direct command reference: /exec alias() = @other
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@" commandRef:BaseIdentifier !"/" withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('SlashExe matched direct command reference', { id, params, commandRef, trust });
      
      // Create identifier node
      const identifierNode = helpers.createNode(NodeType.Text, { content: id, location: location() });
      
      // Process parameters
      const processedParams = params || [];
      
      // Build values and raw objects
      const values = {
        identifier: [identifierNode],
        params: processedParams,
        commandRef: [helpers.createNode(NodeType.Text, { content: commandRef, location: location() })]
      };
      
      const raw = {
        identifier: id,
        params: processedParams.map(p => p.name),
        commandRef: commandRef
      };
      
      // Create meta object
      const metaObj = {
        parameterCount: processedParams.length,
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
        DirectiveKind.exe,
        'exeCommand',
        values,
        raw,
        metaObj,
        location(),
        'reference'
      );
    }
  / DirectiveContext "/exe" _ "@" id:BaseIdentifier meta:ExecMetadata? params:ExecParameters? _ "=" _ "@" resolver:ResolverPathPattern payload:ExecResolverPayload? withClause:WithClause? trust:(_ t:TrustOption { return t; })? {
      helpers.debug('SlashExe matched resolver executable', { id, params, resolver, trust });
      
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
      
      // Add payload if present
      if (payload) {
        values.payload = payload;
      }
      
      const raw = {
        identifier: id,
        params: processedParams.map(p => p.name),
        resolver: resolver
      };
      
      // Add payload to raw if present
      if (payload) {
        raw.payload = payload[0].identifier || payload[0].content;
      }
      
      // Metadata
      const metaObj = {
        parameterCount: processedParams.length,
        hasPayload: !!payload,
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
        DirectiveKind.exe,
        'exeResolver',
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

// ResolverPathPattern - matches resolver paths like resolver/api/@endpoint/@parameter
// Must contain at least one slash to distinguish from simple identifiers like "run"
ResolverPathPattern
  = chars:$([a-zA-Z0-9_@-]+ "/" [a-zA-Z0-9_/@-]*) { return chars; }

// ExecResolverPayload - optional payload syntax: { @variable }
ExecResolverPayload
  = _ "{" _ "@" varName:BaseIdentifier fields:AnyFieldAccess* _ "}" {
      return [helpers.createVariableReferenceNode('varIdentifier', {
        identifier: varName,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location())];
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