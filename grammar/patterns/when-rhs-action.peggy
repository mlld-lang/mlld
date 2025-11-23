// When RHS Action Pattern
// =======================
// Unified pattern for actions in RHS when expressions
// Generates regular directive nodes (same as when.peggy) that get evaluated through normal evaluate() chain
// Used in both /when and /exe...when RHS contexts

// Main pattern - try error recovery first, then side-effect actions, then pure values
WhenRHSAction "when RHS action"
  = WhenRHSExeDefinitionError  // Error recovery FIRST - before ExecInvocationPattern can match
  / WhenRHSShowAction
  / WhenRHSOutputAction  
  / WhenRHSVarAssignment
  / WhenRHSCommandAction
  / WhenRHSFunctionCall
  / WhenRHSSkipAction
  / WhenRHSVariableReference  // Allow @var (optionally with pipelines) as value-returning action
  / WhenRHSRetryAction
  / VarRHSContent  // Pure values (fallback)

// Command action - explicit cmd { ... } in when actions
WhenRHSCommandAction
  = cmdAction:CmdCommandBrackets tail:TailModifiers? {
      const values = { ...cmdAction.values };
      const raw = { ...cmdAction.raw };
      const meta = { ...cmdAction.meta };
      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }
      return [helpers.createStructuredDirective(
        'run',
        'runCommand',
        values,
        raw,
        meta,
        location(),
        'command'
      )];
    }

// Retry action with optional hint value (string/object/function/variable)
// Returns an array of nodes: [RetryLiteral, <hintNode>?]
// IMPORTANT: Hint must be on the same line to avoid consuming next condition
WhenRHSRetryAction
  = "retry" 
    // Look ahead to ensure we're not immediately before another condition on a new line
    !(_ [\n\r]+ _ ("*" / "none" / [a-zA-Z@]) [^=]* "=>") 
    // Then optionally parse a hint - must be on same line
    hint:(
      // Must have whitespace but NO newline before the hint
      [ \t]+ 
      // Parse the hint content (but not across newlines)
      // SingleLineVarRHSContent already prevents crossing line boundaries
      h:SingleLineVarRHSContent { return h; }
    )? {
      const retryNode = helpers.createNode(NodeType.Literal, { 
        value: 'retry', 
        valueType: 'retry',
        location: location() 
      });
      if (typeof hint !== 'undefined' && hint !== null) {
        return [retryNode, hint];
      }
      return [retryNode];
    }

// Single-line version of VarRHSContent for retry hints
// Prevents hint parsing from crossing line boundaries
SingleLineVarRHSContent
  = ![\n\r] content:VarRHSContent { return content; }

// Skip action - returns a special literal used by for-expressions to filter
WhenRHSSkipAction
  = "skip" {
      return helpers.createNode(NodeType.Literal, {
        value: 'skip',
        valueType: 'skip',
        location: location()
      });
    }

// Variable reference (with optional tail modifiers / pipelines)
WhenRHSVariableReference
  = varRef:VariableReferenceWithTail {
      if (!varRef || !varRef.withClause) {
        const loc = location();
        peg$currPos = loc.start.offset;
        return peg$FAILED;
      }
      return varRef;
    }

// Show action - creates regular show directive node
WhenRHSShowAction
  = "show" _ content:WhenRHSShowContent {
      helpers.debug('WhenRHSShowAction matched', { content });
      
      // Handle different content types and create appropriate show directive
      if (content && typeof content === 'object' && content.wrapperType) {
        // Template content (quotes, backticks, etc.)
        return helpers.createNode(NodeType.Directive, {
          kind: 'show',
          subtype: 'showTemplate',
          values: { content: content.content },
          raw: { content: content.raw || text() },
          meta: { wrapperType: content.wrapperType },
          location: location()
        });
      } else if (content && content.type === 'VariableReference') {
        // Variable reference
        return helpers.createNode(NodeType.Directive, {
          kind: 'show',
          subtype: 'showVariable',
          values: { variable: [content] },
          raw: { variable: '@' + content.identifier },
          meta: {},
          location: location()
        });
      } else if (content && content.type === 'ExecInvocation') {
        // Function call
        return helpers.createNode(NodeType.Directive, {
          kind: 'show',
          subtype: 'showExecInvocation',
          values: { execInvocation: content },
          raw: { execInvocation: content.commandRef.name },
          meta: {},
          location: location()
        });
      } else {
        // Primitive value or other content
        return helpers.createNode(NodeType.Directive, {
          kind: 'show',
          subtype: 'showLiteral',
          values: { content: [helpers.createNode(NodeType.Text, { content: String(content), location: location() })] },
          raw: { content: String(content) },
          meta: {},
          location: location()
        });
      }
    }

