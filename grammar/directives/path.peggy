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

// Primary @path directive - handles bracketed paths using proper abstraction
AtPath
  = DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ content:BracketContent {
      helpers.debug('AtPath matched bracketed path', { id, content });
      
      // Process special path variables in the parsed content (only @. special case)
      const processedPathParts = [];
      
      for (const part of content) {
        if (part.type === 'Text' && part.content && part.content.includes('@.')) {
          // Handle @. in text nodes by replacing with @PROJECTPATH and re-parsing as variable
          const updatedContent = part.content.replace(/@\./g, '@PROJECTPATH');
          
          // If the replacement happened, we need to split this into text and variable parts
          if (updatedContent !== part.content) {
            // For simplicity, just replace @. with @PROJECTPATH in the text content
            // The interpreter will handle @PROJECTPATH as a special variable
            const newTextNode = helpers.createNode(NodeType.Text, { 
              content: updatedContent, 
              location: part.location 
            });
            processedPathParts.push(newTextNode);
          } else {
            processedPathParts.push(part);
          }
        } else {
          processedPathParts.push(part);
        }
      }
      
      // Reconstruct raw string from processed parts for metadata
      const rawString = helpers.reconstructRawString(processedPathParts);
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        {
          identifier: [idNode],
          path: processedPathParts
        },
        {
          identifier: id,
          path: rawString
        },
        {
          path: helpers.createPathMetadata(rawString, processedPathParts)
        },
        location(),
        'path'  // Source parameter
      );
    }
  / DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ path:PathExpression {
      helpers.debug('AtPath matched normal path', { id, path });
      
      // Process special path variables
      let processedPath = path.raw.path || path.raw.url;
      if (processedPath.includes('@.')) {
        processedPath = processedPath
          .replace(/@\./g, '@PROJECTPATH');
      }
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // We need to also process the path parts if they contain special variables
      const processedPathParts = [...(path.values.path || path.values.parts || [])];
      for (let i = 0; i < processedPathParts.length; i++) {
        const part = processedPathParts[i];
        if (part.type === NodeType.VariableReference && part.identifier === '.') {
          // Clone the node and update identifier
          const newNode = { ...part };
          newNode.identifier = 'PROJECTPATH';
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

// Special path identifiers
SpecialPathIdentifier
  = "PROJECTPATH" / "." {
      return text();
    }

// We're now using WrappedPathContent from patterns/content.peggy instead of BracketedPathContent