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
  = first:UnifiedPrimary rest:(_ op:UnifiedComparisonOp _ right:UnifiedPrimary { return { op, right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

UnifiedComparisonOp
  = "==" / "!=" / "~=" / "<=" / ">=" / "<" !"=" / ">" !"="

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
  = UnifiedArrayOperation
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