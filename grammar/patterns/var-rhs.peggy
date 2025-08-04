// VAR RHS CONTENT - Unified right-hand side for /var directive
// Used by: /var directive
// Purpose: Route to appropriate content parser based on syntax detection

VarRHSContent "var assignment value"
  = ExpressionWithOperator      // Try expressions FIRST but only if operators present
  / WhenExpression              // when: [...] expressions for conditional values
  / ForeachCommandExpression    // foreach @command(@arrays)
  / FieldAccessExecPattern      // Field access exec invocations @obj.method()
  / ExecInvocationPattern       // Exec invocations @func() - handle @ internally
  / CodeExecution               // Language + code patterns (run keyword and shortcuts)
  / TemplateWithPipeline        // Template content with pipeline support
  / TemplateStyleInterpolation  // Handles backtick, [[...]], double/single quotes
  / DataObjectLiteral           // Use data-context object parsing for proper typing
  / ArrayLiteral                // Arrays: [1, 2, 3] - always arrays!
  / AlligatorWithFields         // File/URL with field access: <file.md>.field - must come before AlligatorExpression
  / AlligatorExpression         // File/URL loading: <file.md> - always loading! (includes transform/rename)
  / VariableWithSpacedPipes     // Variable references @var with spaced or unspaced pipes
  / VariableReferenceWithTail   // Variable references @var with optional tail modifiers
  / NestedDirective             // Nested directives @run, etc.
  / PrimitiveValue              // Direct primitives: 42, true, false, null

// Expression that definitely has an operator (to avoid matching simple variables)
ExpressionWithOperator
  = &{
      // Look ahead to see if there's an operator somewhere
      const rest = input.substring(peg$currPos);
      return /(\s*(&&|\|\||==|!=|<=|>=|<|>|\?|!))|(\s*\?\s*[^:]+\s*:)/.test(rest);
    }
    expr:Expression {
      return expr;
    }

// Note: AlligatorWithTransform was removed because AlligatorExpression 
// already handles "as" clauses internally in alligator.peggy

// ALLIGATOR WITH FIELDS - Handles <file.md>.field syntax for direct assignment
// This pattern allows field access after file references outside of template contexts
AlligatorWithFields "alligator with field access"
  = base:AlligatorExpression fields:AnyFieldAccess+ pipes:CondensedPipeChain? {
      helpers.debug('AlligatorWithFields matched', { 
        source: base.source,
        fieldCount: fields.length,
        pipeCount: pipes ? pipes.length : 0
      });
      
      // Combine pipes from base (before >) and pipes after fields
      const allPipes = [...(base.pipes || []), ...(pipes || [])];
      
      // Convert load-content node to FileReference node with fields
      return helpers.createFileReferenceNode(
        base.source,
        fields,
        allPipes,
        location()
      );
    }

// TEMPLATE WITH PIPELINE - Handles template content (quoted/backtick) followed by pipes
TemplateWithPipeline "template with pipeline"
  = template:TemplateStyleInterpolation pipes:CondensedPipeChain {
      helpers.debug('TemplateWithPipeline matched', { 
        template: template.wrapperType,
        pipelineCount: pipes.length
      });
      
      // Extract the actual content from the template
      const content = template.content || [helpers.createNode(NodeType.Text, { content: '', location: location() })];
      
      // Convert condensed pipes to pipeline format
      const pipeline = pipes.map(pipe => ({
        identifier: [helpers.createVariableReferenceNode('varIdentifier', { 
          identifier: pipe.transform 
        }, location())],
        args: pipe.args || [],
        fields: [],
        rawIdentifier: pipe.transform,
        rawArgs: pipe.args || []
      }));
      
      return {
        content: content,
        wrapperType: template.wrapperType,
        withClause: {
          pipeline: pipeline
        }
      };
    }

