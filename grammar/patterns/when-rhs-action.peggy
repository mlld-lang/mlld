// When RHS Action Pattern
// =======================
// Unified pattern for actions in RHS when expressions
// Generates regular directive nodes (same as when.peggy) that get evaluated through normal evaluate() chain
// Used in both /when and /exe...when RHS contexts

// Main pattern - parse standard actions first, then label modifications
WhenRHSAction "when RHS action"
  = WhenRHSActionBase
  / LabelModificationAction

WhenRHSActionBase "when RHS action base"
  = WhenRHSExeDefinitionError  // Error recovery FIRST - before ExecInvocationPattern can match
  / LetAssignment              // Allow let @x = value inside when actions
  / AugmentedAssignment        // Allow @x += (or let @x +=) inside when actions
  / EffectAction               // Unified effects: show, log, output, append
  / WhenRHSVarAssignment
  / WhenRHSCommandAction
  / WhenRHSFunctionCall
  / DoneLiteral
  / ContinueLiteral
  / WhenRHSSkipAction
  / WhenRHSVariableReference  // Allow @var (optionally with pipelines) as value-returning action
  / WhenRHSRetryAction
  / VarRHSContent  // Pure values (fallback)

LabelModificationAction
  = mods:ReturnLabelModifierList ws:[ \t]+ value:WhenRHSActionBase {
      const normalized = Array.isArray(value) ? value.flat() : [value];
      return helpers.createNode('LabelModification', {
        modifiers: mods,
        value: normalized,
        raw: text(),
        location: location()
      });
    }

ReturnLabelModifierList
  = first:ReturnLabelModifier rest:(HWS "," HWS mod:ReturnLabelModifier { return mod; })* {
      return [first, ...rest];
    }

ReturnLabelModifier
  = "clear!" ![a-zA-Z0-9_] { return { kind: 'clear' }; }
  / "trusted!" ![a-zA-Z0-9_] { return { kind: 'bless' }; }
  / "trusted" ![a-zA-Z0-9_] { return { kind: 'trusted' }; }
  / "untrusted" ![a-zA-Z0-9_] { return { kind: 'untrusted' }; }
  / "!" label:ReturnLabelIdentifier { return { kind: 'remove', label }; }
  / label:ReturnLabelIdentifier { return { kind: 'add', label }; }

ReturnLabelIdentifier
  = label:DataLabelIdentifier { return label; }
  / label:StringLiteral { return label; }

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

// Error recovery - catch exe definitions and provide helpful error
WhenRHSExeDefinitionError
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" _ "=" _ value:VarRHSContent {
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
