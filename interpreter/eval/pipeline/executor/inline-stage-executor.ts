import type { Environment } from '@interpreter/env/Environment';
import type { InlineCommandStage, InlineValueStage } from '@core/types';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { StageContext } from '@interpreter/eval/pipeline/state-machine';
import type { SecurityDescriptor } from '@core/types/security';
import { extractSecurityDescriptor, applySecurityDescriptorToStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { setExpressionProvenance } from '@interpreter/utils/expression-provenance';
import { parseCommand, getOperationLabels } from '@core/policy/operation-labels';
import { evaluateCommandAccess } from '@core/policy/guards';
import { MlldSecurityError } from '@core/errors';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { resolveWorkingDirectory } from '@interpreter/utils/working-directory';
import { PipelineOutputProcessor } from './output-processor';
import { safeJSONStringify } from './helpers';
import type { PipelineCommandExecutionContextFactory, StageExecutionResult } from './types';

interface InlineCommandExecutionRequest {
  stage: InlineCommandStage;
  structuredInput: StructuredValue;
  stageEnv: Environment;
  operationContext?: OperationContext;
  stageIndex: number;
  stageContext: StageContext;
  contextFactory: PipelineCommandExecutionContextFactory;
  parallelIndex?: number;
}

export class PipelineInlineStageExecutor {
  constructor(
    private readonly env: Environment,
    private readonly outputProcessor: PipelineOutputProcessor
  ) {}

  async executeInlineCommandStage(request: InlineCommandExecutionRequest): Promise<StageExecutionResult> {
    const {
      stage,
      structuredInput,
      stageEnv,
      operationContext,
      stageIndex,
      stageContext,
      contextFactory,
      parallelIndex
    } = request;
    const mxManager = stageEnv.getContextManager();
    const runInline = async (): Promise<StageExecutionResult> => {
      const { interpolate } = await import('@interpreter/core/interpreter');
      const descriptors: SecurityDescriptor[] = [];
      const workingDirectory = await resolveWorkingDirectory(stage.workingDir as any, stageEnv, {
        sourceLocation: stage.location,
        directiveType: 'run'
      });
      const commandText = await interpolate(stage.command, stageEnv, InterpolationContext.ShellCommand, {
        collectSecurityDescriptor: d => {
          if (d) descriptors.push(d);
        }
      });
      const parsedCommand = parseCommand(commandText);
      const opLabels = getOperationLabels({
        type: 'cmd',
        command: parsedCommand.command,
        subcommand: parsedCommand.subcommand
      });
      if (operationContext) {
        operationContext.command = commandText;
        operationContext.opLabels = opLabels;
        const metadata = { ...(operationContext.metadata ?? {}) } as Record<string, unknown>;
        metadata.commandPreview = commandText;
        operationContext.metadata = metadata;
      }
      stageEnv.updateOpContext({ command: commandText, opLabels });
      const policySummary = stageEnv.getPolicySummary();
      if (policySummary) {
        const decision = evaluateCommandAccess(policySummary, commandText);
        if (!decision.allowed) {
          throw new MlldSecurityError(
            decision.reason ?? `Command '${decision.commandName}' denied by policy`,
            {
              code: 'POLICY_CAPABILITY_DENIED',
              sourceLocation: stage.location,
              env: stageEnv
            }
          );
        }
      }
      const commandDescriptor =
        descriptors.length > 1 ? stageEnv.mergeSecurityDescriptors(...descriptors) : descriptors[0];
      const stdinDescriptor = extractSecurityDescriptor(structuredInput, {
        recursive: true,
        mergeArrayElements: true
      });
      const inputDescriptor =
        commandDescriptor && stdinDescriptor
          ? stageEnv.mergeSecurityDescriptors(commandDescriptor, stdinDescriptor)
          : commandDescriptor ?? stdinDescriptor;
      const inputTaint = descriptorToInputTaint(inputDescriptor);
      if (inputTaint.length > 0) {
        const policyEnforcer = new PolicyEnforcer(stageEnv.getPolicySummary());
        policyEnforcer.checkLabelFlow(
          {
            inputTaint,
            opLabels,
            exeLabels: Array.from(stageEnv.getEnclosingExeLabels()),
            flowChannel: 'stdin',
            command: parsedCommand.command
          },
          { env: stageEnv, sourceLocation: stage.location }
        );
      }
      const stdinInput = structuredInput?.text ?? '';
      const result = await stageEnv.executeCommand(
        commandText,
        { input: stdinInput, ...(workingDirectory ? { workingDirectory } : {}) },
        contextFactory.createCommandExecutionContext(
          stageIndex,
          stageContext,
          parallelIndex,
          stage.rawIdentifier,
          workingDirectory
        )
      );
      const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
      const normalizedResult = processCommandOutput(result);
      const labelDescriptor =
        descriptors.length > 1 ? stageEnv.mergeSecurityDescriptors(...descriptors) : descriptors[0];
      return { result: normalizedResult, labelDescriptor };
    };

    if (mxManager && operationContext) {
      return await mxManager.withOperation(operationContext, runInline);
    }
    return await runInline();
  }

  async executeInlineValueStage(
    stage: InlineValueStage,
    stageInput: StructuredValue,
    stageEnv: Environment
  ): Promise<StageExecutionResult> {
    const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
    const value = await evaluateDataValue(stage.value, stageEnv);
    const text = safeJSONStringify(value);
    const wrapped = wrapStructured(value, 'object', text);
    const descriptor = extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true });
    if (descriptor) {
      applySecurityDescriptorToStructuredValue(wrapped, descriptor);
      setExpressionProvenance(wrapped, descriptor);
    }
    const mergedDescriptor =
      descriptor && stageEnv ? stageEnv.mergeSecurityDescriptors(descriptor) : descriptor;
    return {
      result: this.outputProcessor.finalizeStageOutput(wrapped, stageInput, value, mergedDescriptor),
      labelDescriptor: mergedDescriptor
    };
  }
}
