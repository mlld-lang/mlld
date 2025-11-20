import type { GuardResult, GuardHint } from '@core/types/guard';
import type { OperationContext } from '../env/ContextManager';
import type { Environment } from '../env/Environment';

export function appendGuardHistory(
  env: Environment,
  operation: OperationContext,
  decision: 'allow' | 'deny' | 'retry',
  guardResults: GuardResult[],
  hints: GuardHint[],
  reasons: string[]
): void {
  const pipelineContext = env.getPipelineContext?.();
  if (!pipelineContext) {
    return;
  }
  env.recordPipelineGuardHistory({
    stage: typeof pipelineContext.stage === 'number' ? pipelineContext.stage : 0,
    operation,
    decision,
    trace: guardResults.slice(),
    hints: hints.slice(),
    reasons: reasons.slice()
  });
}
