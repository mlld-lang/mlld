import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate, resolveVariableValue } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';

/**
 * Evaluate @run directives.
 * Executes commands/code and returns output as replacement nodes.
 * 
 * Ported from RunDirectiveHandler.
 */
export async function evaluateRun(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  let output = '';
  
  // Create execution context with source information
  const executionContext = {
    sourceLocation: directive.location,
    directiveNode: directive,
    filePath: env.getCurrentFilePath(),
    directiveType: directive.directiveType || 'run'
  };
  
  if (directive.subtype === 'runCommand') {
    // Handle command execution
    const commandNodes = directive.values?.identifier || directive.values?.command;
    if (!commandNodes) {
      throw new Error('Run command directive missing command');
    }
    
    // Interpolate command (resolve variables) with shell command context
    const command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand);
    
    // Execute the command with context for rich error reporting
    output = await env.executeCommand(command, undefined, executionContext);
    
  } else if (directive.subtype === 'runCode') {
    // Handle code execution
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Run code directive missing code');
    }
    
    // Get the code - use default context for code blocks
    const code = await interpolate(codeNodes, env, InterpolationContext.Default);
    
    // Execute the code (default to JavaScript) with context for errors
    const language = directive.raw?.lang || directive.meta?.language || 'javascript';
    output = await env.executeCode(code, language, undefined, executionContext);
    
  } else if (directive.subtype === 'runExec') {
    // Handle exec reference
    const execRef = directive.raw?.identifier;
    if (!execRef) {
      throw new Error('Run exec directive missing exec reference');
    }
    
    // Get the command variable from environment
    const cmdVar = env.getVariable(execRef);
    if (!cmdVar || cmdVar.type !== 'command') {
      throw new Error(`Command variable not found: ${execRef}`);
    }
    
    const cmdDef = cmdVar.value;
    
    // Get arguments from the run directive
    const args = directive.values?.args || [];
    const argValues: Record<string, any> = {};
    
    // Map parameter names to argument values
    if (cmdDef.paramNames && cmdDef.paramNames.length > 0) {
      for (let i = 0; i < cmdDef.paramNames.length; i++) {
        const paramName = cmdDef.paramNames[i];
        if (!args[i]) {
          argValues[paramName] = '';
          continue;
        }
        
        // Handle variable references in arguments
        const arg = args[i];
        if (arg.type === 'Text' && arg.content && arg.content.startsWith('@')) {
          // This is a variable reference
          const varName = arg.content.substring(1);
          const variable = env.getVariable(varName);
          if (variable) {
            // Resolve the variable value
            const value = await resolveVariableValue(variable, env);
            argValues[paramName] = value;
          } else {
            // Variable not found, keep as-is
            argValues[paramName] = arg.content;
          }
        } else {
          // Normal interpolation
          const argValue = await interpolate([arg], env, InterpolationContext.Default);
          argValues[paramName] = argValue;
        }
      }
    }
    
    if (cmdDef.type === 'command') {
      // Create a temporary environment with parameter values
      const tempEnv = env.createChild();
      for (const [key, value] of Object.entries(argValues)) {
        tempEnv.setParameterVariable(key, { type: 'text', value, nodeId: '', location: { line: 0, column: 0 } });
      }
      
      // TODO: Remove this workaround when issue #51 is fixed
      // Strip leading '[' from first command segment if present
      const cleanTemplate = cmdDef.commandTemplate.map((seg: any, idx: number) => {
        if (idx === 0 && seg.type === 'Text' && seg.content.startsWith('[')) {
          return { ...seg, content: seg.content.substring(1) };
        }
        return seg;
      });
      
      // Interpolate the command template with parameters
      const command = await interpolate(cleanTemplate, tempEnv, InterpolationContext.ShellCommand);
      // Pass context for exec command errors too
      output = await env.executeCommand(command, undefined, executionContext);
      
    } else if (cmdDef.type === 'commandRef') {
      // This command references another command
      const refCmdVar = env.getVariable(cmdDef.commandRef);
      if (!refCmdVar || refCmdVar.type !== 'command') {
        throw new Error(`Referenced command not found: ${cmdDef.commandRef}`);
      }
      
      // Create a new run directive for the referenced command
      const refDirective = {
        ...directive,
        values: {
          ...directive.values,
          identifier: [{ type: 'Text', content: cmdDef.commandRef }],
          args: cmdDef.commandArgs
        }
      };
      
      // Recursively evaluate the referenced command
      const result = await evaluateRun(refDirective, env);
      output = result.value;
      
    } else if (cmdDef.type === 'code') {
      // Interpolate the code template with parameters
      const tempEnv = env.createChild();
      for (const [key, value] of Object.entries(argValues)) {
        tempEnv.setParameterVariable(key, { type: 'text', value, nodeId: '', location: { line: 0, column: 0 } });
      }
      
      const code = await interpolate(cmdDef.codeTemplate, tempEnv, InterpolationContext.Default);
      output = await env.executeCode(code, cmdDef.language || 'javascript', argValues, executionContext);
    }
  } else {
    throw new Error(`Unsupported run subtype: ${directive.subtype}`);
  }
  
  // Output directives always end with a newline
  // This is the interpreter's responsibility, not the grammar's
  if (!output.endsWith('\n')) {
    output += '\n';
  }
  
  // Only add output nodes for non-embedded directives
  if (!directive.meta?.isDataValue) {
    // Create replacement text node with the output
    const replacementNode: TextNode = {
      type: 'Text',
      nodeId: `${directive.nodeId}-output`,
      content: output
    };
    
    // Add the replacement node to environment
    env.addNode(replacementNode);
  }
  
  // Return the output value
  return { value: output, env };
}