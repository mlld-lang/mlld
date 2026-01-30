// WHEN DIRECTIVE
// Implementation of the /when directive for conditional execution

/*
# When Directive

The when directive provides conditional execution based on truthiness.
It can be used in several forms:
1. /when <condition> => <action>             - Simple conditional
2. /when <expression>: [conditions]          - Match form (first match wins)
3. /when <var>: [conditions] => <action>     - Block conditional

For AND/OR logic, use && and || operators in conditions instead of any/all modifiers:
- Use: /when (@cond1 && @cond2) => action  (instead of: /when all [@cond1 @cond2] => action)
- Use: /when (@cond1 || @cond2) => action  (instead of: /when any [@cond1 @cond2] => action)
*/

// Core content handlers (context, tokens, whitespace, variables, commands)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL WHEN DIRECTIVE
// -------------------------------------------------------------

WhenKeyword
  = "/"? "when"

// Primary /when directive
SlashWhen
  = WhenMatchForm  // This MUST come before WhenSimpleForm to handle colon syntax
  / WhenSimpleForm
  / WhenSimpleBlockForm  // Error recovery for deprecated 'when @cond [block]' form
  // Error recovery: deprecated 'any' modifier
  / DirectiveContext WhenKeyword _ variable:("@" id:BaseIdentifier { return id; })? _ "any" _ ":"? _ "[" {
      helpers.mlldError(
        "The 'any' modifier has been removed from mlld. Use the || operator instead.\n\n" +
        "Old syntax: /when any [@cond1 @cond2] => action\n" +
        "New syntax: /when (@cond1 || @cond2) => action\n\n" +
        "The || operator is more familiar and flexible.",
        "||",
        location()
      );
    }
  / WhenBareBlockForm  // MUST come before WhenBlockForm to handle bare [...] syntax
  // Error recovery: /when <modifier>: [...] => <action>
  / DirectiveContext WhenKeyword _ modifier:WhenModifier _ ":"? _ block:WhenConditionBlock 
    _ action:("=>" _ a:WhenAction { return a; })? {
      
      helpers.debug('WhenBareBlockWithModifierForm matched', { modifier, conditions: block, action });
      
      const values = {
        conditions: block,
        modifier: [modifier]
      };
      
      if (action) {
        values.action = action;
      }
      
      // Create raw representation
      const raw = {
        conditions: block.map(c => ({
          condition: helpers.reconstructRawString(c.condition),
          action: c.action ? helpers.reconstructRawString(c.action) : undefined
        }))
      };
      if (modifier) raw.modifier = modifier.content;
      
      if (action) {
        raw.action = helpers.reconstructRawString(action);
      }
      
      return helpers.createStructuredDirective(
        'when',
        'whenBlock',
        values,
        raw,
        {
          modifier: modifier ? modifier.content : 'default',
          conditionCount: block.length,
          hasVariable: false
        },
        location()
      );
    }
  / WhenBlockForm
  // Error recovery: Missing => or [ in simple form
  / DirectiveContext WhenKeyword _ condition:WhenSimpleCondition _ !("=>" / "[") {
      helpers.mlldError("Invalid when syntax. Expected '=>' or '[' after condition. Use: when @condition => action or when @condition [block]", "=> or [", location());
    }
  // Error recovery: Missing action after =>
  / DirectiveContext WhenKeyword _ condition:WhenSimpleCondition _ "=>" _ !. {
      helpers.mlldError("Missing action in when directive. Expected a directive after '=>'.", "directive", location());
    }
  // Error recovery: deprecated 'all' modifier
  / DirectiveContext WhenKeyword _ variable:("@" id:BaseIdentifier { return id; })? _ "all" _ ":"? _ "[" {
      helpers.mlldError(
        "The 'all' modifier has been removed from mlld. Use the && operator instead.\n\n" +
        "Old syntax: when all [@cond1 @cond2] => action\n" +
        "New syntax: when (@cond1 && @cond2) => action\n\n" +
        "The && operator is more familiar and flexible.",
        "&&",
        location()
      );
    }
  // Error recovery: Unclosed brackets in block form
  / DirectiveContext WhenKeyword _ variable:("@" id:BaseIdentifier { return id; })? _ modifier:WhenModifier? _ ":"? _ "[" _ &{
      // Check if we hit newline or EOF before closing bracket
      let i = peg$currPos;
      let depth = 1;
      while (i < input.length && depth > 0) {
        if (input[i] === '[') depth++;
        else if (input[i] === ']') depth--;
        else if (input[i] === '\n' && depth > 0) {
          // Found newline before closing bracket
          let j = i + 1;
          // Skip whitespace on next line
          while (j < input.length && (input[j] === ' ' || input[j] === '\t')) j++;
          // Check if next line starts with a directive
          if (j < input.length && input[j] === '/') return true;
        }
        i++;
      }
      return depth > 0; // EOF reached without closing bracket
    } {
      helpers.mlldError("Unclosed brackets in when directive. Expected ']' to close the condition list.", "]", location());
    }
  // Error recovery: Invalid modifier - check it's not a valid modifier
  / DirectiveContext WhenKeyword _ variable:("@" id:BaseIdentifier { return id; })? _
    modifier:BaseIdentifier &{ return modifier !== "first"; } _ ":"? _ "[" {
      helpers.mlldError("Invalid when modifier: '" + modifier + "'. Modifiers are not supported.\n" +
            "For AND/OR logic, use && and || operators instead.\n\n" +
            "Examples:\n" +
            "  when @var [...] => action\n" +
            "  when (@cond1 && @cond2) => action  (instead of 'all')\n" +
            "  when (@cond1 || @cond2) => action  (instead of 'any')", "modifier", location());
    }
  // Error recovery: Generic catch-all
  / DirectiveContext WhenKeyword {
      helpers.mlldError("Invalid when syntax. Valid forms:\\n" +
            "  when @condition => action          (simple form)\\n" +
            "  when @variable [...]              (switch form)\\n" +
            "  when @var [...] => action          (block form)\\n" +
            "  when [...] => action               (bare block form)", "@", location());
    }

