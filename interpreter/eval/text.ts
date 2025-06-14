import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { TemplateExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { createTextVariable, astLocationToSourceLocation } from '@core/types';
import { createExecutableVariable } from '@core/types/executable';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { evaluateForeachAsText, parseForeachOptions } from '../utils/foreach';
import { normalizeTemplateContent } from '../utils/blank-line-normalizer';

/**
 * Remove single blank lines but preserve multiple blank lines.
 * This helps match the expected output format.
 */
function compactBlankLines(content: string): string {
  // This operates on final output strings, not AST content
  // eslint-disable-next-line mlld/no-ast-string-manipulation
  return content.replace(/\n\n/g, '\n');
}

/**
 * Extract a section from markdown content.
 * TODO: Replace with llmxml.getSection() once integrated
 */
function extractSection(content: string, sectionName: string): string {
  // This operates on final markdown content, not AST
  // eslint-disable-next-line mlld/no-ast-string-manipulation
  const lines = content.split('\n');
  const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
  
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];
  
  for (const line of lines) {
    // Check if this line starts our section
    if (!inSection && sectionRegex.test(line)) {
      inSection = true;
      sectionLevel = line.match(/^#+/)?.[0].length || 0;
      continue; // Skip the header itself
    }
    
    // If we're in the section
    if (inSection) {
      // Check if we've hit another header at the same or higher level
      const headerMatch = line.match(/^(#+)\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        // We've left the section
        break;
      }
      
      sectionLines.push(line);
    }
  }
  
  return sectionLines.join('\n').trim();
}

/**
 * Evaluate @text directives.
 * Handles variable interpolation and both = and += operators.
 * Also handles parameterized text templates.
 * Now supports direct path and section extraction.
 * 
 * Ported from TextDirectiveHandler.
 */
export async function evaluateText(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Extract identifier - this is a variable name, not content to interpolate
  const identifierNodes = directive.values?.identifier;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Text directive missing identifier');
  }
  
  // For assignment directives, extract the variable name
  const identifierNode = identifierNodes[0];
  let identifier: string;
  
  if (identifierNode.type === 'Text' && 'content' in identifierNode) {
    // eslint-disable-next-line mlld/no-ast-string-manipulation
    identifier = (identifierNode as TextNode).content;
  } else if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
    identifier = (identifierNode as any).identifier;
  } else {
    throw new Error('Text directive identifier must be a simple variable name');
  }
  
  // Handle parameterized text templates
  if (directive.subtype === 'textTemplateDefinition') {
    // Extract parameter names from Parameter nodes
    const params = (directive.values?.params || []).map(p => {
      if (typeof p === 'string') {
        return p;
      } else if (p.type === 'Parameter') {
        return p.name;
      }
      return '';
    }).filter(Boolean);

    // Create template executable definition
    const templateDef: TemplateExecutable = {
      type: 'template',
      templateContent: directive.values?.content || [],
      paramNames: params,
      sourceDirective: 'text'
    };
    
    // Create and store the executable variable
    const variable = createExecutableVariable(identifier, templateDef, {
      definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
    });
    env.setVariable(identifier, variable);
    
    // Templates are definition directives, no output
    return { value: '', env };
  }
  
  let resolvedValue: string;
  
  // Handle foreach expressions (both command and section types)
  if (directive.subtype === 'textForeach' || directive.source === 'foreach' || directive.source === 'foreach-section') {
    const foreachExpression = directive.values?.foreach;
    if (!foreachExpression) {
      throw new Error('Text foreach directive missing foreach expression');
    }
    
    // Parse options from with clause if present
    const options = parseForeachOptions(directive.values?.withClause);
    
    // Evaluate foreach and format as text
    resolvedValue = await evaluateForeachAsText(foreachExpression, env, options);
    
  } else if (directive.source === 'path' && directive.subtype === 'textPath' && !directive.values?.section) {
    // Handle direct path content: @text content = [file.md] or @text content = file.md
    // For textAssignment with source='path', path is in content
    // For textPath subtype, path is in path
    const pathNodes = directive.values?.content || directive.values?.path;
    if (!pathNodes) {
      throw new Error('Text path directive missing path');
    }
    
    // Resolve the path
    const resolvedPath = await interpolate(pathNodes, env);
    if (!resolvedPath) {
      throw new Error('Text path directive resolved to empty path');
    }
    
    // Read the file content or fetch URL (env.readFile handles both)
    resolvedValue = await env.readFile(resolvedPath);
    
  } else if ((directive.source === 'section' || directive.source === 'directive') && directive.subtype === 'textPathSection') {
    // Handle section extraction: @text section = [file.md # Section] or @text section = @add [file.md # Section]
    const sectionNodes = directive.values?.sectionTitle;
    const pathNodes = directive.values?.path;
    
    if (!sectionNodes || !pathNodes) {
      throw new Error('Text section directive missing section title or path');
    }
    
    // Check if this is a URL path based on the path node structure
    const pathNode = pathNodes[0]; // Assuming single path node
    const isURL = pathNode?.subtype === 'urlPath' || pathNode?.subtype === 'urlSectionPath';
    
    // Get the section title
    const sectionTitle = await interpolate(sectionNodes, env);
    
    // Resolve the path
    const resolvedPath = await interpolate(pathNodes, env);
    
    // Read the file content or fetch URL (env.readFile handles both)
    const fileContent = await env.readFile(resolvedPath);
    
    // Extract the section using llmxml
    try {
      // getSection expects just the title without the # prefix
      const titleWithoutHash = sectionTitle.replace(/^#+\s*/, '');
      resolvedValue = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
        includeNested: true,
        includeTitle: true // Include the section title in output
      });
      // Compact blank lines and trim
      resolvedValue = compactBlankLines(resolvedValue).trimEnd();
    } catch (error) {
      // Fallback to basic extraction if llmxml fails
      resolvedValue = sectionTitle + '\n' + extractSection(fileContent, sectionTitle);
    }
    
    // Handle rename if present (could be 'rename' or 'newTitle' in the AST)
    const renameNodes = directive.values?.rename || directive.values?.newTitle;
    if (renameNodes) {
      const newTitle = await interpolate(renameNodes, env);
      // Replace the original section title with the new one
      const lines = resolvedValue.split('\n');
      if (lines.length > 0 && lines[0].match(/^#+\s/)) {
        // Handle three cases:
        // 1. Just header level: "###" -> change level only
        // 2. No header level: "Name" -> keep original level, replace text
        // 3. Full replacement: "### Name" -> replace entire line
        
        const newTitleTrimmed = newTitle.trim();
        const newHeadingMatch = newTitleTrimmed.match(/^(#+)(\s+(.*))?$/);
        
        if (newHeadingMatch) {
          // Case 1: Just header level (e.g., "###")
          if (!newHeadingMatch[3]) {
            const originalText = lines[0].replace(/^#+\s*/, '');
            lines[0] = `${newHeadingMatch[1]} ${originalText}`;
          } 
          // Case 3: Full replacement (e.g., "### Name")
          else {
            lines[0] = newTitleTrimmed;
          }
        } else {
          // Case 2: No header level (e.g., "Name")
          const originalLevel = lines[0].match(/^(#+)\s/)?.[1] || '#';
          lines[0] = `${originalLevel} ${newTitleTrimmed}`;
        }
        
        resolvedValue = lines.join('\n');
      } else {
        // If no heading found, prepend the new title
        resolvedValue = newTitle + '\n' + resolvedValue;
      }
    }
    
  } else if (directive.source === 'run') {
    // Check if this is a run source (e.g., @text result = @run [(echo "hello")] or @text result = @run @cmd(args))
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes)) {
      throw new Error('Text directive missing content');
    }
    
    // Check if this is a command reference
    if (directive.meta?.run?.isCommandRef) {
      // This is a command reference like @run @hello(args)
      // Import the run evaluator to handle this properly
      const { evaluateRun } = await import('./run');
      
      // Get structured arguments from the grammar
      const commandArgs = directive.meta.run.commandArgs || [];
      
      // Convert parsed arguments to the format expected by run directive
      const processedArgs = [];
      for (const arg of commandArgs) {
        if (arg.type === 'string') {
          processedArgs.push(arg.value);
        } else if (arg.type === 'variable' && arg.value) {
          // Variable reference - evaluate it
          const varValue = await interpolate([arg.value], env);
          processedArgs.push(varValue);
        }
      }
      
      // Create a synthetic run directive to evaluate
      const runDirective: DirectiveNode = {
        type: 'Directive',
        nodeId: directive.nodeId + '-run',
        kind: 'run',
        subtype: 'runExec',
        source: 'exec',
        values: {
          identifier: [{ 
            type: 'Text', 
            nodeId: '', 
            content: directive.meta.run.commandName 
          }],
          args: processedArgs.map(arg => ({ 
            type: 'Text', 
            nodeId: '', 
            content: String(arg) 
          }))
        },
        raw: {}, // Empty raw field for synthetic node
        meta: {
          argumentCount: processedArgs.length
        }
      };
      
      // Evaluate the run directive
      const result = await evaluateRun(runDirective, env);
      resolvedValue = result.value;
    } else {
      // Regular command execution
      const command = await interpolate(contentNodes, env);
      // Execute the command and use the output as the value
      resolvedValue = await env.executeCommand(command);
    }
    
    // Trim trailing newlines for consistency
    resolvedValue = resolvedValue.replace(/\n+$/, '');
    
  } else if (directive.source === 'exec' && directive.values?.execInvocation) {
    // ExecInvocation handling: @text result = @greet() | @uppercase
    const execInvocation = directive.values.execInvocation;
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(execInvocation, env);
    resolvedValue = String(result.value);
    
  } else if (directive.source === 'commandRef') {
    // Direct command reference: @text result = @greet(args)
    const commandArgs = directive.meta?.commandArgs || directive.values?.commandArgs || [];
    const commandName = directive.meta?.commandName;
    
    if (!commandName) {
      throw new Error('Command reference missing command name');
    }
    
    // Look up the command definition
    const cmdVar = env.getVariable(commandName);
    if (!cmdVar || cmdVar.type !== 'executable') {
      throw new Error(`Command '${commandName}' not found`);
    }
    
    // Import the run evaluator to execute the command
    const { evaluateRun } = await import('./run');
    
    // Convert parsed arguments to the format expected by run directive
    const processedArgs = [];
    for (const arg of commandArgs) {
      if (arg.type === 'string') {
        processedArgs.push(arg.value);
      } else if (arg.type === 'variable' && arg.value) {
        // Variable reference - evaluate it
        const varValue = await interpolate([arg.value], env);
        processedArgs.push(varValue);
      }
    }
    
    // Create a synthetic run directive to evaluate
    const runDirective: DirectiveNode = {
      type: 'Directive',
      nodeId: directive.nodeId + '-run',
      kind: 'run',
      subtype: 'runExec',
      source: 'exec',
      values: {
        identifier: [{ 
          type: 'Text', 
          nodeId: '', 
          content: commandName 
        }],
        args: processedArgs.map(arg => ({ 
          type: 'Text', 
          nodeId: '', 
          content: String(arg) 
        }))
      },
      raw: {}, // Empty raw field for synthetic node
      meta: {
        argumentCount: processedArgs.length
      }
    };
    
    // Evaluate the run directive
    const result = await evaluateRun(runDirective, env);
    resolvedValue = result.value;
    
  } else {
    // Normal case: interpolate the content (resolve {{variables}})
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes)) {
      throw new Error('Text directive missing content');
    }
    
    resolvedValue = await interpolate(contentNodes, env);
    
    // Apply template normalization if this is template content and normalization is enabled
    if (directive.meta?.isTemplateContent && env.getNormalizeBlankLines()) {
      resolvedValue = normalizeTemplateContent(resolvedValue, true);
    }
  }
  
  // Handle append operator
  // Note: operator is a direct property on DirectiveNode, not in values
  // This is part of the AST structure, not content to be interpolated
  // eslint-disable-next-line mlld/no-raw-field-access
  const operator = directive.operator || '=';
  let finalValue = resolvedValue;
  
  if (operator === '+=') {
    const existingVar = env.getVariable(identifier);
    if (existingVar && existingVar.type === 'text') {
      finalValue = existingVar.value + resolvedValue;
    }
  }
  
  // Create and store the variable with location information
  const variable = createTextVariable(identifier, finalValue, {
    definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath()),
    // Preserve template metadata if this was template content
    ...(directive.meta?.isTemplateContent ? { isTemplateContent: true } : {})
  });
  env.setVariable(identifier, variable);
  
  // Return the value
  return { value: finalValue, env };
}