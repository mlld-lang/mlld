/**
 * Custom ESLint rule to prevent access to .raw fields on AST nodes
 * These should use .values arrays instead
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow access to .raw fields on directive nodes - use .values instead',
      category: 'Best Practices',
    },
    messages: {
      noRawAccess: 'Do not use {{property}} on directive nodes. Use directive.values.{{field}} and interpolate() instead.',
      noDirectAccess: 'Do not access .{{property}} directly. Use appropriate AST evaluation methods.',
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        // Check for directive.raw access
        if (node.property.type === 'Identifier' && node.property.name === 'raw') {
          context.report({
            node,
            messageId: 'noRawAccess',
            data: { property: 'raw', field: 'fieldName' },
          });
        }
        
        // Check for directive.operator direct access
        if (node.property.type === 'Identifier' && 
            node.property.name === 'operator' &&
            node.object.type === 'Identifier' && 
            node.object.name.includes('directive')) {
          context.report({
            node,
            messageId: 'noDirectAccess',
            data: { property: 'operator' },
          });
        }
      },
      
      // Check for optional chaining: directive.raw?.identifier
      ChainExpression(node) {
        if (node.expression.type === 'MemberExpression' &&
            node.expression.property.type === 'Identifier' &&
            node.expression.property.name === 'raw') {
          context.report({
            node,
            messageId: 'noRawAccess',
            data: { property: 'raw', field: 'fieldName' },
          });
        }
      }
    };
  },
};