// -------------------------------------------------------------
// SIMPLE FORM: /when <condition> => <action> (no brackets needed)
// -------------------------------------------------------------

WhenSimpleForm
  = DirectiveContext WhenKeyword _ condition:WhenSimpleCondition _ "=>" _ action:WhenAction comment:InlineComment? {
      helpers.debug('WhenSimpleForm matched', { condition, action, comment });

      // Detect if action is a block (array of statements)
      const isBlockForm = Array.isArray(action) && action.length > 0;

      // Check for return statement in block (last element with type containing return pattern)
      const hasReturn = isBlockForm && action.some(item =>
        item && item.type === 'ReturnStatement' ||
        (Array.isArray(item) && item[0]?.type === 'ReturnStatement')
      );

      const meta = {
        hasVariables: condition.some(n => n.type === NodeType.VariableReference),
        isBlockForm: isBlockForm,
        hasReturn: hasReturn
      };

      if (comment) {
        meta.comment = comment;
      }

      return helpers.createStructuredDirective(
        'when',
        'whenSimple',
        {
          condition: condition,
          action: action
        },
        {
          condition: helpers.reconstructRawString(condition),
          action: helpers.reconstructRawString(action)
        },
        meta,
        location()
      );
    }

// -------------------------------------------------------------
// DEPRECATED FORM: /when <condition> [block] - now requires =>
// Error recovery for old syntax that used space instead of arrow
// -------------------------------------------------------------

WhenSimpleBlockForm
  = DirectiveContext WhenKeyword _ condition:WhenSimpleCondition _ "[" {
      // Extract condition text for error message
      const conditionText = helpers.reconstructRawString(condition);
      helpers.mlldError(
        `Invalid when syntax: missing '=>' before block.\n\n` +
        `Change:  when ${conditionText} [...]  =>  when ${conditionText} => [...]\n\n` +
        `The 'when' directive has these forms:\n\n` +
        `1. Single-line (condition => action):\n` +
        `   when @ready => show "go!"\n` +
        `   when @error => [log @error; => null]\n\n` +
        `2. First-match list:\n` +
        `   when [\n` +
        `     @x > 100 => "large"\n` +
        `     @x > 10 => "medium"\n` +
        `     * => "small"\n` +
        `   ]\n\n` +
        `3. Match form:\n` +
        `   when @status: [\n` +
        `     "ok" => "ready"\n` +
        `     * => "unknown"\n` +
        `   ]`,
        "=>",
        location()
      );
    }

// -------------------------------------------------------------
// MATCH FORM: /when <expression>: [value => action, ...]
// -------------------------------------------------------------

WhenMatchForm
  = DirectiveContext WhenKeyword _ expression:WhenConditionExpression _ ":" _ conditions:WhenConditionBlock {
      helpers.debug('WhenMatchForm matched', { expression, conditions });
      
      return helpers.createStructuredDirective(
        'when',
        'whenMatch',
        {
          expression: expression,
          conditions: conditions
        },
        {
          expression: helpers.reconstructRawString(expression),
          conditions: conditions.map(c => ({
            condition: helpers.reconstructRawString(c.condition),
            action: c.action ? helpers.reconstructRawString(c.action) : undefined
          }))
        },
        {
          conditionCount: conditions.length
        },
        location()
      );
    }

// -------------------------------------------------------------
// BLOCK FORM: /when <var> <modifier>: [...] => <action>
// -------------------------------------------------------------

WhenBlockForm
  = DirectiveContext WhenKeyword _ variable:("@" id:BaseIdentifier { 
      return helpers.createVariableReferenceNode('identifier', {
        identifier: id
      }, location()); 
    })? _ 
    modifier:WhenModifier? _ ":"? _ conditions:WhenConditionBlock 
    _ action:("=>" _ a:WhenAction { return a; })? {
      
      helpers.debug('WhenBlockForm matched', { variable, modifier, conditions, action });
      
      const values = {
        conditions: conditions
      };
      
      // Only add modifier if present
      if (modifier) {
        values.modifier = [modifier]; // Already has correct location from WhenModifier rule
      }
      
      if (variable) {
        values.variable = [variable]; // Already has correct location
      }
      
      if (action) {
        values.action = action;
      }
      
      // Create raw representation
      const raw = {
        conditions: conditions.map(c => ({
          condition: helpers.reconstructRawString(c.condition),
          action: c.action ? helpers.reconstructRawString(c.action) : undefined
        }))
      };
      if (modifier) raw.modifier = modifier.content;
      
      if (variable) {
        raw.variable = variable;
      }
      
      if (action) {
        raw.action = helpers.reconstructRawString(action);
      }
      
      return helpers.createStructuredDirective(
        'when',
        'whenBlock',
        values,
        raw,
        {
          modifier: modifier ? modifier.content : 'default',  // Use 'default' when no modifier specified
          conditionCount: conditions.length,
          hasVariable: !!variable
        },
        location()
      );
    }

