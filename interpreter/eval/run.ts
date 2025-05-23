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
    const execRef = directive.raw?.execRef;
    if (!execRef) {
      throw new Error('Run exec directive missing exec reference');
    }
    
    // Get the command variable from environment
    const cmdVar = env.getVariable(execRef);
    if (!cmdVar || cmdVar.type !== 'command') {
      throw new Error(`Command variable not found: ${execRef}`);
    }
    
    const cmdDef = cmdVar.value;
    if ('executableName' in cmdDef) {
      // It's a command
      const fullCommand = `${cmdDef.executableName} ${cmdDef.args.join(' ')}`;
      output = await env.executeCommand(fullCommand);
    } else if ('code' in cmdDef) {
      // It's code
      output = await env.executeCode(cmdDef.code, cmdDef.language || 'javascript');
    }
  } else {
    throw new Error(`Unsupported run subtype: ${directive.subtype}`);
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