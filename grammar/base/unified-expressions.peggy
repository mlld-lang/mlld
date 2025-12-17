// UNIFIED EXPRESSION PATTERNS
// Unified system for all expression evaluation across mlld
// Provides infix operators for logical and comparison operations
// Used by: when directive conditions, var assignments, array filters, etc.
// Precedence (lowest to highest): Ternary → OR → AND → Comparison → Unary → Primary

// Top-level unified expression with ternary operator (lowest precedence)
UnifiedExpression
  = condition:UnifiedLogicalOr _ "?" _ trueBranch:UnifiedExpression _ ":" _ falseBranch:UnifiedExpression {
      return helpers.createNode('TernaryExpression', {
        condition,
        trueBranch,
        falseBranch,
        location: location()
      });
    }
  / UnifiedLogicalOr

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
  = "==" / "!=" / "~=" / "<=" / ">=" / "<" !"=" / ">" !"="

// Arithmetic operators
UnifiedAdditive
  = first:UnifiedMultiplicative rest:(_ op:("+" / "-") _ right:UnifiedMultiplicative { return { op, right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

UnifiedMultiplicative
  = first:UnifiedPrimary rest:(_ op:("*" / "/" / "%") _ right:UnifiedPrimary { return { op, right }; })* {
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
  / UnifiedArrayOperation
  / ExecResultMethodCall   // Support @func(args).method(args) in expressions
  / UnifiedReferenceNoTail  // Handles @var, @var.field, @func(), @obj.method()
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