// -------------------------------------------------------------
// BARE BLOCK FORM: /when [...] - executes first matching condition
// -------------------------------------------------------------

WhenBareBlockForm
  = DirectiveContext WhenKeyword _ conditions:WhenConditionBlock {
      
      helpers.debug('WhenBareBlockForm matched', { conditions });
      
      const values = {
        conditions: conditions
      };
      
      // Create raw representation
      const raw = {
        conditions: conditions.map(c => ({
          condition: helpers.reconstructRawString(c.condition),
          action: c.action ? helpers.reconstructRawString(c.action) : undefined
        }))
      };
      
      return helpers.createStructuredDirective(
        'when',
        'whenBlock',
        values,
        raw,
        {
          modifier: 'default',  // Bare when uses default first-match behavior
          conditionCount: conditions.length,
          hasVariable: false
        },
        location()
      );
    }

// -------------------------------------------------------------
// MODIFIERS
// -------------------------------------------------------------

WhenModifier
  = mod:("first") {
      helpers.mlldError(
        "The 'first' modifier is not needed. 'when' uses first-match semantics by default. Remove 'first' from your when block.",
        'when',
        location()
      );
    }

// -------------------------------------------------------------
// CONDITION EXPRESSIONS
// -------------------------------------------------------------

// Simple condition for @when simple form - uses unified expressions
WhenSimpleCondition
  = expr:WhenConditionAdapter {
      // Wrap in array for consistency with existing code
      return [expr];
    }

// Negated simple condition with ! prefix
NegatedSimpleCondition
  = "!" _ condition:NonNegatedSimpleCondition {
      // Wrap the condition in a negation node
      return [helpers.createNode('Negation', {
        condition: condition,
        location: location()
      })];
    }

// Non-negated simple conditions
NonNegatedSimpleCondition
  = invocation:UnifiedReferenceWithTail {
      // Unified reference (exec invocation or variable) with tail modifiers
      return [invocation];
    }
  / varRef:VariableNoTail {
      return [varRef];
    }
  / Variable {
      // Other variable forms (special vars, interpolation)
      return [$1];
    }
  / value:BooleanLiteral {
      // Boolean literal (true/false)
      return [helpers.createNode(NodeType.Text, { 
        content: String(value), 
        location: location() 
      })];
    }
  / value:NullLiteral {
      // Null literal
      return [helpers.createNode(NodeType.Text, { 
        content: String(value), 
        location: location() 
      })];
    }
  / value:StringLiteral {
      // String literal ("text")
      return [helpers.createNode(NodeType.Text, { 
        content: value, 
        location: location() 
      })];
    }

// Condition expression - uses unified expressions with when-specific formatting
WhenConditionExpression
  = expr:WhenConditionAdapter {
      // Wrap in array for consistency
      return [expr];
    }
  / NegatedCondition
  / NonNegatedCondition

// Negated condition with ! prefix
NegatedCondition
  = "!" _ condition:NonNegatedCondition {
      // Wrap the condition in a negation node
      return [helpers.createNode('Negation', {
        condition: condition,
        location: location()
      })];
    }

// Non-negated conditions (existing patterns)
NonNegatedCondition
  = invocation:UnifiedReferenceWithTail {
      // Unified reference (exec invocation or variable) with tail modifiers
      return [invocation];
    }
  / varRef:VariableNoTail {
      return [varRef];
    }
  / Variable {
      // Other variable forms (special vars, interpolation)
      return [$1];
    }
  / value:BooleanLiteral {
      // Boolean literal (true/false)
      return [helpers.createNode(NodeType.Text, { 
        content: String(value), 
        location: location() 
      })];
    }
  / value:NullLiteral {
      // Null literal
      return [helpers.createNode(NodeType.Text, { 
        content: String(value), 
        location: location() 
      })];
    }
  / value:StringLiteral {
      // String literal ("text")
      return [helpers.createNode(NodeType.Text, { 
        content: value, 
        location: location() 
      })];
    }

// -------------------------------------------------------------
// CONDITION LIST AND PAIRS
// -------------------------------------------------------------

