import type { DirectiveNode, TextNode } from '@core/types';
import type { Variable } from '@core/types/variable';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { JSONFormatter } from '../core/json-formatter';
// Remove old type imports - we'll use only the new ones
import {
  isTextLike,
  isExecutable as isExecutableVar,
  isSimpleText,
  isInterpolatedText,
  isFileContent,
  isSectionContent,
  isObject,
  isArray,
  isComputed,
  isCommandResult,
  isPipelineInput,
  isImported,
  isPath,
  isExecutable,
  isTemplate,
  isStructured,
  createSimpleTextVariable
} from '@core/types/variable';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { evaluateDataValue, hasUnevaluatedDirectives } from './data-value-evaluator';
import { evaluateForeachAsText, parseForeachOptions } from '../utils/foreach';
import { logger } from '@core/utils/logger';
// Template normalization now handled in grammar - no longer needed here

/**
 * Evaluate /show directives.
 * Handles variable references, paths, and templates.
 * 
 * Ported from AddDirectiveHandler.
 */
export async function evaluateShow(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  
  let content = '';
  
  if (directive.subtype === 'showVariable') {
    // Handle variable reference
    const variableNodes = directive.values?.variable;
    if (!variableNodes || variableNodes.length === 0) {
      throw new Error('Add variable directive missing variable reference');
    }
    
    const variableNode = variableNodes[0];
    const varName = variableNode.identifier;
    
    // Get variable from environment
    const variable = env.getVariable(varName);
    if (!variable) {
      throw new Error(`Variable not found: ${varName}`);
    }
    
    
    // Get the base value using type-safe approach
    let value: any;
    let originalValue: any; // Keep track of the original value before evaluation
    let isForeachSection = false; // Track if this came from a foreach-section
    
    // Handle all variable types using the new type guards
    if (isTextLike(variable)) {
      // All text-producing types: simple, interpolated, template, file, section, command result
      value = variable.value;
      
      // For template variables (like ::{{var}}::), we need to interpolate the template content
      if (isTemplate(variable)) {
        // For double-bracket templates, the value is the AST array
        if (Array.isArray(value)) {
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('Template interpolation in show', {
              variableName: variable.name,
              astArray: value
            });
          }
          value = await interpolate(value, env);
          if (process.env.MLLD_DEBUG === 'true') {
            logger.debug('Interpolation result:', { value });
          }
        } else if (variable.metadata?.templateAst && Array.isArray(variable.metadata.templateAst)) {
          // Fallback - check metadata (shouldn't be needed with new code)
          value = await interpolate(variable.metadata.templateAst, env);
        }
      }
    } else if (isObject(variable)) {
      // Object - use the value
      value = variable.value;
      originalValue = value;
      
      // Check if it's a lazy-evaluated object (still in AST form)
      if (value && typeof value === 'object' && value.type === 'object' && 'properties' in value) {
        // Evaluate the object to get the actual values
        value = await evaluateDataValue(value, env);
      }
    } else if (isArray(variable)) {
      // Array - use the value
      value = variable.value;
      originalValue = value;
      
      // Check if it's a lazy-evaluated array (still in AST form)
      if (value && typeof value === 'object' && value.type === 'array' && 'items' in value) {
        // Evaluate the array to get the actual values
        value = await evaluateDataValue(value, env);
      }
    } else if (isComputed(variable)) {
      // Computed value from code execution
      value = variable.value;
    } else if (isPipelineInput(variable)) {
      // Pipeline input - use the text representation
      value = variable.value.text;
    } else if (isImported(variable)) {
      // Imported variable - use the value
      value = variable.value;
    } else if (isPath(variable)) {
      // Path variables contain file path info - read the file
      const pathValue = variable.value.resolvedPath;
      const isURL = variable.value.isURL;
      const security = variable.value.security;
      
      try {
        if (isURL && security) {
          // Use URL cache with security options
          value = await env.fetchURLWithSecurity(pathValue, security, varName);
        } else {
          // Regular file or URL without security options
          value = await env.readFile(pathValue);
        }
      } catch (error) {
        // If it's not a file or can't be read, use the path itself
        value = pathValue;
      }
    } else if (isExecutable(variable)) {
      // Show a representation of the executable
      value = `[executable: ${variable.name}]`;
    } else {
      throw new Error(`Unknown variable type in show evaluator: ${variable.type}`);
    }
    
    // Handle field access if present in the variable node
    if (variableNode.fields && variableNode.fields.length > 0 && typeof value === 'object' && value !== null) {
      const { accessField } = await import('../utils/field-access');
      for (const field of variableNode.fields) {
        // Handle variableIndex type - need to resolve the variable first
        if (field.type === 'variableIndex') {
          const indexVar = env.getVariable(field.value);
          if (!indexVar) {
            throw new Error(`Variable not found for index: ${field.value}`);
          }
          // Get the actual value to use as index
          let indexValue = indexVar.value;
          if (isTextLike(indexVar)) {
            indexValue = indexVar.value;
          }
          // Create a new field with the resolved value
          const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
          value = accessField(value, resolvedField);
        } else {
          value = accessField(value, field);
        }
        if (value === undefined) break;
      }
    }
    
    // Check if the value contains unevaluated directives
    if (hasUnevaluatedDirectives(value)) {
      // Evaluate any embedded directives
      value = await evaluateDataValue(value, env);
      
      // After evaluation, check if the original value was a foreach-section
      if (originalValue && typeof originalValue === 'object' && originalValue.type === 'foreach-section') {
        isForeachSection = true;
      }
    }
    
    // Convert final value to string
    if (typeof value === 'string') {
      content = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      // For primitives, just convert to string
      content = String(value);
    } else if (Array.isArray(value)) {
      // Check if this is from a foreach-section expression
      if (isForeachSection && value.every(item => typeof item === 'string')) {
        // Join string array with double newlines for foreach-section results
        content = value.join('\n\n');
      } else {
        // For other arrays, use JSON format (this preserves the original behavior)
        // Use proper indentation for arrays (2 spaces)
        const indent = 2;
        
        content = JSONFormatter.stringify(value, { pretty: true, indent });
      }
    } else if (value !== null && value !== undefined) {
      // Check if this is a namespace object that needs special formatting
      // BUT NOT if we've accessed a field on it - in that case, value is no longer the namespace
      const hadFieldAccess = variableNode.fields && variableNode.fields.length > 0;
      if (variable && variable.metadata?.isNamespace && !hadFieldAccess) {
        if (process.env.DEBUG_NAMESPACE) {
          logger.debug('Cleaning namespace for display:', {
            varName: variable.name,
            hasMetadata: !!variable.metadata,
            isNamespace: variable.metadata?.isNamespace,
            valueKeys: Object.keys(value)
          });
        }
        content = JSONFormatter.stringifyNamespace(value);
      } else {
        // Check if the top-level value itself is an executable that needs cleaning
        if (value && typeof value === 'object' && value.__executable) {
          const params = value.paramNames || [];
          content = `<function(${params.join(', ')})>`;
        } else {
          // For objects, use JSON with custom replacer for VariableReference nodes
          content = JSONFormatter.stringify(value, { pretty: true });
        }
      }
    } else {
      // Handle null/undefined
      content = '';
    }
    
    
  } else if (directive.subtype === 'showPath') {
    // Handle path inclusion (whole file)
    const pathValue = directive.values?.path;
    if (!pathValue) {
      throw new Error('Add path directive missing path');
    }
    
    // Handle both string paths (URLs) and node arrays
    let resolvedPath: string;
    if (typeof pathValue === 'string') {
      // Direct string path (typically URLs)
      resolvedPath = pathValue;
    } else if (Array.isArray(pathValue)) {
      // Array of path nodes
      resolvedPath = await interpolate(pathValue, env);
    } else {
      throw new Error('Invalid path type in add directive');
    }
    
    if (!resolvedPath) {
      throw new Error('Add path directive resolved to empty path');
    }
    
    // Check if this directive has security options
    const security = directive.meta ? {
      ttl: directive.meta.ttl,
      trust: directive.meta.trust
    } : undefined;
    
    // Read the file content or fetch URL with security options if URL
    if (env.isURL(resolvedPath) && security) {
      content = await env.fetchURLWithSecurity(resolvedPath, security, 'add-directive');
    } else {
      content = await env.readFile(resolvedPath);
    }
    
  } else if (directive.subtype === 'showPathSection') {
    // Handle section extraction: @add "Section Title" from [file.md]
    const sectionTitleNodes = directive.values?.sectionTitle;
    const pathValue = directive.values?.path;
    
    if (!sectionTitleNodes || !pathValue) {
      throw new Error('Add section directive missing section title or path');
    }
    
    // Get the section title
    const sectionTitle = await interpolate(sectionTitleNodes, env);
    
    // Handle both string paths (URLs) and node arrays
    let resolvedPath: string;
    if (typeof pathValue === 'string') {
      // Direct string path (typically URLs)
      resolvedPath = pathValue;
    } else if (Array.isArray(pathValue)) {
      // Array of path nodes
      resolvedPath = await interpolate(pathValue, env);
    } else {
      throw new Error('Invalid path type in add section directive');
    }
    
    // Check if this directive has security options
    const security = directive.meta ? {
      ttl: directive.meta.ttl,
      trust: directive.meta.trust
    } : undefined;
    
    // Read the file content or fetch URL with security options if URL
    let fileContent: string;
    if (env.isURL(resolvedPath) && security) {
      fileContent = await env.fetchURLWithSecurity(resolvedPath, security, 'add-section-directive');
    } else {
      fileContent = await env.readFile(resolvedPath);
    }
    
    // Extract the section using llmxml
    try {
      // getSection expects just the title without the # prefix
      const titleWithoutHash = sectionTitle.replace(/^#+\s*/, '');
      content = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
        includeNested: true
      });
      // Just trim trailing whitespace
      content = content.trimEnd();
    } catch (error) {
      // Fallback to basic extraction if llmxml fails
      content = extractSection(fileContent, sectionTitle);
    }
    
    // Handle rename if newTitle is specified
    const newTitleNodes = directive.values?.newTitle;
    if (newTitleNodes) {
      const newTitle = await interpolate(newTitleNodes, env);
      // Replace the original section title with the new one
      const lines = content.split('\n');
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
        
        content = lines.join('\n');
      } else {
        // If no heading found, prepend the new title
        content = newTitle + '\n' + content;
      }
    }
    
  } else if (directive.subtype === 'showTemplate') {
    // Handle template
    const templateNodes = directive.values?.content;
    if (!templateNodes) {
      throw new Error('Add template directive missing content');
    }
    
    // Interpolate the template
    content = await interpolate(templateNodes, env);
    
    // Template normalization is now handled in the grammar at parse time
    
    // Handle section extraction if specified
    const sectionNodes = directive.values?.section;
    if (sectionNodes && Array.isArray(sectionNodes)) {
      const section = await interpolate(sectionNodes, env);
      if (section) {
        content = extractSection(content, section);
      }
    }
    
  } else if (directive.subtype === 'addInvocation' || directive.subtype === 'showInvocation') {
    // Handle unified invocation - could be template or exec
    const invocation = directive.values?.invocation;
    if (!invocation) {
      throw new Error('Show invocation directive missing invocation');
    }
    
    // Get the invocation name
    const commandRef = invocation.commandRef;
    const name = commandRef.name || commandRef.identifier[0]?.content;
    if (!name) {
      throw new Error('Add invocation missing name');
    }
    
    // Look up what this invocation refers to
    const variable = env.getVariable(name);
    if (!variable) {
      throw new Error(`Variable not found: ${name}`);
    }
    
    // Handle based on variable type
    if (isExecutableVar(variable)) {
      // This is an executable invocation - use exec-invocation handler
      const { evaluateExecInvocation } = await import('./exec-invocation');
      const result = await evaluateExecInvocation(invocation, env);
      
      // Convert result to string appropriately
      if (typeof result.value === 'string') {
        content = result.value;
      } else if (result.value === null || result.value === undefined) {
        content = '';
      } else if (typeof result.value === 'object') {
        // For objects and arrays, use JSON.stringify
        content = JSON.stringify(result.value);
      } else {
        content = String(result.value);
      }
    } else {
      throw new Error(`Variable ${name} is not executable (type: ${variable.type})`);
    }
    
  } else if (directive.subtype === 'addTemplateInvocation') {
    // Handle old-style template invocation (for backward compatibility)
    const templateNameNodes = directive.values?.templateName;
    if (!templateNameNodes || templateNameNodes.length === 0) {
      throw new Error('Add template invocation missing template name');
    }
    
    // Get the template name
    const templateName = await interpolate(templateNameNodes, env);
    
    // Look up the template
    const template = env.getVariable(templateName);
    if (!template || template.type !== 'executable') {
      throw new Error(`Template not found: ${templateName}`);
    }
    
    const definition = template.value;
    if (definition.type !== 'template') {
      throw new Error(`Variable ${templateName} is not a template`);
    }
    
    // Get the arguments
    const args = directive.values?.arguments || [];
    
    // Check parameter count
    if (args.length !== definition.paramNames.length) {
      throw new Error(`Template ${templateName} expects ${definition.paramNames.length} parameters, got ${args.length}`);
    }
    
    // Create a child environment with the template parameters
    const childEnv = env.createChild();
    
    // Bind arguments to parameters
    for (let i = 0; i < definition.paramNames.length; i++) {
      const paramName = definition.paramNames[i];
      const argValue = args[i];
      
      // Convert argument to string value
      let value: string;
      if (typeof argValue === 'object' && argValue.type === 'Text') {
        // Handle Text nodes from the AST
        value = argValue.content || '';
      } else if (typeof argValue === 'object' && argValue.type === 'VariableReference') {
        // Handle variable references like @userName
        const varName = argValue.identifier;
        const variable = env.getVariable(varName);
        if (!variable) {
          throw new Error(`Variable not found: ${varName}`);
        }
        // Get value based on variable type
        if (isTextLike(variable)) {
          value = variable.value;
        } else if (isObject(variable) || isArray(variable)) {
          value = JSON.stringify(variable.value);
        } else {
          value = String(variable.value);
        }
      } else if (typeof argValue === 'object' && argValue.type === 'string') {
        // Legacy format support
        value = argValue.value;
      } else if (typeof argValue === 'object' && argValue.type === 'variable') {
        // Legacy format - handle variable references
        const varRef = argValue.value;
        const varName = varRef.identifier;
        const variable = env.getVariable(varName);
        if (!variable) {
          throw new Error(`Variable not found: ${varName}`);
        }
        // Get value based on variable type
        if (isTextLike(variable)) {
          value = variable.value;
        } else if (isObject(variable) || isArray(variable)) {
          value = JSON.stringify(variable.value);
        } else {
          value = String(variable.value);
        }
      } else {
        value = String(argValue);
      }
      
      // Create a text variable for the parameter
      const source = {
        directive: 'var' as const,
        syntax: 'quoted' as const,
        hasInterpolation: false,
        isMultiLine: false
      };
      const variable = createSimpleTextVariable(paramName, value, source);
      childEnv.setParameterVariable(paramName, variable);
    }
    
    // Interpolate the template content with the child environment
    // Use definition.template for modern executables, definition.templateContent for legacy
    const templateNodes = definition.template || definition.templateContent;
    if (!templateNodes) {
      throw new Error(`Template ${templateName} has no template content`);
    }
    content = await interpolate(templateNodes, childEnv);
    
    // Template normalization is now handled in the grammar at parse time
    
  } else if (directive.subtype === 'addForeach') {
    // Handle foreach expressions for direct output
    const foreachExpression = directive.values?.foreach;
    if (!foreachExpression) {
      throw new Error('Add foreach directive missing foreach expression');
    }
    
    // Parse options from with clause if present
    const options = parseForeachOptions(foreachExpression.with);
    
    // For @add, we want each result on its own line without the heavy separator
    if (!options.separator) {
      options.separator = '\n';
    }
    
    // Evaluate foreach and format as text
    content = await evaluateForeachAsText(foreachExpression, env, options);
    
  } else if (directive.subtype === 'addExecInvocation' || directive.subtype === 'showExecInvocation') {
    // Handle exec invocation nodes (both legacy add and new show subtypes)
    const execInvocation = directive.values?.execInvocation;
    if (!execInvocation) {
      throw new Error('Show exec invocation directive missing exec invocation');
    }
    
    // Evaluate the exec invocation
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(execInvocation, env);
    
    // Convert result to string appropriately
    if (typeof result.value === 'string') {
      content = result.value;
    } else if (result.value === null || result.value === undefined) {
      content = '';
    } else if (typeof result.value === 'object') {
      // For objects and arrays, use JSON.stringify
      content = JSON.stringify(result.value);
    } else {
      content = String(result.value);
    }
    
  } else if (directive.subtype === 'showForeach') {
    // Handle foreach expressions for direct output
    const foreachExpression = directive.values?.foreach;
    if (!foreachExpression) {
      throw new Error('Show foreach directive missing foreach expression');
    }
    
    // Parse options from with clause if present
    const options = parseForeachOptions(foreachExpression.with);
    
    // For @show, we want each result on its own line without the heavy separator
    if (!options.separator) {
      options.separator = '\n';
    }
    
    // Evaluate foreach and format as text
    content = await evaluateForeachAsText(foreachExpression, env, options);
    
  } else if (directive.subtype === 'showForeachSection') {
    // Handle foreach section expressions: @add foreach [@array.field # section] as ::template::
    const foreachExpression = directive.values?.foreach;
    if (!foreachExpression) {
      throw new Error('Add foreach section directive missing foreach expression');
    }
    
    // Evaluate foreach section expression
    const { ForeachSectionEvaluator } = await import('./data-values/ForeachSectionEvaluator');
    const { evaluateDataValue } = await import('./data-value-evaluator');
    const foreachSectionEvaluator = new ForeachSectionEvaluator(evaluateDataValue);
    const result = await foreachSectionEvaluator.evaluate(foreachExpression, env);
    
    // Convert result to string content - should be an array of results
    if (Array.isArray(result)) {
      content = result.join('\n\n');
    } else {
      content = String(result);
    }
    
  } else if (directive.subtype === 'showLoadContent') {
    // Handle load content expressions: <file.md> or <file.md # Section>
    const loadContentNode = directive.values?.loadContent;
    if (!loadContentNode) {
      throw new Error('Show load content directive missing content loader');
    }
    
    // Use the content loader to process the node
    const { processContentLoader } = await import('./content-loader');
    content = await processContentLoader(loadContentNode, env);
    
    // Handle rename if newTitle is specified (for section extraction)
    const newTitleNodes = directive.values?.newTitle;
    if (newTitleNodes && loadContentNode.options?.section) {
      const newTitle = await interpolate(newTitleNodes, env);
      content = applyHeaderTransform(content, newTitle);
    }
    
  } else {
    throw new Error(`Unsupported show subtype: ${directive.subtype}`);
  }
  
  // Output directives always end with a newline
  // This is the interpreter's responsibility, not the grammar's
  if (!content.endsWith('\n')) {
    content += '\n';
  }
  
  // Create replacement text node
  const replacementNode: TextNode = {
    type: 'Text',
    nodeId: `${directive.nodeId}-content`,
    content
  };
  
  // Add the replacement node to environment
  env.addNode(replacementNode);
  
  // Return the content
  return { value: content, env };
}

