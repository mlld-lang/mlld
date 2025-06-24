// VAR DIRECTIVE - Unified variable assignment
// Replaces: /text and /data directives - DELETED with no backward compatibility
// Purpose: Single directive for all variable types with type inference from syntax

SlashVar "var directive"
  = DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent security:(_ s:SecurityOptions { return s; })? {
      helpers.debug('AtVar matched', { id, value });
      
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
      // Handle object literals
      else if (value && typeof value === 'object' && !Array.isArray(value) && !value.type) {
        processedValue = {
          type: 'object',
          properties: value
        };
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