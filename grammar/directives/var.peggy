// VAR DIRECTIVE - Unified variable assignment
// Replaces: /text and /data directives - DELETED with no backward compatibility
// Purpose: Single directive for all variable types with type inference from syntax

VarKeyword
  = "/"? "var"

SlashVar "var directive"
  = DirectiveContext VarKeyword toolsSegment:(HWS "tools")? labelsSegment:(HWS DataLabelList HWS &"@")? _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent ending:SecuredDirectiveEnding {
      helpers.debug('AtVar matched', { id, value, ending });
      
      // Extract ending components
      let tail = ending.tail;
      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      const isToolsCollection = !!toolsSegment;
      const comment = ending.comment;
      
      // Create variable reference node for identifier
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      
      // Process the value based on its structure
      let processedValue;
      let metaInfo = {};
      
      // Handle template content (backtick, [[...]], quotes)
      if (value && value.content && value.wrapperType) {
        processedValue = value.content; // value.content is already an array of nodes
        
        // Ensure we never have empty arrays - create empty text node if needed
        if (processedValue.length === 0) {
          processedValue = [helpers.createNode(NodeType.Text, { content: '', location: location() })];
        }
        
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';
        metaInfo.rawTemplate = value.raw || helpers.reconstructRawString(processedValue);
        
        // Check if template has a pipeline attached
        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }
        // Note: Pipeline is preserved for all wrapper types (backtick, doubleColon, tripleColon)
        // to allow `var @x = \`template\` | log` syntax to work consistently
      }
      // Handle object literals (already typed by DataObjectLiteral)
      else if (value && value.type === 'object') {
        processedValue = [value];
        metaInfo.inferredType = 'object';
      }
      // Handle array literals
      else if (value && value.type === 'array') {
        processedValue = [value];
        metaInfo.inferredType = 'array';
        metaInfo.isEmptyArray = value.items.length === 0;
      }
      // Handle alligator expressions (file/URL loading)
      else if (value && value.type === 'load-content') {
        processedValue = [value];
        metaInfo.inferredType = value.options && value.options.section ? 'section-content' : 'file-content';
        metaInfo.sourceType = value.source.type; // 'path' or 'url'
      }
      // Handle variable references
      else if (value && (value.type === 'variableReference' || value.type === 'VariableReference')) {
        // Store the variable reference node directly
        processedValue = [value];
        metaInfo.inferredType = 'reference';
        // Note: keep node-level condensed pipes on the VariableReference; they will be
        // applied during evaluation via applyCondensedPipes. Do not promote to tail.
      }
      // Handle variable references with tail modifiers
      else if (value && value.type === 'VariableReferenceWithTail') {
        processedValue = [value.variable];
        metaInfo.inferredType = 'reference';
        // Merge the withClause from the variable reference
        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }
      }
      // Handle leading parallel pipelines (|| @a() || @b())
      else if (value && value.type === 'LeadingParallelPipeline') {
        const placeholder = value.placeholder;
        processedValue = [placeholder];
        metaInfo.inferredType = 'pipeline';
        tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
      }
      // Handle nested directives
      else if (value && value.type === 'nestedDirective') {
        processedValue = [value.directive];
        metaInfo.inferredType = 'computed';
        metaInfo.isDataValue = true;
      }
      // Handle code execution (both 'run' keyword and shorthand)
      else if (value && value.type === 'code') {
        processedValue = [{
          type: 'code',
          language: value.language,
          code: value.code
        }];
        metaInfo.inferredType = 'computed';
        metaInfo.language = value.language;
        metaInfo.hasRunKeyword = value.hasRunKeyword;
      }
      // Handle command execution (run {command})
      else if (value && value.type === 'command') {
        processedValue = [{
          type: 'command',
          command: value.command
        }];
        metaInfo.inferredType = 'computed';
        metaInfo.hasRunKeyword = value.hasRunKeyword;
      }
      // Handle foreach expressions
      else if (value && value.type === 'foreach-command') {
        processedValue = [value.value];
        metaInfo.inferredType = 'computed';
        metaInfo.isForeach = true;
      }
      // Handle expressions (BinaryExpression, TernaryExpression, UnaryExpression)
      else if (value && (value.type === 'BinaryExpression' || value.type === 'TernaryExpression' || value.type === 'UnaryExpression')) {
        processedValue = [value];
        metaInfo.inferredType = 'expression';
        metaInfo.expressionType = value.type;
      }
      // Handle primitive values (numbers, booleans, null)
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        processedValue = [value];
        metaInfo.inferredType = 'primitive';
        metaInfo.primitiveType = value === null ? 'null' : typeof value;
      }
      // Handle other types
      else {
        processedValue = Array.isArray(value) ? value : [value];
        metaInfo.inferredType = 'unknown';
      }
      
      // Create the values object
      const values = {
        identifier: [idNode],
        value: processedValue
      };
      
      // Add withClause from tail if present
      if (tail) {
        values.withClause = tail;
        metaInfo.withClause = tail;
      }
      
      // Apply security options if present
      if (labelInfo) {
        metaInfo.securityLabels = labelInfo.labels;
        values.securityLabels = labelInfo.labels;
      }

      if (isToolsCollection) {
        metaInfo.isToolsCollection = true;
      }
      
      // Add comment to meta if present
      if (comment) {
        metaInfo.comment = comment;
      }
      
      const raw = {}; // raw object
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }

      // Create directive with 'var' kind and single subtype
      return helpers.createStructuredDirective(
        DirectiveKind.var,
        'var',  // Single unified subtype
        values,
        raw,
        metaInfo,
        location()
      );
    }

  // Error: Augmented assignment inside /var
  / DirectiveContext VarKeyword _ "@" id:BaseIdentifier _ "=" _ "@" augId:BaseIdentifier _ "+=" _ {
      helpers.mlldError(
        `Augmented assignment is not valid in /var directive. Use let @${augId} += value inside a block.`,
        "+=",
        location()
      );
    }
    
  // Error: Unclosed array literal
  / DirectiveContext VarKeyword _ "@" id:BaseIdentifier _ "=" _ "[" &{
      // peg$currPos is now after the '[', but isUnclosedArray expects to start from after '['
      // So we pass the current position which is correct
      return helpers.isUnclosedArray(input, peg$currPos);
    } {
      const reason = helpers.parserState.lastUnclosedReason;
      if (reason === 'commentInside') {
        helpers.mlldError("Comments (>>) are not allowed inside array literals. Place comments before the array or on a separate line.", ">>", location());
      } else {
        helpers.mlldError("Unclosed array in /var directive. Expected ']' to close the array.", "]", location());
      }
    }

  // Error: Unclosed object literal
  / DirectiveContext VarKeyword _ "@" id:BaseIdentifier _ "=" _ "{" &{
      return helpers.isUnclosedObject(input, peg$currPos);
    } {
      const reason = helpers.parserState.lastUnclosedReason;
      if (reason === 'commentInside') {
        helpers.mlldError("Comments (>>) are not allowed inside object literals. Place comments before the object or on a separate line.", ">>", location());
      } else {
        helpers.mlldError("Unclosed object in /var directive. Expected closing brace to close the object.", String.fromCharCode(125), location());
      }
    }
    
  // Error: Unclosed string (double quotes)
  / DirectiveContext VarKeyword _ "@" id:BaseIdentifier _ "=" _ '"' &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, '"');
    } {
      helpers.mlldError("Unclosed string in /var directive. Expected closing double quote (\").", "\"", location());
    }
    
  // Error: Unclosed string (single quotes)
  / DirectiveContext VarKeyword _ "@" id:BaseIdentifier _ "=" _ "'" &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, "'");
    } {
      helpers.mlldError("Unclosed string in /var directive. Expected closing single quote.", "'", location());
    }
    
  // Error: Unclosed template
  / DirectiveContext VarKeyword _ "@" id:BaseIdentifier _ "=" _ "::" &{
      return helpers.isUnclosedTemplate(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed template in /var directive. Expected closing '::' delimiter.", "::", location());
    }
    
  // Error: Missing value after =
  / DirectiveContext VarKeyword _ "@" id:BaseIdentifier _ "=" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing value in var directive. Expected a value after '=' for variable '@" + id + "'.", "value", location());
    }

  // Error: Missing = after variable name
  / DirectiveContext VarKeyword _ "@" id:BaseIdentifier _ &{
      // Look ahead to see if there's content but no =
      const rest = input.substring(peg$currPos).trim();
      return rest.length > 0 && rest[0] !== '=';
    } {
      helpers.mlldError("Invalid var syntax. Expected '=' after variable name '@" + id + "'.", "=", location());
    }

  // Error: Missing @ before variable name
  / DirectiveContext VarKeyword _ id:BaseIdentifier _ "=" {
      const varLoc = location(); // Use built-in location() function
      helpers.mlldError("Missing '@' before variable name in var directive. Use: var @" + id + " = value", "@", varLoc);
    }

  // Error: Missing variable name after @
  / DirectiveContext VarKeyword _ "@" _ &{
      // Check if next character is not a valid identifier start
      const nextChar = input[peg$currPos];
      return !/[a-zA-Z_]/.test(nextChar);
    } {
      const atLoc = location(); // Use built-in location() function
      helpers.mlldError("Invalid variable name in var directive. Variable names must start with a letter or underscore.", "identifier", atLoc);
    }

  // Error: Generic var syntax error
  / DirectiveContext VarKeyword {
      helpers.mlldError("Invalid var syntax. Expected: var @name = value", "@", location());
    }
