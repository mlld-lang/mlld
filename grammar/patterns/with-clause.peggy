// WITH CLAUSE PATTERN
// Pattern for the 'with' clause that supports pipeline and related options

// -------------------------------------------------------------
// MAIN WITH CLAUSE
// -------------------------------------------------------------

// With clause for run/exec directives
WithClause
  = _ "with" _ object:WithObject {
      helpers.debug('WithClause matched', { object });
      return object;
    }

// Object containing pipeline and related options
WithObject
  = "{" _ props:WithProperties? _ "}" {
      const result = {};
      if (props) {
        for (const [key, value] of props) {
          result[key] = value;
        }
      }
      return result;
    }

// Properties list for with clause
WithProperties
  = first:WithProperty rest:(CommaSpace prop:WithProperty { return prop; })* {
      return [first, ...rest];
    }

// Individual property (pipeline or metadata)
WithProperty
  = "pipeline" _ ":" _ pipeline:PipelineArray {
      return ["pipeline", pipeline];
    }
  / "guards" _ ":" _ guards:GuardOverrides {
      return ["guards", guards];
    }
  / "stdin" _ ":" _ stdin:Expression {
      return ["stdin", stdin];
    }
  / "format" _ ":" _ format:DataString {
      return ["format", format];
    }
  / "asSection" _ ":" _ title:AsSectionRenameString {
      return ["asSection", title];
    }
  / "policy" _ ":" _ policy:DataObjectLiteral {
      return ["policy", policy];
    }
  / "parallel" _ ":" _ cap:NumberLiteral {
      return ["parallel", Number(cap)];
    }
  / "delay" _ ":" _ wait:TimeDurationLiteral {
      const delayMs = helpers.ttlToSeconds(wait.value, wait.unit) * 1000;
      return ["delayMs", delayMs];
    }
  / "stream" _ ":" _ stream:BooleanLiteral {
      return ["stream", stream === 'true' || stream === true];
    }
  / "streamFormat" _ ":" _ format:DataString {
      return ["streamFormat", format];
    }

// -------------------------------------------------------------
// PIPELINE SUPPORT
// -------------------------------------------------------------

// Array of pipeline commands
PipelineArray
  = "[" _ commands:PipelineStageList? _ "]" {
      return commands || [];
    }

// List of pipeline commands
// A pipeline stage can be a single command or a parallel group represented
// as a nested array: [[@a, @b], @c]
PipelineStageList
  = first:PipelineStage rest:(CommaSpace st:PipelineStage { return st; })* {
      return [first, ...rest];
    }

PipelineStage
  = ParallelGroupArray
  / PipelineStageEntry

// Parallel group inside with { pipeline: [...] }, only commands allowed inside
ParallelGroupArray
  = "[" _ cmds:GroupCommandList? _ "]" {
      return cmds || [];
    }

GroupCommandList
  = first:PipelineStageEntry rest:(CommaSpace cmd:PipelineStageEntry { return cmd; })* {
      return [first, ...rest];
    }

// -------------------------------------------------------------
// GUARD OVERRIDES
// -------------------------------------------------------------

GuardOverrides
  = "false" {
      return false;
    }
  / GuardOverrideObject

GuardOverrideObject
  = "{" _ entries:GuardOverrideEntries? _ "}" {
      const result = {};
      if (entries) {
        for (const [key, value] of entries) {
          result[key] = value;
        }
      }
      return result;
    }

GuardOverrideEntries
  = first:GuardOverrideEntry rest:(CommaSpace entry:GuardOverrideEntry { return entry; })* {
      return [first, ...rest];
    }

GuardOverrideEntry
  = "only" _ ":" _ names:GuardOverrideNameList {
      return ["only", names];
    }
  / "except" _ ":" _ names:GuardOverrideNameList {
      return ["except", names];
    }

GuardOverrideNameList
  = "[" _ names:GuardOverrideNames? _ "]" {
      return names || [];
    }

GuardOverrideNames
  = first:GuardOverrideName rest:(CommaSpace name:GuardOverrideName { return name; })* {
      return [first, ...rest];
    }

