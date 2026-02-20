// UNIFIED EXPRESSION PATTERNS
// Unified system for all expression evaluation across mlld
// Provides infix operators for logical and comparison operations
// Used by: when directive conditions, var assignments, array filters, etc.
// Precedence (lowest to highest): Ternary → Nullish → OR → AND → Comparison → Unary → Primary

// Top-level unified expression with ternary operator (lowest precedence)
UnifiedExpression
  = condition:UnifiedNullish _ "?" _ trueBranch:TernaryBranch _ ":" _ falseBranch:TernaryBranch {
      return helpers.createNode('TernaryExpression', {
        condition,
        trueBranch,
        falseBranch,
        location: location()
      });
    }
  / UnifiedNullish

// Ternary branch can be a template, code execution, or a regular expression
// Templates and code execution must be tried first to avoid expression parsing issues
TernaryBranch
  = TernaryBacktick
  / CodeExecution
  / UnifiedExpression

// Backtick template in ternary branch context - isolated from main expression parsing
TernaryBacktick "backtick template in ternary"
  = '`' content:TernaryBacktickContent* '`' {
      if (content.length === 0) {
        return {
          content: [helpers.createNode('Literal', { value: '', valueType: 'string', location: location() })],
          wrapperType: 'backtick',
          hasInterpolation: false
        };
      }
      if (content.length === 1 && content[0].type === 'Text') {
        return {
          content: [helpers.createNode('Literal', { value: content[0].content, valueType: 'string', location: location() })],
          wrapperType: 'backtick',
          hasInterpolation: false
        };
      }
      return {
        content: content,
        wrapperType: 'backtick',
        hasInterpolation: true
      };
    }

