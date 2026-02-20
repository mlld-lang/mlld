import type { DirectiveNode, SourceLocation } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import { llmxmlInstance } from '@interpreter/utils/llmxml-instance';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
import type { Environment } from '@interpreter/env/Environment';
import { interpolate } from '@interpreter/core/interpreter';
import { applyHeaderTransform, extractSection } from './section-utils';

export interface ShowPathHandlerParams {
  directive: DirectiveNode;
  env: Environment;
  directiveLocation: SourceLocation | null;
  collectInterpolatedDescriptor: (descriptor?: SecurityDescriptor) => void;
}

async function resolvePathValue(
  pathValue: unknown,
  env: Environment,
  collectInterpolatedDescriptor: (descriptor?: SecurityDescriptor) => void
): Promise<string> {
  if (typeof pathValue === 'string') {
    return pathValue;
  }
  if (Array.isArray(pathValue)) {
    return interpolate(pathValue, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
  }
  throw new Error('Invalid path type in add directive');
}

async function readPathContent(
  env: Environment,
  resolvedPath: string,
  directiveLocation: SourceLocation | null
): Promise<string> {
  if (env.isURL(resolvedPath)) {
    return env.fetchURL(resolvedPath);
  }
  return readFileWithPolicy(env, resolvedPath, directiveLocation ?? undefined);
}

export async function evaluateShowPath({
  directive,
  env,
  directiveLocation,
  collectInterpolatedDescriptor
}: ShowPathHandlerParams): Promise<string> {
  const pathValue = directive.values?.path;
  if (!pathValue) {
    throw new Error('Add path directive missing path');
  }

  const resolvedPath = await resolvePathValue(pathValue, env, collectInterpolatedDescriptor);
  if (!resolvedPath) {
    throw new Error('Add path directive resolved to empty path');
  }

  return readPathContent(env, resolvedPath, directiveLocation);
}

export async function evaluateShowPathSection({
  directive,
  env,
  directiveLocation,
  collectInterpolatedDescriptor
}: ShowPathHandlerParams): Promise<string> {
  const sectionTitleNodes = directive.values?.sectionTitle;
  const pathValue = directive.values?.path;

  if (!sectionTitleNodes || !pathValue) {
    throw new Error('Add section directive missing section title or path');
  }

  const sectionTitle = await interpolate(sectionTitleNodes, env, undefined, {
    collectSecurityDescriptor: collectInterpolatedDescriptor
  });

  const resolvedPath = await resolvePathValue(pathValue, env, collectInterpolatedDescriptor);
  let content = await readPathContent(env, resolvedPath, directiveLocation);

  try {
    const titleWithoutHash = sectionTitle.replace(/^#+\s*/, '');
    content = await llmxmlInstance.getSection(content, titleWithoutHash, {
      includeNested: true
    });
    content = content.trimEnd();
  } catch {
    content = extractSection(content, sectionTitle);
  }

  const newTitleNodes = directive.values?.newTitle;
  if (newTitleNodes) {
    const newTitle = await interpolate(newTitleNodes, env, undefined, {
      collectSecurityDescriptor: collectInterpolatedDescriptor
    });
    content = applyHeaderTransform(content, newTitle);
  }

  return content;
}