// List of when block entries (let assignments and condition pairs)
WhenConditionBlock
  = "[" _ conditions:WhenConditionList _ "]" {
      return conditions;
    }
  / "[" _ {
      const blockStart = peg$currPos;
      const captured = helpers.captureBracketContent(input, blockStart);
      if (!captured) return peg$FAILED;
      helpers.reparseBlock({
        parse: peg$parse,
        SyntaxErrorClass: peg$SyntaxError,
        text: captured.content,
        startRule: 'WhenConditionList',
        baseLocation: peg$computeLocation(blockStart, blockStart),
        grammarSource: options.grammarSource,
        mode: options.mode
      });
    }
  / "[" _ &{
      let depth = 1;
      let i = peg$currPos;
      let inString = false;
      let quote = null;
      while (i < input.length && depth > 0) {
        const ch = input[i];
        if (inString) {
          if (ch === quote && input[i - 1] !== '\\') { inString = false; quote = null; }
        } else {
          if (ch === '"' || ch === '\'') { inString = true; quote = ch; }
          else if (ch === '[') depth++;
          else if (ch === ']') depth--;
        }
        i++;
      }
      return depth > 0;
    } {
      helpers.mlldError("Unclosed brackets in /when directive. Expected ']' to close the condition list.", "]", location());
    }

WhenConditionList
  = leadingComments:LeadingBlockComment* _ first:WhenEntry rest:(WhenConditionSeparator entry:WhenEntry { return entry; })* trailing:BlockComments* {
      const entries = [first, ...rest];
      // Attach leading comments to first entry's meta (immutable update)
      if (leadingComments.length > 0 && entries.length > 0) {
        const firstEntry = entries[0];
        if (firstEntry && typeof firstEntry === 'object') {
          const existingMeta = firstEntry.meta || {};
          entries[0] = {
            ...firstEntry,
            meta: {
              ...existingMeta,
              comment: existingMeta.comment || leadingComments[0],
              leadingComments: leadingComments
            }
          };
        }
      }
      return entries;
    }
  / BlockComments+ { return []; }

// Single entry in a when block - let assignment, augmented assignment, or condition pair
WhenEntry
  = LetAssignment        // let @x = value (local variable)
  / AugmentedAssignment  // @x += value (augmented assignment)
  / WhenConditionPair    // condition => action

// Separator for condition pairs - whitespace only, with helpful error for commas
WhenConditionSeparator
  = _ "," _ {
      helpers.mlldError(
        'Comma separators are not allowed in /when conditions. ' +
        'Separate conditions with whitespace or semicolons instead of commas.\n' +
        '💡 Remove the comma and use whitespace or semicolons:\n' +
        '   /when expr: [value1 => action1, value2 => action2]  ❌\n' +
        '   /when expr: [value1 => action1; value2 => action2]  ✅\n' +
        '   /when expr: [value1 => action1  value2 => action2]  ✅\n' +
        '   /when expr: [\n' +
        '     value1 => action1\n' +
        '     value2 => action2\n' +
        '   ]  ✅',
        "whitespace",
        location()
      );
    }
  / _? BlockComments+ _
  / _ ";" _
  / _

// Single condition => action pair
WhenConditionPair
  = condition:WhenConditionExpression _ action:("=>" _ a:WhenAction { return a; })? {
      return { condition, action };
    }

// -------------------------------------------------------------
// ACTIONS
// -------------------------------------------------------------

// Action (single directive or block of directives)
WhenAction
  = WhenActionBlock
  / WhenImplicitAction   // NEW: Implicit actions without directive prefix
  / WhenActionDirective

// Block of directives as action: [directive1, directive2, ...]
WhenActionBlock
  = "[" _ actions:WhenActionBlockContent _ "]" {
      return actions;
    }
  / "[" _ {
      const blockStart = peg$currPos;
      const captured = helpers.captureBracketContent(input, blockStart);
      if (!captured) return peg$FAILED;
      helpers.reparseBlock({
        parse: peg$parse,
        SyntaxErrorClass: peg$SyntaxError,
        text: captured.content,
        startRule: 'WhenActionBlockContent',
        baseLocation: peg$computeLocation(blockStart, blockStart),
        grammarSource: options.grammarSource,
        mode: options.mode
      });
    }
  / "[" _ &{
      let depth = 1;
      let i = peg$currPos;
      let inString = false;
      let quote = null;
      while (i < input.length && depth > 0) {
        const ch = input[i];
        if (inString) {
          if (ch === quote && input[i - 1] !== '\\') { inString = false; quote = null; }
        } else {
          if (ch === '"' || ch === '\'') { inString = true; quote = ch; }
          else if (ch === '[') depth++;
          else if (ch === ']') depth--;
        }
        i++;
      }
      return depth > 0;
    } {
      helpers.mlldError(
        `Unterminated block in when action. Expected ']' to close the block.`,
        "]",
        location()
      );
    }

// Block body for when action blocks - supports full statement list like ForBlockBody
WhenActionBlockBody "when action block body"
  = statements:WhenActionBlockStatementList firstReturn:(
      BlockStatementSeparator ret:WhenActionBlockReturnStatement { return ret; }
    / _ ret:WhenActionBlockReturnStatement { return ret; }
    )
    extraReturn:(BlockStatementSeparator WhenActionBlockReturnStatement { return true; })?
    trailing:(BlockStatementSeparator WhenActionBlockStatement { return true; })? {
      if (extraReturn) {
        helpers.mlldError(
          'Multiple return statements in when block. Only one return allowed as last statement.',
          'single return',
          location()
        );
      }
      if (trailing) {
        helpers.mlldError(
          'Return must be the last statement in a block.',
          'end of block',
          location()
        );
      }
      return {
        statements,
        returnStmt: firstReturn
      };
    }
  / statements:WhenActionBlockStatementList {
      return {
        statements,
        returnStmt: null
      };
    }
  / leadingComments:LeadingBlockComment* _ ret:WhenActionBlockReturnStatement {
      return {
        statements: [],
        returnStmt: ret
      };
    }

