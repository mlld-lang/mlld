import type { Environment } from '../../env/Environment';
import { PipelineExecutor } from '../pipeline/executor';
import type { PipelineCommand, PipelineStage, PipelineStageEntry } from '@core/types/run';
import { extractSecurityDescriptor } from '../../utils/structured-value';
import type { SecurityDescriptor } from '@core/types/security';

interface ParallelExecResult {
  value: any;
  descriptor?: SecurityDescriptor;
}

function toPipelineCommand(node: any): PipelineStageEntry {
  const commandRef = node.commandRef || {};
  const identifier = Array.isArray(commandRef.identifier)
    ? commandRef.identifier
    : commandRef.identifier
      ? [commandRef.identifier]
      : [];
  const rawIdentifier =
    commandRef.name ||
    (Array.isArray(commandRef.identifier)
      ? commandRef.identifier.map((id: any) => id.identifier || id.content || '').find(Boolean)
      : commandRef.identifier) ||
    'unknown';
  const rawArgs = (commandRef.args || []).map((arg: any) => {
    if (arg && typeof arg === 'object' && 'content' in arg) return (arg as any).content;
    return typeof arg === 'string' ? arg : '';
  });

  const command: PipelineCommand & { stream?: boolean } = {
    identifier,
    args: commandRef.args || [],
    fields: commandRef.fields || [],
    rawIdentifier,
    rawArgs,
    meta: {}
  };

  if (node.withClause) {
    command.withClause = node.withClause;
    command.meta = { ...(command.meta || {}), withClause: node.withClause };
    if (node.withClause.stream !== undefined) {
      command.stream = node.withClause.stream;
    }
  }

  return command;
}

/**
 * Execute two ExecInvocations in parallel using pipeline semantics.
 * Returns the aggregated result (array string/StructuredValue) plus any descriptor.
 */
export async function executeParallelExecInvocations(
  left: any,
  right: any,
  env: Environment
): Promise<ParallelExecResult> {
  const stage = [toPipelineCommand(left), toPipelineCommand(right)] as PipelineStage;
  const pipeline: PipelineStage[] = [stage];

  const executor = new PipelineExecutor(pipeline, env);
  const executionResult = await executor.execute('', { returnStructured: true });
  const descriptor = extractSecurityDescriptor(executionResult, {
    recursive: true,
    mergeArrayElements: true
  });

  return { value: executionResult, descriptor };
}
