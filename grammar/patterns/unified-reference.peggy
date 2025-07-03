// UNIFIED REFERENCE PATTERNS
// Purpose: Consolidated, battle-tested patterns for all @variable and @exec() usage
// Replaces: 20+ duplicate patterns across the grammar
// Source: Best implementations from var-rhs.peggy and variables.peggy

// =============================================================================
// CORE UNIFIED PATTERNS (choose the right one based on syntax)
// =============================================================================

// Meta-pattern that chooses the right implementation based on syntax
UnifiedReference "unified variable or exec reference"
  = FieldAccessExec          // @obj.method(args) - must come first (most specific)
  / SimpleExec               // @func(args) 
  / VariableWithTail         // @var.field with tail modifiers

// Context-aware wrappers for different usage contexts
UnifiedReferenceWithTail "unified reference with tail support"
  = UnifiedReference         // All patterns already support tail modifiers

UnifiedReferenceNoTail "unified reference without tail support"  
  = FieldAccessExecNoTail    // @obj.method(args) - no tail
  / SimpleExecNoTail         // @func(args) - no tail
  / VariableNoTail           // @var.field - no tail

// =============================================================================
// FIELD ACCESS EXEC PATTERN (Champion #1)
// =============================================================================
// Source: FieldAccessExecPattern from var-rhs.peggy (PROVEN to work!)
// Handles: @obj.field.method(args) with optional tail modifiers

FieldAccessExec "field access exec invocation"
  = "@" id:BaseIdentifier fields:AnyFieldAccess+ "(" args:CommandArgumentList? _ ")" tail:TailModifiers? {
      // Extract the last field as the method name
      const lastField = fields[fields.length - 1];
      const methodName = lastField.value;
      
      // Create variable reference for the object path (all fields except last)
      const objectFields = fields.slice(0, -1);
      const objectRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(objectFields.length > 0 ? { fields: objectFields } : {})
      }, location());
      
      // Create the exec invocation
      const ref = {
        name: methodName,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: methodName
        }, location())],
        args: args || [],
        isCommandReference: true,
        objectReference: objectRef
      };
      
      return {
        type: 'ExecInvocation',
        commandRef: ref,
        withClause: tail || null
      };
    }

FieldAccessExecNoTail "field access exec invocation without tail"
  = "@" id:BaseIdentifier fields:AnyFieldAccess+ "(" args:CommandArgumentList? _ ")" !TailModifiers {
      // Same logic as FieldAccessExec but no tail modifiers
      const lastField = fields[fields.length - 1];
      const methodName = lastField.value;
      
      const objectFields = fields.slice(0, -1);
      const objectRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(objectFields.length > 0 ? { fields: objectFields } : {})
      }, location());
      
      const ref = {
        name: methodName,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: methodName
        }, location())],
        args: args || [],
        isCommandReference: true,
        objectReference: objectRef
      };
      
      return {
        type: 'ExecInvocation',
        commandRef: ref,
        withClause: null
      };
    }

// =============================================================================
// SIMPLE EXEC PATTERN (Champion #2) 
// =============================================================================
// Source: ExecInvocationPattern from var-rhs.peggy
// Handles: @func(args) with optional tail modifiers

SimpleExec "simple exec invocation"
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" tail:TailModifiers? {
      // Create command reference with arguments
      const ref = {
        name,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: name
        }, location())],
        args: args || [],
        isCommandReference: true
      };
      
      return {
        type: 'ExecInvocation',
        commandRef: ref,
        withClause: tail || null
      };
    }

SimpleExecNoTail "simple exec invocation without tail"
  = "@" name:BaseIdentifier "(" args:CommandArgumentList? _ ")" !TailModifiers {
      const ref = {
        name,
        identifier: [helpers.createVariableReferenceNode('varIdentifier', {
          identifier: name
        }, location())],
        args: args || [],
        isCommandReference: true
      };
      
      return {
        type: 'ExecInvocation',
        commandRef: ref,
        withClause: null
      };
    }

// =============================================================================
// VARIABLE REFERENCE PATTERN (Champion #3)
// =============================================================================
// Source: VariableReferenceWithTail from variables.peggy
// Handles: @var.field with optional tail modifiers

VariableWithTail "variable reference with optional tail modifiers"
  = "@" id:BaseIdentifier !"(" fields:AnyFieldAccess* tail:TailModifiers? {
      const normalizedId = helpers.normalizePathVar(id);
      const varRef = helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
      
      if (tail) {
        // Wrap in a structure similar to ExecInvocation for consistency
        return {
          type: 'VariableReferenceWithTail',
          variable: varRef,
          withClause: tail
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