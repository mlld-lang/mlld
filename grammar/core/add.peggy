// ADD CORE
// Core content handlers for add directive logic without directive wrapper

/* 
# Add Content Core

This file provides core add content handling that can be used by:
- @add directive for including content
- @data directive for embedded add operations
- Other contexts requiring add functionality

The cores extract the essential logic without the directive wrapper,
allowing reuse in RHS patterns and embedded contexts.
*/

// -------------------------------------------------------------
// ADD PATH CORE - Core path content logic
// -------------------------------------------------------------

AddPathCore
  = path:PathCore {
      helpers.debug('AddPathCore matched path', { path });
      
      return {
        type: 'addPath',
        values: { path: path.values.path },
        raw: { path: path.raw.path },
        meta: path.meta
      };
    }

// -------------------------------------------------------------
// ADD TEMPLATE CORE - Core template content logic
// -------------------------------------------------------------

AddTemplateCore
  = template:TemplateCore {
      helpers.debug('AddTemplateCore matched template', { template });
      
      return {
        type: 'addTemplate',
        values: { content: template.values.content },
        raw: { content: template.raw.content },
        meta: template.meta
      };
    }

// -------------------------------------------------------------
// ADD VARIABLE CORE - Core variable reference logic
// -------------------------------------------------------------

AddVariableCore
  = "@" varRef:VariableReference {
      helpers.debug('AddVariableCore matched variable', { varRef });
      
      return {
        type: 'addVariable',
        values: { variable: [varRef] },
        raw: { variable: `@${varRef.identifier}` },
        meta: {
          hasFieldAccess: !!(varRef.fields && varRef.fields.length > 0)
        }
      };
    }

// -------------------------------------------------------------
// ADD TEMPLATE INVOCATION CORE - Template with parameters
// -------------------------------------------------------------

AddTemplateInvocationCore
  = "@" id:BaseIdentifier _ "(" _ args:TemplateArgsList? _ ")" {
      helpers.debug('AddTemplateInvocationCore matched', { id, args });
      
      const processedArgs = args || [];
      
      return {
        type: 'addTemplateInvocation',
        values: {
          templateName: [helpers.createNode(NodeType.Text, { content: id, location: location() })],
          arguments: processedArgs
        },
        raw: {
          templateName: id,
          arguments: processedArgs.map(arg => {
            if (arg.type === 'string') return `"${arg.value}"`;
            if (arg.type === 'variable') return `@${arg.value.identifier}`;
            return arg.value || '';
          })
        },
        meta: {
          argumentCount: processedArgs.length
        }
      };
    }

// -------------------------------------------------------------
// ADD PATH SECTION CORE - Section extraction from path
// -------------------------------------------------------------

AddPathSectionCore
  = sectionTitle:QuotedContent _ "from" _ path:PathCore rename:AsNewTitle? {
      helpers.debug('AddPathSectionCore matched', { sectionTitle, path, rename });
      
      return {
        type: 'addPathSection',
        values: {
          sectionTitle: sectionTitle,
          path: path.values.path,
          ...(rename ? { newTitle: rename } : {})
        },
        raw: {
          sectionTitle: sectionTitle[0].content,
          path: path.raw.path,
          ...(rename ? { newTitle: rename[0].content } : {})
        },
        meta: {
          hasRename: !!rename,
          ...path.meta
        }
      };
    }
  / '[' pathText:$([^#\]]+) '#' _ sectionText:$([^\]]+) ']' rename:AsNewTitle? {
      helpers.debug('AddPathSectionCore matched bracketed', { pathText, sectionText, rename });
      
      const rawPath = pathText.trim();
      const pathParts = [helpers.createNode(NodeType.Text, { content: rawPath, location: location() })];
      
      return {
        type: 'addPathSection',
        values: {
          sectionTitle: [helpers.createNode(NodeType.Text, { content: sectionText.trim(), location: location() })],
          path: pathParts,
          ...(rename ? { newTitle: rename } : {})
        },
        raw: {
          sectionTitle: sectionText.trim(),
          path: rawPath,
          ...(rename ? { newTitle: rename[0].content } : {})
        },
        meta: {
          hasRename: !!rename,
          hasVariables: false,
          isAbsolute: rawPath.startsWith('/'),
          hasExtension: /\.[a-zA-Z0-9]+$/.test(rawPath),
          extension: rawPath.match(/\.([a-zA-Z0-9]+)$/)?.[1] || null
        }
      };
    }

// -------------------------------------------------------------
// COMBINED ADD CORE - All add patterns for RHS contexts
// -------------------------------------------------------------

AddCore
  = AddPathSectionCore
  / AddTemplateInvocationCore
  / AddTemplateCore
  / AddVariableCore
  / AddPathCore

// -------------------------------------------------------------
// REFERENCES TO EXISTING RULES
// -------------------------------------------------------------
// These rules are defined in other files and will be available
// during the build process:
// - VariableReference (from add.peggy)
// - TemplateArgsList (from add.peggy)
// - TemplateArg (from add.peggy) 
// - QuotedStringContent (from add.peggy)
// - QuotedContent (from add.peggy)
// - AsNewTitle (from add.peggy)