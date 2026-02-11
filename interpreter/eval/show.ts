import * as fs from 'fs';
import type { DirectiveNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Variable } from '@core/types/variable';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { JSONFormatter } from '../core/json-formatter';
import { formatForDisplay } from '../utils/display-formatter';
import type { DataLabel } from '@core/types/security';
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
  isStructuredValueVariable,
  createSimpleTextVariable
} from '@core/types/variable';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { evaluateDataValue, hasUnevaluatedDirectives } from './data-value-evaluator';
import { evaluateForeachAsText, parseForeachOptions } from '../utils/foreach';
import { convertEntriesToProperties } from '../utils/object-compat';
import { logger } from '@core/utils/logger';
import { MlldSecurityError } from '@core/errors';
import {
  asText,
  assertStructuredValue,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
// Template normalization now handled in grammar - no longer needed here
import { resolveDirectiveExecInvocation } from './directive-replay';
import { evaluateShowVariable } from './show/show-variable';
import {
  buildShowResultDescriptor,
  emitShowEffectIfNeeded,
  enforceShowPolicyIfNeeded,
  materializeShowDisplayValue,
  normalizeShowContent,
  ShowDescriptorCollector,
  wrapShowResult
} from './show/shared-helpers';

/**
 * Extract withClause from foreach expression AST format.
 * Handles two AST patterns:
 * 1. Direct `with` property from batch pipeline syntax: `foreach @fn(@arr) => | @sort with {separator: ", "}`
 *    In this case, foreachExpression.with already contains {separator: ", "} as direct properties.
 * 2. Nested `execInvocation.withClause` from simple foreach syntax: `foreach @arr with {separator: " | "}`
 *    In this case, withClause is an array of inlineValue objects that need conversion.
 */
function extractForeachWithClause(foreachExpression: any): Record<string, any> | undefined {
  // First check for direct 'with' property (batch pipeline syntax)
  if (foreachExpression?.with && typeof foreachExpression.with === 'object') {
    return foreachExpression.with;
  }

  // Then check for execInvocation.withClause (simple foreach syntax)
  const withClause = foreachExpression?.execInvocation?.withClause;
  if (!withClause || !Array.isArray(withClause) || withClause.length === 0) {
    return undefined;
  }

  // withClause is array of inlineValue objects, each with value.entries
  const inlineValue = withClause[0];
  if (inlineValue?.type !== 'inlineValue' || inlineValue?.value?.type !== 'object') {
    return undefined;
  }

  // Convert entries [{type:'pair', key:'separator', value:' | '}] to {separator: ' | '}
  return convertEntriesToProperties(inlineValue.value.entries);
}

/**
 * Evaluate /show directives.
 * Handles variable references, paths, and templates.
 * 
 * Ported from AddDirectiveHandler.
 */
export async function evaluateShow(
  directive: DirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  // Check if we're importing - skip execution if so
  if (env.getIsImporting()) {
    return { value: null, env };
  }

  if (process.env.MLLD_DEBUG === 'true') {
  }

  let resultValue: unknown | undefined;
  let content = '';
  let skipJsonFormatting = false;
  const hasErrorMetadata = (val: unknown): boolean =>
    isStructuredValue(val) &&
    Array.isArray((val as any).metadata?.errors) &&
    (val as any).metadata?.errors?.length > 0;
  const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
  let isStreamingShow = false;
  const descriptorCollector = new ShowDescriptorCollector(env);
  const collectInterpolatedDescriptor = descriptorCollector.collectInterpolatedDescriptor.bind(descriptorCollector);
  
  const directiveLocation = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());

  if (directive.subtype === 'showVariable') {
    const showVariableResult = await evaluateShowVariable({
      directive,
      env,
      context,
      collectInterpolatedDescriptor,
      descriptorCollector,
      directiveLocation
    });
    content = showVariableResult.content;
    resultValue = showVariableResult.resultValue;
    if (showVariableResult.skipJsonFormatting) {
      skipJsonFormatting = true;
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
      resolvedPath = await interpolate(pathValue, env, undefined, {
        collectSecurityDescriptor: collectInterpolatedDescriptor
      });
    } else {
      throw new Error('Invalid path type in add directive');
    }
    
    if (!resolvedPath) {
      throw new Error('Add path directive resolved to empty path');
    }
    
    // Read the file content or fetch URL when path is remote
    if (env.isURL(resolvedPath)) {
      content = await env.fetchURL(resolvedPath);
    } else {
      content = await readFileWithPolicy(env, resolvedPath, directiveLocation ?? undefined);
    }
    
  } else if (directive.subtype === 'showPathSection') {
    // Handle section extraction: @add "Section Title" from [file.md]
    const sectionTitleNodes = directive.values?.sectionTitle;
    const pathValue = directive.values?.path;
    
    if (!sectionTitleNodes || !pathValue) {
      throw new Error('Add section directive missing section title or path');
    }
    
    // Get the section title
    const sectionTitle = await interpolate(sectionTitleNodes, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
    
    // Handle both string paths (URLs) and node arrays
    let resolvedPath: string;
    if (typeof pathValue === 'string') {
      // Direct string path (typically URLs)
      resolvedPath = pathValue;
    } else if (Array.isArray(pathValue)) {
      // Array of path nodes
      resolvedPath = await interpolate(pathValue, env, undefined, {
        collectSecurityDescriptor: collectInterpolatedDescriptor
      });
    } else {
      throw new Error('Invalid path type in add section directive');
    }
    
    // Read the file content or fetch URL when path is remote
    let fileContent: string;
    if (env.isURL(resolvedPath)) {
      fileContent = await env.fetchURL(resolvedPath);
    } else {
      fileContent = await readFileWithPolicy(env, resolvedPath, directiveLocation ?? undefined);
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
      const newTitle = await interpolate(newTitleNodes, env, undefined, {
        collectSecurityDescriptor: collectInterpolatedDescriptor
      });
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
    content = await interpolate(templateNodes, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
    
    // Handle pipeline if present
    if (directive.values?.pipeline) {
      const { executePipeline } = await import('./pipeline');
      content = await executePipeline(content, directive.values.pipeline, env);
    }
    
    // Template normalization is now handled in the grammar at parse time
    
    // Handle section extraction if specified
    const sectionNodes = directive.values?.section;
    if (sectionNodes && Array.isArray(sectionNodes)) {
      const section = await interpolate(sectionNodes, env, undefined, {
        collectSecurityDescriptor: collectInterpolatedDescriptor
      });
      if (section) {
        content = extractSection(content, section);
      }
    }
    
  } else if (directive.subtype === 'addInvocation' || directive.subtype === 'showInvocation') {
    // Handle unified invocation - could be template or exec
    const baseInvocation = directive.values?.invocation;
    if (!baseInvocation) {
      throw new Error('Show invocation directive missing invocation');
    }
    isStreamingShow = Boolean(securityLabels?.includes('stream'));
    const invocation = isStreamingShow
      ? {
          ...baseInvocation,
          withClause: {
            ...(baseInvocation.withClause || {}),
            stream: true
          }
        }
      : baseInvocation;
    
    // Check if this is a method call on an object or on an exec result
    const commandRef = invocation.commandRef as any;
    if (commandRef && (commandRef.objectReference || commandRef.objectSource)) {
      // This is a method call like @list.includes() - evaluate directly
      const result = await resolveDirectiveExecInvocation(directive, env, invocation);
      
      resultValue = result.value;

      // Convert result to string appropriately
      if (isStructuredValue(result.value)) {
        if (result.value.type === 'array' && Array.isArray(result.value.data)) {
          const cleaned = result.value.data.map(item => (isStructuredValue(item) ? asText(item) : item));
          content = JSONFormatter.stringify(cleaned, { pretty: true });
        } else {
          content = asText(result.value);
        }
      } else if (typeof result.value === 'string') {
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
      const extracted = getExtractedVariable(context, name);
      const variable = extracted ?? env.getVariable(name);
      if (!variable) {
        throw new Error(`Variable not found: ${name}`);
      }
      
      // Handle based on variable type
      if (isExecutableVar(variable)) {
        // This is an executable invocation - use exec-invocation handler
        const result = await resolveDirectiveExecInvocation(directive, env, invocation);
        
        resultValue = result.value;

        // Convert result to string appropriately
        if (isStructuredValue(result.value)) {
          if (result.value.type === 'array' && Array.isArray(result.value.data)) {
            const cleaned = result.value.data.map(item => (isStructuredValue(item) ? asText(item) : item));
            content = JSONFormatter.stringify(cleaned, { pretty: true });
          } else {
            content = asText(result.value);
          }
        } else if (typeof result.value === 'string') {
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
    const templateName = await interpolate(templateNameNodes, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
    
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
    content = await interpolate(templateNodes, childEnv, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
    
    // Template normalization is now handled in the grammar at parse time
    
  } else if (directive.subtype === 'addForeach') {
    // Handle foreach expressions for direct output
    const foreachExpression = directive.values?.foreach;
    if (!foreachExpression) {
      throw new Error('Add foreach directive missing foreach expression');
    }
    
    // Parse options from with clause if present
    const options = parseForeachOptions(extractForeachWithClause(foreachExpression));

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
    const result = await resolveDirectiveExecInvocation(directive, env, execInvocation);
    resultValue = result.value;

    // Convert result to string appropriately
    if (isStructuredValue(result.value)) {
      if (hasErrorMetadata(result.value)) {
        content = asText(result.value);
        skipJsonFormatting = true;
      } else {
        content = formatForDisplay(result.value, { pretty: false });
      }
    } else if (typeof result.value === 'string') {
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
    const options = parseForeachOptions(extractForeachWithClause(foreachExpression));

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
    const loadResult = await processContentLoader(loadContentNode, env);

    // Handle different return types from processContentLoader
    if (isStructuredValue(loadResult)) {
      resultValue = loadResult;
      content = asText(loadResult);
    } else if (typeof loadResult === 'string') {
      // Backward compatibility - plain string
      content = loadResult;
      resultValue = loadResult;
    } else {
      try {
        content = String(loadResult ?? '');
      } catch {
        content = '';
      }
    }
    
    // Handle rename if newTitle is specified (for section extraction)
    const newTitleNodes = directive.values?.newTitle;
    if (newTitleNodes && loadContentNode.options?.section) {
      const newTitle = await interpolate(newTitleNodes, env, undefined, {
        collectSecurityDescriptor: collectInterpolatedDescriptor
      });
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
    const command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
    
    // Execute the command and capture output for display
    const executionContext = {
      sourceLocation: directiveLocation,
      directiveNode: directive,
      filePath: env.getCurrentFilePath(),
      directiveType: 'show'  // Mark as show for context
    };
    
    // Execute command and get output
    content = await env.executeCommand(command, undefined, executionContext);
    resultValue = content;
    
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
      sourceLocation: directiveLocation,
      directiveNode: directive,
      filePath: env.getCurrentFilePath(),
      directiveType: 'show'  // Mark as show for context
    };
    
    // Execute code using the unified executeCode method
    // Note: executeCode handles all language types internally
    content = await env.executeCode(code, lang, {}, executionContext);
    resultValue = content;
    
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
    content = await interpolate(templateNodes, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });

  } else if (directive.subtype === 'showLiteral' && directive.values?.content) {
    // Handle literal show directive (from unified effects pattern)
    const templateNodes = directive.values.content;

    // Process the content using the standard interpolation
    content = await interpolate(templateNodes, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });

  } else {
    throw new Error(`Unsupported show subtype: ${directive.subtype}`);
  }

  if (resultValue === undefined) {
    resultValue = content;
  }

  // Apply tail pipeline when requested (used by inline /show in templates)
  const tailPipeline = (directive as any).values?.withClause?.pipeline;
  if (Array.isArray(tailPipeline) && tailPipeline.length > 0 && (directive as any).meta?.applyTailPipeline) {
    const { processPipeline } = await import('./pipeline/unified-processor');
    const pipeline = tailPipeline;
    const processed = await processPipeline({
      value: content,
      env,
      directive,
      pipeline,
      identifier: 'show-tail',
      location: directive.location,
      descriptorHint: descriptorCollector.getInterpolatedDescriptor()
    });
    resultValue = processed;
    if (isStructuredValue(processed)) {
      content = asText(processed);
    } else if (typeof processed === 'string') {
      content = processed;
    } else {
      content = JSONFormatter.stringify(processed, { pretty: true });
    }
  }
  
  content = normalizeShowContent(content, skipJsonFormatting);

  if (resultValue === undefined) {
    resultValue = content;
  }

  const displayMaterialized = materializeShowDisplayValue(content, resultValue);
  content = displayMaterialized.text;
  const textForWrapper = content;

  enforceShowPolicyIfNeeded({
    context,
    directive,
    env,
    descriptorCollector,
    displayDescriptor: displayMaterialized.descriptor,
    directiveLocation
  });

  if (process.env.MLLD_DEBUG_FIX === 'true') {
    try {
      fs.appendFileSync(
        '/tmp/mlld-debug.log',
        JSON.stringify({
          source: 'show-final',
          invocationName: (directive.values as any)?.invocation?.commandRef?.name,
          contentType: typeof content,
          contentPreview: typeof content === 'string' ? content.slice(0, 160) : content,
          resultValueType: typeof resultValue,
          resultValueIsStructured: resultValue ? (resultValue as any)[Symbol.for('mlld.StructuredValue')] === true : false,
          resultValueKeys: resultValue && typeof resultValue === 'object' ? Object.keys(resultValue as any).slice(0, 5) : undefined
        }) + '\n'
      );
    } catch {}
  }

  if (!content.endsWith('\n')) {
    content = `${content}\n`;
  }

  const resultDescriptor = buildShowResultDescriptor(
    env,
    descriptorCollector,
    displayMaterialized.descriptor
  );

  emitShowEffectIfNeeded(context, env, content, directive.location, isStreamingShow);

  const wrapped = wrapShowResult(
    resultValue,
    textForWrapper,
    resultDescriptor,
    securityLabels
  );
  return { value: wrapped, env };
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract a section from markdown content.
 */
export function extractSection(content: string, sectionName: string): string {
  const lines = content.split('\\n');
  const normalizedName = sectionName.replace(/^#+\\s*/, '').trim();
  const escapedName = escapeRegExp(normalizedName);
  const sectionRegex = new RegExp(`^#{1,6}\\s+${escapedName}\\s*$`, 'i');
  
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];
  
  for (const line of lines) {
    const lineForMatch = line.trimEnd();
    // Check if this line starts our section
    if (!inSection && sectionRegex.test(lineForMatch)) {
      inSection = true;
      sectionLevel = lineForMatch.match(/^#+/)?.[0].length || 0;
      sectionLines.push(lineForMatch);
      continue;
    }
    
    // If we're in the section
    if (inSection) {
      // Check if we've hit another header at the same or higher level
      const headerMatch = lineForMatch.match(/^(#{1,6})\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        // We've left the section
        break;
      }
      
      sectionLines.push(lineForMatch);
    }
  }
  
  return sectionLines.join('\\n').trim();
}
function getExtractedVariable(
  context: EvaluationContext | undefined,
  name: string
): Variable | undefined {
  if (!context?.extractedInputs || context.extractedInputs.length === 0) {
    return undefined;
  }
  for (const candidate of context.extractedInputs) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'name' in candidate &&
      (candidate as Variable).name === name
    ) {
      return candidate as Variable;
    }
  }
  return undefined;
}