// Return statement for when action blocks
WhenActionBlockReturnStatement "when block return statement"
  = "=>" _ value:WhenRHSAction noise:BlockComments* {
      const normalized = Array.isArray(value) ? value.flat() : [value];
      return normalized;
    }

// Statement list for when action blocks
WhenActionBlockStatementList "when action block statement list"
  = leadingComments:LeadingBlockComment* _ first:WhenActionBlockStatement rest:(BlockStatementSeparator stmt:WhenActionBlockStatement { return stmt; })* trailing:BlockComments* {
      const normalize = (stmt) => Array.isArray(stmt) ? stmt : [stmt];
      const stmts = [...normalize(first), ...rest.flatMap(normalize)];
      // Attach leading comments to first statement's meta (immutable update)
      if (leadingComments.length > 0 && stmts.length > 0) {
        const firstStmt = stmts[0];
        if (firstStmt && typeof firstStmt === 'object') {
          const existingMeta = firstStmt.meta || {};
          stmts[0] = {
            ...firstStmt,
            meta: {
              ...existingMeta,
              comment: existingMeta.comment || leadingComments[0],
              leadingComments: leadingComments
            }
          };
        }
      }
      return stmts;
    }
  / BlockComments+ { return []; }

// Single statement inside a when action block
WhenActionBlockStatement "when action block statement"
  = LetAssignment
  / AugmentedAssignment
  / WhenExpressionAny
  / SlashIf
  / ForNestedDirective
  / WhenBlockAction

WhenActionBlockContent
  = body:WhenActionBlockBody {
      const statements = body.statements || [];
      const returnStmt = body.returnStmt;
      const hasReturn = Array.isArray(returnStmt) ? returnStmt.length > 0 : !!returnStmt;
      return hasReturn ? [...statements, ...returnStmt] : statements;
    }

// Single action within a when block - supports both implicit and explicit
WhenBlockAction
  = WhenImplicitAction   // Try implicit actions first
  / WhenActionDirective  // Fall back to explicit directives

