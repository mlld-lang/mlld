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


// -------------------------------------------------------------
// COMMAND CORE - Standard command with interpolation
// -------------------------------------------------------------

CommandCore
  = command:WrappedCommandContent {
      helpers.debug('CommandCore matched command', { command });
      
      // Try to parse the command string with the shell parser to extract command bases
      let commandBases = [];
      let rawBases = [];
      let hasScriptRunner = false;
      
      // First, try to use the shell parser on the raw command string
      try {
        // We need to parse the raw command string to detect pipes and command bases
        const rawCommandString = command.raw;
        
        // Use a simplified regex-based approach to detect command bases
        // This handles pipes, &&, ||, and ; operators
        const commandSegments = rawCommandString.split(/\s*(\||&&|\|\||;)\s*/);
        
        for (let i = 0; i < commandSegments.length; i += 2) {
          const segment = commandSegments[i].trim();
          if (!segment) continue;
          
          // Extract the first word as the command base
          const match = segment.match(/^(\S+)/);
          if (match) {
            const cmdBase = match[1];
            
            // Check for script runner patterns
            const runnerMatch = segment.match(/^(npm|yarn|pnpm|bun)\s+run\s+(\S+)/);
            if (runnerMatch) {
              commandBases.push(helpers.createNode(NodeType.CommandBase, {
                command: runnerMatch[1] + ' run',
                script: runnerMatch[2],
                isScriptRunner: true,
                location: location()
              }));
              rawBases.push(runnerMatch[1] + ' run');
              hasScriptRunner = true;
            } else if (segment.match(/^npx\s+(\S+)/)) {
              const npxMatch = segment.match(/^npx\s+(\S+)/);
              commandBases.push(helpers.createNode(NodeType.CommandBase, {
                command: 'npx',
                package: npxMatch[1],
                isPackageRunner: true,
                location: location()
              }));
              rawBases.push('npx');
              hasScriptRunner = true;
            } else if (segment.match(/^python\s+-m\s+(\S+)/)) {
              const pythonMatch = segment.match(/^python\s+-m\s+(\S+)/);
              commandBases.push(helpers.createNode(NodeType.CommandBase, {
                command: 'python -m',
                module: pythonMatch[1],
                location: location()
              }));
              rawBases.push('python -m');
            } else {
              // Regular command
              commandBases.push(helpers.createNode(NodeType.CommandBase, {
                command: cmdBase,
                location: location()
              }));
              rawBases.push(cmdBase);
            }
          }
        }
      } catch (e) {
        // Fallback to simple detection if parsing fails
        helpers.debug('Shell parsing failed, using simple detection', { error: e.message });
        
        if (command.parts && command.parts.length > 0) {
          const firstPart = command.parts[0];
          if (firstPart.type === NodeType.Text && firstPart.content) {
            const cmdText = firstPart.content.trim();
            commandBases.push(helpers.createNode(NodeType.CommandBase, {
              command: cmdText,
              location: firstPart.location
            }));
            rawBases.push(cmdText);
          }
        }
      }
    
      // Structure for outputting a shell command with command bases
      return {
        type: 'command',
        subtype: 'shellCommand',
        values: { 
          command: command.parts,
          commandBases: commandBases
        },
        raw: { 
          command: command.raw,
          commandBases: rawBases
        },
        meta: {
          ...helpers.createCommandMetadata(command.parts),
          commandCount: commandBases.length,
          hasScriptRunner: hasScriptRunner
        }
      };
    }

// -------------------------------------------------------------
// PARAMETERIZED COMMAND CORE - Command with explicit parameters
// -------------------------------------------------------------

ParameterizedCommandCore
  = command:WrappedCommandContent params:CommandParameters? {
      helpers.debug('ParameterizedCommandCore matched', { command, params });
      
      // Use the same command base detection logic
      const commandBases = [];
      const rawBases = [];
      let hasScriptRunner = false;
      
      if (command.parts && command.parts.length > 0) {
        const firstPart = command.parts[0];
        if (firstPart.type === NodeType.Text && firstPart.content) {
          const cmdText = firstPart.content.trim();
          commandBases.push(helpers.createNode(NodeType.CommandBase, {
            command: cmdText,
            location: firstPart.location
          }));
          rawBases.push(cmdText);
        }
      }
    
      // Structure for outputting a command with parameters
      return {
        type: 'command',
        subtype: 'parametrizedCommand',
        values: { 
          command: command.parts,
          commandBases: commandBases,
          ...(params ? { params: params.values } : {})
        },
        raw: { 
          command: command.raw,
          commandBases: rawBases,
          ...(params ? { params: params.raw } : {})
        },
        meta: {
          ...helpers.createCommandMetadata(command.parts),
          commandCount: commandBases.length,
          hasScriptRunner: hasScriptRunner,
          hasParams: !!params
        }
      };
    }

// -------------------------------------------------------------
// COMMAND PARAMETERS - Explicit key-value parameters for commands
// -------------------------------------------------------------

CommandParameters
  = ":" _ params:CommandParameterList {
      return params;
    }

CommandParameterList
  = first:CommandParameter rest:(_ "," _ param:CommandParameter { return param; })* {
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

CommandParameter
  = key:BaseIdentifier _ "=" _ value:(StringLiteral / NumberLiteral / BooleanLiteral) {
      return { key, value };
    }