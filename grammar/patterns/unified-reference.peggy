// UNIFIED REFERENCE PATTERNS
// Purpose: Consolidated, battle-tested patterns for all @variable and @exec() usage

// =============================================================================
// CORE UNIFIED PATTERNS (choose the right one based on syntax)
// =============================================================================

// Meta-pattern that chooses the right implementation based on syntax
UnifiedReference "unified variable or exec reference"
  = ExecResultMethodCall     // @func(args).method(args) on exec result
  / FieldAccessExec          // @obj.method(args) - most specific object form
  / SimpleExec               // @func(args) 
  / VariableWithTail         // @var.field with tail modifiers

// Context-aware wrappers for different usage contexts
UnifiedReferenceWithTail "unified reference with tail support"
  = UnifiedReference         // All patterns already support tail modifiers

UnifiedReferenceNoTail "unified reference without tail support"  
  = ExecResultMethodCall     // @func(args).method(args) - no tail captured
  / FieldAccessExecNoTail    // @obj.method(args) - no tail
  / SimpleExecNoTail         // @func(args) - no tail
  / VariableNoTail           // @var.field - no tail

// Special pattern for use inside pipeline contexts
// This allows function arguments but prevents capturing tail modifiers
UnifiedReferenceForPipeline "unified reference for pipeline commands"
  = ExecResultMethodCall          // @func(args).method(args) - no tail capture
  / FieldAccessExecForPipeline    // @obj.method(args) - no tail capture
  / SimpleExecForPipeline         // @func(args) - no tail capture
  / VariableForPipeline           // @var.field - no tail capture

// =============================================================================
// FIELD ACCESS EXEC PATTERN 
// =============================================================================
// Source: FieldAccessExecPattern from var-rhs.peggy (PROVEN to work!)
// Handles: @obj.field.method(args) with optional tail modifiers

FieldAccessExec "field access exec invocation"
  = streamPrefix:StreamKeyword? _ "@" id:BaseIdentifier fields:AnyFieldAccess+ "(" args:CommandArgumentList? _ ")" post:PostFieldAccess* tail:TailModifiers? {
      helpers.debug('FieldAccessExec matched', { id, fields });
      
      // Extract the last field as the method name
      const lastField = fields[fields.length - 1];
      const methodName = lastField.value;
      
      // Create variable reference for the object path (all fields except last)
      const objectFields = fields.slice(0, -1);
      const objectRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(objectFields.length > 0 ? { fields: objectFields } : {})
      }, location());
      
      // Create the full path variable reference (id + all fields)
      const fullPathRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        fields: fields
      }, location());
      
      // Create the exec invocation
      const ref = {
        name: methodName,
        identifier: [fullPathRef],  // Use the full path reference instead of just method name
        args: args || [],
        isCommandReference: true,
        objectReference: objectRef
      };
      
      const finalTail = streamPrefix ? (tail ? { ...tail, stream: true } : { stream: true }) : tail;
      const exec = helpers.createExecInvocation(ref, finalTail || null, location());
      return helpers.attachPostFields(exec, post);
    }

FieldAccessExecNoTail "field access exec invocation without tail"
  = streamPrefix:StreamKeyword? _ "@" id:BaseIdentifier fields:AnyFieldAccess+ "(" args:CommandArgumentList? _ ")" post:PostFieldAccess* !TailModifiers {
      helpers.debug('FieldAccessExecNoTail matched', { id, fields });
      
      // Same logic as FieldAccessExec but no tail modifiers
      const lastField = fields[fields.length - 1];
      const methodName = lastField.value;
      
      const objectFields = fields.slice(0, -1);
      const objectRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(objectFields.length > 0 ? { fields: objectFields } : {})
      }, location());
      
      // Create the full path variable reference (id + all fields)
      const fullPathRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        fields: fields
      }, location());
      
      const ref = {
        name: methodName,
        identifier: [fullPathRef],  // Use the full path reference instead of just method name
        args: args || [],
        isCommandReference: true,
        objectReference: objectRef
      };
      
      const exec = helpers.createExecInvocation(ref, streamPrefix ? { stream: true } : null, location());
      return helpers.attachPostFields(exec, post);
    }