// Output action - creates regular output directive node
WhenRHSOutputAction
  = "output" _ source:WhenRHSOutputSource _ "to" _ target:WhenRHSOutputTarget format:(_ "as" _ f:OutputFormat { return f; })? {
      helpers.debug('WhenRHSOutputAction matched', { source, target, format });
      
      // Build base directive structure
      const values = { target };
      const raw = { target: target.raw || String(target) };
      let subtype = 'outputDocument';
      const meta = { 
        hasSource: false,
        targetType: target.type || 'file',
        enhanced: true
      };
      
      if (source) {
        meta.hasSource = true;
        
        // Case 1: Template/quoted content (UnifiedQuoteOrTemplate)
        if (source && typeof source === 'object' && source.content && source.wrapperType) {
          values.source = source.content;
          raw.source = source.raw || text();
          meta.sourceType = 'literal'; // Treat templates/quotes as literal content to be interpolated
          meta.wrapperType = source.wrapperType;
          subtype = 'outputText';
        }
        // Case 2: Variable reference
        else if (source && source.type === 'VariableReference') {
          // Canonical: use structured source with identifier/args
          values.source = {
            identifier: [source],
            args: []
          };
          raw.source = '@' + source.identifier;
          meta.sourceType = 'variable';
          subtype = 'outputVariable';
        }
        // Case 3: Exec invocation (function call)
        else if (source && source.type === 'ExecInvocation') {
          values.source = {
            identifier: source.commandRef.identifier,
            args: source.commandRef.args || []
          };
          raw.source = source.commandRef.name;
          meta.sourceType = 'execInvocation';
          subtype = 'outputInvocation';
        }
        // Case 4: Primitive values (numbers, booleans, null) or plain strings
        else {
          values.source = [helpers.createNode(NodeType.Text, { content: String(source), location: location() })];
          raw.source = String(source);
          meta.sourceType = 'literal';
          subtype = 'outputText';
        }
      }
      
      if (format) {
        meta.format = format;
      }
      
      return helpers.createNode(NodeType.Directive, {
        kind: 'output',
        subtype,
        values,
        raw,
        meta,
        location: location()
      });
    }

// Variable assignment - creates regular var directive node
WhenRHSVarAssignment  
  = "@" name:BaseIdentifier _ "=" _ value:VarRHSContent {
      helpers.debug('WhenRHSVarAssignment matched', { name, value });
      
      // Create variable reference for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: name }, location());
      
      // Process the value based on its structure (simplified from var.peggy)
      let processedValue;
      let metaInfo = {};
      
      // Handle template content (backtick, [[...]], quotes)
      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';
      }
      // Handle object literals
      else if (value && value.type === 'object') {
        processedValue = [value];
        metaInfo.inferredType = 'object';
      }
      // Handle array literals
      else if (value && value.type === 'array') {
        processedValue = [value];
        metaInfo.inferredType = 'array';
      }
      // Handle exec invocations (function calls)
      else if (value && value.type === 'ExecInvocation') {
        processedValue = [value];
        metaInfo.inferredType = 'computed';
      }
      // Handle variable references
      else if (value && value.type === 'variableReference') {
        processedValue = [value.value];
        metaInfo.inferredType = 'reference';
      }
      // Handle primitives and other values
      else {
        processedValue = Array.isArray(value) ? value : [value];
        metaInfo.inferredType = 'primitive';
      }
      
      return helpers.createNode(NodeType.Directive, {
        kind: 'var',
        subtype: 'assignment',
        values: {
          identifier: [idNode],
          value: processedValue
        },
        raw: {
          identifier: '@' + name,
          value: text()
        },
        meta: metaInfo,
        location: location()
      });
    }

// Function call - just return the invocation directly (it gets evaluated normally)
WhenRHSFunctionCall
  = ref:UnifiedReference &{ 
      // Check if this is actually an executable reference
      return ref.type === 'ExecInvocation' || 
             ref.type === 'FieldAccessExec' ||
             (ref.arguments && ref.arguments.length >= 0);
    } {
      helpers.debug('WhenRHSFunctionCall matched', { ref });
      
      // Just return the reference directly - it will be evaluated normally
      return ref;
    }

// Show content for RHS context - use same patterns as VarRHSContent
WhenRHSShowContent
  = UnifiedQuoteOrTemplate  // Use unified pattern instead of TemplateStyleInterpolation
  / UnifiedReference             // Variable or exec reference
  / DataObjectLiteral
  / PrimitiveValue              // Includes string literals and other primitives

// Output source for RHS context - use same patterns as VarRHSContent  
WhenRHSOutputSource
  = UnifiedQuoteOrTemplate  // Use unified pattern instead of TemplateStyleInterpolation
  / UnifiedReference             // Variable or exec reference
  / PrimitiveValue              // Includes string literals and other primitives

// Output target for RHS context
WhenRHSOutputTarget
  = OutputTarget  // Reuse existing output target patterns

// Error recovery - catch exe definitions and provide helpful error
WhenRHSExeDefinitionError
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? ")" _ "=" _ value:VarRHSContent {
      helpers.mlldError(
        `Executable definitions are not allowed in when RHS contexts.\n\n` +
        `Instead of:\n` +
        `  /when @condition => @${name}() = ...\n` +
        `  /var @result = when [@condition => @${name}() = ...]\n\n` +
        `Use:\n` +
        `  /exe @${name}() = when [@condition => ..., * => default]`,
        "/exe",
        location()
      );
    }
