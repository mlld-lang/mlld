// WHEN DIRECTIVE
// Implementation of the /when directive for conditional execution

/* 
# When Directive

The when directive provides conditional execution based on truthiness.
It can be used in two main forms:
1. /when <condition> => <action>                    - Simple conditional
2. /when <var> <modifier>: [conditions] => <action> - Block conditional with modifiers

Modifiers:
- first: Execute the first truthy condition's action
- all: All conditions must be truthy
- any: At least one condition must be truthy
*/

// Core content handlers (context, tokens, whitespace, variables, commands)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL WHEN DIRECTIVE
// -------------------------------------------------------------

// Primary /when directive
SlashWhen
  // Error recovery: /when @var [...] without colon (MUST come before WhenSimpleForm)
  = DirectiveContext "/when" _ "@" id:BaseIdentifier tail:("." prop:BaseIdentifier { return prop; })* _ "[" {
      const fullVar = "@" + id + (tail.length > 0 ? "." + tail.join(".") : "");
      helpers.mlldError("Invalid /when syntax. Missing ':' after variable.\\n\\n" +
            "The syntax /when " + fullVar + " [...] requires a colon after the variable.\\n" +
            "This is the block form that compares the variable value against each condition.\\n\\n" +
            "Correct syntax:\\n" +
            "  /when " + fullVar + ": [\\n" +
            "    \"value1\" => /show \"First case\"\\n" +
            "    \"value2\" => /show \"Second case\"\\n" +
            "  ]\\n\\n" +
            "Or use the simple form without brackets:\\n" +
            "  /when " + fullVar + " => /show \"Action\"", ":", location());
    }
  / WhenSimpleForm
  // Error recovery: any: with individual actions (MUST come before WhenBlockForm)
  / DirectiveContext "/when" _ variable:("@" id:BaseIdentifier { return id; })? _ "any" _ ":" _ "[" _ &{
      // Look ahead to see if there are individual actions (=> inside the block)
      let i = peg$currPos;
      let depth = 1;
      while (i < input.length && depth > 0) {
        if (input[i] === '[') depth++;
        else if (input[i] === ']') depth--;
        else if (input[i] === '=' && i + 1 < input.length && input[i + 1] === '>' && depth === 1) {
          return true; // Found => at the top level of the block
        }
        i++;
      }
      return false;
    } {
      helpers.mlldError("Invalid /when syntax. The 'any:' modifier requires a block action after the conditions.\\n" +
            "Individual actions are not allowed with 'any:'.\\n\\n" +
            "Incorrect: /when @var any: [@cond1 => action1, @cond2 => action2]\\n" +
            "Correct:   /when @var any: [@cond1, @cond2] => /show \"Any matched\"", "=>", location());
    }
  / WhenBlockForm
  / WhenBareBlockForm
  / WhenSwitchForm
  // Error recovery: Missing => in simple form
  / DirectiveContext "/when" _ condition:WhenSimpleCondition _ !"=>" {
      helpers.mlldError("Invalid /when syntax. Expected '=>' after condition. Use: /when @condition => action", "=>", location());
    }
  // Error recovery: Missing action after =>
  / DirectiveContext "/when" _ condition:WhenSimpleCondition _ "=>" _ !. {
      helpers.mlldError("Missing action in /when directive. Expected a directive after '=>'.", "directive", location());
    }
  // Error recovery: all: with individual actions AND block action
  / DirectiveContext "/when" _ variable:("@" id:BaseIdentifier { return id; })? _ "all" _ ":" _ "[" _ &{
      // Look ahead to see if there are BOTH individual actions AND a block action
      let i = peg$currPos;
      let depth = 1;
      let hasIndividualActions = false;
      let hasBlockAction = false;
      
      while (i < input.length && depth > 0) {
        if (input[i] === '[') depth++;
        else if (input[i] === ']') depth--;
        else if (input[i] === '=' && i + 1 < input.length && input[i + 1] === '>' && depth === 1) {
          hasIndividualActions = true;
        }
        i++;
      }
      
      // After closing ], check for => (block action)
      if (depth === 0 && i < input.length) {
        while (i < input.length && (input[i] === ' ' || input[i] === '\t' || input[i] === '\n')) i++;
        if (i + 1 < input.length && input[i] === '=' && input[i + 1] === '>') {
          hasBlockAction = true;
        }
      }
      
      return hasIndividualActions && hasBlockAction;
    } {
      helpers.mlldError("Invalid /when syntax. The 'all:' modifier cannot have both individual actions and a block action.\\n" +
            "Use either:\\n" +
            "  /when @var all: [@cond1 => action1, @cond2 => action2]  (individual actions)\\n" +
            "  /when @var all: [@cond1, @cond2] => /show \"All matched\"  (block action)", "]", location());
    }
  // Error recovery: Unclosed brackets in block form
  / DirectiveContext "/when" _ variable:("@" id:BaseIdentifier { return id; })? _ modifier:WhenModifier? _ ":" _ "[" _ &{
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
      helpers.mlldError("Unclosed brackets in /when directive. Expected ']' to close the condition list.", "]", location());
    }
  // Error recovery: Invalid modifier
  / DirectiveContext "/when" _ variable:("@" id:BaseIdentifier { return id; })? _ modifier:BaseIdentifier _ ":" _ "[" {
      helpers.mlldError("Invalid /when modifier: '" + modifier + "'. Valid modifiers are: 'first', 'all', 'any'.\\n" +
            "Examples:\\n" +
            "  /when @var first: [...] => action\\n" +
            "  /when @var all: [...] => action\\n" +
            "  /when @var any: [...] => action", "modifier", location());
    }
  // Error recovery: Generic catch-all
  / DirectiveContext "/when" {
      helpers.mlldError("Invalid /when syntax. Valid forms:\\n" +
            "  /when @condition => action          (simple form)\\n" +
            "  /when @variable: [...]              (switch form)\\n" +
            "  /when @var first: [...] => action   (block form with modifier)\\n" +
            "  /when [...] => action               (bare block form)", "@", location());
    }

