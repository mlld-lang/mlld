// VAR DIRECTIVE - Unified variable assignment
// Replaces: /text and /data directives - DELETED with no backward compatibility
// Purpose: Single directive for all variable types with type inference from syntax

SlashVar "var directive"
  = DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent tail:TailModifiers? security:(_ s:SecurityOptions { return s; })? {
      helpers.debug('AtVar matched', { id, value, tail });
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // Process the value based on its structure
      let processedValue;
      let metaInfo = {};
      
      // Handle template content (backtick, [[...]], quotes)
      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';
      }
      // Handle object literals (already typed by DataObjectLiteral)
      else if (value && value.type === 'object') {
        processedValue = value;
        metaInfo.inferredType = 'object';
      }
      // Handle array literals
      else if (value && value.type === 'array') {
        processedValue = value;
        metaInfo.inferredType = 'array';
        metaInfo.isEmptyArray = value.items.length === 0;
      }
      // Handle section extraction
      else if (value && value.type === 'section') {
        processedValue = value;
        metaInfo.inferredType = 'section-content';
      }
      // Handle path dereference (array of nodes)
      else if (Array.isArray(value)) {
        processedValue = value;
        metaInfo.inferredType = 'file-content';
      }
      // Handle variable references
      else if (value && value.type === 'variableReference') {
        processedValue = [value.value];
        metaInfo.inferredType = 'reference';
      }
      // Handle nested directives
      else if (value && value.type === 'nestedDirective') {
        processedValue = value.directive;
        metaInfo.inferredType = 'computed';
        metaInfo.isDataValue = true;
      }
      // Handle code execution (both 'run' keyword and shorthand)
      else if (value && value.type === 'code') {
        processedValue = {
          type: 'code',
          language: value.language,
          code: value.code
        };
        metaInfo.inferredType = 'computed';
        metaInfo.language = value.language;
        metaInfo.hasRunKeyword = value.hasRunKeyword;
      }
      // Handle command execution (run {command})
      else if (value && value.type === 'command') {
        processedValue = {
          type: 'command',
          command: value.command
        };
        metaInfo.inferredType = 'computed';
        metaInfo.hasRunKeyword = value.hasRunKeyword;
      }
      // Handle foreach expressions
      else if (value && value.type === 'foreach-command') {
        processedValue = value.value;
        metaInfo.inferredType = 'computed';
        metaInfo.isForeach = true;
      }
      // Handle primitive values (numbers, booleans, null)
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        processedValue = value;
        metaInfo.inferredType = 'primitive';
        metaInfo.primitiveType = value === null ? 'null' : typeof value;
      }
      // Handle other types
      else {
        processedValue = value;
        metaInfo.inferredType = 'unknown';
      }
      
      // Create the values object
      const values = {
        identifier: idNode,
        value: processedValue
      };
      
      // Add withClause from tail if present
      if (tail) {
        values.withClause = tail;
        metaInfo.withClause = tail;
      }
      
      // Apply security options if present
      if (security) {
        metaInfo.security = security;
      }
      
      // Create directive with 'var' kind and single subtype
      return helpers.createStructuredDirective(
        DirectiveKind.var,
        'var',  // Single unified subtype
        values,
        {}, // raw object
        metaInfo,
        location()
      );
    }
    
  // Error: Unclosed array literal
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ "[" &{
      return helpers.isUnclosedArray(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed array in /var directive. Expected ']' to close the array.", "]", location());
    }
    
  // Error: Unclosed object literal
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ "{" &{
      return helpers.isUnclosedObject(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed object in /var directive. Expected closing brace to close the object.", String.fromCharCode(125), location());
    }
    
  // Error: Unclosed string (double quotes)
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ '"' &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, '"');
    } {
      helpers.mlldError("Unclosed string in /var directive. Expected closing double quote (\").", "\"", location());
    }
    
  // Error: Unclosed string (single quotes)
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ "'" &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, "'");
    } {
      helpers.mlldError("Unclosed string in /var directive. Expected closing single quote.", "'", location());
    }
    
  // Error: Unclosed template
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ "::" &{
      return helpers.isUnclosedTemplate(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed template in /var directive. Expected closing '::' delimiter.", "::", location());
    }
    
  // Error: Missing value after =
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing value in /var directive. Expected a value after '=' for variable '@" + id + "'.", "value", location());
    }
    
  // Error: Missing = after variable name
  / DirectiveContext "/var" _ "@" id:BaseIdentifier _ &{
      // Look ahead to see if there's content but no =
      const rest = input.substring(peg$currPos).trim();
      return rest.length > 0 && rest[0] !== '=';
    } {
      helpers.mlldError("Invalid /var syntax. Expected '=' after variable name '@" + id + "'.", "=", location());
    }
    
  // Error: Missing @ before variable name
  / DirectiveContext "/var" _ id:BaseIdentifier _ "=" {
      const varLoc = location(); // Use built-in location() function
      helpers.mlldError("Missing '@' before variable name in /var directive. Use: /var @" + id + " = value", "@", varLoc);
    }
    
  // Error: Missing variable name after @
  / DirectiveContext "/var" _ "@" _ &{
      // Check if next character is not a valid identifier start
      const nextChar = input[peg$currPos];
      return !/[a-zA-Z_]/.test(nextChar);
    } {
      const atLoc = location(); // Use built-in location() function
      helpers.mlldError("Invalid variable name in /var directive. Variable names must start with a letter or underscore.", "identifier", atLoc);
    }
    
  // Error: Generic /var syntax error
  / DirectiveContext "/var" {
      helpers.mlldError("Invalid /var syntax. Expected: /var @name = value", "@", location());
    }