import type { DirectiveNode, SourceLocation } from '@core/types';
import type { ToolCollection } from '@core/types/tools';
import {
  createArrayVariable,
  createCommandResultVariable,
  createComputedVariable,
  createExecutableVariable,
  createFileContentVariable,
  createInterpolatedTextVariable,
  createObjectVariable,
  createPrimitiveVariable,
  createSectionContentVariable,
  createSimpleTextVariable,
  createStructuredValueVariable,
  createTemplateVariable,
  type Variable,
  type VariableContext,
  type VariableFactoryInitOptions,
  type VariableInternalMetadata,
  type VariableSource,
  VariableMetadataUtils
} from '@core/types/variable';
import type { SecurityDescriptor } from '@core/types/security';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { logger } from '@core/utils/logger';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { hasComplexArrayItems, hasComplexValues } from './collection-evaluator';

type StrategyKey =
  | 'existing-variable'
  | 'structured-value'
  | 'executable-wrapper'
  | 'primitive-node'
  | 'array-node'
  | 'object-node'
  | 'command-node'
  | 'code-node'
  | 'path-node'
  | 'section-node'
  | 'reference-node'
  | 'load-content-node'
  | 'foreach-node'
  | 'loop-node'
  | 'when-node'
  | 'exec-node'
  | 'new-node'
  | 'reference-tail-node'
  | 'env-node'
  | 'expression-meta'
  | 'literal-node'
  | 'text-default';

export interface VariableBuilderDependencies {
  directive: DirectiveNode;
  extractSecurityFromValue: (value: unknown) => SecurityDescriptor | undefined;
  identifier: string;
  interpolateWithSecurity: (nodes: unknown) => Promise<string>;
  location?: SourceLocation;
  resolvedValueDescriptor?: SecurityDescriptor;
  securityLabels: string[];
  source: VariableSource;
  valueNode: unknown;
}

export interface VariableBuildInput {
  resolvedValue: unknown;
  toolCollection?: ToolCollection;
}

export interface VariableBuilder {
  applySecurityOptions: (
    overrides?: Partial<VariableFactoryInitOptions>,
    existing?: SecurityDescriptor
  ) => VariableFactoryInitOptions;
  baseCtx: Partial<VariableContext>;
  baseInternal: Partial<VariableInternalMetadata>;
  build: (input: VariableBuildInput) => Promise<Variable>;
}