GuardOverrideName
  = GuardOverrideSingleQuoted
  / GuardOverrideDoubleQuoted

GuardOverrideSingleQuoted
  = "'" content:EscapedSingleStringContent "'" {
      return content;
    }

GuardOverrideDoubleQuoted
  = '"' parts:GuardOverrideDoubleChars* '"' {
      return parts.join('');
    }

GuardOverrideDoubleChars
  = '\\"' { return '"'; }
  / '\\\\' { return '\\'; }
  / char:[^"] { return char; }

// Pipeline stage entry (inline value, inline command, or command reference)
PipelineStageEntry
  = PipelineInlineValueStage
  / PipelineInlineCommandStage
  / PipelineCommand

// Single pipeline command (command reference with @input support)
// Uses UnifiedReferenceForPipeline to prevent nested pipelines
PipelineCommand
  = PipelineBuiltinOutput
  / PipelineBuiltinAppend
  / PipelineBuiltinShow
  / PipelineBuiltinLog
  / ref:UnifiedReferenceForPipeline {
      helpers.debug('PipelineCommand matched unified reference', { ref });
      
      // Handle ExecInvocation, VariableReferenceWithTail, and VariableReference types
      if (ref.type === 'ExecInvocation') {
        return {
          identifier: ref.commandRef.identifier,
          args: ref.commandRef.args || [],
          fields: [],
          rawIdentifier: ref.commandRef.name,
          rawArgs: ref.commandRef.args ? ref.commandRef.args.map(arg => 
            arg.type === NodeType.Text ? arg.content : 
            arg.type === NodeType.VariableReference ? '@' + arg.identifier : ''
          ) : [],
          ...(ref.withClause?.stream ? { stream: true } : {})
        };
      } else if (ref.type === 'VariableReferenceWithTail') {
        // Variable with tail modifiers - should not happen in pipeline context
        // Extract just the variable part and ignore the tail
        const variable = ref.variable;
        return {
          identifier: [variable],
          args: [],
          fields: variable.fields || [],
          rawIdentifier: variable.identifier,
          rawArgs: [],
          ...(ref.withClause?.stream ? { stream: true } : {})
        };
      } else {
        // Plain variable reference
        return {
          identifier: [ref],
          args: [],
          fields: ref.fields || [],
          rawIdentifier: ref.identifier,
          rawArgs: []
        };
      }
    }

// Inline command stage using cmd { ... }
PipelineInlineCommandStage
  = "cmd" _ content:UnifiedCommandBrackets {
      return {
        type: 'inlineCommand',
        command: content.values.command,
        commandBases: content.values.commandBases,
        rawCommand: content.raw.command,
        rawIdentifier: content.raw.commandBases && content.raw.commandBases.length > 0 ? content.raw.commandBases[0] : 'cmd-stage',
        meta: content.meta,
        location: location()
      };
    }

// Inline data stage using bare/data braces
PipelineInlineValueStage
  = "data" _ obj:DataObjectLiteral { 
      return {
        type: 'inlineValue',
        value: obj,
        rawIdentifier: 'data-literal',
        location: location()
      };
    }
  / obj:DataObjectLiteral {
      return {
        type: 'inlineValue',
        value: obj,
        rawIdentifier: 'data-literal',
        location: location()
      };
    }

// -------------------------------------------------------------
// PIPELINE BUILTIN EFFECTS (minimal)
// -------------------------------------------------------------

InlineEffectWhitespace "inline whitespace without newline"
  = [ \t\u00A0\u200B\u200C\u200D]*

PipelineEffectInlineSource "inline effect source (same line only)"
  = InlineEffectWhitespace !(LineTerminator) source:OutputSource {
      return source;
    }

// Support: log [<source>]
// Example: | log "After stage"   or   | log @var   or   | log
PipelineBuiltinLog
  = "log" ![A-Za-z0-9_] src:PipelineEffectInlineSource? {
      // Build a pseudo reference node for identifier compatibility
      const idNode = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'log'
      }, location());

      // Convert optional source into effect args suitable for interpolation
      let args = [];
      let rawArgs = [];
      if (src) {
        if (src.type === 'literal') {
          // Use the literal node array directly
          args = [src.values];
          rawArgs = [src.raw?.content || ''];
        } else if (src.type === 'variable') {
          const varRef = src.values.identifier && src.values.identifier[0] ? src.values.identifier[0] : null;
          if (varRef) {
            args = [varRef];
            rawArgs = ['@' + (varRef.identifier || '')];
          }
        } else if (src.type === 'exec') {
          args = [src.values]; // ExecInvocation node
          rawArgs = ['@' + (src.raw?.commandName || '')];
        }
      }

      return {
        identifier: [idNode],
        args: args,
        fields: [],
        rawIdentifier: 'log',
        rawArgs: rawArgs,
        meta: { isBuiltinEffect: true }
      };
    }

