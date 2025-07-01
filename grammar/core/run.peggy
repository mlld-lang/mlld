// RUN CORE
// Core content handlers for run directive logic without directive wrapper

/* 
# Run Content Core

This file provides core run content handling that can be used by:
- @run directive for executing commands
- @data directive for embedded run operations
- Other contexts requiring run functionality

The cores extract the essential logic without the directive wrapper,
allowing reuse in RHS patterns and embedded contexts.
*/

// -------------------------------------------------------------
// RUN EXEC CORE - Execute a previously defined command
// -------------------------------------------------------------

RunExecCore
  = commandRef:UnifiedReferenceNoTail {
      helpers.debug('RunExecCore matched unified command reference', { commandRef });
      
      // Handle both ExecInvocation and VariableReference types from unified patterns
      let values, raw, meta;
      
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
        meta = {
          argumentCount: commandRef.commandRef.args ? commandRef.commandRef.args.length : 0
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
        meta = {
          argumentCount: 0
        };
      }
      
      return {
        type: 'runExec',
        values,
        raw,
        meta
      };
    }

// -------------------------------------------------------------
// REFERENCES TO EXISTING RULES
// -------------------------------------------------------------
// These rules are available from unified patterns:
// - UnifiedReferenceNoTail (from unified-reference.peggy)
// - UnifiedReferenceWithTail (from unified-reference.peggy)
// - VariableNoTail (from unified-reference.peggy)
// - VariableWithTail (from unified-reference.peggy)