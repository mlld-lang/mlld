// OUTPUT SOURCE PATTERNS
// Purpose: Consolidated output source handling for all directive contexts
// Used by: /output directive, for loop actions, when actions
//
// This module provides a unified abstraction for parsing output sources across
// different directive contexts, ensuring consistent behavior and reducing duplication.

// Main output source pattern - supports all source types
OutputSource "output source"
  = OutputVariable      // Variable MUST come before exec invocation
  / OutputExecInvocation
  / OutputCommand  
  / OutputLiteral

// Context-specific variants for directives with limited source support
OutputSourceVariable "output source (variables only)"
  = OutputVariable

OutputSourceVarAndExec "output source (variables and exec)"
  = OutputVariable
  / OutputExecInvocation

// Unified reference (exec invocation or variable) with tail modifiers
OutputExecInvocation
  = "@" invocation:UnifiedReferenceWithTail {
      helpers.debug('OutputExecInvocation matched', { invocation });
      
      // Handle both ExecInvocation and VariableReferenceWithTail types
      const isExecInvocation = invocation.type === 'ExecInvocation';
      const rawValue = isExecInvocation ? invocation.commandRef.name : `@${invocation.variable.identifier}`;
      
      return {
        type: isExecInvocation ? 'exec' : 'variable',
        subtype: isExecInvocation ? 'outputExecInvocation' : 'outputVariable',
        values: invocation,
        raw: {
          [isExecInvocation ? 'commandName' : 'variable']: rawValue
        }
      };
    }

// Variable reference with optional arguments (includes templates and commands)
OutputVariable
  = ref:UnifiedReferenceNoTail !("|" / "with" / "trust" / "needs") {
      // Handle both ExecInvocation and VariableReference types from unified patterns
      let values, raw, subtype;
      
      if (ref.type === 'ExecInvocation') {
        // Function/method call with arguments
        values = {
          identifier: ref.commandRef.identifier,
          args: ref.commandRef.args || []
        };
        raw = {
          identifier: ref.commandRef.name,
          args: ref.commandRef.args ? ref.commandRef.args.map(arg => 
            arg.type === NodeType.Text ? arg.content : 
            arg.type === NodeType.VariableReference ? '@' + arg.identifier : ''
          ) : []
        };
        subtype = 'outputInvocation';
      } else {
        // Plain variable reference
        values = {
          identifier: [ref],
          args: [],
          ...(ref.fields && ref.fields.length > 0 ? { fields: ref.fields } : {})
        };
        raw = {
          identifier: ref.identifier,
          ...(ref.fields && ref.fields.length > 0 ? { fields: ref.fields.map(f => f.value) } : {})
        };
        subtype = 'outputVariable';
      }
      
      return {
        type: 'variable',
        subtype,
        values,
        raw
      };
    }

// Command reference (for exec commands)
OutputCommand
  = "@run" _ commandRef:UnifiedReferenceNoTail {
      helpers.debug('OutputCommand matched unified reference', { commandRef });
      
      // Handle both ExecInvocation and VariableReference types from unified patterns
      let values, raw;
      
      if (commandRef.type === 'ExecInvocation') {
        values = {
          identifier: commandRef.commandRef.identifier,
          args: commandRef.commandRef.args || []
        };
        raw = {
          identifier: commandRef.commandRef.name,
          args: commandRef.commandRef.args ? commandRef.commandRef.args.map(arg => 
            arg.type === NodeType.Text ? arg.content : 
            arg.type === NodeType.VariableReference ? '@' + arg.identifier : ''
          ) : []
        };
      } else {
        // Plain variable reference
        values = {
          identifier: [commandRef],
          args: []
        };
        raw = {
          identifier: commandRef.identifier,
          args: []
        };
      }
      
      return {
        type: 'command',
        subtype: 'outputCommand',
        values,
        raw
      };
    }

// Literal text output - now supports all quote types and templates with interpolation
OutputLiteral
  = source:UnifiedQuoteOrTemplate {
      return {
        type: 'literal',
        subtype: 'outputLiteral',
        values: source.content,  // Array of nodes ready for interpolation
        raw: source,
        meta: {
          wrapperType: source.wrapperType,
          hasInterpolation: source.hasInterpolation || false
        }
      };
    }