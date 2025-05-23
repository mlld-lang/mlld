import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate, evaluate } from '../core/interpreter';
import { parse } from '@core/ast/parser';
import * as path from 'path';

/**
 * Evaluate @import directives.
 * Processes other Meld files recursively with proper scoping.
 * 
 * Ported from ImportDirectiveHandler.
 */
export async function evaluateImport(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Get the path to import
  const pathNodes = directive.values?.path;
  if (!pathNodes) {
    throw new Error('Import directive missing path');
  }
  
  // Resolve the import path
  const importPath = await interpolate(pathNodes, env);
  const resolvedPath = env.resolvePath(importPath);
  
  // Read the file
  const content = await env.readFile(resolvedPath);
  
  // Handle section extraction if specified
  let processedContent = content;
  const section = directive.raw?.section;
  if (section) {
    processedContent = extractSection(content, section);
  }
  
  // Handle variable selection for importSelected
  const selectedVars = directive.raw?.selectedVars;
  
  // Parse the imported content
  const parseResult = await parse(processedContent);
  const ast = parseResult.ast;
  
  // Create a child environment for the imported file
  const importDir = path.dirname(resolvedPath);
  const childEnv = env.createChild(importDir);
  
  // Evaluate the imported file
  const result = await evaluate(ast, childEnv);
  
  // Handle variable merging based on import type
  if (directive.subtype === 'importAll') {
    // Import all variables from child to parent
    const childVars = childEnv.getAllVariables();
    for (const [name, variable] of childVars) {
      // Skip if this is a parent variable (don't re-import)
      if (env.hasVariable(name)) continue;
      env.setVariable(name, variable);
    }
    
  } else if (directive.subtype === 'importSelected' && selectedVars) {
    // Import only selected variables
    for (const varName of selectedVars) {
      const variable = childEnv.getVariable(varName);
      if (variable) {
        env.setVariable(varName, variable);
      }
    }
  }
  
  // Create replacement node (empty for imports)
  const replacementNode: TextNode = {
    type: 'Text',
    nodeId: `${directive.nodeId}-imported`,
    content: '' // Imports don't produce output
  };
  
  // Add the replacement node
  env.addNode(replacementNode);
  
  // Also add any nodes from the child environment
  const childNodes = childEnv.getNodes();
  for (const node of childNodes) {
    env.addNode(node);
  }
  
  // Return success
  return { value: undefined, env };
}

/**
 * Extract a section from markdown content.
 * Copied from add.ts - should probably be in a shared utility.
 */
function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\\n');
  const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
  
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];
  
  for (const line of lines) {
    if (!inSection && sectionRegex.test(line)) {
      inSection = true;
      sectionLevel = line.match(/^#+/)?.[0].length || 0;
      continue;
    }
    
    if (inSection) {
      const headerMatch = line.match(/^(#+)\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        break;
      }
      
      sectionLines.push(line);
    }
  }
  
  return sectionLines.join('\\n').trim();
}