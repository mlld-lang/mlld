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
  = "@" commandRef:RunCommandReference {
      helpers.debug('RunExecCore matched command reference', { commandRef });
      
      return {
        type: 'runExec',
        values: {
          identifier: commandRef.identifier,
          args: commandRef.args || []
        },
        raw: {
          identifier: commandRef.rawIdentifier,
          args: commandRef.rawArgs || []
        },
        meta: {
          argumentCount: commandRef.args ? commandRef.args.length : 0
        }
      };
    }

// -------------------------------------------------------------
// REFERENCES TO EXISTING RULES
// -------------------------------------------------------------
// These rules are defined in run.peggy and will be available
// during the build process:
// - RunCommandReference
// - RunCommandArguments
// - RunCommandArgumentList
// - RunCommandArgument