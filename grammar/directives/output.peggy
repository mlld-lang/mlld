// OUTPUT DIRECTIVE
// Implementation of the @output directive for writing content to files

// Main @output directive - supports multiple forms:
// @output [file.md]                    <- outputs full document content
// @output @variable [file.md]          <- outputs variable content
// @output @template(args) [file.md]    <- outputs template result
// @output @command(args) [file.md]     <- outputs command result  
// @output "text content" [file.md]     <- outputs literal text
AtOutput
  = DirectiveContext "@output" _ source:OutputSource _ path:WrappedPathContent {
      helpers.debug('AtOutput with source matched', { source, path });
      
      const values = {
        source: source.values,
        path: path.parts  // Use .parts, not .values
      };
      
      const raw = {
        source: source.raw,
        path: path.raw
      };
      
      const meta = {
        sourceType: source.type,
        hasSource: true
      };
      
      return helpers.createStructuredDirective(
        'output',
        source.subtype,
        values,
        raw,
        meta,
        location()
      );
    }
  / DirectiveContext "@output" _ path:WrappedPathContent {
      helpers.debug('AtOutput without source matched', { path });
      
      const values = {
        path: path.parts  // Use .parts, not .values
      };
      
      const raw = {
        path: path.raw
      };
      
      const meta = {
        hasSource: false
      };
      
      return helpers.createStructuredDirective(
        'output',
        'outputDocument',
        values,
        raw,
        meta,
        location()
      );
    }

// Output source types
OutputSource
  = OutputVariable
  / OutputCommand  
  / OutputLiteral

// Variable reference with optional arguments (includes templates and commands)
OutputVariable
  = "@" identifier:BaseIdentifier fields:AnyFieldAccess* args:OutputArguments? {
      const hasArgs = args && args.length > 0;
      const isTemplate = hasArgs; // With args, it's a template/command invocation
      
      const values = {
        identifier: [helpers.createNode(NodeType.Text, { content: identifier, location: location() })],
        ...(fields && fields.length > 0 ? { fields } : {}),
        ...(hasArgs ? { args } : {})
      };
      
      const raw = {
        identifier,
        ...(fields && fields.length > 0 ? { fields: fields.map(f => f.value) } : {}),
        ...(hasArgs ? { args: args.map(arg => helpers.reconstructRawString([arg])) } : {})
      };
      
      return {
        type: 'variable',
        subtype: hasArgs ? 'outputInvocation' : 'outputVariable',
        values,
        raw
      };
    }

// Command reference (for exec commands)
OutputCommand
  = "@run" _ "@" commandRef:OutputCommandReference {
      helpers.debug('OutputCommand matched', { commandRef });
      
      return {
        type: 'command',
        subtype: 'outputCommand',
        values: {
          identifier: commandRef.identifier,
          args: commandRef.args || []
        },
        raw: {
          identifier: commandRef.rawIdentifier,
          args: commandRef.rawArgs || []
        }
      };
    }

// Literal text output
OutputLiteral
  = str:StringLiteral {
      return {
        type: 'literal',
        subtype: 'outputLiteral',
        values: [helpers.createNode(NodeType.Text, { content: str, location: location() })],
        raw: str
      };
    }

// Command reference structure (similar to RunCommandReference)
OutputCommandReference
  = identifier:BaseIdentifier fields:AnyFieldAccess* _ args:OutputArguments? {
      const processedArgs = args || [];
      const rawArgs = processedArgs.map(arg => {
        if (arg.type === 'Variable') {
          return '@' + arg.identifier;
        }
        return arg.content || '';
      });
      
      return {
        identifier: [helpers.createNode(NodeType.Text, { content: identifier, location: location() })],
        ...(fields && fields.length > 0 ? { fields } : {}),
        args: processedArgs,
        rawIdentifier: identifier,
        rawArgs: rawArgs
      };
    }

// Arguments for templates/commands
OutputArguments
  = "(" _ args:OutputArgumentList? _ ")" {
      return args || [];
    }

// Argument list
OutputArgumentList
  = first:OutputArgument rest:(CommaSpace arg:OutputArgument { return arg; })* {
      return [first, ...rest];
    }

// Individual argument
OutputArgument
  = str:StringLiteral {
      return helpers.createNode(NodeType.Text, { content: str, location: location() });
    }
  / varRef:Variable {
      return varRef;
    }
  / val:$([^,)]+) {
      // Plain value (raw argument)
      return helpers.createNode(NodeType.Text, { content: val.trim(), location: location() });
    }