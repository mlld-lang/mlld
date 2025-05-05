RunDirective
  = runCommand / runCode / runExec

// @run [command]
runCommand
  = "run" _ command:WrappedCommandContent {
      // Calculate if this is a multi-line command by checking for newlines
      const rawCommand = command.raw;
      const isMultiLine = rawCommand.includes('\n');
      
      // Create values object
      const values = {
        command: command.parts
      };
      
      // Create raw object
      const raw = {
        command: rawCommand
      };
      
      // Create meta object
      const meta = {
        isMultiLine: isMultiLine
      };
      
      return helpers.createStructuredDirective('run', 'runCommand', values, raw, meta, location(), 'command');
    }

// @run language [code]
// @run language (arg1, arg2) [code]
runCode
  = "run" _ language:Identifier _ args:RunCodeArgs? _ code:WrappedCodeContent {
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
      
      return helpers.createStructuredDirective('run', 'runCode', values, raw, meta, location(), 'code');
    }

// @run @commandName
// @run @commandName(arg1, arg2)
// @run @commandName (arg1, arg2)
runExec
  = "run" _ "@" identifier:Identifier _ args:RunExecArgs? HWS DirectiveEOL {
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
      
      return helpers.createStructuredDirective('run', 'runExec', values, raw, meta, location(), 'exec');
    }

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
  = _ cmdRef:CommandReference {
      const commandObj = {
        raw: `@${cmdRef.name}${cmdRef.args.length > 0 ? `(${cmdRef.args.map(arg => {
          if (arg.type === 'string') return `\"${arg.value}\"`;
          if (arg.type === 'variable') return arg.value.raw || '';
          return arg.value;
        }).join(', ')})` : ''}`,
        name: cmdRef.name,
        args: cmdRef.args
      };
      
      // Convert args to proper nodes
      const argNodes = cmdRef.args.map(arg => {
        if (arg.type === 'string') {
          return helpers.createNode(NodeType.Text, { content: arg.value }, location());
        } else if (arg.type === 'variable') {
          return arg.value;
        } else {
          return helpers.createNode(NodeType.Text, { content: arg.value }, location());
        }
      });
      
      return {
        subtype: 'runExec',
        values: {
          identifier: [helpers.createNode(NodeType.Text, { content: cmdRef.name }, location())],
          args: argNodes
        },
        raw: {
          identifier: cmdRef.name,
          args: cmdRef.args.map(arg => arg.type === 'string' ? arg.value : 
                              arg.type === 'variable' ? arg.value.identifier : arg.value)
        },
        meta: {
          argumentCount: cmdRef.args.length
        }
      };
    }
  / _ lang:Identifier _ params:RunVariableParams? _ code:WrappedCodeContent _[ \t]* {
      // Create language node and get code content
      const langNode = helpers.createNode(NodeType.Text, { content: lang }, location());
      const rawCode = code.raw;
      const isMultiLine = rawCode.includes('\n');
      
      // runCode subtype
      return {
        subtype: 'runCode',
        values: {
          lang: [langNode],
          args: params || [],
          code: code.parts
        },
        raw: {
          lang,
          args: params ? params.map(p => p.identifier) : [],
          code: rawCode
        },
        meta: {
          isMultiLine: isMultiLine
        }
      };
    }
  / _ command:WrappedCommandContent _[ \t]* {
      // Simple command case (no language)
      const rawCommand = command.raw;
      const isMultiLine = rawCommand.includes('\n');
      
      // runCommand subtype
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