// -------------------------------------------------------------
// SIMPLE FORM: /when <condition> => <action>
// -------------------------------------------------------------

WhenSimpleForm
  = DirectiveContext "/when" _ condition:WhenSimpleCondition _ "=>" _ action:WhenAction {
      helpers.debug('WhenSimpleForm matched', { condition, action });
      
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
        {
          hasVariables: condition.some(n => n.type === NodeType.VariableReference)
        },
        location()
      );
    }

// -------------------------------------------------------------
// SWITCH FORM: /when <expression>: [value => action, ...]
// -------------------------------------------------------------

WhenSwitchForm
  = DirectiveContext "/when" _ expression:WhenConditionExpression _ ":" _ "[" _ conditions:WhenConditionList _ "]" {
      helpers.debug('WhenSwitchForm matched', { expression, conditions });
      
      return helpers.createStructuredDirective(
        'when',
        'whenSwitch',
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
  = DirectiveContext "/when" _ variable:("@" id:BaseIdentifier { return id; })? _ 
    modifier:WhenModifier? _ ":" _ "[" _ conditions:WhenConditionList _ "]" 
    _ action:("=>" _ a:WhenAction { return a; })? {
      
      helpers.debug('WhenBlockForm matched', { variable, modifier, conditions, action });
      
      const values = {
        conditions: conditions
      };
      
      // Only add modifier if present
      if (modifier) {
        values.modifier = [helpers.createNode(NodeType.Text, { 
          content: modifier, 
          location: location() 
        })];
      }
      
      if (variable) {
        values.variable = [helpers.createVariableReferenceNode('identifier', {
          identifier: variable
        })];
      }
      
      if (action) {
        values.action = action;
      }
      
      // Create raw representation
      const raw = {
        modifier: modifier,
        conditions: conditions.map(c => ({
          condition: helpers.reconstructRawString(c.condition),
          action: c.action ? helpers.reconstructRawString(c.action) : undefined
        }))
      };
      
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
          modifier: modifier || 'default',  // Use 'default' when no modifier specified
          conditionCount: conditions.length,
          hasVariable: !!variable
        },
        location()
      );
    }

// -------------------------------------------------------------
// BARE BLOCK FORM: /when [...] - executes all matching conditions
// -------------------------------------------------------------

