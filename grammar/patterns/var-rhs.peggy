// VAR RHS CONTENT - Unified right-hand side for /var directive
// Used by: /var directive
// Purpose: Route to appropriate content parser based on syntax detection

VarRHSContent "var assignment value"
  = ExpressionWithOperator      // Try expressions FIRST but only if operators present
  / VarWhenError                // Error recovery: when expressions not allowed in /var
  / ForExpression               // for @var in @collection => expression
  / ForeachCommandExpression    // foreach @command(@arrays)
  / ExecResultMethodCall        // @func(args).method(args) on exec result
  / ExecInvocationWithFields    // Exec invocations followed by field/index access (must come before FieldAccessExecPattern)
  / FieldAccessExecPattern      // Field access exec invocations @obj.method()
  / ExecInvocationPattern       // Exec invocations @func() - handle @ internally
  / CodeExecution               // Language + code patterns (run keyword and shortcuts)
  / TemplateWithPipeline        // Template content with pipeline support - MUST come before PrimitiveValue
  / ArrayLiteral                // Arrays: [1, 2, 3] - MUST come before templates to handle [[nested]]
  / DataObjectLiteral           // Use data-context object parsing for proper typing
  / UnifiedQuoteOrTemplate      // Unified quotes and templates (moved after arrays)
  / AlligatorWithFields         // File/URL with field access: <file.md>.field - must come before AlligatorExpression
  / AlligatorWithPostPipes      // <file> followed by external pipe chain with optional whitespace/newlines
  / AlligatorExpression         // File/URL loading: <file.md> - always loading! (includes transform/rename)
  / VariableWithSpacedPipes     // Variable references @var with spaced or unspaced pipes
  / VariableReferenceWithTail   // Variable references @var with optional tail modifiers
  / NestedDirective             // Nested directives @run, etc.
  / PrimitiveValue              // Direct primitives: 42, true, false, null, and strings WITHOUT pipes

// Expression that definitely has an operator (to avoid matching simple variables)
ExpressionWithOperator
  = &{
      // Look ahead to see if there's an operator somewhere IN THE CURRENT DIRECTIVE
      // Stop at: newline, next directive (/), or comment (>>)
      const rest = input.substring(peg$currPos);
      // Only look within the current line/directive context
      const endOfContext = rest.search(/[\n\r]|(?:^|\s)\/\w+|(?:^|\s)>>/);
      const contextToSearch = endOfContext === -1 ? rest : rest.substring(0, endOfContext);
      return /(\s*(&&|\|\||==|!=|<=|>=|<|>|\?|!))|(\s*\?\s*[^:]+\s*:)/.test(contextToSearch);
    }
    expr:Expression {
      return expr;
    }

// EXEC INVOCATION FOLLOWED BY FIELDS - e.g., @func()[1] or @obj.method().2
ExecInvocationWithFields "exec invocation with post fields"
  = base:FieldAccessExecPattern post:AnyFieldAccess+ {
      // Allow chaining fields after a method call on an object
      return {
        ...base,
        fields: post
      };
    }
  / base:ExecInvocationPattern post:AnyFieldAccess+ {
      // Allow chaining fields after a plain function call
      return {
        ...base,
        fields: post
      };
    }

// Note: AlligatorWithTransform was removed because AlligatorExpression 
// already handles "as" clauses internally in alligator.peggy

