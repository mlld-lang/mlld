import type { DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';

export interface ReferenceDescriptorState {
  descriptorFromVariable: (variable?: Variable) => SecurityDescriptor | undefined;
  getResolvedDescriptor: () => SecurityDescriptor | undefined;
  mergePipelineDescriptor: (
    ...descriptors: (SecurityDescriptor | undefined)[]
  ) => SecurityDescriptor | undefined;
}

export interface ReferenceEvaluatorDependencies {
  descriptorState: ReferenceDescriptorState;
  directive: DirectiveNode;
  env: Environment;
}

export interface ReferenceEvaluationResult {
  executableVariable?: Variable;
  resolvedValue: unknown;
}

export interface ReferenceEvaluator {
  evaluateVariableReference: (
    valueNode: any,
    assignmentIdentifier: string
  ) => Promise<ReferenceEvaluationResult>;
  evaluateVariableReferenceWithTail: (
    valueNode: any,
    assignmentIdentifier: string
  ) => Promise<ReferenceEvaluationResult>;
}

async function throwVariableNotFound(
  identifier: string,
  directive: DirectiveNode,
  env: Environment
): Promise<never> {
  const { MlldDirectiveError } = await import('@core/errors');
  throw new MlldDirectiveError(
    `Variable not found: ${identifier}`,
    'var',
    { location: directive.location, env }
  );
}

function createPipelineDescriptorHint(
  descriptorState: ReferenceDescriptorState,
  sourceVar: Variable
): SecurityDescriptor | undefined {
  return descriptorState.mergePipelineDescriptor(
    descriptorState.descriptorFromVariable(sourceVar),
    descriptorState.getResolvedDescriptor()
  );
}

export function createReferenceEvaluator(
  dependencies: ReferenceEvaluatorDependencies
): ReferenceEvaluator {
  const { descriptorState, directive, env } = dependencies;

  const evaluateVariableReference = async (
    valueNode: any,
    assignmentIdentifier: string
  ): Promise<ReferenceEvaluationResult> => {
    const sourceVar = env.getVariable(valueNode.identifier);
    if (!sourceVar) {
      await throwVariableNotFound(valueNode.identifier, directive, env);
    }

    const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
    const { accessField } = await import('@interpreter/utils/field-access');
    const resolvedVar = await resolveVariable(sourceVar, env, ResolutionContext.VariableCopy);

    let resolvedValue: unknown;
    if (valueNode.fields && valueNode.fields.length > 0) {
      const fieldResult = await accessField(resolvedVar, valueNode.fields[0], {
        preserveContext: true,
        env,
        sourceLocation: directive.location
      });
      let currentResult = fieldResult as any;

      for (let i = 1; i < valueNode.fields.length; i++) {
        currentResult = await accessField(currentResult.value, valueNode.fields[i], {
          preserveContext: true,
          parentPath: currentResult.accessPath,
          env,
          sourceLocation: directive.location
        });
      }

      resolvedValue = currentResult.value;
      if (
        resolvedValue &&
        typeof resolvedValue === 'object' &&
        (resolvedValue as Record<string, unknown>).type === 'executable'
      ) {
        return {
          executableVariable: resolvedValue as Variable,
          resolvedValue
        };
      }
    } else {
      resolvedValue = resolvedVar;
    }

    if (valueNode.pipes && valueNode.pipes.length > 0) {
      const { processPipeline } = await import('../pipeline/unified-processor');
      resolvedValue = await processPipeline({
        value: resolvedValue,
        env,
        node: valueNode,
        identifier: assignmentIdentifier,
        location: directive.location,
        descriptorHint: createPipelineDescriptorHint(descriptorState, sourceVar)
      });
    }

    return { resolvedValue };
  };

  const evaluateVariableReferenceWithTail = async (
    valueNode: any,
    assignmentIdentifier: string
  ): Promise<ReferenceEvaluationResult> => {
    const sourceVar = env.getVariable(valueNode.variable.identifier);
    if (!sourceVar) {
      await throwVariableNotFound(valueNode.variable.identifier, directive, env);
    }

    const { resolveVariable, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
    const { accessFields } = await import('@interpreter/utils/field-access');

    const needsPipelineExtraction = !!(valueNode.withClause && valueNode.withClause.pipeline);
    const hasFieldAccess = !!(valueNode.variable.fields && valueNode.variable.fields.length > 0);
    const resolutionContext = needsPipelineExtraction && !hasFieldAccess
      ? ResolutionContext.PipelineInput
      : ResolutionContext.FieldAccess;

    const resolvedVar = await resolveVariable(sourceVar, env, resolutionContext);
    let resolvedValue: unknown = resolvedVar;

    if (valueNode.variable.fields && valueNode.variable.fields.length > 0) {
      const fieldResult = await accessFields(resolvedVar, valueNode.variable.fields, {
        preserveContext: true,
        env,
        sourceLocation: directive.location
      });
      resolvedValue = (fieldResult as any).value;
    }

    if (valueNode.withClause && valueNode.withClause.pipeline) {
      const { processPipeline } = await import('../pipeline/unified-processor');
      resolvedValue = await processPipeline({
        value: resolvedValue,
        env,
        node: valueNode,
        identifier: assignmentIdentifier,
        location: directive.location,
        descriptorHint: createPipelineDescriptorHint(descriptorState, sourceVar)
      });
    }

    return { resolvedValue };
  };

  return {
    evaluateVariableReference,
    evaluateVariableReferenceWithTail
  };
}
