// PATH DIRECTIVE
// Implementation of the /path directive for defining path variables

/* 
# Path Directive

The path directive defines path variables that can include interpolated variables.
It is used in the form:
/path identifier = "path/to/something"
/path identifier = path/with/@variables
*/

// Core content handlers (context, tokens, whitespace, variables, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL PATH DIRECTIVE
// -------------------------------------------------------------

// Primary /path directive - handles bracketed paths using proper abstraction
SlashPath
  // Double quoted string path with @var interpolation
  = DirectiveContext "/path" _ "@" id:BaseIdentifier _ "=" _ quote:UnifiedDoubleQuote tail:TailModifiers? comment:InlineComment? {
      helpers.debug('SlashPath matched double quoted string with interpolation', { id, quote });
      
      // Extract content from unified quote
      const content = quote.content;
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      
      // Check if content has variables
      const hasVariables = content.some(part => 
        part && part.type === NodeType.VariableReference
      );
      
      // Build values object
      const values = {
        identifier: [idNode],
        path: content
      };
      
      // Add withClause if tail modifiers present
      if (tail) {
        values.withClause = tail;
      }
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        values,
        {},  // No raw field needed - simple string values provide no debugging benefit
        {
          path: helpers.createPathMetadata(helpers.reconstructRawString(content), content)
        },
        location(),
        'path'
      );
    }
  // Single quoted string path (literal, no interpolation)
  / DirectiveContext "/path" _ "@" id:BaseIdentifier _ "=" _ "'" content:$([^']*) "'" tail:TailModifiers? comment:InlineComment? {
      helpers.debug('SlashPath matched single quoted string (literal)', { id, content, tail });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      
      // Create path parts - literal content
      const pathParts = [helpers.createNode(NodeType.Text, { content, location: location() })];
      
      // Build values object
      const values = {
        identifier: [idNode],
        path: pathParts
      };
      
      // Add withClause if tail modifiers present
      if (tail) {
        values.withClause = tail;
      }
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        values,
        {},  // No raw field needed
        {
          path: helpers.createPathMetadata(content, pathParts)
        },
        location(),
        'path'
      );
    }
  // REMOVED: Bracketed path syntax - use quoted strings instead
  / DirectiveContext "/path" _ "@" id:BaseIdentifier _ "=" _ path:PathExpression tail:TailModifiers? comment:InlineComment? {
      helpers.debug('SlashPath matched normal path', { id, path, tail });
      
      // Process special path variables
      let processedPath = path.raw.path || path.raw.url;
      if (processedPath.includes('@.')) {
        processedPath = processedPath
          .replace(/@\./g, '@PROJECTPATH');
      }
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      
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
      
      // Build values object
      const values = {
        identifier: [idNode],
        path: processedPathParts
      };
      
      // Add withClause if tail modifiers present
      if (tail) {
        values.withClause = tail;
      }
      
      return helpers.createStructuredDirective(
        'path',
        'pathAssignment',
        values,
        {},  // No raw field needed - values contain all necessary information
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

// Path parts for path assignment - allows @var interpolation
PathAssignmentParts
  = parts:(UnifiedVariableNoTail / PathTextSegment / PathSeparator)* {
      return parts;
    }


// Special path identifiers
SpecialPathIdentifier
  = "PROJECTPATH" / "." {
      return text();
    }

// Path syntax uses PathExpression from patterns/path-expression.peggy for quoted paths