function valueToString(value: unknown): string {
  if (value === null) return '';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (isStructuredValue(value)) return value.text;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getNodeType(valueNode: unknown): string | undefined {
  if (!valueNode || typeof valueNode !== 'object') {
    return undefined;
  }

  return (valueNode as { type?: string }).type;
}

function isPrimitiveNode(valueNode: unknown): boolean {
  return typeof valueNode === 'number' || typeof valueNode === 'boolean' || valueNode === null;
}

function resolveStrategyKey(
  directive: DirectiveNode,
  valueNode: unknown,
  resolvedValue: unknown,
  isVariableFn: (value: unknown) => boolean
): StrategyKey {
  if (isVariableFn(resolvedValue)) {
    return 'existing-variable';
  }

  if (isStructuredValue(resolvedValue)) {
    return 'structured-value';
  }

  if (resolvedValue && typeof resolvedValue === 'object' && (resolvedValue as any).__executable) {
    return 'executable-wrapper';
  }

  if (isPrimitiveNode(valueNode)) {
    return 'primitive-node';
  }

  const nodeType = getNodeType(valueNode);
  if (nodeType === 'array') return 'array-node';
  if (nodeType === 'object') return 'object-node';
  if (nodeType === 'command') return 'command-node';
  if (nodeType === 'code') return 'code-node';
  if (nodeType === 'path') return 'path-node';
  if (nodeType === 'section') return 'section-node';
  if (nodeType === 'VariableReference') return 'reference-node';
  if (nodeType === 'load-content') return 'load-content-node';
  if (nodeType === 'foreach' || nodeType === 'foreach-command') return 'foreach-node';
  if (nodeType === 'LoopExpression') return 'loop-node';
  if (nodeType === 'WhenExpression') return 'when-node';
  if (nodeType === 'ExecInvocation' || nodeType === 'ExeBlock') return 'exec-node';
  if (nodeType === 'NewExpression') return 'new-node';
  if (nodeType === 'VariableReferenceWithTail') return 'reference-tail-node';
  if (nodeType === 'Directive' && (valueNode as any).kind === 'env') return 'env-node';

  if (directive.meta?.expressionType) {
    return 'expression-meta';
  }

  if (nodeType === 'Literal') {
    return 'literal-node';
  }

  return 'text-default';
}

function buildFromResolvedShape(
  identifier: string,
  resolvedValue: unknown,
  source: VariableSource,
  resolvedValueDescriptor: SecurityDescriptor | undefined,
  applySecurityOptions: VariableBuilder['applySecurityOptions'],
  allowPrimitive: boolean
): Variable {
  if (isStructuredValue(resolvedValue)) {
    const options = applySecurityOptions(undefined, resolvedValueDescriptor);
    return createStructuredValueVariable(identifier, resolvedValue, source, options);
  }

  if (typeof resolvedValue === 'object' && resolvedValue !== null) {
    if (Array.isArray(resolvedValue)) {
      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      return createArrayVariable(identifier, resolvedValue, false, source, options);
    }

    const options = applySecurityOptions(undefined, resolvedValueDescriptor);
    return createObjectVariable(identifier, resolvedValue as Record<string, unknown>, false, source, options);
  }

  if (allowPrimitive && (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null)) {
    const options = applySecurityOptions(undefined, resolvedValueDescriptor);
    return createPrimitiveVariable(identifier, resolvedValue, source, options);
  }

  const options = applySecurityOptions(undefined, resolvedValueDescriptor);
  return createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
}

export function createVariableBuilder(dependencies: VariableBuilderDependencies): VariableBuilder {
  const {
    directive,
    extractSecurityFromValue,
    identifier,
    interpolateWithSecurity,
    location,
    resolvedValueDescriptor,
    securityLabels,
    source,
    valueNode
  } = dependencies;

  const baseCtx: Partial<VariableContext> = {
    definedAt: location
  };

  const baseInternal: Partial<VariableInternalMetadata> = {};
  if (typeof directive.meta?.rawTemplate === 'string') {
    baseInternal.templateRaw = directive.meta.rawTemplate;
  }

  if (
    valueNode
    && typeof valueNode === 'object'
    && (
      (valueNode as any).type === 'ExecInvocation'
      || (valueNode as any).type === 'command'
      || (valueNode as any).type === 'code'
    )
  ) {
    baseInternal.isRetryable = true;
    baseInternal.sourceFunction = valueNode;
  }

  const cloneFactoryOptions = (
    overrides?: Partial<VariableFactoryInitOptions>
  ): VariableFactoryInitOptions => ({
    mx: { ...baseCtx, ...(overrides?.mx ?? {}) },
    internal: { ...baseInternal, ...(overrides?.internal ?? {}) }
  });

  const applySecurityOptions: VariableBuilder['applySecurityOptions'] = (
    overrides?: Partial<VariableFactoryInitOptions>,
    existing?: SecurityDescriptor
  ): VariableFactoryInitOptions => {
    const options = cloneFactoryOptions(overrides);

    const finalMetadata = VariableMetadataUtils.applySecurityMetadata(undefined, {
      labels: securityLabels,
      existingDescriptor: existing ?? resolvedValueDescriptor
    });

    if (finalMetadata?.security) {
      updateVarMxFromDescriptor(options.mx ?? (options.mx = {}), finalMetadata.security);
    }

    if (finalMetadata) {
      options.metadata = {
        ...(options.metadata ?? {}),
        ...finalMetadata
      };
    }

    return options;
  };

  const build = async (input: VariableBuildInput): Promise<Variable> => {
    const { resolvedValue, toolCollection } = input;

    const { isVariable } = await import('@interpreter/utils/variable-resolution');
    const strategyKey = resolveStrategyKey(directive, valueNode, resolvedValue, isVariable);

    if (strategyKey === 'existing-variable') {
      const overrides: Partial<VariableFactoryInitOptions> = {
        mx: { ...((resolvedValue as any).mx ?? {}), ...baseCtx },
        internal: { ...((resolvedValue as any).internal ?? {}), ...baseInternal }
      };
      const existingSecurity = extractSecurityFromValue(resolvedValue);
      const options = applySecurityOptions(overrides, existingSecurity);

      const variable = {
        ...(resolvedValue as Variable),
        name: identifier,
        definedAt: location,
        mx: options.mx,
        internal: options.internal
      };

      VariableMetadataUtils.attachContext(variable);
      return variable;
    }

    if (strategyKey === 'structured-value') {
      const options = applySecurityOptions(
        {
          internal: {
            isStructuredValue: true,
            structuredValueType: (resolvedValue as any).type
          }
        },
        resolvedValueDescriptor
      );
      return createStructuredValueVariable(identifier, resolvedValue as any, source, options);
    }

    if (strategyKey === 'executable-wrapper') {
      const execDef = (resolvedValue as any).executableDef ?? (resolvedValue as any).value;
      const options = applySecurityOptions(
        {
          internal: {
            executableDef: execDef
          }
        },
        resolvedValueDescriptor
      );
      return createExecutableVariable(
        identifier,
        'command',
        '',
        execDef?.paramNames || [],
        undefined,
        source,
        options
      );
    }

    if (strategyKey === 'primitive-node') {
      const options = applySecurityOptions();
      return createPrimitiveVariable(identifier, valueNode as any, source, options);
    }

    if (strategyKey === 'array-node') {
      const arrayNode = valueNode as any;
      const isComplex = hasComplexArrayItems(arrayNode.items || arrayNode.elements || []);

      const options = applySecurityOptions();
      return createArrayVariable(identifier, resolvedValue as any, isComplex, source, options);
    }

    if (strategyKey === 'object-node') {
      const objectNode = valueNode as any;
      const isComplex = toolCollection ? false : hasComplexValues(objectNode.entries || objectNode.properties);
      const options = applySecurityOptions(
        toolCollection
          ? {
              internal: {
                toolCollection,
                isToolsCollection: true
              }
            }
          : undefined
      );
      return createObjectVariable(identifier, resolvedValue as any, isComplex, source, options);
    }

    if (strategyKey === 'command-node') {
      const options = applySecurityOptions();
      return createCommandResultVariable(
        identifier,
        resolvedValue as any,
        (valueNode as any).command,
        source,
        undefined,
        undefined,
        options
      );
    }

    if (strategyKey === 'code-node') {
      const sourceCode = (valueNode as any).code || '';
      const options = applySecurityOptions();
      return createComputedVariable(
        identifier,
        resolvedValue as any,
        (valueNode as any).language || 'js',
        sourceCode,
        source,
        options
      );
    }

    if (strategyKey === 'path-node') {
      const filePath = await interpolateWithSecurity((valueNode as any).segments);
      const options = applySecurityOptions();
      return createFileContentVariable(identifier, resolvedValue as any, filePath, source, options);
    }

    if (strategyKey === 'section-node') {
      const filePath = await interpolateWithSecurity((valueNode as any).path);
      const sectionName = await interpolateWithSecurity((valueNode as any).section);
      const options = applySecurityOptions();
      return createSectionContentVariable(identifier, resolvedValue as any, filePath, sectionName, 'hash', source, options);
    }

    if (strategyKey === 'reference-node') {
      const actualValue = isStructuredValue(resolvedValue) ? asData(resolvedValue) : resolvedValue;
      const existingSecurity = extractSecurityFromValue(resolvedValue);

      if (typeof actualValue === 'string') {
        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        return createSimpleTextVariable(identifier, actualValue, source, options);
      }
      if (typeof actualValue === 'number' || typeof actualValue === 'boolean' || actualValue === null) {
        const options = applySecurityOptions(undefined, existingSecurity);
        return createPrimitiveVariable(identifier, actualValue, source, options);
      }
      if (Array.isArray(actualValue)) {
        const options = applySecurityOptions(undefined, existingSecurity);
        return createArrayVariable(identifier, actualValue, false, source, options);
      }
      if (typeof actualValue === 'object' && actualValue !== null) {
        const options = applySecurityOptions(undefined, existingSecurity);
        return createObjectVariable(identifier, actualValue, false, source, options);
      }

      const options = applySecurityOptions(undefined, existingSecurity);
      return createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

    if (strategyKey === 'load-content-node') {
      const structuredValue = wrapLoadContentValue(resolvedValue);
      const options = applySecurityOptions({
        internal: {
          structuredValueMetadata: structuredValue.metadata
        }
      });
      return createStructuredValueVariable(identifier, structuredValue, source, options);
    }

    if (strategyKey === 'foreach-node') {
      const options = applySecurityOptions();
      return createArrayVariable(identifier, resolvedValue as any, false, source, options);
    }

    if (strategyKey === 'loop-node') {
      return buildFromResolvedShape(
        identifier,
        resolvedValue,
        source,
        resolvedValueDescriptor,
        applySecurityOptions,
        true
      );
    }

    if (strategyKey === 'when-node') {
      return buildFromResolvedShape(
        identifier,
        resolvedValue,
        source,
        resolvedValueDescriptor,
        applySecurityOptions,
        true
      );
    }

    if (strategyKey === 'exec-node') {
      return buildFromResolvedShape(
        identifier,
        resolvedValue,
        source,
        resolvedValueDescriptor,
        applySecurityOptions,
        false
      );
    }

    if (strategyKey === 'new-node') {
      return buildFromResolvedShape(
        identifier,
        resolvedValue,
        source,
        resolvedValueDescriptor,
        applySecurityOptions,
        true
      );
    }

    if (strategyKey === 'reference-tail-node') {
      const actualValue = isStructuredValue(resolvedValue) ? asData(resolvedValue) : resolvedValue;
      if (typeof actualValue === 'object' && actualValue !== null) {
        if (Array.isArray(actualValue)) {
          const options = applySecurityOptions(undefined, resolvedValueDescriptor);
          return createArrayVariable(identifier, actualValue, false, source, options);
        }

        const options = applySecurityOptions(undefined, resolvedValueDescriptor);
        return createObjectVariable(identifier, actualValue, false, source, options);
      }

      const options = applySecurityOptions(undefined, resolvedValueDescriptor);
      return createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

    if (strategyKey === 'env-node') {
      return buildFromResolvedShape(
        identifier,
        resolvedValue,
        source,
        resolvedValueDescriptor,
        applySecurityOptions,
        true
      );
    }

    if (strategyKey === 'expression-meta') {
      if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
        const options = applySecurityOptions();
        return createPrimitiveVariable(identifier, resolvedValue, source, options);
      }
      if (Array.isArray(resolvedValue)) {
        const options = applySecurityOptions();
        return createArrayVariable(identifier, resolvedValue, false, source, options);
      }
      if (typeof resolvedValue === 'object' && resolvedValue !== null) {
        const options = applySecurityOptions();
        return createObjectVariable(identifier, resolvedValue as Record<string, unknown>, false, source, options);
      }

      const options = applySecurityOptions();
      return createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

    if (strategyKey === 'literal-node') {
      if (typeof resolvedValue === 'boolean' || typeof resolvedValue === 'number' || resolvedValue === null) {
        const options = applySecurityOptions();
        return createPrimitiveVariable(identifier, resolvedValue, source, options);
      }

      const options = applySecurityOptions();
      return createSimpleTextVariable(identifier, valueToString(resolvedValue), source, options);
    }

    const strValue = valueToString(resolvedValue);

    if (directive.meta?.wrapperType === 'singleQuote') {
      const options = applySecurityOptions();
      return createSimpleTextVariable(identifier, strValue, source, options);
    }

    if (
      directive.meta?.isTemplateContent
      || directive.meta?.wrapperType === 'backtick'
      || directive.meta?.wrapperType === 'doubleQuote'
      || directive.meta?.wrapperType === 'doubleColon'
      || directive.meta?.wrapperType === 'tripleColon'
    ) {
      let templateType: 'backtick' | 'doubleColon' | 'tripleColon' = 'backtick';
      if (directive.meta?.wrapperType === 'doubleColon') {
        templateType = 'doubleColon';
      } else if (directive.meta?.wrapperType === 'tripleColon') {
        templateType = 'tripleColon';
      }

      const templateValue = directive.meta?.wrapperType === 'tripleColon' && Array.isArray(resolvedValue)
        ? resolvedValue as any
        : strValue;

      const options = applySecurityOptions();
      return createTemplateVariable(
        identifier,
        templateValue,
        undefined,
        templateType as any,
        source,
        options
      );
    }

    if (directive.meta?.wrapperType === 'doubleQuote' || source.hasInterpolation) {
      const options = applySecurityOptions();
      return createInterpolatedTextVariable(identifier, strValue, [], source, options);
    }

    const options = applySecurityOptions();
    return createSimpleTextVariable(identifier, strValue, source, options);
  };

  return {
    applySecurityOptions,
    baseCtx,
    baseInternal,
    build
  };
}