// show [<source>]
PipelineBuiltinShow
  = "show" ![A-Za-z0-9_] src:PipelineEffectInlineSource? {
      const idNode = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'show'
      }, location());
      let args = [];
      let rawArgs = [];
      if (src) {
        if (src.type === 'literal') {
          args = [src.values];
          rawArgs = [src.raw?.content || ''];
        } else if (src.type === 'variable') {
          const varRef = src.values.identifier && src.values.identifier[0] ? src.values.identifier[0] : null;
          if (varRef) {
            args = [varRef];
            rawArgs = ['@' + (varRef.identifier || '')];
          }
        } else if (src.type === 'exec') {
          args = [src.values];
          rawArgs = ['@' + (src.raw?.commandName || '')];
        }
      }

      return {
        identifier: [idNode],
        args,
        fields: [],
        rawIdentifier: 'show',
        rawArgs,
        meta: { isBuiltinEffect: true }
      };
    }

// output [<source>] to <target>
PipelineBuiltinOutput
  = "output" ![A-Za-z0-9_] _ src:OutputSource? _ "to" _ target:OutputTarget {
      const idNode = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'output'
      }, location());

      // Normalize args: [source?, target]
      let srcArg = null;
      if (src) {
        if (src.type === 'literal') {
          srcArg = src.values;
        } else if (src.type === 'variable') {
          srcArg = src.values.identifier && src.values.identifier[0] ? src.values.identifier[0] : null;
        } else if (src.type === 'exec') {
          srcArg = src.values; // ExecInvocation node
        }
      }

      const args = srcArg ? [srcArg, target] : [target];
      const rawArgs = [];

      return {
        identifier: [idNode],
        args,
        fields: [],
        rawIdentifier: 'output',
        rawArgs,
        meta: { isBuiltinEffect: true, hasExplicitSource: !!src }
      };
    }

// append [<source>] to <file target>
PipelineBuiltinAppend
  = "append" ![A-Za-z0-9_] _ src:OutputSource? _ "to" _ target:OutputTargetFile {
      const idNode = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'append'
      }, location());

      let srcArg = null;
      if (src) {
        if (src.type === 'literal') {
          srcArg = src.values;
        } else if (src.type === 'variable') {
          srcArg = src.values.identifier && src.values.identifier[0] ? src.values.identifier[0] : null;
        } else if (src.type === 'exec') {
          srcArg = src.values;
        }
      }

      const args = srcArg ? [srcArg, target] : [target];

      return {
        identifier: [idNode],
        args,
        fields: [],
        rawIdentifier: 'append',
        rawArgs: [],
        meta: {
          isBuiltinEffect: true,
          hasExplicitSource: !!src
        }
      };
    }
  / "append" ![A-Za-z0-9_] _ target:OutputTargetFile {
      const idNode = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'append'
      }, location());

      return {
        identifier: [idNode],
        args: [target],
        fields: [],
        rawIdentifier: 'append',
        rawArgs: [target.raw],
        meta: {
          isBuiltinEffect: true,
          hasExplicitSource: false
        }
      };
    }
