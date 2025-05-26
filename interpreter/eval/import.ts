import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate, evaluate } from '../core/interpreter';
import { parse } from '@grammar/parser';
import * as path from 'path';

/**
 * Evaluate @import directives.
 * Processes other Mlld files recursively with proper scoping.
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
  
  // Check if this is a URL path based on the path node structure
  const pathNode = pathNodes[0]; // Assuming single path node for imports
  const isURL = pathNode?.subtype === 'urlPath' || pathNode?.subtype === 'urlSectionPath';
  
  // Resolve the import path (handles both file paths and URLs)
  const importPath = await interpolate(pathNodes, env);
  let resolvedPath: string;
  
  if (isURL || env.isURL(importPath)) {
    // For URLs, use the URL as-is (no path resolution needed)
    resolvedPath = importPath;
    
    // Check for circular imports
    if (env.isImporting(resolvedPath)) {
      throw new Error(`Circular import detected: ${resolvedPath}`);
    }
    
    // Mark that we're importing this URL
    env.beginImport(resolvedPath);
  } else {
    // For file paths, resolve relative to current basePath
    resolvedPath = await env.resolvePath(importPath);
  }
  
  try {
    // Read the file or fetch the URL
    // For URL imports, use the special import flag to trigger approval
    const content = isURL || env.isURL(resolvedPath) 
      ? await env.fetchURL(resolvedPath, true) // true = forImport
      : await env.readFile(resolvedPath);
    
    // Handle section extraction if specified
    let processedContent = content;
    const section = directive.raw?.section || pathNode?.values?.section;
    if (section) {
      processedContent = extractSection(content, section);
    }
    
    // Parse the imported content
    const parseResult = await parse(processedContent);
    const ast = parseResult.ast;
    
    // Create a child environment for the imported file
    // For URLs, use the current directory as basePath since URLs don't have directories
    const importDir = isURL ? env.getBasePath() : path.dirname(resolvedPath);
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
    
  } else if (directive.subtype === 'importSelected') {
    // Get selected variables from AST
    const imports = directive.values?.imports || [];
    for (const importNode of imports) {
      const varName = importNode.identifier;
      const variable = childEnv.getVariable(varName);
      if (variable) {
        // Use alias if provided, otherwise use original name
        const targetName = importNode.alias || varName;
        env.setVariable(targetName, variable);
      } else {
        // Variable not found in imported file
        throw new Error(`Variable '${varName}' not found in imported file: ${resolvedPath}`);
      }
    }
  }
  
  // Imports are definition directives - they don't produce output
  // Don't add any nodes to the environment
  
  // Return success
  return { value: undefined, env };
  } finally {
    // Clean up import tracking for URLs
    if (isURL || env.isURL(importPath)) {
      env.endImport(resolvedPath);
    }
  }
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