/**
 * Custom ESLint rule to prevent string manipulation on AST content
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow string manipulation methods on AST node content',
      category: 'Best Practices',
    },
    messages: {
      noStringManipulation: 'Do not use {{method}}() on AST content. Use AST evaluation methods instead.',
      noContentAccess: 'Do not access .content directly on {{nodeType}} nodes. Use interpolate() instead.',
      noRegexOnAst: 'Do not use regex matching on AST content. Parse the AST structure instead.',
    },
    schema: [],
  },
  create(context) {
    const bannedMethods = ['split', 'replace', 'match', 'startsWith', 'endsWith', 'includes', 'indexOf'];
    
    return {
      // Check for .content access on Text nodes
      MemberExpression(node) {
        if (node.property.type === 'Identifier' && 
            node.property.name === 'content') {
          // Try to detect if this is on a Text/TextNode
          const sourceCode = context.getSourceCode();
          const text = sourceCode.getText(node.object);
          
          if (text.includes('Text') || text.includes('node')) {
            context.report({
              node,
              messageId: 'noContentAccess',
              data: { nodeType: 'Text' },
            });
          }
        }
      },
      
      // Check for string methods on potential AST content
      CallExpression(node) {
        if (node.callee.type === 'MemberExpression' &&
            node.callee.property.type === 'Identifier' &&
            bannedMethods.includes(node.callee.property.name)) {
          
          const sourceCode = context.getSourceCode();
          const objectText = sourceCode.getText(node.callee.object);
          
          // Check if this looks like AST content manipulation
          if (objectText.includes('content') || 
              objectText.includes('identifier') ||
              objectText.includes('value') ||
              objectText.includes('node')) {
            context.report({
              node,
              messageId: 'noStringManipulation',
              data: { method: node.callee.property.name },
            });
          }
        }
        
        // Check for regex match calls
        if (node.callee.type === 'MemberExpression' &&
            node.callee.property.type === 'Identifier' &&
            node.callee.property.name === 'match' &&
            node.arguments.length > 0 &&
            node.arguments[0].type === 'Literal' &&
            node.arguments[0].regex) {
          
          const sourceCode = context.getSourceCode();
          const objectText = sourceCode.getText(node.callee.object);
          
          if (objectText.includes('content') || objectText.includes('Str')) {
            context.report({
              node,
              messageId: 'noRegexOnAst',
            });
          }
        }
      }
    };
  },
};