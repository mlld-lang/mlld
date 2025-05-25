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
  = DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ "[" pathContent:$(!"]" .)* "]" {
      helpers.debug('AtPath matched bracketed path', { id, pathContent });
      
      // Process special path variables @~ and @. directly
      // This ensures the AST and raw string are consistent with test expectations
      const processedContent = pathContent
        .replace(/@~/g, '@HOMEPATH')
        .replace(/@\./g, '@PROJECTPATH');
      
      // Use WrappedPathContent abstraction to process the processed content 
      // instead of manual parsing
      const pathWrapper = {
        parts: [],
        raw: processedContent
      };
      
      // Parse path contents for variables - similar to what WrappedPathContent would do
      // but with our processed special variables
      const pathParts = [];
      let lastIndex = 0;
      const varPattern = /@([a-zA-Z0-9_]+)/g;
      let match;
      
      while ((match = varPattern.exec(processedContent)) !== null) {
        // Add text content before the variable
        if (match.index > lastIndex) {
          const textContent = processedContent.substring(lastIndex, match.index);
          if (textContent) {
            pathParts.push(helpers.createNode(NodeType.Text, { content: textContent, location: location() }));
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
          pathParts.push(helpers.createNode(NodeType.Text, { content: textContent, location: location() }));
        }
      }
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
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
          path: helpers.createPathMetadata(processedContent, pathParts)
        },
        location(),
        'path'  // Source parameter
      );
    }
  / DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ path:PathExpression {
      helpers.debug('AtPath matched normal path', { id, path });
      
      // ProcessedPath might need @~ and @. transformed like we did above
      let processedPath = path.raw.path || path.raw.url;
      if (processedPath.includes('@~') || processedPath.includes('@.')) {
        processedPath = processedPath
          .replace(/@~/g, '@HOMEPATH')
          .replace(/@\./g, '@PROJECTPATH');
      }
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // We need to also process the path parts if they contain special variables
      const processedPathParts = [...(path.values.path || path.values.parts || [])];
      for (let i = 0; i < processedPathParts.length; i++) {
        const part = processedPathParts[i];
        if (part.type === NodeType.VariableReference && 
            (part.identifier === '~' || part.identifier === '.')) {
          // Clone the node and update identifier
          const newNode = { ...part };
          newNode.identifier = part.identifier === '~' ? 'HOMEPATH' : 'PROJECTPATH';
          processedPathParts[i] = newNode;
        }
      }
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        {
          identifier: [idNode],
          path: processedPathParts
        },
        {
          identifier: id,
          path: processedPath
        },
        {
          path: {
            ...path.meta,
            pathSubtype: path.subtype // Preserve the specific path type
          }
        },
        location(),
        'path'  // Source parameter
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

// We're now using WrappedPathContent from patterns/content.peggy instead of BracketedPathContent