// Single directive as action - simplified inline directives
WhenActionDirective
  = "output" _ source:WhenOutputSource? _ "to" _ target:WhenOutputTarget {
      helpers.debug('WhenActionDirective: Enhanced output matched!');
      // Enhanced output syntax in when actions (FIRST to match before bracket syntax)
      const values = {
        target: target
      };
      
      const raw = {
        target: target.raw
      };
      
      let subtype = 'outputDocument';
      const meta = { 
        hasSource: false,
        targetType: target.type,
        enhanced: true
      };
      
      if (source) {
        values.source = source.values;
        raw.source = source.raw;
        meta.hasSource = true;
        meta.sourceType = source.type;
        subtype = source.subtype;
      }
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'output',
        subtype: subtype,
        values: values,
        raw: raw,
        meta: meta,
        location: location()
      })];
    }
  // Special handling for /log directive - syntactic sugar for output to stderr
  / "log" _ source:WhenOutputSource? {
      helpers.debug('WhenActionDirective: log matched');
      // Create stderr target automatically (same as /log directive)
      const stdoutTarget = {
        type: 'stream',
        stream: 'stderr',
        raw: 'stderr'
      };
      
      const values = {
        target: stdoutTarget
      };
      
      const raw = {
        target: 'stderr'
      };
      
      let subtype = 'outputStream';
      const meta = { 
        hasSource: false,
        targetType: 'stream',
        isLogSugar: true,  // Mark for debugging/tracing
        enhanced: true
      };
      
      if (source) {
        values.source = source.values;
        raw.source = source.raw;
        meta.hasSource = true;
        meta.sourceType = source.type;
      }
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'output',  // CRITICAL: Use 'output' kind, not 'log'
        subtype: subtype,
        values: values,
        raw: raw,
        meta: meta,
        location: location()
      })];
    }
  // show with simple variable reference (MUST come before exec invocation)
  / "show" _ varRef:VariableNoTail {
      // show with simple variable
      return [helpers.createNode(NodeType.Directive, {
        kind: 'show',
        subtype: 'showVariable',
        values: { 
          variable: [varRef]
        },
        raw: { 
          variable: '@' + varRef.identifier
        },
        meta: {},
        location: location()
      })];
    }
  // show with unified reference (function call with parentheses or tail modifiers)
  / "show" _ invocation:UnifiedReferenceWithTail {
      // show with unified reference (exec invocation or variable)
      const isExecInvocation = invocation.type === 'ExecInvocation';
      const subtype = isExecInvocation ? 'showExecInvocation' : 'showVariable';
      const rawValue = isExecInvocation ? invocation.commandRef.name : `@${invocation.variable.identifier}`;
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'show',
        subtype: subtype,
        values: { 
          // CRITICAL: Must wrap in array for consistency with show.peggy
          [isExecInvocation ? 'execInvocation' : 'variable']: isExecInvocation ? invocation : [invocation]
        },
        raw: { 
          [isExecInvocation ? 'execInvocation' : 'variable']: rawValue
        },
        meta: {},
        location: location()
      })];
    }
  / "show" _ template:TemplateCore ending:StandardDirectiveEnding {
      // Use the same abstraction and pipeline handling as standalone /show directives
      const values = { ...template.values };
      const raw = { ...template.raw };
      const meta = { ...template.meta };
      
      // Apply unified pipeline processing (consolidates with show.peggy)
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'show',
        subtype: 'showTemplate',
        source: 'template',  // CRITICAL: Must set source field for showTemplate
        values: values,
        raw: raw,
        meta: meta,
        location: location()
      })];
    }
  / "var" _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent ending:SecuredDirectiveEnding {
      // Support full range of var assignments in when actions
      let tail = ending.tail;
      const comment = ending.comment;
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());

      // Process the value based on its structure (simplified from var.peggy)
      let processedValue;
      let metaInfo = {};

      // Handle template content (backtick, [[...]], quotes)
      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';
        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }
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
      // Handle variable references with tail modifiers
      else if (value && value.type === 'VariableReferenceWithTail') {
        processedValue = [value.variable];
        metaInfo.inferredType = 'reference';
        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }
      }
      // Handle nested directives
      else if (value && value.type === 'nestedDirective') {
        processedValue = [value.directive];
        metaInfo.inferredType = 'computed';
      }
      // Handle code execution
      else if (value && value.type === 'code') {
        processedValue = [{
          type: 'code',
          language: value.language,
          code: value.code
        }];
        metaInfo.inferredType = 'computed';
      }
      // Handle command execution
      else if (value && value.type === 'command') {
        processedValue = [{
          type: 'command',
          command: value.command
        }];
        metaInfo.inferredType = 'computed';
      }
      // Handle foreach expressions
      else if (value && value.type === 'foreach-command') {
        processedValue = [value.value];
        metaInfo.inferredType = 'computed';
      }
      // Handle primitive values
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        processedValue = [value];
        metaInfo.inferredType = 'primitive';
      }
      // Handle string literals (backward compatibility)
      else if (typeof value === 'string') {
        processedValue = [helpers.createNode(NodeType.Text, {
          content: value,
          location: location()
        })];
        metaInfo.inferredType = 'text';
      }
      // Handle other types
      else {
        processedValue = Array.isArray(value) ? value : [value];
        metaInfo.inferredType = 'unknown';
      }

      // Add comment to meta if present
      if (comment) {
        metaInfo.comment = comment;
      }

      const nodeInit = {
        kind: 'var',
        subtype: 'var',
        values: {
          identifier: [idNode],
          value: processedValue
        },
        raw: {
          identifier: id,
          value: helpers.reconstructRawString(processedValue)
        },
        meta: metaInfo,
        location: location()
      };

      // Add withClause if tail exists
      if (tail) {
        nodeInit.values.withClause = tail;
        metaInfo.withClause = tail;
      }

      return [helpers.createNode(NodeType.Directive, nodeInit)];
    }
  / "run" _ invocation:UnifiedReferenceWithTail {
      // run with unified reference (exec invocation or variable)
      const isExecInvocation = invocation.type === 'ExecInvocation';
      const subtype = isExecInvocation ? 'runExecReference' : 'runVariable';
      const rawValue = isExecInvocation ? invocation.commandRef.name : `@${invocation.variable.identifier}`;
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'run',
        subtype: subtype,
        values: { 
          [isExecInvocation ? 'execRef' : 'varRef']: invocation
        },
        raw: { 
          [isExecInvocation ? 'execRef' : 'varRef']: rawValue
        },
        meta: {
          hasWithClause: !!invocation.withClause
        },
        location: location()
      })];
    }
  / "run" _ command:UnifiedCommandBrackets {
      // Use the same abstraction as /run directive
      return [helpers.createNode(NodeType.Directive, {
        kind: 'run',
        subtype: 'runCommand',
        values: command.values,
        raw: command.raw,
        meta: command.meta,
        location: location()
      })];
    }
  / "output" _ source:WhenOutputSource? _ "[" path:WhenPathText "]" {
      helpers.debug('WhenActionDirective: Bracket output matched');
      // Bracket output syntax in when actions
      const values = {
        target: {
          type: 'file',
          path: [helpers.createNode(NodeType.Text, { 
            content: path, 
            location: location() 
          })],
          raw: path,
          meta: { bracketed: true }
        }
      };
      
      const raw = {
        target: `[${path}]`
      };
      
      let subtype = 'outputDocument';
      const meta = { 
        hasSource: false,
        targetType: 'file',
        legacy: true
      };
      
      if (source) {
        values.source = source.values;
        raw.source = source.raw;
        meta.hasSource = true;
        meta.sourceType = source.type;
        subtype = source.subtype;
      }
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'output',
        subtype: subtype,
        values: values,
        raw: raw,
        meta: meta,
        location: location()
      })];
    }

// Simple command text without interpolation for now
WhenCommandText
  = chars:[^\]]+ {
      return chars.join('');
    }

// Command text for braces
WhenBraceCommandText
  = chars:[^}]+ {
      return chars.join('');
    }

// Path text for output directive in when actions
WhenPathText
  = chars:[^\]]+ {
      return chars.join('').trim();
    }