// =============================================================================
// SIMPLE EXEC PATTERN 
// =============================================================================
// Source: ExecInvocationPattern from var-rhs.peggy
// Handles: @func(args) with optional tail modifiers

SimpleExec "simple exec invocation"
  = streamPrefix:StreamKeyword? _ "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" post:PostFieldAccess* tail:TailModifiers? {
      // Create command reference with arguments
      const ref = {
        name,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: name
        }, location())],
        args: args || [],
        isCommandReference: true
      };
      
      const finalTail = streamPrefix ? (tail ? { ...tail, stream: true } : { stream: true }) : tail;
      const exec = helpers.createExecInvocation(ref, finalTail || null, location());
      return helpers.attachPostFields(exec, post);
    }

SimpleExecNoTail "simple exec invocation without tail"
  = streamPrefix:StreamKeyword? _ "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" post:PostFieldAccess* !TailModifiers {
      const ref = {
        name,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: name
        }, location())],
        args: args || [],
        isCommandReference: true
      };
      
      const exec = helpers.createExecInvocation(ref, streamPrefix ? { stream: true } : null, location());
      return helpers.attachPostFields(exec, post);
    }

// =============================================================================
// PIPELINE-SPECIFIC PATTERNS (No tail capture for use in pipeline contexts)
// =============================================================================

FieldAccessExecForPipeline "field access exec for pipeline"
  = streamPrefix:StreamKeyword? _ "@" id:BaseIdentifier fields:AnyFieldAccess+ "(" args:CommandArgumentList? _ ")" post:PostFieldAccess* {
      // Same as FieldAccessExecNoTail but without the negative lookahead
      const lastField = fields[fields.length - 1];
      const methodName = lastField.value;
      
      const objectFields = fields.slice(0, -1);
      const objectRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(objectFields.length > 0 ? { fields: objectFields } : {})
      }, location());
      
      const fullPathRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        fields: fields
      }, location());
      
      const ref = {
        name: methodName,
        identifier: [fullPathRef],
        args: args || [],
        isCommandReference: true,
        objectReference: objectRef
      };
      
      const exec = helpers.createExecInvocation(ref, streamPrefix ? { stream: true } : null, location());
      return helpers.attachPostFields(exec, post);
    }

SimpleExecForPipeline "simple exec for pipeline"
  = streamPrefix:StreamKeyword? _ "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" post:PostFieldAccess* {
      // Same as SimpleExecNoTail but without the negative lookahead
      const ref = {
        name,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: name
        }, location())],
        args: args || [],
        isCommandReference: true
      };
      
      const exec = helpers.createExecInvocation(ref, streamPrefix ? { stream: true } : null, location());
      return helpers.attachPostFields(exec, post);
    }

VariableForPipeline "variable reference for pipeline"
  = streamPrefix:StreamKeyword? _ "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* {
      // Same as VariableNoTail but without the negative lookahead
      const normalizedId = helpers.normalizePathVar(id);
      const variable = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      if (streamPrefix) {
        return {
          type: 'VariableReferenceWithTail',
          variable,
          withClause: { stream: true }
        };
      }
      return variable;
    }

// =============================================================================
// VARIABLE REFERENCE PATTERN 
// =============================================================================
// Source: VariableReferenceWithTail from variables.peggy
// Handles: @var.field with optional tail modifiers

VariableWithTail "variable reference with optional tail modifiers"
  = streamPrefix:StreamKeyword? _ "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* tail:TailModifiers? {
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      const finalTail = streamPrefix ? (tail ? { ...tail, stream: true } : { stream: true }) : tail;
      
      if (finalTail) {
        // Wrap in a structure similar to ExecInvocation for consistency
        return {
          type: 'VariableReferenceWithTail',
          variable: varRef,
          withClause: finalTail
        };
      }
      
      // No tail modifiers - return plain variable reference
      return varRef;
    }

VariableNoTail "variable reference without tail modifiers"
  = "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* !TailModifiers {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
