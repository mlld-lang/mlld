// UNIFIED RUN CONTENT PATTERN
// Handles the new [(...))] syntax for both commands and code

/* 
# Unified Run Content

The [(...))] syntax unifies command and code execution:
- @run [(echo "hello")]        - Command (no language keyword)
- @run [(js console.log(42))]  - Code (starts with language keyword)

This pattern detects the content type and applies appropriate parsing rules.
*/

// -------------------------------------------------------------
// UNIFIED CONTENT PATTERN - Single entry point for [(...)]
// -------------------------------------------------------------

// UNIFIED RUN CONTENT - Detects and parses command vs code
// Used by: AtRun directive (directives/run.peggy)
// Purpose: Unified parsing of [(...))] syntax with type detection
UnifiedRunContent "Unified run content [(...))]"
  = "[(" _ content:UnifiedRunContentInner _ ")]" {
      helpers.debug('UnifiedRunContent matched', { content });
      return content;
    }

// Inner content parser - determines command vs code
UnifiedRunContentInner
  = lang:RunCodeLanguage ws:_ rest:$(UnifiedCodeContent) {
      // Language detected -> Code execution
      helpers.debug('UnifiedRunContentInner detected code', { lang, rest });
      
      const langNode = helpers.createNode(NodeType.Text, { content: lang, location: location() });
      const codeNode = helpers.createNode(NodeType.Text, { content: rest.trim(), location: location() });
      
      return {
        type: 'code',
        subtype: 'runCode',
        values: {
          lang: [langNode],
          args: [], // TODO: Could support args in future like [(js(x, y) return x + y)]
          code: [codeNode]
        },
        raw: {
          lang: lang,
          args: [],
          code: rest.trim()
        },
        meta: {
          isMultiLine: rest.includes('\n'),
          language: lang,
          hasVariables: false // Code blocks don't support variable interpolation
        }
      };
    }
  / parts:UnifiedCommandParts {
      // No language -> Command execution
      helpers.debug('UnifiedRunContentInner detected command', { parts });
      
      const rawCommand = helpers.reconstructRawString(parts);
      
      // Extract command bases
      let commandBases = [];
      let rawBases = [];
      
      // Simple command base detection from first text segment
      if (parts.length > 0 && parts[0].type === NodeType.Text) {
        const cmdMatch = parts[0].content.match(/^(\S+)/);
        if (cmdMatch) {
          commandBases.push(helpers.createNode(NodeType.CommandBase, {
            command: cmdMatch[1],
            location: parts[0].location
          }));
          rawBases.push(cmdMatch[1]);
        }
      }
      
      return {
        type: 'command',
        subtype: 'runCommand',
        values: {
          command: parts,
          commandBases: commandBases
        },
        raw: {
          command: rawCommand,
          commandBases: rawBases
        },
        meta: {
          isMultiLine: rawCommand.includes('\n'),
          commandCount: commandBases.length,
          hasScriptRunner: false // TODO: Detect script runners
        }
      };
    }

// -------------------------------------------------------------
// COMMAND CONTENT - With variable interpolation
// -------------------------------------------------------------

// Command parts for unified syntax - allows @var interpolation
UnifiedCommandParts
  = parts:(UnifiedCommandVariable / UnifiedCommandText)* {
      return parts;
    }

// Variable in unified command context
UnifiedCommandVariable
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / SpecialVariable

// Text segments in unified commands - handle nested brackets
UnifiedCommandText
  = chars:UnifiedCommandChar+ {
      const content = chars.join('');
      return helpers.createNode(NodeType.Text, { content, location: location() });
    }

// Characters in unified commands - handle nested brackets  
UnifiedCommandChar
  = '[' inner:UnifiedCommandInnerContent ']' {
      // Preserve brackets in commands
      return '[' + inner + ']';
    }
  / !'@' !')]' char:. { return char; }

// Inner content of nested brackets
UnifiedCommandInnerContent
  = chars:UnifiedCommandInnerChar* {
      return chars.join('');
    }

// Characters inside nested brackets
UnifiedCommandInnerChar
  = '[' inner:UnifiedCommandInnerContent ']' {
      // Handle deeply nested brackets
      return '[' + inner + ']';
    }
  / !']' char:. { return char; }

// -------------------------------------------------------------
// CODE CONTENT - Without variable interpolation
// -------------------------------------------------------------

// Code content - everything after language keyword
UnifiedCodeContent
  = chars:UnifiedCodeChar* {
      return chars.join('');
    }

// Code characters - preserve everything literally
UnifiedCodeChar
  = '[' inner:UnifiedCodeInnerContent ']' {
      // Preserve brackets in code
      return '[' + inner + ']';
    }
  / !')]' char:. { return char; }

// Inner content for code brackets
UnifiedCodeInnerContent
  = chars:UnifiedCodeInnerChar* {
      return chars.join('');
    }

// Characters inside code brackets
UnifiedCodeInnerChar
  = '[' inner:UnifiedCodeInnerContent ']' {
      // Handle deeply nested brackets
      return '[' + inner + ']';
    }
  / !']' char:. { return char; }