// VARIABLE WITH SPACED PIPES - Allows both "@var | @pipe" and "@var|@pipe" in var RHS
VariableWithSpacedPipes "variable with flexible pipe syntax"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* firstPipe:(_ pipeStart:("" { return peg$currPos; }) "|" _ "@" transform:BaseIdentifier { return { transform, pipeStart }; })? restPipes:SpacedOrCondensedPipe* {
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      // Collect all pipes
      const pipes = [];
      if (firstPipe) {
        const loc = location();
        const startOffset = firstPipe.pipeStart;
        pipes.push({
          type: 'CondensedPipe',
          transform: firstPipe.transform,
          hasAt: true,
          location: {
            source: loc.source,
            start: { 
              offset: startOffset,
              line: loc.start.line,
              column: loc.start.column - (loc.start.offset - startOffset)
            },
            end: loc.end
          }
        });
      }
      if (restPipes && restPipes.length > 0) {
        pipes.push(...restPipes);
      }
      
      if (pipes.length > 0) {
        return {
          ...varRef,
          pipes: pipes
        };
      }
      
      return varRef;
    }

// Flexible pipe pattern for var RHS - allows whitespace
SpacedOrCondensedPipe
  = _ pipeStart:("" { return peg$currPos; }) "|" _ "@" transform:BaseIdentifier {
      const loc = location();
      const startOffset = pipeStart;
      return {
        type: 'CondensedPipe',
        transform: transform,
        hasAt: true,
        location: {
          source: loc.source,
          start: { 
            offset: startOffset,
            line: loc.start.line,
            column: loc.start.column - (loc.start.offset - startOffset)
          },
          end: loc.end
        }
      };
    }

// FIELD ACCESS EXEC PATTERN - Matches @obj.field() with nested field access
FieldAccessExecPattern "field access exec invocation"
  = "@" id:BaseIdentifier fields:AnyFieldAccess+ "(" args:CommandArgumentList? _ ")" tail:TailModifiers? {
      // Extract the last field as the method name
      const lastField = fields[fields.length - 1];
      const methodName = lastField.value;
      
      // Create variable reference for the object path (all fields except last)
      const objectFields = fields.slice(0, -1);
      const objectRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(objectFields.length > 0 ? { fields: objectFields } : {})
      }, location());
      
      // Create the exec invocation
      const ref = {
        name: methodName,
        identifier: [helpers.createNode(NodeType.Text, { content: methodName, location: location() })],
        args: args || [],
        isCommandReference: true,
        objectReference: objectRef
      };
      
      return helpers.createExecInvocation(ref, tail || null, location());
    }

// EXEC INVOCATION PATTERN - Matches @func() specifically
ExecInvocationPattern "exec invocation pattern"
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" tail:TailModifiers? {
      // Create command reference with arguments
      const ref = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args: args || [],
        isCommandReference: true
      };
      
      return helpers.createExecInvocation(ref, tail || null, location());
    }

// Note: BracketAmbiguous removed - use ArrayLiteral for arrays, AlligatorExpression for file loading


// Primitive values for arrays
PrimitiveValue
  = ExpressionString        // Returns Literal node for both single and double quotes
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral

// Object property values - use data context patterns for proper typing and unwrapping
ObjectPropertyValue "object property value"
  = DataPropertyValue           // Delegate to data-context patterns


// Run command in object context
RunCommandValue
  = "run" _ "\"" command:$([^"]*) "\"" {
      // Quoted command syntax: run "echo hello"
      // Parse the command string to extract parts with proper location
      const commandLocation = location();
      const parts = helpers.parseCommandContent(command, commandLocation);
      
      // Extract command base
      let commandBases = [];
      
      if (parts.length > 0 && parts[0].type === NodeType.Text) {
        const cmdMatch = parts[0].content.match(/^(\S+)/);
        if (cmdMatch) {
          commandBases.push(helpers.createNode(NodeType.CommandBase, {
            command: cmdMatch[1],
            location: commandLocation
          }));
        }
      }
      
      return {
        type: 'command',
        command: parts,
        commandBases: commandBases,
        hasRunKeyword: true,
        meta: {
          isMultiLine: false,
          commandCount: commandBases.length,
          hasScriptRunner: false
        }
      };
    }
  / "run" _ content:UnifiedCommandBrackets {
      // Use the same command parsing as regular /run directives
      return {
        type: 'command',
        command: content.values.command,  // Parsed command nodes
        commandBases: content.values.commandBases,
        hasRunKeyword: true,
        meta: content.meta
      };
    }
  / "run" _ "@" invocation:UnifiedReferenceWithTail {
      // Handle run @command() syntax with unified patterns
      return {
        type: 'runExec',
        invocation: invocation,
        hasRunKeyword: true
      };
    }

// Code execution in object context  
CodeExecutionValue
  = "/"? lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      return {
        type: 'code',
        language: lang,
        code: code,
        hasRunKeyword: false
      };
    }


// Property key - shared between old ObjectLiteral and DataObjectLiteral
PropertyKey
  = BaseIdentifier
  / DataString      // Use DataString for object property keys

// Nested directive like @run
NestedDirective
  = "@"? "/"? "run" _ lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      // Inline code execution
      return {
        type: 'nestedDirective',
        directive: 'run',
        language: lang,
        code: code
      };
    }
  / "@"? "/"? "run" _ "[" _ cmd:CommandContent _ "]" {
      // Command execution
      return {
        type: 'nestedDirective', 
        directive: 'run',
        command: cmd
      };
    }

