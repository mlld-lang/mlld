import type { DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import { interpolate } from '@interpreter/core/interpreter';
import { isStructuredValue, asText } from '@interpreter/utils/structured-value';
import { applyHeaderTransform, extractSection } from './section-utils';

export interface ShowTemplateLoadHandlerParams {
  directive: DirectiveNode;
  env: Environment;
  collectInterpolatedDescriptor: (descriptor?: SecurityDescriptor) => void;
}

export interface ShowLoadContentResult {
  content: string;
  resultValue: unknown;
}

export async function evaluateShowTemplate({
  directive,
  env,
  collectInterpolatedDescriptor
}: ShowTemplateLoadHandlerParams): Promise<string> {
  const templateNodes = directive.values?.content;
  if (!templateNodes) {
    throw new Error('Add template directive missing content');
  }

  let content = await interpolate(templateNodes, env, undefined, {
    collectSecurityDescriptor: collectInterpolatedDescriptor
  });

  if (directive.values?.pipeline) {
    const { executePipeline } = await import('@interpreter/eval/pipeline');
    content = await executePipeline(content, directive.values.pipeline, env);
  }

  const sectionNodes = directive.values?.section;
  if (sectionNodes && Array.isArray(sectionNodes)) {
    const section = await interpolate(sectionNodes, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
    if (section) {
      content = extractSection(content, section);
    }
  }

  return content;
}

export async function evaluateShowLoadContent({
  directive,
  env,
  collectInterpolatedDescriptor
}: ShowTemplateLoadHandlerParams): Promise<ShowLoadContentResult> {
  const loadContentNode = directive.values?.loadContent;
  if (!loadContentNode) {
    throw new Error('Show load content directive missing content loader');
  }

  const { processContentLoader } = await import('@interpreter/eval/content-loader');
  const loadResult = await processContentLoader(loadContentNode, env);

  let content = '';
  let resultValue: unknown;
  if (isStructuredValue(loadResult)) {
    resultValue = loadResult;
    content = asText(loadResult);
  } else if (typeof loadResult === 'string') {
    content = loadResult;
    resultValue = loadResult;
  } else {
    try {
      content = String(loadResult ?? '');
    } catch {
      content = '';
    }
    resultValue = loadResult;
  }

  const newTitleNodes = directive.values?.newTitle;
  if (newTitleNodes && loadContentNode.options?.section) {
    const newTitle = await interpolate(newTitleNodes, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
    content = applyHeaderTransform(content, newTitle);
  }

  return {
    content,
    resultValue
  };
}
