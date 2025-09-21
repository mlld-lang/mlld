import type { DirectiveNode } from '@core/types';
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
  isPrimitive,
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
  env: Environment,
  context?: any
): Promise<EvalResult> {
  // Check if we're importing - skip execution if so
  if (env.getIsImporting()) {
    return { value: null, env };
  }

  if (process.env.MLLD_DEBUG === 'true') {
  }

  let content = '';
  
  if (directive.subtype === 'showVariable') {
    // Handle variable reference - supports both unified AST and legacy structure
    let variableNode: any;
    let varName: string;
    
    if (directive.values?.invocation) {
      // New unified AST structure: support VariableReference and VariableReferenceWithTail
      const invocationNode = directive.values.invocation as any;
      const allowedTypes = ['VariableReference', 'VariableReferenceWithTail', 'TemplateVariable'] as const;
      if (!invocationNode || !allowedTypes.includes(invocationNode.type)) {
        throw new Error('Show variable directive missing variable reference');
      }
      variableNode = invocationNode;
      if (invocationNode.type === 'VariableReference') {
        varName = invocationNode.identifier;
      } else if (invocationNode.type === 'VariableReferenceWithTail') {
        // Extract inner variable identifier for lookup; pipeline handled later
        const innerVar = invocationNode.variable;
        if (innerVar.type === 'TemplateVariable') {
          varName = innerVar.identifier; // __template__
        } else {
          varName = innerVar.identifier;
        }
      } else if (invocationNode.type === 'TemplateVariable') {
        varName = invocationNode.identifier; // __template__
      }
    } else if (directive.values?.variable) {
      // Legacy structure (for backwards compatibility during transition)
      const legacyVariable = directive.values.variable;
      
      // Handle both array and single object formats
      if (!legacyVariable) {
        throw new Error('Show variable directive missing variable reference');
      }
      
      // When used in when actions, variable might be a single object instead of an array
      if (Array.isArray(legacyVariable)) {
        if (legacyVariable.length === 0) {
          throw new Error('Show variable directive missing variable reference');
        }
        variableNode = legacyVariable[0];
      } else {
        // Single object format (e.g., from when actions)
        variableNode = legacyVariable;
      }
      
      // Handle both VariableReference and VariableReferenceWithTail
      if (variableNode.type === 'VariableReferenceWithTail') {
        // Extract the actual variable reference and handle pipeline later
        const innerVar = variableNode.variable;
        if (innerVar.type === 'TemplateVariable') {
          // Handle template literals like show "high" | @toUpper
          varName = innerVar.identifier; // Will be __template__
        } else {
          varName = innerVar.identifier;
        }
        // The pipeline will be handled through variableNode.withClause.pipeline
      } else if (variableNode.type === 'VariableReference') {
        varName = variableNode.identifier;
      } else if (variableNode.type === 'TemplateVariable') {
        // Handle direct template literals
        varName = variableNode.identifier; // Will be __template__
      } else {
        throw new Error('Show variable directive missing variable reference');
      }
    } else {
      throw new Error('Show variable directive missing variable reference');
    }

    // NOTE: Do not pre-process pipelines here. For show-invocation, we rely on
    // evaluateExecInvocation(invocation, env) to execute any attached withClause
    // (including parallel groups) correctly. Pre-processing here can interfere
    // with retry/source wiring and produce partial outputs.

    // Get variable from environment or handle template literals
    let variable: any;
    let value: any;
    let originalValue: any; // Keep track of the original value before evaluation
    let isForeachSection = false; // Track if this came from a foreach-section
    
    // Handle template literals (show "string" syntax)
    if (varName === '__template__') {
      // This is a template literal like show "high"
      // The content is in the TemplateVariable node
      let templateContent: any;
      
      if (variableNode.type === 'VariableReferenceWithTail' && variableNode.variable.type === 'TemplateVariable') {
        templateContent = variableNode.variable.content;
      } else if (variableNode.type === 'TemplateVariable') {
        templateContent = variableNode.content;
      }
      
      // Evaluate the template content (it's an array of AST nodes)
      if (templateContent) {
        // For literal strings, the content is typically a single Literal node
        if (Array.isArray(templateContent) && templateContent.length === 1 && templateContent[0].type === 'Literal') {
          value = templateContent[0].value;
        } else {
          // More complex template - evaluate it
          const result = await evaluate(templateContent, env);
          value = result.value;
        }
      } else {
        value = '';
      }
      
      // Skip the variable type checking below since we already have the value
    } else {
      // Normal variable reference
      variable = env.getVariable(varName);
      if (!variable) {
        throw new Error(`Variable not found: ${varName}`);
      }
    }
    
    // Handle all variable types using the new type guards (skip if we already have a value from template literal)
    if (value === undefined && variable) {
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
          // GOTCHA: Some legacy paths store template AST in metadata
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
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('show.ts: Processing array variable:', {
          varName: variable.name,
          valueType: typeof value,
          hasType: value && typeof value === 'object' && 'type' in value,
          typeValue: value && typeof value === 'object' && value.type,
          hasItems: value && typeof value === 'object' && 'items' in value,
          isArray: Array.isArray(value),
          value: value
        });
      }
      
      // Check if it's a lazy-evaluated array (still in AST form)
      if (value && typeof value === 'object' && value.type === 'array' && 'items' in value) {
        // Evaluate the array to get the actual values
        value = await evaluateDataValue(value, env);
        
        // Debug logging
        if (process.env.MLLD_DEBUG === 'true') {
          logger.debug('show.ts: After evaluation:', {
            varName: variable.name,
            value: value
          });
        }
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
      const isURL = variable.value.isURL || /^https?:\/\//.test(pathValue);
      const security = variable.value.security;
      
      try {
        if (isURL) {
          if (security) {
            // Use URL cache with security options when available
            value = await env.fetchURLWithSecurity(pathValue, security, varName);
          } else {
            // Fetch URL content directly when no additional security metadata is provided
            value = await env.fetchURL(pathValue);
          }
        } else {
          // Regular file path
          value = await env.readFile(pathValue);
        }
      } catch (error) {
        // Try test hook override if available
        try {
          if (isURL) {
            const override = (globalThis as any).__mlldFetchOverride as (u: string) => Promise<any> | undefined;
            if (override) {
              const resp = await override(pathValue);
              if (resp && typeof resp.text === 'function') {
                value = await resp.text();
              } else {
                value = String(resp);
              }
            } else {
              value = pathValue;
            }
          } else {
            value = pathValue;
          }
        } catch {
          // Fallback to the path itself on any unexpected errors
          value = pathValue;
        }
      }
    } else if (isExecutable(variable)) {
      // Show a representation of the executable
      value = `[executable: ${variable.name}]`;
    } else if (isPrimitive(variable)) {
      // Primitive variables (numbers, booleans, null)
      value = variable.value;
    } else {
      throw new Error(`Unknown variable type in show evaluator: ${variable.type}`);
    }

    // Legacy compatibility: only apply this path when not using unified invocation tail
    if (!(directive as any)?.values?.invocation) {
      if (variableNode?.type === 'VariableReferenceWithTail' && variableNode.withClause?.pipeline) {
        const { executePipeline } = await import('./pipeline');
        content = await executePipeline(typeof value === 'string' ? value : String(value ?? ''), variableNode.withClause.pipeline, env);
      }
    }
    } // Close the if (value === undefined && variable) block
    
    // Debug logging for LoadContentResult
    if (process.env.MLLD_DEBUG === 'true' && variable) {
      logger.debug('Show variable value:', {
        varName: variable.name,
        varType: variable.type,
        valueType: typeof value,
        isObject: isObject(variable),
        valueKeys: value && typeof value === 'object' ? Object.keys(value) : undefined
      });
    }
    
    // Handle field access if present in the variable node
    if (variableNode.fields && variableNode.fields.length > 0 && typeof value === 'object' && value !== null) {
      const { accessField } = await import('../utils/field-access');
      for (const field of variableNode.fields) {
        // Handle variableIndex type - need to resolve the variable first
        if (field.type === 'variableIndex') {
          const indexVar = env.getVariable(field.value);
          if (!indexVar) {
            const { FieldAccessError } = await import('@core/errors');
            throw new FieldAccessError(`Variable not found for index: ${field.value}`,
              { baseValue: value, fieldAccessChain: [], failedAtIndex: 0, failedKey: String(field.value) },
              { sourceLocation: directive.location, env }
            );
          }
          // Get the actual value to use as index
          let indexValue = indexVar.value;
          if (isTextLike(indexVar)) {
            indexValue = indexVar.value;
          }
          // Create a new field with the resolved value
          const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
          const fieldResult = await accessField(value, resolvedField, { 
            preserveContext: true,
            env,
            sourceLocation: directive.location
          });
          value = (fieldResult as any).value;
        } else {
          const fieldResult = await accessField(value, field, { 
            preserveContext: true,
            env,
            sourceLocation: directive.location
          });
          value = (fieldResult as any).value;
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
    
    /**
     * Extract Variable value for display output
     * WHY: Display contexts need raw values because users see final content,
     *      not internal Variable metadata or wrapper objects
     */
    const { isVariable, resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
    value = await resolveValue(value, env, ResolutionContext.Display);
    
    // Import LoadContentResult type check
    const { isLoadContentResult, isLoadContentResultArray, isLoadContentResultURL } = await import('@core/types/load-content');
    
    // Convert final value to string
    if (typeof value === 'string') {
      content = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      // For primitives, just convert to string
      content = String(value);
    } else if (isLoadContentResult(value)) {
      // For LoadContentResult, show the content by default
      content = value.content;
    } else if (isLoadContentResultArray(value)) {
      // For array of LoadContentResult, concatenate content with double newlines
      content = value.map(item => item.content).join('\n\n');
    } else if (Array.isArray(value)) {
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        logger.debug('show.ts: Formatting array:', {
          varName: variable.name,
          valueLength: value.length,
          value: value,
          isForeachSection: isForeachSection
        });
      }
      
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
    
    // Legacy path: only run when invocation is not present (avoid double-processing)
    if (!(directive as any)?.values?.invocation) {
      if (variableNode?.type === 'VariableReferenceWithTail' && variableNode.withClause?.pipeline) {
        const { executePipeline } = await import('./pipeline');
        content = await executePipeline(content, variableNode.withClause.pipeline, env);
      }
    }
    
    // Unified pipeline processing for showVariable: detect pipeline from invocation or directive
    try {
      const { hasPipeline } = await import('./pipeline/detector');
      const invocationNode = (directive as any)?.values?.invocation;
      if (hasPipeline(invocationNode, directive)) {
        const { processPipeline } = await import('./pipeline/unified-processor');
        // Use direct value; do not inject synthetic source here — avoids stage-0 retry confusion
        const processed = await processPipeline({
          value: content,
          env,
          node: invocationNode,
          directive,
          identifier: varName || 'show',
          location: directive.location
        });
        content = typeof processed === 'string' ? processed : JSONFormatter.stringify(processed);
      }
    } catch {
      // If no pipeline detected or processing fails, leave content as-is
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
    
    // Handle pipeline if present
    if (directive.values?.pipeline) {
      const { executePipeline } = await import('./pipeline');
      content = await executePipeline(content, directive.values.pipeline, env);
    }
    
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
    
    // Check if this is a method call on an object or on an exec result
    const commandRef = invocation.commandRef as any;
    if (commandRef && (commandRef.objectReference || commandRef.objectSource)) {
      // This is a method call like @list.includes() - evaluate directly
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
      // Normal invocation - look up the variable
      const name = commandRef.name || commandRef.identifier?.[0]?.content;
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
    const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
    const loadResult = await processContentLoader(loadContentNode, env);
    
    // Handle different return types from processContentLoader
    if (typeof loadResult === 'string') {
      // Backward compatibility - plain string
      content = loadResult;
    } else if (isLoadContentResult(loadResult)) {
      // Single file with metadata - use content
      content = loadResult.content;
    } else if (isLoadContentResultArray(loadResult)) {
      // Multiple files from glob - join their contents
      content = loadResult.map(r => r.content).join('\n\n');
    } else {
      content = String(loadResult);
    }
    
    // Handle rename if newTitle is specified (for section extraction)
    const newTitleNodes = directive.values?.newTitle;
    if (newTitleNodes && loadContentNode.options?.section) {
      const newTitle = await interpolate(newTitleNodes, env);
      content = applyHeaderTransform(content, newTitle);
    }
    
  } else if (directive.subtype === 'showCommand') {
    // Handle command execution for display: /show {echo "test"}
    const commandNodes = directive.values?.command;
    if (!commandNodes) {
      throw new Error('Show command directive missing command');
    }
    
    // Import necessary dependencies for command execution
    const { InterpolationContext } = await import('../core/interpolation-context');
    
    // Interpolate command (resolve variables) with shell command context
    const command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand);
    
    // Execute the command and capture output for display
    const executionContext = {
      sourceLocation: directive.location,
      directiveNode: directive,
      filePath: env.getCurrentFilePath(),
      directiveType: 'show'  // Mark as show for context
    };
    
    // Execute command and get output
    content = await env.executeCommand(command, undefined, executionContext);
    
  } else if (directive.subtype === 'showCode') {
    // Handle code execution for display: /show js {console.log("test")}
    const codeNodes = directive.values?.code;
    const langNodes = directive.values?.lang;
    
    if (!codeNodes || !langNodes) {
      throw new Error('Show code directive missing code or language');
    }
    
    // Inline helper functions (same as in run.ts)
    function extractRawTextContent(nodes: any[]): string {
      const parts: string[] = [];
      for (const node of nodes) {
        if (node.type === 'Text') {
          parts.push(node.content || '');
        } else if (node.type === 'Newline') {
          parts.push('\n');
        } else {
          parts.push(String((node as any).value || (node as any).content || ''));
        }
      }
      const rawContent = parts.join('');
      return rawContent.replace(/^\n/, '');
    }
    
    function dedentCommonIndent(src: string): string {
      const lines = src.replace(/\r\n/g, '\n').split('\n');
      let minIndent: number | null = null;
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        const match = line.match(/^[ \t]*/);
        const indent = match ? match[0].length : 0;
        if (minIndent === null || indent < minIndent) minIndent = indent;
        if (minIndent === 0) break;
      }
      if (!minIndent) return src;
      return lines.map(l => (l.trim().length === 0 ? '' : l.slice(minIndent!))).join('\n');
    }
    
    // Get language and code content
    const lang = extractRawTextContent(langNodes);
    const code = dedentCommonIndent(extractRawTextContent(codeNodes));
    
    // Execute code and capture output for display
    const executionContext = {
      sourceLocation: directive.location,
      directiveNode: directive,
      filePath: env.getCurrentFilePath(),
      directiveType: 'show'  // Mark as show for context
    };
    
    // Execute code using the unified executeCode method
    // Note: executeCode handles all language types internally
    content = await env.executeCode(code, lang, {}, executionContext);
    
  } else if (directive.subtype === 'show' && directive.values?.content) {
    // Handle simple show directive with content (used in for loops)
    let templateNodes = directive.values.content;
    
    // Handle wrapped content structure from for loop actions
    if (Array.isArray(templateNodes) && templateNodes.length === 1 && 
        templateNodes[0].content && templateNodes[0].wrapperType) {
      // Unwrap the content
      templateNodes = templateNodes[0].content;
    }
    
    
    // Process the content using the standard interpolation
    content = await interpolate(templateNodes, env);
    
    
  } else {
    throw new Error(`Unsupported show subtype: ${directive.subtype}`);
  }

  // Apply tail pipeline when requested (used by inline /show in templates)
  if ((directive as any).values?.withClause?.pipeline && (directive as any).meta?.applyTailPipeline) {
    const { executePipeline } = await import('./pipeline');
    const pipeline = (directive as any).values.withClause.pipeline;
    content = await executePipeline(typeof content === 'string' ? content : String(content ?? ''), pipeline, env);
  }
  
  // Output directives always end with a newline
  // This is the interpreter's responsibility, not the grammar's
  // Final safety: ensure content is a string and pretty-print JSON when possible
  if (typeof content !== 'string') {
    try {
      const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
      if (isLoadContentResult(content)) {
        content = content.content;
      } else if (isLoadContentResultArray(content)) {
        content = content.map(item => item.content).join('\n\n');
      } else if (Array.isArray(content)) {
        content = JSONFormatter.stringify(content, { pretty: true });
      } else if (content !== null && content !== undefined) {
        content = JSONFormatter.stringify(content, { pretty: true });
      } else {
        content = '';
      }
    } catch {
      content = String(content);
    }
  } else if (typeof content === 'string') {
    // Check if content is a JSON string that should be pretty-printed
    try {
      // Only attempt to parse if it looks like JSON (starts with { or [)
      const trimmed = content.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        const parsed = JSON.parse(content);
        content = JSONFormatter.stringify(parsed, { pretty: true });
      }
    } catch {
      // Not valid JSON, keep original string
    }
  }

  if (!content.endsWith('\n')) {
    content += '\n';
  }
  
  // Only emit the effect if we're not in an expression context
  // In expression contexts (like when expressions), we only return the value
  if (!context?.isExpression) {
    // Emit effect with type 'both' - shows on stdout (if streaming) AND adds to document
    env.emitEffect('both', content, { source: directive.location });
  }
  
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
