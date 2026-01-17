import type { PolicyConfig } from '@core/policy/union';
import type { SourceLocation } from '@core/types';
import { MlldSecurityError } from '@core/errors';
import { checkLabelFlow, type FlowContext } from '@core/policy/label-flow';
import type { Environment } from '@interpreter/env/Environment';

export class PolicyEnforcer {
  private readonly policy?: PolicyConfig;

  constructor(policy?: PolicyConfig) {
    this.policy = policy;
  }

  checkLabelFlow(
    ctx: FlowContext,
    options?: { env?: Environment; sourceLocation?: SourceLocation }
  ): void {
    if (!this.policy?.labels) {
      return;
    }

    const result = checkLabelFlow(ctx, this.policy);
    if (result.allowed) {
      return;
    }

    throw new MlldSecurityError(result.reason ?? 'Label flow denied by policy', {
      code: 'LABEL_FLOW_DENIED',
      details: {
        label: result.label,
        rule: result.rule,
        matched: result.matched,
        opLabels: ctx.opLabels,
        exeLabels: ctx.exeLabels,
        flowChannel: ctx.flowChannel,
        command: ctx.command
      },
      sourceLocation: options?.sourceLocation,
      env: options?.env
    });
  }
}
