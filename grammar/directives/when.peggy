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
  = "@" invocation:ExecInvocationWithTail {
      // Exec invocation with tail modifiers
      return [invocation];
    }
  / Variable {
      // Variable reference from patterns/variables.peggy
      return [text()];
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

// -------------------------------------------------------------
// CONDITION LIST AND PAIRS
// -------------------------------------------------------------

// List of condition => action pairs
WhenConditionList
  = first:WhenConditionPair rest:(_ pair:WhenConditionPair { return pair; })* {
      return [first, ...rest];
    }

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
  = "@add" _ "@" invocation:ExecInvocationWithTail {
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
      // @output directive for when actions
      const values = {
        path: [helpers.createNode(NodeType.Text, { 
          content: path, 
          location: location() 
        })]
      };
      
      const raw = {
        path: path
      };
      
      let subtype = 'outputDocument';
      const meta = { hasSource: false };
      
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