// EXPRESSION CONTEXT ADAPTERS
// Thin wrappers that adapt unified expressions for specific contexts
// Avoid wrapper nodes - pass through with metadata instead

// For when directive contexts - pass through with metadata
WhenConditionAdapter
  = expr:UnifiedExpression {
      // Create a new object with expression data plus metadata, but keep original structure
      const result = {
        ...expr,
        meta: {
          ...expr.meta,
          isWhenCondition: true,
          isSimple: helpers.isSimpleCondition(expr),
          negated: expr.type === 'UnaryExpression' && expr.operator === '!'
        }
      };
      return result; // Return enhanced expression directly, not wrapped
    }

// For array filter contexts  
ArrayFilterAdapter
  = filter:UnifiedArrayOperation {
      return {
        type: 'arrayOperation',
        operation: filter.type,
        condition: filter.filter,
        array: filter.array,
        parameters: {
          start: filter.start,
          end: filter.end
        }
      };
    }

// For simple boolean contexts
BooleanExpressionAdapter
  = expr:UnifiedExpression {
      // Create a new object with expression data plus metadata
      const result = {
        ...expr,
        meta: {
          ...expr.meta,
          isBooleanContext: true
        }
      };
      return result; // Return enhanced expression directly, not wrapped
    }

// For comparison contexts
ComparisonAdapter
  = expr:UnifiedExpression &{ return expr.type === 'BinaryExpression'; } {
      // Create a new object with expression data plus metadata
      const result = {
        ...expr,
        meta: {
          ...expr.meta,
          isComparison: true,
          isEquality: ['==', '!=', '~='].includes(expr.operator),
          isRelational: ['<', '>', '<=', '>='].includes(expr.operator)
        }
      };
      return result; // Return enhanced expression directly, not wrapped
    }