// Output source for when actions (simplified)
WhenOutputSource
  = varRef:VariableNoTail {
      // Variable reference (supports field access)
      return {
        type: 'variable',
        subtype: 'outputVariable',
        values: [varRef],
        raw: '@' + varRef.identifier
      };
    }
  / str:DataString {
      // Literal text
      return {
        type: 'literal',
        subtype: 'outputLiteral',
        values: [helpers.createNode(NodeType.Text, { content: str, location: location() })],
        raw: '"' + str + '"'
      };
    }

// Output target for when actions - simplified version supporting stdout/stderr
WhenOutputTarget
  = stream:("stdout" / "stderr") {
      return {
        type: 'stream',
        stream: stream,
        raw: stream
      };
    }
  / "env" varname:(":"  name:BaseIdentifier { return name; })? {
      return {
        type: 'env',
        varname: varname || null,
        raw: varname ? `env:${varname}` : 'env'
      };
    }
  / "@" resolver:BaseIdentifier path:ResolverPath? {
      // Variable or resolver target (e.g., @path or @resolver/subpath)
      return {
        type: 'resolver',
        resolver: resolver,
        path: path || [],
        raw: `@${resolver}${path ? '/' + path.map(p => p.content || '').join('/') : ''}`
      };
    }
  / str:DataString {
      // File path as quoted string
      return {
        type: 'file',
        path: [helpers.createNode(NodeType.Text, { content: str, location: location() })],
        raw: `"${str}"`,
        meta: { quoted: true }
      };
    }

// -------------------------------------------------------------
// IMPLICIT ACTIONS - Support for simplified syntax without directive prefix
// -------------------------------------------------------------

// Implicit action patterns - these match the same syntax as explicit directives but without "/"
WhenImplicitAction
  = WhenImplicitRetryAction
  / WhenImplicitExplicitVarAssignment // var @x = value (outer-scope variable)
  / WhenImplicitVarAssignmentError    // Error: @x = value - use let or var instead
  / WhenImplicitFunctionCall
  / WhenImplicitShowWithPipeline  // NEW: Support show with pipeline syntax
  / WhenImplicitRichContent
  / WhenImplicitExecDefinitionError  // Error recovery for removed exec definitions

// Implicit show with pipeline support: show "text" | @func
WhenImplicitShowWithPipeline
  = "show" _ template:TemplateCore tail:TailModifiers? {
      // Handle show with template content and optional pipeline
      let meta = {
        ...template.meta,
        implicit: true
      };
      
      // If there's a pipeline tail modifier, use the existing template with tail pattern
      if (tail && tail.pipeline) {
        // Create a VariableReferenceWithTail structure that matches expected patterns
        const templateWithTail = {
          type: 'VariableReferenceWithTail',
          variable: {
            type: 'TemplateVariable', // Use a virtual template variable 
            identifier: '__template__', // Virtual identifier for templates
            content: template.values.content,
            location: location()
          },
          withClause: tail,
          location: location()
        };
        
        return [helpers.createNode(NodeType.Directive, {
          kind: 'show',
          subtype: 'showVariable',
          values: { 
            variable: templateWithTail
          },
          raw: { 
            variable: helpers.reconstructRawString(template.values.content)
          },
          meta: meta,
          location: location()
        })];
      } else {
        // No pipeline, use regular template
        return [helpers.createNode(NodeType.Directive, {
          kind: 'show',
          subtype: 'showTemplate',
          values: template.values,
          raw: template.raw,
          meta: meta,
          location: location()
        })];
      }
    }

// Error: Implicit var assignment @x = "value" is no longer supported - use let or var
WhenImplicitVarAssignmentError
  = "@" id:BaseIdentifier _ "=" _ value:VarRHSContent {
      helpers.mlldError(
        `Variable assignment \`@${id} = ...\` is not allowed in when actions.\n\n` +
        `Use \`let\` for local variables scoped to the when block:\n` +
        `  /when [let @${id} = value ...]\n\n` +
        `Or use \`var\` in actions to set outer-scope variables:\n` +
        `  "match" => var @${id} = "value"\n\n` +
        `Example:\n` +
        `  /when @mode: [\n` +
        `    let @local = "scoped"      # Local to when block\n` +
        `    "match" => var @${id} = @local  # Sets outer-scope variable\n` +
        `  ]`,
        "let",
        location()
      );
    }