/**
 * Apply header transformation to content
 * Supports three cases:
 * 1. Just header level: "###" -> change level only
 * 2. Just text: "New Title" -> keep original level, replace text
 * 3. Full header: "### New Title" -> replace entire line
 */
export function applyHeaderTransform(content: string, newHeader: string): string {
  const lines = content.split('\n');
  if (lines.length === 0) return newHeader;
  
  // Check if first line is a markdown header
  if (lines[0].match(/^#+\s/)) {
    const newHeaderTrimmed = newHeader.trim();
    const headerMatch = newHeaderTrimmed.match(/^(#+)(\s+(.*))?$/);
    
    if (headerMatch) {
      if (!headerMatch[3]) {
        // Case 1: Just header level
        const originalText = lines[0].replace(/^#+\s*/, '');
        lines[0] = `${headerMatch[1]} ${originalText}`;
      } else {
        // Case 3: Full replacement
        lines[0] = newHeaderTrimmed;
      }
    } else {
      // Case 2: Just text, preserve original level
      const originalLevel = lines[0].match(/^(#+)\s/)?.[1] || '#';
      lines[0] = `${originalLevel} ${newHeaderTrimmed}`;
    }
  } else {
    // No header found, prepend the new header
    lines.unshift(newHeader);
  }
  
  return lines.join('\n');
}

// We'll use llmxml for section extraction once it's properly set up
// For now, keeping the basic implementation
/**
 * Extract a section from markdown content.
 * TODO: Replace with llmxml.getSection() once integrated
 */
export function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\\n');
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
  
  return sectionLines.join('\\n').trim();
}