// ALLIGATOR WITH FIELDS - Handles <file.md>.field syntax for direct assignment
// This pattern allows field access after file references outside of template contexts
AlligatorWithFields "alligator with field access"
  = base:AlligatorExpression fields:AnyFieldAccess+ pipes:SpacedOrCondensedPipeChain? {
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
// Note: We use HWS (horizontal whitespace) before the first pipe to prevent matching
// pipes on the next line unless they're intentionally continued
TemplateWithPipeline "template with pipeline"
  = template:UnifiedQuoteOrTemplate pipes:SpacedOrCondensedPipeChain {
      helpers.debug('TemplateWithPipeline matched', { 
        template: template.wrapperType,
        pipelineCount: pipes.length
      });
      
      // Extract the actual content from the template
      const content = template.content || [helpers.createNode(NodeType.Text, { content: '', location: location() })];
      
      // Convert tail pipes (with optional whitespace) to pipeline format
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

// ALLIGATOR WITH POST PIPES - Merge inside-angle pipes with external spaced/condensed pipe chains
AlligatorWithPostPipes "alligator with external pipe chain"
  = base:AlligatorExpression pipes:SpacedOrCondensedPipeChain {
      helpers.debug('AlligatorWithPostPipes matched', {
        innerPipes: base.pipes ? base.pipes.length : 0,
        outerPipes: pipes.length
      });
      const allPipes = [...(base.pipes || []), ...(pipes || [])];
      return {
        ...base,
        ...(allPipes.length > 0 ? { pipes: allPipes } : {})
      };
    }

// VARIABLE WITH PIPES (outside template contexts)
// Optional whitespace form that accepts full CommandArgumentList for args
VariableWithSpacedPipes "variable with flexible pipe syntax"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* firstPipe:(_ pipeStart:("" { return peg$currPos; }) "|" _ command:PipeCommand { return { command, pipeStart }; })? restPipes:SpacedOrCondensedPipe* {
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
          transform: firstPipe.command.name,
          hasAt: true,
          args: firstPipe.command.args || [],
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

// Flexible pipe pattern for var RHS - allows whitespace and optional args
SpacedOrCondensedPipe
  = _ pipeStart:("" { return peg$currPos; }) "|" _ command:PipeCommand {
      const loc = location();
      const startOffset = pipeStart;
      return {
        type: 'CondensedPipe',
        transform: command.name,
        hasAt: true,
        args: command.args || [],
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

// Pipe command syntax for non-template pipelines: @name or @name(args)
PipeCommand "pipe command"
  = "@" name:BaseIdentifier args:( _ "(" _ a:CommandArgumentList? _ ")" { return a || []; } )? {
      return { name, args: args || [] };
    }

// Chain of spaced-or-condensed pipes
SpacedOrCondensedPipeChain "flexible pipe chain"
  = pipes:SpacedOrCondensedPipe+ { return pipes; }

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


// Primitive values for arrays and when expressions
PrimitiveValue
  = ExpressionString        // Returns Literal node for both single and double quotes
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral
  / RetryLiteral           // retry keyword for pipeline control

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
  = lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
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
  = "@"? "run" _ lang:VarCodeLanguage _ "{" _ code:CodeBlockContent _ "}" {
      // Inline code execution
      return {
        type: 'nestedDirective',
        directive: 'run',
        language: lang,
        code: code
      };
    }
  / "@"? "run" _ "[" _ cmd:CommandContent _ "]" {
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
  = "run" _ lang:VarCodeLanguage _ "{" _ content:CodeBlockContent _ "}" {
      // Language-specific code execution (js, python, etc.)
      return {
        type: 'code',
        language: lang,
        code: content,
        hasRunKeyword: true
      };
    }
  / "run" _ content:UnifiedCommandBrackets {
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

// VAR WHEN ERROR - Error recovery for when expressions in /var context
// when expressions are not allowed in /var assignments - use /exe instead
VarWhenError
  = "when" _ ":" _ "[" {
      helpers.mlldError(
        "when expressions are not allowed in /var assignments.\n\n" +
        "Instead of:\n" +
        "  /var @result = when [@condition => value, ...]\n\n" +
        "Use:\n" +
        "  /exe @result() = when [@condition => value, ...]",
        "/exe",
        location()
      );
    }

// FOR EXPRESSION - for @var in @collection => expression
// Used in /var and /exe assignments to collect results
ForExpression "for expression"
  = "for" _ pattern:ForIterationPattern _ "=>" _ expr:VarRHSContent {
      helpers.debug('ForExpression matched', { pattern, expr });
      
      return helpers.createForExpression(
        pattern.variable,
        pattern.source, 
        expr,
        location()
      );
    }
  // Error recovery
  / "for" _ "@" id:BaseIdentifier _ "in" _ source:VarRHSContent _ !"=>" {
      helpers.mlldError("Missing '=>' in for expression. Expected: for @var in @collection => expression", "=>", location());
    }
  / "for" _ "@" id:BaseIdentifier _ !"in" {
      helpers.mlldError("Missing 'in' in for expression. Expected: for @var in @collection => expression", "in", location());
    }
  / "for" _ !"each" _ !"@" {
      helpers.mlldError("Invalid for expression syntax. Expected: for @var in @collection => expression", "@", location());
    }