// Content inside ternary backticks - minimal parsing to avoid interference
TernaryBacktickContent
  = "@" id:BaseIdentifier fields:TernaryFieldAccess* {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / chars:(!('`' / '@') .)+ {
      return helpers.createNode(NodeType.Text, { content: chars.map(c => c[1]).join(''), location: location() });
    }

TernaryFieldAccess
  = "." id:BaseIdentifier {
      return { type: 'field', value: id, location: location() };
    }

// Nullish coalescing (left-associative)
UnifiedNullish
  = first:UnifiedLogicalOr rest:(_ "??" _ right:UnifiedLogicalOr { return { op: "??", right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

// Logical OR (left-associative)
UnifiedLogicalOr
  = first:UnifiedLogicalAnd rest:(_ "||" _ right:UnifiedLogicalAnd { return { op: "||", right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

// Logical AND (left-associative)
UnifiedLogicalAnd
  = first:UnifiedComparison rest:(_ "&&" _ right:UnifiedComparison { return { op: "&&", right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

// Comparison operators (left-associative)
UnifiedComparison
  = first:UnifiedAdditive rest:(_ op:UnifiedComparisonOp _ right:UnifiedAdditive { return { op, right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

UnifiedComparisonOp
  = "==" / "!=" / "~=" / "<=" / ">=" / "<" !("=" / "<") / ">" !("=" / ">")

// Arithmetic operators — mandatory whitespace around operators
// Required to disambiguate from hyphenated identifiers (e.g. @a-b is identifier, @a - @b is subtraction)
UnifiedAdditive
  = first:UnifiedMultiplicative rest:(__ op:("+" / "-") __ right:UnifiedMultiplicative { return { op, right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

UnifiedMultiplicative
  = first:UnifiedPrimary rest:(__ op:("*" / "/" / "%") __ right:UnifiedPrimary { return { op, right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

// Primary expressions (highest precedence)
UnifiedPrimary
  = "(" _ expr:UnifiedExpression _ ")" { return expr; }
  / UnifiedUnaryExpression
  / UnifiedAtomicExpression

// Unary expressions
UnifiedUnaryExpression
  = "!" _ expr:UnifiedPrimary {
      return helpers.createNode('UnaryExpression', {
        operator: '!',
        operand: expr,
        location: location()
      });
    }

// Atomic expressions - use unified patterns for proper variable/exec support
UnifiedAtomicExpression
  = WhenExpression                 // Treat when as atomic expression
  / ForeachCommandExpression       // Treat foreach as atomic expression
  / NewExpression                  // new @Class(...) constructor expression
  / UnifiedArrayOperation
  / ExecResultMethodCall   // Support @func(args).method(args) in expressions
  / AlligatorWithFields    // File with field access: <path>.field - must come before bare AlligatorExpression
  / AlligatorExpression    // File/URL loading: <path> - enables <file> ?? default
  / UnifiedReferenceNoTail  // Handles @var, @var.field, @func(), @obj.method()
  / ArrayLiteral           // Array literals [1, 2, 3] or []
  / DataObjectLiteral      // Object literals { key: value }
  / ExpressionString  // ExpressionString already returns a Literal node
  / value:NumberLiteral {
      // Wrap number literal in a Literal node
      return helpers.createNode('Literal', {
        value: value,
        valueType: 'number',
        location: location()
      });
    }
  / value:BooleanLiteral {
      // Wrap boolean literal in a Literal node  
      return helpers.createNode('Literal', {
        value: value,
        valueType: 'boolean',
        location: location()
      });
    }
  / value:NullLiteral {
      // Wrap null literal in a Literal node
      return helpers.createNode('Literal', {
        value: value,
        valueType: 'null',
        location: location()
      });
    }
  / value:WildcardLiteral {
      // Wrap wildcard literal in a Literal node
      return helpers.createNode('Literal', {
        value: value,
        valueType: 'wildcard',
        location: location()
      });
    }
  / NoneLiteral  // NoneLiteral already returns a properly formatted Literal node
  / DeniedLiteral  // DeniedLiteral maps to @mx.denied during evaluation

NewExpression "new expression"
  = "new" _ target:NewExpressionTarget args:NewExpressionArgs? {
      return helpers.createNode('NewExpression', {
        target,
        args: args || [],
        location: location()
      });
    }

NewExpressionArgs "new expression args"
  = "(" args:CommandArgumentList? _ ")" {
      return args || [];
    }

NewExpressionTarget "new expression target"
  = "@" id:BaseIdentifier fields:AnyFieldAccessOptional* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }

// Method call on the result of an exec invocation
// Example: @helper(@input).includes("APPROVE")
// Note: We intentionally keep this here (base) so WhenConditionAdapter (UnifiedExpression)
// can parse it in simple /when forms.
ExecResultMethodCall
  = streamPrefix:StreamKeyword? _ "@" func:BaseIdentifier "(" args:CommandArgumentList? _ ")" _ "." method:BaseIdentifier "(" margs:CommandArgumentList? _ ")" post:PostFieldAccess* tail:TailModifiers? {
      // Build the base exec invocation: @func(args)
      const baseRef = {
        name: func,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: func
        }, location())],
        args: args || [],
        isCommandReference: true
      };
      const baseInvocation = helpers.createExecInvocation(baseRef, null, location());

      // Build the method invocation with the base as objectSource
      const methodRef = {
        name: method,
        identifier: [helpers.createNode(NodeType.Text, { content: method, location: location() })],
        args: margs || [],
        isCommandReference: true,
        objectSource: baseInvocation // Non-standard: handled by evaluator
      };

      const finalTail = streamPrefix ? (tail ? { ...tail, stream: true } : { stream: true }) : tail;
      const exec = helpers.createExecInvocation(methodRef, null, location());
      const execWithPost = helpers.attachPostFields(exec, post);
      return finalTail ? helpers.applyTail(execWithPost, finalTail) : execWithPost;
    }

// Method call on the result of an exec invocation without tail modifiers.
// Used when a following "with" clause belongs to a directive, not the expression.
ExecResultMethodCallNoTail
  = _ "@" func:BaseIdentifier "(" args:CommandArgumentList? _ ")" _ "." method:BaseIdentifier "(" margs:CommandArgumentList? _ ")" post:PostFieldAccess* {
      const baseRef = {
        name: func,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: func
        }, location())],
        args: args || [],
        isCommandReference: true
      };
      const baseInvocation = helpers.createExecInvocation(baseRef, null, location());

      const methodRef = {
        name: method,
        identifier: [helpers.createNode(NodeType.Text, { content: method, location: location() })],
        args: margs || [],
        isCommandReference: true,
        objectSource: baseInvocation
      };

      const exec = helpers.createExecInvocation(methodRef, null, location());
      return helpers.attachPostFields(exec, post);
    }

// Array operations for advanced filtering and manipulation
UnifiedArrayOperation
  = arrayRef:UnifiedReferenceNoTail "[?" filter:UnifiedExpression "]" {
      return helpers.createNode('ArrayFilterExpression', {
        array: arrayRef,
        filter: filter,
        location: location()
      });
    }
  / arrayRef:UnifiedReferenceNoTail "[" start:NumberLiteral ":" end:NumberLiteral? "]" {
      return helpers.createNode('ArraySliceExpression', {
        array: arrayRef,
        start: start,
        end: end,
        location: location()
      });
    }

// Error recovery for common mistakes
/ "(" _ expr:UnifiedExpression _ &{
    const rest = input.substring(peg$currPos);
    return !rest.includes(')');
  } {
    error("Unclosed parenthesis in expression. Expected ')'");
  }
