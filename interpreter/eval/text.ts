import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createTextVariable } from '@core/types';
import { createLLMXML } from 'llmxml';

/**
 * Remove single blank lines but preserve multiple blank lines.
 * This helps match the expected output format.
 */
function compactBlankLines(content: string): string {
  return content.replace(/\n\n/g, '\n');
}

/**
 * Extract a section from markdown content.
 * TODO: Replace with llmxml.getSection() once integrated
 */
function extractSection(content: string, sectionName: string): string {
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
  // Extract identifier
  const identifier = directive.raw?.identifier;
  if (!identifier) {
    throw new Error('Text directive missing identifier');
  }
  
  // Handle parameterized text templates
  if (directive.subtype === 'textTemplateDefinition') {
    // Store the template definition
    const templateDef = {
      type: 'textTemplate' as const,
      name: identifier,
      identifier,
      params: directive.values?.params || [],
      content: directive.values?.content || [],
      value: '' // Templates don't have a direct value
    };
    
    env.setVariable(identifier, templateDef);
    
    // Templates are definition directives, no output
    return { value: '', env };
  }
  
  let resolvedValue: string;
  
  // Handle new subtypes: textPath and textPathSection
  if (directive.subtype === 'textPath') {
    // Handle direct path content: @text content = [file.md]
    const pathNodes = directive.values?.path;
    if (!pathNodes) {
      throw new Error('Text path directive missing path');
    }
    
    // Resolve the path
    const resolvedPath = await interpolate(pathNodes, env);
    if (!resolvedPath) {
      throw new Error('Text path directive resolved to empty path');
    }
    
    // Read the entire file content
    resolvedValue = await env.readFile(resolvedPath);
    
  } else if (directive.subtype === 'textPathSection') {
    // Handle section extraction: @text section = "## Setup" from [file.md]
    const sectionNodes = directive.values?.section;
    const pathNodes = directive.values?.path;
    
    if (!sectionNodes || !pathNodes) {
      throw new Error('Text section directive missing section title or path');
    }
    
    // Get the section title
    const sectionTitle = await interpolate(sectionNodes, env);
    
    // Resolve the path
    const resolvedPath = await interpolate(pathNodes, env);
    
    // Read the file content
    const fileContent = await env.readFile(resolvedPath);
    
    // Extract the section using llmxml
    const llmxml = createLLMXML();
    try {
      // getSection expects just the title without the # prefix
      const titleWithoutHash = sectionTitle.replace(/^#+\s*/, '');
      resolvedValue = await llmxml.getSection(fileContent, titleWithoutHash, {
        includeNested: true,
        includeTitle: true // Include the section title in output
      });
      // Compact blank lines and trim
      resolvedValue = compactBlankLines(resolvedValue).trimEnd();
    } catch (error) {
      // Fallback to basic extraction if llmxml fails
      resolvedValue = sectionTitle + '\n' + extractSection(fileContent, sectionTitle);
    }
    
    // Handle rename if present
    const renameNodes = directive.values?.rename;
    if (renameNodes) {
      const newTitle = await interpolate(renameNodes, env);
      // Replace the original section title with the new one
      const lines = resolvedValue.split('\n');
      if (lines.length > 0 && lines[0].match(/^#+\s/)) {
        // Extract the heading level from the new title or default to original
        const newHeadingMatch = newTitle.match(/^(#+)\s/);
        const newHeadingLevel = newHeadingMatch ? newHeadingMatch[1] : '#';
        const titleText = newTitle.replace(/^#+\s*/, '');
        lines[0] = `${newHeadingLevel} ${titleText}`;
        resolvedValue = lines.join('\n');
      } else {
        // If no heading found, prepend the new title
        resolvedValue = newTitle + '\n' + resolvedValue;
      }
    }
    
  } else if (directive.source === 'run') {
    // Check if this is a run source (e.g., @text result = @run [echo "hello"])
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes)) {
      throw new Error('Text directive missing content');
    }
    
    // The content should be the command to run
    const command = await interpolate(contentNodes, env);
    // Execute the command and use the output as the value
    resolvedValue = await env.executeCommand(command);
    // Trim trailing newlines for consistency
    resolvedValue = resolvedValue.replace(/\n+$/, '');
    
  } else {
    // Normal case: interpolate the content (resolve {{variables}})
    const contentNodes = directive.values?.content;
    if (!contentNodes || !Array.isArray(contentNodes)) {
      throw new Error('Text directive missing content');
    }
    
    resolvedValue = await interpolate(contentNodes, env);
  }
  
  // Handle append operator
  const operator = directive.operator || '=';
  let finalValue = resolvedValue;
  
  if (operator === '+=') {
    const existingVar = env.getVariable(identifier);
    if (existingVar && existingVar.type === 'text') {
      finalValue = existingVar.value + resolvedValue;
    }
  }
  
  // Create and store the variable
  const variable = createTextVariable(identifier, finalValue);
  env.setVariable(identifier, variable);
  
  // Return the value
  return { value: finalValue, env };
}