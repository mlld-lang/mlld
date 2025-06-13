// WHEN DIRECTIVE
// Implementation of the @when directive for conditional execution

/* 
# When Directive

The when directive provides conditional execution based on truthiness.
It can be used in two main forms:
1. @when <condition> => <action>                    - Simple conditional
2. @when <var> <modifier>: [conditions] => <action> - Block conditional with modifiers

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

// Primary @when directive
AtWhen
  = WhenSimpleForm
  / WhenBlockForm
  / WhenSwitchForm

// -------------------------------------------------------------
// SIMPLE FORM: @when <condition> => <action>
// -------------------------------------------------------------

WhenSimpleForm
  = DirectiveContext "@when" _ condition:WhenConditionExpression _ "=>" _ action:WhenAction {
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
// SWITCH FORM: @when <expression>: [value => action, ...]
// -------------------------------------------------------------

WhenSwitchForm
  = DirectiveContext "@when" _ expression:WhenConditionExpression _ ":" _ "[" _ conditions:WhenConditionList _ "]" {
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
// BLOCK FORM: @when <var> <modifier>: [...] => <action>
// -------------------------------------------------------------

WhenBlockForm
  = DirectiveContext "@when" _ variable:("@" id:BaseIdentifier { return id; })? _ 
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
// MODIFIERS
// -------------------------------------------------------------

WhenModifier
  = "first" / "all" / "any"

// -------------------------------------------------------------
// CONDITION EXPRESSIONS
// -------------------------------------------------------------

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
  = "@" id:BaseIdentifier !("(" / TailModifiers) fields:AnyFieldAccess* {
      // Simple variable reference without parentheses or tail modifiers
      const loc = location();
      const node = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, loc);
      return [node];
    }
  / "@" invocation:ExecInvocationWithTail {
      // Exec invocation with tail modifiers
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
      error(
        'Comma separators are not allowed in @when conditions. ' +
        'For readability, @when conditions must be separated by whitespace (newlines or spaces) instead of commas.\n' +
        '💡 Remove the comma and use a newline or space:\n' +
        '   @when expr: [value1 => action1, value2 => action2]  ❌\n' +
        '   @when expr: [value1 => action1  value2 => action2]  ✅\n' +
        '   @when expr: [\n' +
        '     value1 => action1\n' +
        '     value2 => action2\n' +
        '   ]  ✅'
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
  = "@output" _ source:WhenOutputSource? _ "to" _ target:WhenOutputTarget {
      helpers.debug('WhenActionDirective: Enhanced @output matched!');
      // Enhanced @output syntax in when actions (FIRST to match before bracket syntax)
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
  / "@add" _ "@" invocation:ExecInvocationWithTail {
      // @add with exec invocation
      return [helpers.createNode(NodeType.Directive, {
        kind: 'add',
        subtype: 'addExecInvocation',
        values: { 
          execInvocation: invocation
        },
        raw: { 
          execInvocation: invocation.commandRef.name 
        },
        meta: {},
        location: location()
      })];
    }
  / "@add" _ content:StringLiteral {
      return [helpers.createNode(NodeType.Directive, {
        kind: 'add',
        subtype: 'addTemplate',
        values: { 
          content: [helpers.createNode(NodeType.Text, { 
            content: content, 
            location: location() 
          })]
        },
        raw: { content: content },
        meta: {},
        location: location()
      })];
    }
  / "@text" _ id:BaseIdentifier _ "=" _ value:StringLiteral {
      return [helpers.createNode(NodeType.Directive, {
        kind: 'text',
        subtype: 'textAssignment',
        values: { 
          identifier: [helpers.createVariableReferenceNode('identifier', { identifier: id })],
          content: [helpers.createNode(NodeType.Text, { 
            content: value, 
            location: location() 
          })]
        },
        raw: {
          identifier: id,
          content: value
        },
        meta: {},
        location: location()
      })];
    }
  / "@run" _ "@" invocation:ExecInvocationWithTail {
      // @run with exec invocation
      return [helpers.createNode(NodeType.Directive, {
        kind: 'run',
        subtype: 'runExecReference',
        values: { 
          execRef: invocation
        },
        raw: { 
          execRef: invocation.commandRef.name 
        },
        meta: {
          hasWithClause: !!invocation.withClause
        },
        location: location()
      })];
    }
  / "@run" _ "[" command:WhenCommandText "]" {
      // Use simple command parsing for actions
      return [helpers.createNode(NodeType.Directive, {
        kind: 'run',
        subtype: 'runCommand',
        values: { 
          command: [helpers.createNode(NodeType.Text, {
            content: command,
            location: location()
          })]
        },
        raw: { command: command },
        meta: {},
        location: location()
      })];
    }
  / "@output" _ source:WhenOutputSource? _ "[" path:WhenPathText "]" {
      helpers.debug('WhenActionDirective: Bracket @output matched');
      // Bracket @output syntax in when actions
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