/**
 * @fileoverview Rule to enforce Meld module import standards
 * @author Claude-Meld
 */

"use strict";

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce Meld module import standards",
      category: "Module System",
      recommended: true,
    },
    fixable: "code",
    schema: [],
  },

  create: function (context) {
    // List of Node.js built-in modules
    const nodeBuiltIns = new Set([
      'fs', 'path', 'events', 'crypto', 'readline', 'os', 'util', 'stream', 'zlib', 
      'http', 'https', 'child_process', 'buffer', 'url', 'querystring', 'assert',
    ]);

    return {
      ImportDeclaration(node) {
        const importSource = node.source.value;
        
        // Skip relative imports to node_modules or third-party packages
        if (!importSource.startsWith('.') && !importSource.startsWith('@') && !nodeBuiltIns.has(importSource)) {
          return;
        }

        // Check if it's a Node.js built-in module with a .js extension
        if (nodeBuiltIns.has(importSource.replace(/\.js$/, ''))) {
          if (importSource.endsWith('.js')) {
            context.report({
              node,
              message: "Node.js built-in modules should not have .js extension",
              fix: function(fixer) {
                return fixer.replaceText(
                  node.source,
                  `'${importSource.replace(/\.js$/, '')}'`
                );
              }
            });
          }
          return;
        }

        // Check if it's an internal import without a .js extension
        if ((importSource.startsWith('.') || importSource.startsWith('@')) && !importSource.endsWith('.js')) {
          // Skip imports for CSS, JSON, or other non-JS files
          if (importSource.endsWith('.css') || importSource.endsWith('.json') || importSource.endsWith('.d.ts')) {
            return;
          }
          
          context.report({
            node,
            message: "Internal imports must include .js extension",
            fix: function(fixer) {
              return fixer.replaceText(
                node.source,
                `'${importSource}.js'`
              );
            }
          });
        }
        
        // Check for @sdk imports that should be @api
        if (importSource.startsWith('@sdk/')) {
          context.report({
            node,
            message: "Use @api/ instead of @sdk/ for API module imports",
            fix: function(fixer) {
              return fixer.replaceText(
                node.source,
                `'${importSource.replace('@sdk/', '@api/')}'`
              );
            }
          });
        }
        
        // Check for directory imports without index.js
        if ((importSource.startsWith('.') || importSource.startsWith('@')) && 
            !importSource.includes('.') && !importSource.endsWith('/')) {
          context.report({
            node,
            message: "Directory imports should explicitly include index.js",
            fix: function(fixer) {
              return fixer.replaceText(
                node.source,
                `'${importSource}/index.js'`
              );
            }
          });
        }
      }
    };
  }
};