// PIPELINE BUILT-IN COMMANDS
// Pass-through stages that don't transform data but perform side effects
// These directives (show, log, output) can be used in pipelines as stages

// -------------------------------------------------------------
// MAIN PIPELINE BUILTIN COMMAND
// -------------------------------------------------------------

PipelineBuiltinCommand "pipeline built-in command"
  = ShowPipelineCommand
  / LogPipelineCommand  
  / OutputPipelineCommand

// -------------------------------------------------------------
// SHOW COMMAND
// -------------------------------------------------------------

ShowPipelineCommand
  = "show" args:(_ arg:PipelineBuiltinArgument { return arg; })? {
      helpers.debug('ShowPipelineCommand matched', { args });
      return {
        type: 'builtinCommand',
        command: 'show',
        args: args ? [args] : [],
        rawIdentifier: 'show',
        passThrough: true
      };
    }

// -------------------------------------------------------------
// LOG COMMAND
// -------------------------------------------------------------

LogPipelineCommand
  = "log" args:(_ arg:PipelineBuiltinArgument { return arg; })? {
      helpers.debug('LogPipelineCommand matched', { args });
      return {
        type: 'builtinCommand',
        command: 'log',
        args: args ? [args] : [],
        rawIdentifier: 'log',
        passThrough: true
      };
    }

// -------------------------------------------------------------
// OUTPUT COMMAND
// -------------------------------------------------------------

OutputPipelineCommand
  = "output" args:(_ arg:PipelineBuiltinArgument { return arg; })? _ "to" _ target:OutputPipelineTarget {
      helpers.debug('OutputPipelineCommand matched with source and target', { args, target });
      return {
        type: 'builtinCommand',
        command: 'output',
        args: args ? [args] : [],
        target: target,
        rawIdentifier: args ? `output ${args} to ${target.raw}` : `output to ${target.raw}`,
        passThrough: true
      };
    }
  / "output" _ "to" _ target:OutputPipelineTarget {
      helpers.debug('OutputPipelineCommand matched with target', { target });
      return {
        type: 'builtinCommand',
        command: 'output',
        args: [],
        target: target,
        rawIdentifier: `output to ${target.raw}`,
        passThrough: true
      };
    }
  / "output" _ target:OutputPipelineTarget {
      helpers.debug('OutputPipelineCommand matched with target (no to)', { target });
      return {
        type: 'builtinCommand',
        command: 'output',
        args: [],
        target: target,
        rawIdentifier: `output ${target.raw}`,
        passThrough: true
      };
    }
  / "output" {
      helpers.debug('OutputPipelineCommand matched without target');
      // Default to stdout when no target specified
      return {
        type: 'builtinCommand',
        command: 'output',
        args: [],
        target: { type: 'stream', stream: 'stdout', raw: 'stdout' },
        rawIdentifier: 'output',
        passThrough: true
      };
    }

// -------------------------------------------------------------
// PIPELINE BUILTIN ARGUMENTS
// -------------------------------------------------------------

// Pipeline-specific argument handling
PipelineBuiltinArgument
  = quote:UnifiedQuoteOrTemplate { 
      helpers.debug('PipelineBuiltinArgument matched quote/template', { quote });
      return quote; 
    }
  / "@input" "." fields:AnyFieldAccess+ { 
      helpers.debug('PipelineBuiltinArgument matched @input with fields', { fields });
      return {
        type: 'inputField',
        fields: fields
      };
    }
  / "@input" { 
      helpers.debug('PipelineBuiltinArgument matched @input');
      return { type: 'input' };
    }
  / varRef:AtVar {
      helpers.debug('PipelineBuiltinArgument matched variable', { varRef });
      return varRef;
    }

// -------------------------------------------------------------
// OUTPUT TARGETS
// -------------------------------------------------------------

OutputPipelineTarget
  = path:DataString {
      helpers.debug('OutputPipelineTarget matched file path', { path });
      return {
        type: 'file',
        path: path,
        raw: `"${path}"`
      };
    }
  / stream:("stdout" / "stderr") {
      helpers.debug('OutputPipelineTarget matched stream', { stream });
      return {
        type: 'stream',
        stream: stream,
        raw: stream
      };
    }