// Explicit var assignment in when action: var @x = "value" (sets outer-scope variable)
WhenImplicitExplicitVarAssignment
  = "var" _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent ending:SecuredDirectiveEnding {
      // Create the same structure as explicit /var but with implicit flag
      let tail = ending.tail;
      const comment = ending.comment;
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());

      // Process the value using the same logic as explicit /var directive
      let processedValue;
      let metaInfo = { implicit: true };

      // Handle template content (backtick, [[...]], quotes)
      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';
        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }
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
      // Handle variable references with tail modifiers
      else if (value && value.type === 'VariableReferenceWithTail') {
        processedValue = [value.variable];
        metaInfo.inferredType = 'reference';
        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }
      }
      // Handle nested directives
      else if (value && value.type === 'nestedDirective') {
        processedValue = [value.directive];
        metaInfo.inferredType = 'computed';
      }
      // Handle code execution
      else if (value && value.type === 'code') {
        processedValue = [{
          type: 'code',
          language: value.language,
          code: value.code
        }];
        metaInfo.inferredType = 'computed';
      }
      // Handle command execution
      else if (value && value.type === 'command') {
        processedValue = [{
          type: 'command',
          command: value.command
        }];
        metaInfo.inferredType = 'computed';
      }
      // Handle foreach expressions
      else if (value && value.type === 'foreach-command') {
        processedValue = [value.value];
        metaInfo.inferredType = 'computed';
      }
      // Handle primitive values
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        processedValue = [value];
        metaInfo.inferredType = 'primitive';
      }
      // Handle string literals (backward compatibility)
      else if (typeof value === 'string') {
        processedValue = [helpers.createNode(NodeType.Text, {
          content: value,
          location: location()
        })];
        metaInfo.inferredType = 'text';
      }
      // Handle other types
      else {
        processedValue = Array.isArray(value) ? value : [value];
        metaInfo.inferredType = 'unknown';
      }

      // Add comment to meta if present
      if (comment) {
        metaInfo.comment = comment;
      }

      const nodeInit = {
        kind: 'var',
        subtype: 'var',
        values: {
          identifier: [idNode],
          value: processedValue
        },
        raw: {
          identifier: id,
          value: helpers.reconstructRawString(processedValue)
        },
        meta: metaInfo,
        location: location()
      };

      // Add withClause if tail exists
      if (tail) {
        nodeInit.values.withClause = tail;
        metaInfo.withClause = tail;
      }

      return [helpers.createNode(NodeType.Directive, nodeInit)];
    }

// REMOVED: Implicit exec assignment is no longer supported in when RHS
// Users should use /exe...when at the top level for conditional executable definitions
// Example: /exe @func() = when: [@condition => value, * => default]

// Implicit function call: @doSomething()
WhenImplicitFunctionCall  
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" tail:TailModifiers? {
      // Create run directive for function calls (same as /run @func())
      const ref = {
        name,
        identifier: [helpers.createNode(NodeType.Text, { content: name, location: location() })],
        args: args || [],
        isCommandReference: true
      };
      
      const invocation = helpers.createExecInvocation(ref, tail || null, location());
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'run',
        subtype: 'runExecReference',
        values: { 
          execRef: invocation
        },
        raw: { 
          execRef: name
        },
        meta: {
          implicit: true,
          hasWithClause: !!tail
        },
        location: location()
      })];
    }


// Implicit rich content - multi-line templates, code blocks, etc.
WhenImplicitRichContent
  = template:TemplateCore {
      // Multi-line template content (:: content ::, ```content```, etc.)
      return [helpers.createNode(NodeType.Directive, {
        kind: 'show',
        subtype: 'showTemplate',
        source: 'template',  // CRITICAL: Must set source field for showTemplate
        values: template.values,
        raw: template.raw,
        meta: {
          ...template.meta,
          implicit: true
        },
        location: location()
      })];
    }
  / content:VarRHSContent &{
      // Only allow rich content patterns that make sense as standalone actions
      return content && (
        (content.type === 'code') ||
        (content.type === 'command') ||
        (content.content && content.wrapperType) ||
        (content.type === 'object') ||
        (content.type === 'array')
      );
    } {
      // Rich content like code blocks, object literals, etc.
      let directive, subtype, values, raw;
      const metaInfo = { implicit: true };
      
      if (content.type === 'code') {
        directive = 'run';
        subtype = 'runCode';
        values = { 
          language: content.language,
          code: content.code
        };
        raw = {
          language: content.language,
          code: content.code
        };
      } else if (content.type === 'command') {
        directive = 'run';
        subtype = 'runCommand';
        values = { 
          command: content.command
        };
        raw = {
          command: helpers.reconstructRawString(content.command)
        };
      } else if (content.content && content.wrapperType) {
        directive = 'show';
        subtype = 'showTemplate';
        values = { content: content.content };
        raw = { content: helpers.reconstructRawString(content.content) };
        metaInfo.wrapperType = content.wrapperType;
      } else {
        directive = 'show';
        subtype = 'showValue';
        values = { value: [content] };
        raw = { value: helpers.reconstructRawString([content]) };
      }
      
      return [helpers.createNode(NodeType.Directive, {
        kind: directive,
        subtype: subtype,
        values: values,
        raw: raw,
        meta: metaInfo,
        location: location()
      })];
    }

// Error recovery - catch implicit exe definitions and provide helpful error
WhenImplicitExecDefinitionError
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? ")" _ "=" _ value:VarRHSContent {
      helpers.mlldError(
        `Implicit executable definitions are not allowed in /when actions.\n\n` +
        `Instead of:\n` +
        `  /when @condition => @${name}() = ...\n\n` +
        `Use a separate /exe directive:\n` +
        `  /exe @${name}() = when [@condition => ..., * => default]\n\n` +
        `This keeps executable definitions at the top level where they belong.`,
        "/exe",
        location()
      );
    }
// Implicit retry with optional hint value (string/object/function/variable)
WhenImplicitRetryAction
  = "retry" _ hint:VarRHSContent? {
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
