/**
 * Custom ESLint rule to require type guards before accessing AST node properties
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require type guards before accessing AST node-specific properties',
      category: 'Best Practices',
    },
    messages: {
      missingTypeGuard: 'Use a type guard before accessing .{{property}} on a node. Consider using is{{nodeType}}() from @core/types/guards.',
    },
    schema: [],
  },
  create(context) {
    const nodeProperties = {
      content: 'TextNode',
      identifier: 'VariableReference',
      kind: 'Directive',
      subtype: 'Directive',
      valueType: 'VariableReference',
      properties: 'Object',
      items: 'Array',
    };
    
    return {
      MemberExpression(node) {
        if (node.property.type === 'Identifier' &&
            nodeProperties[node.property.name]) {
          
          // Check if we're in a type guard context
          let currentScope = node;
          let hasTypeGuard = false;
          
          // Simple heuristic: check if we're inside an if statement with type check
          while (currentScope.parent) {
            currentScope = currentScope.parent;
            
            if (currentScope.type === 'IfStatement') {
              const sourceCode = context.getSourceCode();
              const testText = sourceCode.getText(currentScope.test);
              
              // Check for type guards
              if (testText.includes('.type ===') ||
                  testText.includes('is' + nodeProperties[node.property.name]) ||
                  testText.includes('typeof')) {
                hasTypeGuard = true;
                break;
              }
            }
            
            // Don't traverse too far up
            if (currentScope.type === 'FunctionDeclaration' ||
                currentScope.type === 'FunctionExpression' ||
                currentScope.type === 'ArrowFunctionExpression') {
              break;
            }
          }
          
          if (!hasTypeGuard) {
            context.report({
              node,
              messageId: 'missingTypeGuard',
              data: {
                property: node.property.name,
                nodeType: nodeProperties[node.property.name],
              },
            });
          }
        }
      }
    };
  },
};