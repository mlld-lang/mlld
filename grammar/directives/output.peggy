// OUTPUT DIRECTIVE
// Implementation of the /output directive for writing content to various targets

// Main /output directive - supports multiple forms:
// Legacy syntax (backward compatible):
// /output [file.md]                              <- outputs full document
// /output @variable [file.md]                    <- outputs variable content
// /output @template(args) [file.md]              <- outputs template result
// /output @command(args) [file.md]               <- outputs command result  
// /output "text content" [file.md]               <- outputs literal text
//
// New enhanced syntax:
// /output @variable to "path/to/file.md"         <- file output
// /output @variable to stdout                    <- standard output
// /output @variable to stderr                    <- standard error
// /output @variable to env                       <- environment variable (MLLD_VARIABLE)
// /output @variable to env:CUSTOM_NAME           <- custom environment variable
// /output @variable to @resolver/path/file.md    <- resolver output
// /output @variable to "file.json" as json       <- with format specification

SlashOutput
  = DirectiveContext "/output" _ source:OutputSource _ "to" _ target:OutputTarget format:(_ f:OutputFormat { return f; })? {
      helpers.debug('SlashOutput enhanced syntax matched', { source, target, format });
      
      const values = {
        source: source.values,
        target: target
      };
      
      const raw = {
        source: source.raw,
        target: target.raw
      };
      
      const meta = {
        sourceType: source.type,
        targetType: target.type,
        hasSource: true,
        ...(format ? { format, explicitFormat: true } : {})
      };
      
      // Determine subtype based on target type
      let subtype = 'outputFile';  // default
      if (target.type === 'stream') {
        subtype = 'outputStream';
      } else if (target.type === 'env') {
        subtype = 'outputEnv';
      } else if (target.type === 'resolver') {
        subtype = 'outputResolver';
      }
      
      return helpers.createStructuredDirective(
        'output',
        subtype,
        values,
        raw,
        meta,
        location()
      );
    }
  // Legacy bracket syntax for backward compatibility
  / DirectiveContext "/output" _ source:OutputSource _ path:WrappedPathContent {
      helpers.debug('SlashOutput legacy syntax with source matched', { source, path });
      
      const values = {
        source: source.values,
        target: {
          type: 'file',
          path: path.parts,
          raw: path.raw,
          meta: path.meta
        }
      };
      
      const raw = {
        source: source.raw,
        target: path.raw
      };
      
      const meta = {
        sourceType: source.type,
        targetType: 'file',
        hasSource: true,
        legacy: true
      };
      
      return helpers.createStructuredDirective(
        'output',
        'outputFile',
        values,
        raw,
        meta,
        location()
      );
    }
  / DirectiveContext "/output" _ path:WrappedPathContent {
      helpers.debug('SlashOutput legacy syntax without source matched', { path });
      
      const values = {
        target: {
          type: 'file',
          path: path.parts,
          raw: path.raw,
          meta: path.meta
        }
      };
      
      const raw = {
        target: path.raw
      };
      
      const meta = {
        targetType: 'file',
        hasSource: false,
        legacy: true
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
  // New enhanced syntax for document output
  / DirectiveContext "/output" _ "to" _ target:OutputTarget format:(_ f:OutputFormat { return f; })? {
      helpers.debug('SlashOutput enhanced syntax without source matched', { target, format });
      
      const values = {
        target: target
      };
      
      const raw = {
        target: target.raw
      };
      
      const meta = {
        targetType: target.type,
        hasSource: false,
        ...(format ? { format, explicitFormat: true } : {})
      };
      
      // Determine subtype based on target type
      let subtype = 'outputDocument';
      if (target.type !== 'file') {
        subtype = 'output' + target.type.charAt(0).toUpperCase() + target.type.slice(1);
      }
      
      return helpers.createStructuredDirective(
        'output',
        subtype,
        values,
        raw,
        meta,
        location()
      );
    }

// Output source types
OutputSource
  = OutputVariable      // Variable MUST come before exec invocation
  / OutputExecInvocation
  / OutputCommand  
  / OutputLiteral

// Exec invocation with tail modifiers
OutputExecInvocation
  = "@" invocation:ExecInvocationWithTail {
      helpers.debug('OutputExecInvocation matched', { invocation });
      
      return {
        type: 'exec',
        subtype: 'outputExecInvocation',
        values: invocation,
        raw: {
          commandName: invocation.commandRef.name
        }
      };
    }

// Variable reference with optional arguments (includes templates and commands)
OutputVariable
  = "@" identifier:BaseIdentifier fields:AnyFieldAccess* args:OutputArguments? !("|" / "with" / "trust" / "needs") {
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