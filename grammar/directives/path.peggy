// PATH DIRECTIVE
// Implementation of the @path directive for defining path variables

/* 
# Path Directive

The path directive defines path variables that can include interpolated variables.
It is used in the form:
@path identifier = "path/to/something"
@path identifier = path/with/@variables
*/

// Core content handlers (context, tokens, whitespace, variables, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL PATH DIRECTIVE
// -------------------------------------------------------------

// Primary @path directive - handles bracketed paths
AtPath
  = DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ "[" content:BracketedPathContent "]" {
      helpers.debug('AtPath matched bracketed path', { id, content });
      
      // Process bracketed content for special path variables
      const processedContent = content
        .replace(/@~/g, '@HOMEPATH')
        .replace(/@\./g, '@PROJECTPATH');

      // Parse path contents for variables
      const pathParts = [];
      let lastIndex = 0;
      const varPattern = /@([a-zA-Z0-9_]+)/g;
      let match;
      
      while ((match = varPattern.exec(processedContent)) !== null) {
        // Add text content before the variable, if any
        if (match.index > lastIndex) {
          const textContent = processedContent.substring(lastIndex, match.index);
          if (textContent) {
            pathParts.push(helpers.createNode(NodeType.Text, { content: textContent }, location()));
          }
        }
        
        // Add the variable reference node
        const varName = match[1];
        pathParts.push(helpers.createVariableReferenceNode('varIdentifier', { identifier: varName }, location()));
        
        // Update lastIndex to after the variable reference
        lastIndex = match.index + match[0].length;
      }
      
      // Add any remaining text after the last variable
      if (lastIndex < processedContent.length) {
        const textContent = processedContent.substring(lastIndex);
        if (textContent) {
          pathParts.push(helpers.createNode(NodeType.Text, { content: textContent }, location()));
        }
      }
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // Check for variables
      const hasVariables = pathParts.some(part => part.type === NodeType.VariableReference);
      
      // Other path metadata
      const isAbsolute = processedContent.startsWith('/');
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(processedContent);
      const extension = hasExtension ? 
        processedContent.substring(processedContent.lastIndexOf('.') + 1) : null;
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        {
          identifier: [idNode],
          path: pathParts
        },
        {
          identifier: id,
          path: processedContent
        },
        {
          path: {
            hasVariables,
            isAbsolute,
            hasExtension,
            extension
          }
        },
        location(),
        'path'  // Added source parameter
      );
    }
  / DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ path:PathCore {
      helpers.debug('AtPath matched normal path', { id, path });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        {
          identifier: [idNode],
          path: path.values.path
        },
        {
          identifier: id,
          path: path.raw.path
        },
        {
          path: {
            hasVariables: path.meta.hasVariables,
            isAbsolute: path.meta.isAbsolute,
            hasExtension: path.meta.hasExtension,
            extension: path.meta.extension
          }
        },
        location(),
        'path'  // Added source parameter
      );
    }

// -------------------------------------------------------------
// HELPER RULES (special path identifiers)
// -------------------------------------------------------------

// Special path identifiers (HOMEPATH, PROJECTPATH, etc.)
SpecialPathIdentifier
  = "HOMEPATH" / "~" / "PROJECTPATH" / "." {
      return text();
    }

// Captures the content inside brackets for path directives
BracketedPathContent
  = $(!"]" .)* {
      return text();
    }