WhenBareBlockForm
  = DirectiveContext "/when" _ "[" _ conditions:WhenConditionList _ "]" {
      
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
          modifier: 'default',  // Bare when has default behavior (execute all matching)
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
  = "first" / "all" / "any"

// -------------------------------------------------------------
// CONDITION EXPRESSIONS
// -------------------------------------------------------------

// Simple condition for @when simple form - no literals allowed
WhenSimpleCondition
  = NegatedSimpleCondition
  / NonNegatedSimpleCondition

// Negated simple condition with ! prefix
NegatedSimpleCondition
  = "!" _ condition:NonNegatedSimpleCondition {
      // Wrap the condition in a negation node
      return [helpers.createNode('Negation', {
        condition: condition,
        location: location()
      })];
    }

// Non-negated simple conditions (no literals)
NonNegatedSimpleCondition
  = varRef:VariableNoTail {
      return [varRef];
    }
  / invocation:UnifiedReferenceWithTail {
      // Unified reference (exec invocation or variable) with tail modifiers
      return [invocation];
    }
  / Variable {
      // Other variable forms (special vars, interpolation)
      return [$1];
    }
  // Deliberately exclude literals - these will cause parse errors with helpful message
  / value:(BooleanLiteral / NullLiteral / StringLiteral) {
      helpers.mlldError(
        '/when directive requires a variable reference, not a literal value.\n' +
        'Use a variable instead:\n' +
        '   /when true => ...  (incorrect)\n' +
        '   /text condition = "true"\n' +
        '   /when @condition => ...  (correct)\n\n' +
        'For switch-style conditions with literal values, use:\n' +
        '   /when @variable: [\n' +
        '     true => ...\n' +
        '     false => ...\n' +
        '   ]',
        "@variable",
        location()
      );
    }

// Condition expression - reuse existing patterns
WhenConditionExpression
  = NegatedCondition
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
  = varRef:VariableNoTail {
      return [varRef];
    }
  / invocation:UnifiedReferenceWithTail {
      // Unified reference (exec invocation or variable) with tail modifiers
      return [invocation];
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

// List of condition => action pairs
WhenConditionList
  = first:WhenConditionPair rest:(WhenConditionSeparator pair:WhenConditionPair { return pair; })* {
      return [first, ...rest];
    }

// Separator for condition pairs - whitespace only, with helpful error for commas
WhenConditionSeparator
  = _ "," _ {
      helpers.mlldError(
        'Comma separators are not allowed in /when conditions. ' +
        'For readability, /when conditions must be separated by whitespace (newlines or spaces) instead of commas.\n' +
        '💡 Remove the comma and use a newline or space:\n' +
        '   /when expr: [value1 => action1, value2 => action2]  ❌\n' +
        '   /when expr: [value1 => action1  value2 => action2]  ✅\n' +
        '   /when expr: [\n' +
        '     value1 => action1\n' +
        '     value2 => action2\n' +
        '   ]  ✅',
        "whitespace",
        location()
      );
    }
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
  / WhenActionDirective

// Block of directives as action: [directive1, directive2, ...]
WhenActionBlock
  = "[" _ first:WhenActionDirective rest:(_ d:WhenActionDirective { return d; })* _ "]" {
      return [first, ...rest].flat();
    }

// Single directive as action - simplified inline directives
WhenActionDirective
  = "/"? "output" _ source:WhenOutputSource? _ "to" _ target:WhenOutputTarget {
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
  // show with simple variable reference (MUST come before exec invocation)
  / "/"? "show" _ varRef:VariableNoTail {
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
  / "/"? "show" _ invocation:UnifiedReferenceWithTail {
      // show with unified reference (exec invocation or variable)
      const isExecInvocation = invocation.type === 'ExecInvocation';
      const subtype = isExecInvocation ? 'showExecInvocation' : 'showVariable';
      const rawValue = isExecInvocation ? invocation.commandRef.name : `@${invocation.variable.identifier}`;
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'show',
        subtype: subtype,
        values: { 
          [isExecInvocation ? 'execInvocation' : 'variable']: invocation
        },
        raw: { 
          [isExecInvocation ? 'execInvocation' : 'variable']: rawValue
        },
        meta: {},
        location: location()
      })];
    }
  / "/"? "show" _ template:TemplateCore {
      // Use the same abstraction as /show directive
      return [helpers.createNode(NodeType.Directive, {
        kind: 'show',
        subtype: 'showTemplate',
        values: template.values,
        raw: template.raw,
        meta: template.meta,
        location: location()
      })];
    }
  / "/"? "var" _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent {
      // Support full range of var assignments in when actions
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
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
      // Handle variable references with tail modifiers
      else if (value && value.type === 'VariableReferenceWithTail') {
        processedValue = [value.variable];
        metaInfo.inferredType = 'reference';
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
      
      return [helpers.createNode(NodeType.Directive, {
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
      })];
    }
  / "/"? "run" _ invocation:UnifiedReferenceWithTail {
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
  / "/"? "run" _ command:UnifiedCommandBrackets {
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
  / "/"? "output" _ source:WhenOutputSource? _ "[" path:WhenPathText "]" {
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
  = "@" id:BaseIdentifier {
      // Simple variable reference
      return {
        type: 'variable',
        subtype: 'outputVariable',
        values: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
        raw: '@' + id
      };
    }
  / str:StringLiteral {
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
  / str:StringLiteral {
      // File path as quoted string
      return {
        type: 'file',
        path: [helpers.createNode(NodeType.Text, { content: str, location: location() })],
        raw: `"${str}"`,
        meta: { quoted: true }
      };
    }