// Command content inside brackets
CommandContent
  = chars:(!"]" .)* {
      return chars.map(c => c[1]).join('');
    }

// Note: Bracket section patterns removed - use AlligatorExpression for section extraction

// Code execution patterns (language + code without @run prefix)
CodeExecution "code execution"
  = "/"? "run" _ lang:VarCodeLanguage _ "{" _ content:CodeBlockContent _ "}" {
      // Language-specific code execution (js, python, etc.)
      return {
        type: 'code',
        language: lang,
        code: content,
        hasRunKeyword: true
      };
    }
  / "/"? "run" _ content:UnifiedCommandBrackets {
      // Shell command - use proper command parsing
      return {
        type: 'command',
        command: content.values.command,  // Parsed command nodes
        commandBases: content.values.commandBases,
        hasRunKeyword: true,
        meta: content.meta
      };
    }
  / lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      // Shorthand: language + code without 'run' keyword
      return {
        type: 'code',
        language: lang,
        code: code,
        hasRunKeyword: false
      };
    }

// Language keywords for var code execution
VarCodeLanguage "code language"
  = "js" / "javascript" / "node" / "python" / "bash" / "sh"

// Code block content - preserve everything literally
CodeBlockContent "code block content"
  = chars:CodeChar* {
      return chars.join('');
    }

// Characters in code blocks (handle nested braces)
CodeChar
  = "{" inner:CodeBlockContent "}" {
      return '{' + inner + '}';
    }
  / !"}" char:. {
      return char;
    }

// WHEN EXPRESSION - Value-returning when expressions for variable assignments
// Used by: VarRHSContent
// Purpose: Allow when: [...] expressions that return values based on first matching condition

WhenExpression "when expression"
  = "when" _ ":" _ "[" _ conditions:WhenExpressionConditionList _ "]" tail:TailModifiers? {
      helpers.debug('WhenExpression matched', { 
        conditionCount: conditions.length,
        hasTailModifiers: !!tail
      });
      
      return helpers.createWhenExpression(conditions, tail, location());
    }
  // Error recovery patterns
  / "when" _ ":" _ "[" _ &{
      return helpers.isUnclosedArray(input, peg$currPos);
    } {
      helpers.mlldError(
        `Unclosed array in when expression. Expected ']' to close the condition list.`,
        "]",
        location()
      );
    }
  / "when" _ ":" _ {
      helpers.mlldError(
        `Missing condition list in when expression. Expected: when: [condition => value, ...]`,
        "[",
        location()
      );
    }
  / "when" _ &{ return !input.substring(peg$currPos).startsWith(':'); } {
      helpers.mlldError(
        `Missing ':' in when expression. Expected: when: [...]`,
        ":",
        location()
      );
    }

// Value-oriented condition list for when expressions
WhenExpressionConditionList
  = first:WhenExpressionConditionPair rest:(_ pair:WhenExpressionConditionPair { return pair; })* {
      return [first, ...rest];
    }

// Single condition => value pair for expressions
WhenExpressionConditionPair
  = condition:WhenConditionExpression _ "=>" _ action:WhenExpressionAction {
      return { condition, action: [action] };
    }

// Actions in when expressions are values, not directives
WhenExpressionAction
  = VarRHSContent