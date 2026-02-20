import * as fs from 'fs';
import type { DirectiveNode } from '@core/types';
import { astLocationToSourceLocation } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { JSONFormatter } from '../core/json-formatter';
import type { DataLabel } from '@core/types/security';
import { logger } from '@core/utils/logger';
import {
  asText,
  isStructuredValue
} from '@interpreter/utils/structured-value';
// Template normalization now handled in grammar - no longer needed here
import {
  buildShowResultDescriptor,
  emitShowEffectIfNeeded,
  enforceShowPolicyIfNeeded,
  materializeShowDisplayValue,
  normalizeShowContent,
  ShowDescriptorCollector,
  wrapShowResult
} from './show/shared-helpers';
import { applyHeaderTransform, extractSection } from './show/section-utils';
import { dispatchShowSubtype } from './show/show-dispatcher';

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
  const securityLabels = (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined;
  let isStreamingShow = false;
  const descriptorCollector = new ShowDescriptorCollector(env);
  const collectInterpolatedDescriptor = descriptorCollector.collectInterpolatedDescriptor.bind(descriptorCollector);
  
  const directiveLocation = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());

  const dispatchResult = await dispatchShowSubtype({
    directive,
    env,
    context,
    descriptorCollector,
    collectInterpolatedDescriptor,
    directiveLocation,
    securityLabels
  });
  content = dispatchResult.content;
  resultValue = dispatchResult.resultValue;
  if (dispatchResult.skipJsonFormatting) {
    skipJsonFormatting = true;
  }
  if (dispatchResult.isStreamingShow) {
    isStreamingShow = true;
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

export { applyHeaderTransform, extractSection };
