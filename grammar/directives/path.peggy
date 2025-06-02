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
  // Quoted string path with security options
  = DirectiveContext "@path" _ security:(SecurityOptions _)? id:BaseIdentifier _ "=" _ "\"" content:$([^"]*) "\"" {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtPath matched quoted string', { id, content, securityOptions });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // Create path parts
      const pathParts = [helpers.createNode(NodeType.Text, { content, location: location() })];
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        {
          identifier: [idNode],
          path: pathParts
        },
        {
          identifier: id,
          path: content
        },
        {
          path: helpers.createPathMetadata(content, pathParts),
          ...helpers.createSecurityMeta(securityOptions)
        },
        location(),
        'path'
      );
    }
  // Bracketed path with security options - semantic parsing
  / DirectiveContext "@path" _ security:(SecurityOptions _)? id:BaseIdentifier _ "=" _ "[" parts:PathAssignmentParts "]" {
      const securityOptions = security ? security[0] : null;
      helpers.debug('AtPath matched bracketed path', { id, parts });
      
      // Process special path variables in the parsed content (only @. special case)
      const processedPathParts = [];
      
      for (const part of parts) {
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
          path: helpers.createPathMetadata(rawString, processedPathParts),
          ...helpers.createSecurityMeta(securityOptions)
        },
        location(),
        'path'  // Source parameter
      );
    }
  / DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ path:PathExpression security:(_ s:SecurityOptions { return s; })? {
      helpers.debug('AtPath matched normal path', { id, path, security });
      
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
          },
          ...helpers.createSecurityMeta(security)
        },
        location(),
        'path'  // Source parameter
      );
    }

// -------------------------------------------------------------
// HELPER RULES (special path identifiers)
// -------------------------------------------------------------

// Path parts for path assignment - allows @var interpolation
PathAssignmentParts
  = parts:(PathAssignmentVariable / PathTextSegment / PathSeparator)* {
      return parts;
    }

// Variable in path assignment context
PathAssignmentVariable
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / SpecialVariable

// Special path identifiers
SpecialPathIdentifier
  = "PROJECTPATH" / "." {
      return text();
    }

// We're now using WrappedPathContent from patterns/content.peggy instead of BracketedPathContent