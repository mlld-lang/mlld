import type { DirectiveNode, SourceLocation } from '@core/types';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { JSONFormatter } from '@interpreter/core/json-formatter';
import { getOperationLabels } from '@core/policy/operation-labels';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { descriptorToInputTaint, mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import { materializeDisplayValue } from '@interpreter/utils/display-materialization';
import {
  applySecurityDescriptorToStructuredValue,
  asText,
  isStructuredValue,
  parseAndWrapJson
} from '@interpreter/utils/structured-value';
import { wrapExecResult } from '@interpreter/utils/structured-exec';

export interface ShowDisplayMaterialized {
  text: string;
  descriptor?: SecurityDescriptor;
}

export interface ShowPolicyContext {
  context?: EvaluationContext;
  directive: DirectiveNode;
  env: Environment;
  descriptorCollector: ShowDescriptorCollector;
  displayDescriptor?: SecurityDescriptor;
  directiveLocation: SourceLocation | null;
}

export class ShowDescriptorCollector {
  private interpolatedDescriptor: SecurityDescriptor | undefined;
  private sourceDescriptor: SecurityDescriptor | undefined;

  public constructor(private readonly env: Environment) {}

  public collectInterpolatedDescriptor(descriptor?: SecurityDescriptor): void {
    if (!descriptor) {
      return;
    }
    this.interpolatedDescriptor = this.interpolatedDescriptor
      ? this.env.mergeSecurityDescriptors(this.interpolatedDescriptor, descriptor)
      : descriptor;
  }

  public setSourceFromVariable(variable?: Variable): void {
    const descriptor = this.descriptorFromVariable(variable);
    if (!descriptor) {
      return;
    }
    this.sourceDescriptor = this.sourceDescriptor
      ? this.env.mergeSecurityDescriptors(this.sourceDescriptor, descriptor)
      : descriptor;
  }

  public mergePipelineDescriptorFromVariable(variable?: Variable): SecurityDescriptor | undefined {
    return this.mergePipelineDescriptors(this.descriptorFromVariable(variable), this.interpolatedDescriptor);
  }

  public mergePipelineDescriptors(
    ...values: (SecurityDescriptor | undefined)[]
  ): SecurityDescriptor | undefined {
    const descriptors = values.filter(Boolean) as SecurityDescriptor[];
    if (descriptors.length === 0) {
      return undefined;
    }
    if (descriptors.length === 1) {
      return descriptors[0];
    }
    return this.env.mergeSecurityDescriptors(...descriptors);
  }

  public getInterpolatedDescriptor(): SecurityDescriptor | undefined {
    return this.interpolatedDescriptor;
  }

  public getSourceDescriptor(): SecurityDescriptor | undefined {
    return this.sourceDescriptor;
  }

  private descriptorFromVariable(variable?: Variable): SecurityDescriptor | undefined {
    if (!variable?.mx) {
      return undefined;
    }
    return varMxToSecurityDescriptor(variable.mx);
  }
}

export function normalizeShowContent(content: unknown, skipJsonFormatting: boolean): string {
  if (typeof content !== 'string') {
    try {
      if (isStructuredValue(content)) {
        return asText(content);
      }
      if (Array.isArray(content)) {
        return JSONFormatter.stringify(content, { pretty: true });
      }
      if (content !== null && content !== undefined) {
        return JSONFormatter.stringify(content, { pretty: true });
      }
      return '';
    } catch {
      return String(content);
    }
  }

  if (!skipJsonFormatting) {
    const parsed = parseAndWrapJson(content, { preserveText: true });
    if (parsed && typeof parsed !== 'string' && isStructuredValue(parsed)) {
      return JSONFormatter.stringify(parsed.data, { pretty: true });
    }
  }

  return content;
}

export function materializeShowDisplayValue(content: string, resultValue: unknown): ShowDisplayMaterialized {
  return materializeDisplayValue(content, undefined, resultValue);
}

export function enforceShowPolicyIfNeeded({
  context,
  directive,
  env,
  descriptorCollector,
  displayDescriptor,
  directiveLocation
}: ShowPolicyContext): void {
  if (context?.isExpression || context?.policyChecked) {
    return;
  }

  const inputDescriptor = mergeInputDescriptors(
    descriptorCollector.getInterpolatedDescriptor(),
    displayDescriptor,
    descriptorCollector.getSourceDescriptor()
  );
  const inputTaint = descriptorToInputTaint(inputDescriptor);
  if (inputTaint.length === 0) {
    return;
  }

  const opType = directive.kind === 'stream' ? 'stream' : 'show';
  const opLabels =
    context?.operationContext?.opLabels ?? getOperationLabels({ type: opType });
  const enforcer = new PolicyEnforcer(env.getPolicySummary());
  enforcer.checkLabelFlow(
    {
      inputTaint,
      opLabels,
      exeLabels: Array.from(env.getEnclosingExeLabels()),
      flowChannel: 'arg'
    },
    { env, sourceLocation: directiveLocation }
  );
}

export function emitShowEffectIfNeeded(
  context: EvaluationContext | undefined,
  env: Environment,
  content: string,
  source: DirectiveNode['location'],
  isStreamingShow: boolean
): void {
  if ((context?.isExpression && !context.allowEffects) || isStreamingShow) {
    return;
  }
  env.emitEffect('both', content, { source });
}

export function buildShowResultDescriptor(
  env: Environment,
  descriptorCollector: ShowDescriptorCollector,
  displayDescriptor?: SecurityDescriptor
): SecurityDescriptor | undefined {
  const snapshot = env.getSecuritySnapshot();
  return mergeDescriptors(
    descriptorCollector.getInterpolatedDescriptor(),
    displayDescriptor,
    descriptorCollector.getSourceDescriptor(),
    snapshot
      ? makeSecurityDescriptor({
          labels: snapshot.labels,
          taint: snapshot.taint,
          sources: snapshot.sources,
          policyContext: snapshot.policy ? { ...snapshot.policy } : undefined
        })
      : undefined
  );
}

export function wrapShowResult(
  resultValue: unknown,
  textForWrapper: string,
  descriptor?: SecurityDescriptor,
  securityLabels?: DataLabel[]
): unknown {
  const baseValue = resultValue ?? textForWrapper;
  const wrapOptions =
    !isStructuredValue(baseValue) && typeof baseValue !== 'string'
      ? { text: textForWrapper }
      : undefined;
  const wrapped = wrapExecResult(baseValue, wrapOptions);

  if (descriptor) {
    applySecurityDescriptorToStructuredValue(wrapped, descriptor);
  }
  if (securityLabels && securityLabels.length > 0) {
    wrapped.metadata = wrapped.metadata || {};
    wrapped.metadata.securityLabels = [...securityLabels];
  }

  return wrapped;
}
