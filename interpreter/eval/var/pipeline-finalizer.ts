import type { DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import {
  createSimpleTextVariable,
  createStructuredValueVariable,
  type Variable,
  type VariableContext,
  type VariableFactoryInitOptions,
  type VariableInternalMetadata,
  type VariableSource
} from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { isStructuredValue } from '@interpreter/utils/structured-value';

export interface PipelineFinalizerDependencies {
  applySecurityOptions: (
    overrides?: Partial<VariableFactoryInitOptions>,
    existing?: SecurityDescriptor
  ) => VariableFactoryInitOptions;
  baseCtx: Partial<VariableContext>;
  baseInternal: Partial<VariableInternalMetadata>;
  directive: DirectiveNode;
  env: Environment;
  extractSecurityFromValue: (value: unknown) => SecurityDescriptor | undefined;
  identifier: string;
  source: VariableSource;
  valueNode: unknown;
}

export interface PipelineFinalizer {
  process: (variable: Variable) => Promise<Variable>;
}

function shouldSkipPipeline(valueNode: unknown): boolean {
  return !!(
    valueNode
    && typeof valueNode === 'object'
    && (
      (((valueNode as any).type === 'ExecInvocation') && !!(valueNode as any).withClause)
      || (((valueNode as any).type === 'VariableReference') && !!(valueNode as any).pipes)
      || (((valueNode as any).type === 'load-content') && !!(valueNode as any).pipes)
    )
  );
}

function commandWasHandledByRun(valueNode: unknown, directive: DirectiveNode): boolean {
  return !!(
    valueNode
    && typeof valueNode === 'object'
    && (valueNode as any).type === 'command'
    && !!(directive.values?.withClause || directive.meta?.withClause)
  );
}

export function createPipelineFinalizer(
  dependencies: PipelineFinalizerDependencies
): PipelineFinalizer {
  const {
    applySecurityOptions,
    baseCtx,
    baseInternal,
    directive,
    env,
    extractSecurityFromValue,
    identifier,
    source,
    valueNode
  } = dependencies;

  const processVariable = async (variable: Variable): Promise<Variable> => {
    let result: unknown = variable;
    const skip = shouldSkipPipeline(valueNode);
    const handledByRun = commandWasHandledByRun(valueNode, directive);

    if (!skip && !handledByRun) {
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[var.ts] Calling processPipeline:', {
          identifier,
          variableType: variable.type,
          hasCtx: !!variable.mx,
          hasInternal: !!variable.internal,
          isRetryable: variable.internal?.isRetryable || false,
          hasSourceFunction: !!(variable.internal?.sourceFunction),
          sourceNodeType: (variable.internal?.sourceFunction as any)?.type
        });
      }

      const { processPipeline } = await import('../pipeline/unified-processor');
      result = await processPipeline({
        value: variable,
        env,
        node: valueNode,
        directive,
        identifier,
        location: directive.location,
        isRetryable: variable.internal?.isRetryable || false
      });
    }

    if (typeof result === 'string' && result !== variable.value) {
      const existingSecurity = extractSecurityFromValue(variable);
      const options = applySecurityOptions(
        {
          mx: { ...(variable.mx ?? {}), ...baseCtx },
          internal: { ...(variable.internal ?? {}), ...baseInternal }
        },
        existingSecurity
      );
      return createSimpleTextVariable(identifier, result, source, options);
    }

    if (isStructuredValue(result)) {
      const existingSecurity = extractSecurityFromValue(variable);
      const options = applySecurityOptions(
        {
          mx: { ...(variable.mx ?? {}), ...baseCtx },
          internal: { ...(variable.internal ?? {}), ...baseInternal, isPipelineResult: true }
        },
        existingSecurity
      );
      return createStructuredValueVariable(identifier, result, source, options);
    }

    return variable;
  };

  return {
    process: processVariable
  };
}
