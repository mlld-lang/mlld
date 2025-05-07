// Core rules that can be used by both top-level directives and RHS directives

// Core rule for run command - extract just the command content processing
RunCommandCore
  = command:WrappedCommandContent {
      // Calculate if this is a multi-line command by checking for newlines
      const rawCommand = command.raw;
      const isMultiLine = rawCommand.includes('\n');
      
      return {
        subtype: 'runCommand',
        values: {
          command: command.parts
        },
        raw: {
          command: rawCommand
        },
        meta: {
          isMultiLine: isMultiLine
        }
      };
    }

// Top-level directive definition
RunDirective
  = runCommand / runCode / runExec

// @run [command] - uses the core rule
runCommand
  = "run" _ core:RunCommandCore {
      // Use the core result to create the directive
      return helpers.createStructuredDirective(
        'run', 
        core.subtype, 
        core.values, 
        core.raw, 
        core.meta, 
        location(), 
        'command'
      );
    }

// Core rule for run code - extract just the code content processing
RunCodeCore
  = language:Identifier _ args:RunCodeArgs? _ code:WrappedCodeContent {
      // Create language node
      const langNode = helpers.createNode(NodeType.Text, { content: language }, location());
      
      // Reconstruct raw strings
      const rawLang = language;
      const rawArgs = args ? args.map(arg => {
        if (arg.type === 'VariableReference') {
          return arg.identifier;
        }
        return arg.content || '';
      }) : [];
      
      // Get raw code and check for multi-line
      const rawCode = code.raw;
      const isMultiLine = rawCode.includes('\n');
      
      // Create values object
      const values = {
        lang: [langNode],
        args: args || [],
        code: code.parts
      };
      
      // Create raw object
      const raw = {
        lang: rawLang,
        args: rawArgs,
        code: rawCode
      };
      
      // Create meta object
      const meta = {
        isMultiLine: isMultiLine
      };
      
      return {
        subtype: 'runCode',
        values: values,
        raw: raw,
        meta: meta
      };
    }

// @run language [code]
// @run language (arg1, arg2) [code]
runCode
  = "run" _ core:RunCodeCore {
      return helpers.createStructuredDirective(
        'run', 
        core.subtype, 
        core.values, 
        core.raw, 
        core.meta, 
        location(), 
        'code'
      );
    }

// Core rule for run exec - extracts just the command reference processing without the @ prefix
RunExecCore
  = identifier:Identifier _ args:RunExecArgs? HWS {
      // Create text node from identifier
      const identifierNode = helpers.createNode(NodeType.Text, { content: identifier }, location());
      
      // Process arguments
      const processedArgs = args || [];
      const rawArgs = processedArgs.map(arg => {
        if (arg.type === 'Text') return arg.content;
        if (arg.type === 'VariableReference') return arg.identifier;
        return '';
      });
      
      // Create values object
      const values = {
        identifier: [identifierNode],
        args: processedArgs
      };
      
      // Create raw object
      const raw = {
        identifier: identifier,
        args: rawArgs
      };
      
      // Create meta object
      const meta = {
        argumentCount: processedArgs.length
      };
      
      return {
        subtype: 'runExec',
        values: values,
        raw: raw,
        meta: meta
      };
    }

// @run @commandName
// @run @commandName(arg1, arg2)
// @run @commandName (arg1, arg2)
runExec
  = "run" _ "@" core:RunExecCore DirectiveEOL {
      return helpers.createStructuredDirective(
        'run', 
        core.subtype, 
        core.values, 
        core.raw, 
        core.meta, 
        location(), 
        'exec'
      );
    }

// A rule that can be used for RHS assignments in exec or text directives
// This combines all run variants into a single rule that returns structured data
RunRHS "Right-hand side run directive"
  = core:RunCommandCore { return core; }
  / core:RunCodeCore { return core; }
  / "@" core:RunExecCore { return core; }

// Helper rules for runCode arguments
RunCodeArgs
  = "(" _ args:RunArgsList? _ ")" {
      return args || [];
    }

RunArgsList
  = first:RunArg rest:(_ "," _ arg:RunArg { return arg; })* {
      return [first, ...rest];
    }

RunArg
  = varName:Identifier {
      return helpers.createVariableReferenceNode('varInterpolation', { identifier: varName }, location());
    }

// Helper rules for runExec arguments
RunExecArgs
  = "(" _ argList:RunExecArgsList? _ ")" {
      return argList || [];
    }

RunExecArgsList
  = first:RunExecArg rest:(_ "," _ arg:RunExecArg { return arg; })* {
      return [first, ...rest];
    }

RunExecArg
  = str:StringLiteral {
      return helpers.createNode(NodeType.Text, { content: str }, location());
    }
  / varRef:Variable {
      return varRef;
    }
  / val:$([^,)]+) {
      // Plain value (raw argument)
      return helpers.createNode(NodeType.Text, { content: val.trim() }, location());
    }

// Helper rule for parsing RHS @run variations
// Returns { subtype: '...', ... } structure without 'source' field.
// This rule is needed for compatibility with the define.peggy file
_RunRHS
  = _ "@run" _ rhsDirective:RunRHS {
      // This uses our newly unified RunRHS rule
      return rhsDirective;
    }

CommandReference
  = "@" name:Identifier _ args:CommandArgs? { 
      return {
        name,
        args: args || [],
        isCommandReference: true
      };
    }

CommandArgs
  = "(" _ args:CommandArgsList? _ ")" {
      return args || [];
    }

CommandArgsList
  = first:CommandArg rest:(_ "," _ arg:CommandArg { return arg; })* {
      const result = [first, ...rest];
      return result;
    }

CommandArg
  = str:StringLiteral { 
      const result = { type: 'string', value: str };
      return result; 
    }
  / varRef:Variable { 
      return { type: 'variable', value: varRef }; 
    }
  / chars:RawArgChar+ { 
      const result = { type: 'raw', value: chars.join('').trim() }; 
      return result;
    }

RawArgChar
  = !("," / ")") char:. { return char; }

// Additional rules needed for _RunRHS compatibility
RunVariableParams
  = params:RunParamsList? {
      return params || [];
    }

RunParamsList
  = first:RunParam rest:(_ "," _ param:RunParam { return param; })* {
      return [first, ...rest].filter(Boolean);
    }

RunParam
  = varName:("{{" _ name:Identifier _ "}}" { return name; } / "(" _ name:Identifier _ ")" { return name; }) {
      return helpers.createVariableReferenceNode('varInterpolation', { identifier: varName }, location());
    }
  / StringLiteral
  / identifier:Identifier { return identifier; }