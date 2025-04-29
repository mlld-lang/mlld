
RunDirective
  = "run" _ "[" content:BracketInterpolatableContent "]" {
      const raw = content.map(n => {
        if (n.type === 'Text') return n.content;
        if (n.type === 'VariableReference') return `{{${n.identifier}}}`;
        return '';
      }).join('');
      return helpers.createDirective('run', {
        subtype: 'runCommand',
        raw,
        values: content
      }, location());
    }
  / "run" _ cmdRef:CommandReference _ HWS DirectiveEOL { 
      const { name, args: params } = cmdRef;
      return helpers.createDirective('run', {
        subtype: 'runDefined',
        raw: `$${name}`,
        values: [
          helpers.createVariableReferenceNode('path', { identifier: name, isVariableReference: true }, location())
        ],
        args: params || []
      }, location());
    }
  / "run" _ language:Identifier _ "[" _ code:$([^\[\]]+) _ "]" {
      return helpers.createDirective('run', {
        subtype: 'runCode',
        language,
        values: [
          helpers.createNode('Text', { content: code.trim() }, location())
        ]
      }, location());
    }

  / "run" _ lang:Identifier _ "(" params:RunVariableParams ")" _ "[" code:BracketInterpolatableContentOrEmpty "]" header:UnderHeader? HWS DirectiveEOL {
      const clean = code.filter(
        n => !(n.type === 'Text' && /^\s*$/.test(n.content))
      ).map(node => {
        if (node.type === 'Text') {
          return helpers.createNode('Text', { content: node.content.trim() }, location());
        }
        return node;
      });
      return helpers.createDirective('run', {
        subtype: 'runCodeParams',
        language: lang,
        values: clean,
        args: params,
        ...(header ? { underHeader: header } : {})
      }, location());
    }
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
      return helpers.createVariableReferenceNode('text', { identifier: varName }, location());
    }
  / StringLiteral
  / identifier:Identifier { return identifier; }


// Helper rule for parsing RHS @run variations
// Returns { subtype: '...', ... } structure without 'source' field.
_RunRHS
  = _ cmdRef:CommandReference {
      const commandObj = {
        raw: `$${cmdRef.name}${cmdRef.args.length > 0 ? `(${cmdRef.args.map(arg => {
          if (arg.type === 'string') return `\"${arg.value}\"`;
          if (arg.type === 'variable') return arg.value.raw || '';
          return arg.value;
        }).join(', ')})` : ''}`,
        name: cmdRef.name,
        args: cmdRef.args
      };
      return {
        subtype: 'runDefined',
        command: commandObj
      };
    }
  / _ lang:Identifier? _ params:RunVariableParams? _ "[[" content:MultilineInterpolatableContentOrEmpty "]]" _[ \t]* {
      return {
        subtype: params ? 'runCodeParams' : 'runCode',
        command: content,
        ...(lang ? { language: lang } : {}),
        ...(params ? { parameters: params } : {}),
        isMultiLine: true
      };
    }
  / _ "[" content:BracketInterpolatableContentOrEmpty "]" {
      return {
        subtype: 'runCommand',
        values: content // Changed 'command' to 'values'
      };
    }

CommandReference
  = "$" name:Identifier _ args:CommandArgs? { 
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
      return varRef; 
  }
  / chars:RawArgChar+ { 
      const result = { type: 'raw', value: chars.join('').trim() }; 
      return result;
  }

RawArgChar
  = !("," / ")") char:. { return char; }

