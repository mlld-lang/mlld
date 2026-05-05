// UNIFIED ARGUMENTS
// Single source of truth for all argument list handling across mlld grammar

/* 
# Unified Argument System

This file provides unified argument list handling that can be used by:
- /run directive for code execution arguments
- /exec directive for executable arguments
- /output directive for output arguments  
- /show directive for template arguments
- Command references for command arguments
- Pipe transforms for pipe arguments

Argument lists support:
- Variables with field access: @var.field[index]
- Literals: strings, numbers, booleans, arrays, objects
- Nested function calls: @func(@arg)
- Template arguments: ::template:: and `template`
- File loading: <file.md>
- Primitive values and escaped arguments

This consolidates 5+ incompatible argument systems into one unified approach.
*/

// -------------------------------------------------------------
// UNIFIED ARGUMENT LIST - Main entry point
// -------------------------------------------------------------

// Single source of truth for all argument list handling
UnifiedArgumentList
  = "(" _ args:UnifiedArgumentListItems? _ ")" {
      helpers.debug('UnifiedArgumentList matched', { args });
      
      return {
        type: 'argumentList',
        arguments: args || [],
        isEmpty: !args || args.length === 0,
        argumentCount: args ? args.length : 0,
        location: location()
      };
    }

UnifiedArgumentListItems
  = head:UnifiedArgument tail:(_ "," _ arg:UnifiedArgument { return arg; })* {
      // Filter out null arguments (from empty raw arguments)
      const args = [head, ...tail].filter(arg => arg !== null);
      return args;
    }

// -------------------------------------------------------------
// UNIFIED ARGUMENT - Individual argument handling
// -------------------------------------------------------------

BlockExpressionInArgsError "block expression in argument"
  = "[" _ &{
      let i = peg$currPos;
      while (i < input.length) {
        const ch = input[i];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
          i += 1;
          continue;
        }
        if (input[i] === '>' && input[i + 1] === '>') {
          i += 2;
          while (i < input.length && input[i] !== '\n') i += 1;
          continue;
        }
        if (input[i] === '<' && input[i + 1] === '<') {
          i += 2;
          while (i < input.length && input[i] !== '\n') i += 1;
          continue;
        }
        break;
      }
      const rest = input.substring(i);
      if (rest.startsWith('let')) return true;
      if (rest.startsWith('=>')) return true;
      if (/^@[_a-zA-Z]\w*\s*\+=/.test(rest)) return true;
      return false;
    } {
      helpers.mlldError(
        'Block expressions are not allowed inside function arguments. Move the block to a let/var and pass the variable instead.',
        'argument',
        location()
      );
    }

// Use existing proven patterns from CommandArgument - handles all edge cases
UnifiedArgument "unified argument"
  = value:UnifiedArgumentBase coercion:InlineRecordCoercionSuffix? {
      if (!coercion) {
        return value;
      }

      return helpers.createNode('CoerceExpression', {
        value,
        schema: coercion,
        location: location()
      });
    }

UnifiedArgumentBase "unified argument"
  = BlockExpressionInArgsError
  / WhenExpression              // Allow when-expressions as arguments
  / ForeachCommandExpression    // Allow foreach as argument (returns array)
  / GroupedCoerceExpressionAccess
  // Function-call branches: decline if immediately followed by an operator so
  // `ExpressionWithOperator` (later in this alternation) can consume the full
  // expression, e.g. `@f(@deepEq(1,1) && true, "m")`. Without this guard, the
  // call rule greedily matches `@deepEq(1,1)` and the argument list then
  // chokes on `&&`.
  / call:ExecResultMethodCall !ArgOpFollowsCall { return call; }
  / call:FieldAccessExecPattern !ArgOpFollowsCall { return call; }
  / call:ExecInvocationPattern !ArgOpFollowsCall { return call; }
  / CodeExecution               // Allow inline run/command executions as arguments
  / CommandTemplateArgument     // Template arguments ::...::
  / BacktickTemplateArgument    // Backtick templates `...`
  / call:NestedExecInvocation !ArgOpFollowsCall { return call; }
  / DataObjectLiteral           // Object literals: {"key": "value"}
  / ArrayLiteral                // Arrays: [1, 2, 3]
  / AlligatorExpression         // File loading: <file.md>
  / regex:RegexLiteral { return regex; }
  / str:DataString {
      // Create a Text node directly - handle both simple strings and interpolated content
      if (typeof str === 'string') {
        return helpers.createNode(NodeType.Text, {
          content: str,
          location: location()
        });
      } else if (str.needsInterpolation) {
        // Return the parts for runtime interpolation
        return str.parts;
      }
    }
  / ExpressionWithOperator     // Operator expressions (ternary, comparison, etc.)
  / GroupedUnifiedExpression
  / varRef:VariableNoTail {  // Use unified variable pattern for all contexts
      return varRef;
    }
  / PipeInArgumentError   // Catch @var | @pipe before RawArgument swallows it
  / PrimitiveValue       // Direct primitives: 42, true, false, null
  / EscapedArgument      // Escaped characters in unquoted arguments
  / RawArgument          // Fallback for unquoted arguments

// Lookahead: matches when an argument-position function call is immediately
// followed by an operator that should belong to a wrapping expression. Used
// by UnifiedArgumentBase to defer to ExpressionWithOperator instead of letting
// the call alone satisfy the argument and leaving an orphaned operator behind.
ArgOpFollowsCall
  = _ ("&&" / "||" / "==" / "!=" / "!~=" / "~=" / "<=" / ">=" / "<" / ">" / "??" / "+" / "-" / "*" / "/" / "%" / "?")

PipeInArgumentError "pipe expression in argument"
  = "@" id:BaseIdentifier fields:AnyFieldAccessOptional* _ "|" {
      const varName = id + (fields.length > 0 ? fields.map(f => '.' + f.value).join('') : '');
      helpers.mlldError(
        'Pipe expressions are not supported inside function arguments. Assign the result to a variable first:\n\n  let @piped = @' + varName + ' | ...\n  @func(@piped)',
        'argument',
        location()
      );
    }

// Regex literal for arguments: /body/flags
RegexLiteral "regex literal"
  = "/" body:RegexBody "/" flags:RegexFlags? {
      return helpers.createNode('RegexLiteral', {
        pattern: body,
        flags: flags || '',
        raw: `/${body}/${flags || ''}`,
        location: location()
      });
    }

RegexBody = chars:RegexBodyChar* { return chars.join(''); }

RegexBodyChar
  = "\\\\" char:. { return '\\\\' + char; }  // Escaped character, including escaped slash
  / !("/" / "\n" / "\r") char:. { return char; }  // Any char except unescaped slash or newline

RegexFlags = flags:$[a-zA-Z]* { return flags; }

// -------------------------------------------------------------
// UNIFIED ARGUMENT PATTERNS - From command-reference.peggy
// -------------------------------------------------------------

// Note: Individual argument patterns are defined in other grammar files.
// UnifiedArgument references existing patterns like NestedExecInvocation, 
// CommandTemplateArgument, etc. from their original locations.

// -------------------------------------------------------------
// CONTEXT VALIDATION AND COERCION
// -------------------------------------------------------------

// Consolidation complete - all patterns now use UnifiedArgumentList directly
