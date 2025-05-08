// COMMAND CORE
// Core content handler for shell commands with variable interpolation

/* 
# Command Content Core

This file provides core command content handling that can be used by:
- @run directive for executing shell commands
- @exec directive for executing commands with return values

Commands can contain:
- Shell command text
- Variable interpolation with @var
- Spaces and arguments
*/

// Import base patterns
import './base/context.peggy';
import './base/tokens.peggy';
import './base/whitespace.peggy';
import './patterns/variables.peggy';
import './patterns/content.peggy';

// -------------------------------------------------------------
// COMMAND CORE - Standard command with interpolation
// -------------------------------------------------------------

CommandCore
  = command:WrappedCommandContent {
      helpers.debug('CommandCore matched command', { command });
    
      // Structure for outputting a shell command
      return {
        type: 'command',
        subtype: 'shellCommand',
        values: { 
          command: command.parts 
        },
        raw: { 
          command: command.raw 
        },
        meta: {
          hasVariables: command.parts.some(part => 
            part && part.type === NodeType.VariableReference
          )
        }
      };
    }

// -------------------------------------------------------------
// PARAMETERIZED COMMAND CORE - Command with explicit parameters
// -------------------------------------------------------------

ParameterizedCommandCore
  = command:WrappedCommandContent params:CommandParams? {
      helpers.debug('ParameterizedCommandCore matched', { command, params });
    
      // Structure for outputting a command with parameters
      return {
        type: 'command',
        subtype: 'parametrizedCommand',
        values: { 
          command: command.parts,
          ...(params ? { params: params.values } : {})
        },
        raw: { 
          command: command.raw,
          ...(params ? { params: params.raw } : {})
        },
        meta: {
          hasVariables: command.parts.some(part => 
            part && part.type === NodeType.VariableReference
          ),
          hasParams: !!params
        }
      };
    }

// -------------------------------------------------------------
// COMMAND PARAMETERS - Explicit key-value parameters for commands
// -------------------------------------------------------------

CommandParams
  = ":" _ params:CommandParamsList {
      return params;
    }

CommandParamsList
  = first:CommandParam rest:(_ "," _ param:CommandParam { return param; })* {
      const allParams = [first, ...rest];
      
      // Extract values and raw representation
      const values = allParams.reduce((acc, param) => {
        acc[param.key] = param.value;
        return acc;
      }, {});
      
      const raw = allParams.map(param => 
        `${param.key}=${typeof param.value === 'string' ? 
          JSON.stringify(param.value) : param.value}`
      ).join(',');
      
      return { values, raw };
    }

CommandParam
  = key:BaseIdentifier _ "=" _ value:(StringLiteral / NumberLiteral / BooleanLiteral) {
      return { key, value };
    }