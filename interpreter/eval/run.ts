import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';

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
  
  if (directive.subtype === 'runCommand') {
    // Handle command execution
    const commandNodes = directive.values?.identifier || directive.values?.command;
    if (!commandNodes) {
      throw new Error('Run command directive missing command');
    }
    
    // Interpolate command (resolve variables)
    const command = await interpolate(commandNodes, env);
    
    // Execute the command
    output = await env.executeCommand(command);
    
  } else if (directive.subtype === 'runCode') {
    // Handle code execution
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Run code directive missing code');
    }
    
    // Get the code
    const code = await interpolate(codeNodes, env);
    
    // Execute the code (default to JavaScript)
    const language = directive.raw?.language || 'javascript';
    output = await env.executeCode(code, language);
    
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
        const argValue = args[i] ? await interpolate([args[i]], env) : '';
        argValues[paramName] = argValue;
      }
    }
    
    if (cmdDef.type === 'command') {
      // Create a temporary environment with parameter values
      const tempEnv = env.createChild();
      for (const [key, value] of Object.entries(argValues)) {
        tempEnv.setVariable(key, { type: 'text', value, nodeId: '', location: null });
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
      const command = await interpolate(cleanTemplate, tempEnv);
      output = await env.executeCommand(command);
      
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
        tempEnv.setVariable(key, { type: 'text', value, nodeId: '', location: null });
      }
      
      const code = await interpolate(cmdDef.codeTemplate, tempEnv);
      output = await env.executeCode(code, cmdDef.language || 'javascript', argValues);
    }
  } else {
    throw new Error(`Unsupported run subtype: ${directive.subtype}`);
  }
  
  // Output directives always end with a newline
  // This is the interpreter's responsibility, not the grammar's
  if (!output.endsWith('\n')) {
    output += '\n';
  }
  
  // Create replacement text node with the output
  const replacementNode: TextNode = {
    type: 'Text',
    nodeId: `${directive.nodeId}-output`,
    content: output
  };
  
  // Add the replacement node to environment
  env.addNode(replacementNode);
  
  // Return the output value
  return { value: output, env };
}