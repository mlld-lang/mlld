// EXPRESSION PATTERNS
// Provides infix operators for logical and comparison operations
// Used by: when directive conditions, var assignments
// Precedence (lowest to highest): Ternary → OR → AND → Comparison → Unary → Primary

// Top-level expression with ternary operator (lowest precedence)
Expression
  = condition:LogicalOr _ "?" _ trueBranch:Expression _ ":" _ falseBranch:Expression {
      return helpers.createNode('TernaryExpression', {
        condition,
        trueBranch,
        falseBranch,
        location: location()
      });
    }
  / LogicalOr

// Logical OR (left-associative)
LogicalOr
  = first:LogicalAnd rest:(_ "||" _ right:LogicalAnd { return { op: "||", right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

// Logical AND (left-associative)
LogicalAnd
  = first:Comparison rest:(_ "&&" _ right:Comparison { return { op: "&&", right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

// Comparison operators (left-associative)
Comparison
  = first:Primary rest:(_ op:ComparisonOp _ right:Primary { return { op, right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

ComparisonOp
  = "==" / "!="

// Primary expressions (highest precedence)
Primary
  = "(" _ expr:Expression _ ")" { return expr; }
  / UnaryExpression
  / AtomicExpression

// Unary expressions
UnaryExpression
  = "!" _ expr:Primary {
      return helpers.createNode('UnaryExpression', {
        operator: '!',
        operand: expr,
        location: location()
      });
    }

// Atomic expressions - use basic patterns that are definitely available
AtomicExpression
  = "@" id:BaseIdentifier &{ 
      // Simple variable reference check - avoid complex patterns for now
      return !input.charAt(peg$currPos) || input.charAt(peg$currPos) !== '(';
    } {
      // Create simple variable reference
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        location: location()
      });
    }
  / "@" id:BaseIdentifier "(" _ ")" {
      // Simple function call without arguments
      return helpers.createNode('ExecInvocation', {
        name: id,
        arguments: [],
        location: location()
      });
    }
  / BooleanLiteral           // true/false (from base/literals.peggy)
  / NullLiteral              // null (from base/literals.peggy)
  / StringLiteral            // "string" (from base/literals.peggy)
  / NumberLiteral            // 123 (from base/literals.peggy)

// Error recovery for common mistakes
/ "(" _ expr:Expression _ &{
    const rest = input.substring(peg$currPos);
    return !rest.includes(')');
  } {
    error("Unclosed parenthesis in expression. Expected ')'");
  }