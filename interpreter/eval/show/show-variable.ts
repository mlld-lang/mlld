import type { DirectiveNode, SourceLocation } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import {
  isArray,
  isComputed,
  isExecutable,
  isImported,
  isObject,
  isPath,
  isPipelineInput,
  isPrimitive,
  isStructuredValueVariable,
  isTemplate,
  isTextLike
} from '@core/types/variable';
import type { Variable } from '@core/types/variable';
import { logger } from '@core/utils/logger';
import { MlldSecurityError } from '@core/errors';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import { evaluate, interpolate } from '@interpreter/core/interpreter';
import { JSONFormatter } from '@interpreter/core/json-formatter';
import { evaluateDataValue, hasUnevaluatedDirectives } from '@interpreter/eval/data-value-evaluator';
import type { Environment } from '@interpreter/env/Environment';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
import { formatForDisplay } from '@interpreter/utils/display-formatter';
import {
  asText,
  assertStructuredValue,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import type { ShowDescriptorCollector } from './shared-helpers';

export interface ShowVariableEvaluationParams {
  directive: DirectiveNode;
  env: Environment;
  context?: EvaluationContext;
  collectInterpolatedDescriptor: (descriptor?: SecurityDescriptor) => void;
  descriptorCollector: ShowDescriptorCollector;
  directiveLocation: SourceLocation | null;
}

export interface ShowVariableEvaluationResult {
  content: string;
  resultValue: unknown;
  skipJsonFormatting: boolean;
}

export async function evaluateShowVariable({
  directive,
  env,
  context,
  collectInterpolatedDescriptor,
  descriptorCollector,
  directiveLocation
}: ShowVariableEvaluationParams): Promise<ShowVariableEvaluationResult> {
  let content = '';
  let skipJsonFormatting = false;
  const hasErrorMetadata = (val: unknown): boolean =>
    isStructuredValue(val) &&
    Array.isArray((val as any).metadata?.errors) &&
    (val as any).metadata?.errors?.length > 0;

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
    const extractedVar = getExtractedVariable(context, varName);
    variable = extractedVar ?? env.getVariable(varName);
    if (!variable) {
      throw new Error(`Variable not found: ${varName}`);
    }
    descriptorCollector.setSourceFromVariable(variable);
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
          value = await interpolate(value, env, undefined, {
            collectSecurityDescriptor: collectInterpolatedDescriptor
          });
        } else if (variable.internal?.templateAst && Array.isArray(variable.internal.templateAst)) {
          // GOTCHA: Some legacy paths store template AST in internal metadata
          value = await interpolate(variable.internal.templateAst, env, undefined, {
            collectSecurityDescriptor: collectInterpolatedDescriptor
          });
        }
      }
    } else if (isObject(variable)) {
      // Object - use the value
      value = variable.value;
      originalValue = value;

      // Check if it's a lazy-evaluated object (still in AST form)
      if (
        value &&
        typeof value === 'object' &&
        value.type === 'object' &&
        ('properties' in value || 'entries' in value)
      ) {
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
      assertStructuredValue(variable.value, 'show:pipeline-input');
      value = asText(variable.value);
    } else if (isImported(variable)) {
      // Imported variable - use the value
      value = variable.value;
    } else if (isPath(variable)) {
      // Path variables contain file path info - read the file
      const pathValue = variable.value.resolvedPath;
      const isURL = variable.value.isURL || /^https?:\/\//.test(pathValue);

      try {
        value = await readFileWithPolicy(env, pathValue, directiveLocation ?? undefined);
      } catch (error: any) {
        if (error instanceof MlldSecurityError) {
          throw error;
        }
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
    } else if (isStructuredValueVariable(variable)) {
      value = variable.value;
    } else {
      throw new Error(`Unknown variable type in show evaluator: ${variable.type}`);
    }

    // Handle field access BEFORE pipeline processing
    // For VariableReferenceWithTail, fields are in variableNode.variable.fields
    // For VariableReference, fields are in variableNode.fields
    const fieldsToProcess = variableNode?.type === 'VariableReferenceWithTail'
      ? (variableNode as any).variable?.fields
      : variableNode?.fields;

    if (fieldsToProcess && fieldsToProcess.length > 0) {
      const { accessField } = await import('@interpreter/utils/field-access');
      const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
      let fieldTarget: any = variable
        ? await resolveVariable(variable, env, ResolutionContext.FieldAccess)
        : value;
      for (const field of fieldsToProcess) {
        // Handle variableIndex type - need to resolve the variable first
        if (field.type === 'variableIndex') {
          const indexNode =
            typeof field.value === 'object'
              ? (field.value as any)
              : {
                  type: 'VariableReference',
                  valueType: 'varIdentifier',
                  identifier: String(field.value)
                };
          const indexValue = await evaluateDataValue(indexNode as any, env);
          const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
          const fieldResult = await accessField(fieldTarget, resolvedField, {
            preserveContext: true,
            env,
            sourceLocation: directiveLocation
          });
          value = (fieldResult as any).value;
        } else {
          const fieldResult = await accessField(fieldTarget, field, {
            preserveContext: true,
            env,
            sourceLocation: directiveLocation
          });
          value = (fieldResult as any).value;
        }
        fieldTarget = value;
        if (value === undefined || value === null) break;
      }
    }

    // Legacy compatibility: only apply this path when not using unified invocation tail
    if (!(directive as any)?.values?.invocation) {
      if (variableNode?.type === 'VariableReferenceWithTail' && variableNode.withClause?.pipeline) {
        const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
        const processed = await processPipeline({
          value,
          env,
          node: variableNode,
          directive,
          pipeline: variableNode.withClause.pipeline,
          identifier: varName,
          location: directive.location,
          descriptorHint: descriptorCollector.mergePipelineDescriptorFromVariable(variable)
        });
        value = processed;
        if (isStructuredValue(processed)) {
          content = asText(processed);
        } else if (typeof processed === 'string') {
          content = processed;
        } else {
          content = JSONFormatter.stringify(processed, { pretty: true });
        }
      }
    }
  } // Close the if (value === undefined && variable) block

  // Check if the value contains unevaluated directives
  if (!isStructuredValue(value) && hasUnevaluatedDirectives(value)) {
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
  const { resolveValue, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
  value = await resolveValue(value, env, ResolutionContext.Display);
  const hadFieldAccess = variableNode.fields && variableNode.fields.length > 0;
  const isNamespaceVariable = variable?.internal?.isNamespace && !hadFieldAccess;

  if (isNamespaceVariable && value && typeof value === 'object') {
    content = JSONFormatter.stringifyNamespace(value);
  } else if (value && typeof value === 'object' && (value as any).__executable) {
    const params = (value as any).paramNames || [];
    content = `<function(${params.join(', ')})>`;
  } else {
    if (isStructuredValue(value)) {
      if (hasErrorMetadata(value)) {
        content = asText(value);
        skipJsonFormatting = true;
      } else {
        content = formatForDisplay(value, { isForeachSection, pretty: true });
      }
    } else {
      content = formatForDisplay(value, { isForeachSection, pretty: false });
    }
  }

  // Legacy path: only run when invocation is not present (avoid double-processing)
  if (!(directive as any)?.values?.invocation) {
    if (variableNode?.type === 'VariableReferenceWithTail' && variableNode.withClause?.pipeline) {
      const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
      const processed = await processPipeline({
        value: content,
        env,
        node: variableNode,
        directive,
        pipeline: variableNode.withClause.pipeline,
        identifier: varName,
        location: directive.location,
        descriptorHint: descriptorCollector.mergePipelineDescriptorFromVariable(variable)
      });
      value = processed;
      if (isStructuredValue(processed)) {
        content = asText(processed);
      } else if (typeof processed === 'string') {
        content = processed;
      } else {
        content = JSONFormatter.stringify(processed, { pretty: true });
      }
    }
  }

  // Unified pipeline processing for showVariable: detect pipeline from invocation or directive
  try {
    const { hasPipeline } = await import('@interpreter/eval/pipeline/detector');
    const invocationNode = (directive as any)?.values?.invocation;
    if (hasPipeline(invocationNode, directive)) {
      const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
      // Use direct value; do not inject synthetic source here — avoids stage-0 retry confusion
      const processed = await processPipeline({
        value: content,
        env,
        node: invocationNode,
        directive,
        identifier: varName || 'show',
        location: directive.location,
        descriptorHint: descriptorCollector.mergePipelineDescriptorFromVariable(variable)
      });
      value = processed;
      if (isStructuredValue(processed)) {
        content = asText(processed);
      } else if (typeof processed === 'string') {
        content = processed;
      } else {
        content = JSONFormatter.stringify(processed, { pretty: true });
      }
    }
  } catch {
    // If no pipeline detected or processing fails, leave content as-is
  }

  return {
    content,
    resultValue: value,
    skipJsonFormatting
  };
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
