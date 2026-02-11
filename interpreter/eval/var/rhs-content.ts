import type { SourceLocation } from '@core/types';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import type { Environment } from '@interpreter/env/Environment';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
import { applyHeaderTransform } from '../show';

export interface RhsContentEvaluatorDependencies {
  interpolateWithSecurity: (nodes: unknown) => Promise<string>;
  sourceLocation?: SourceLocation;
  withClause?: {
    asSection?: unknown;
  };
}

export interface RhsContentEvaluator {
  evaluateFileReference: (valueNode: any) => Promise<unknown>;
  evaluateLoadContent: (valueNode: any) => Promise<unknown>;
  evaluatePath: (valueNode: any) => Promise<string>;
  evaluateSection: (valueNode: any) => Promise<string>;
}

function resolveAsSection(withClause?: { asSection?: unknown }): unknown {
  return withClause?.asSection;
}

function hasGlobSource(valueNode: any): boolean {
  return !!(valueNode?.source?.raw?.includes('*') || valueNode?.source?.raw?.includes('?'));
}

function applyAsSectionTransformToLoadContentNode(valueNode: any, asSection: unknown): void {
  if (!asSection) {
    return;
  }

  if (!valueNode.options) {
    valueNode.options = {};
  }

  if (hasGlobSource(valueNode)) {
    valueNode.options.transform = {
      type: 'template',
      parts: asSection
    };
    return;
  }

  if (!valueNode.options.section) {
    valueNode.options.section = {};
  }
  valueNode.options.section.renamed = {
    type: 'rename-template',
    parts: asSection
  };
}

export function extractSectionFallback(content: string, sectionName: string): string {
  const lines = content.split('\n');
  const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');

  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (!inSection && sectionRegex.test(line)) {
      inSection = true;
      sectionLevel = line.match(/^#+/)?.[0].length || 0;
      sectionLines.push(line);
      continue;
    }

    if (inSection) {
      const headerMatch = line.match(/^(#+)\\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n').trim();
}

export function createRhsContentEvaluator(
  env: Environment,
  dependencies: RhsContentEvaluatorDependencies
): RhsContentEvaluator {
  const { interpolateWithSecurity, sourceLocation, withClause } = dependencies;

  const evaluateFileReference = async (valueNode: any): Promise<unknown> => {
    const { processContentLoader } = await import('../content-loader');
    const { accessField } = await import('@interpreter/utils/field-access');

    const loadContentNode = {
      type: 'load-content' as const,
      source: valueNode.source,
      options: valueNode.options,
      pipes: valueNode.pipes
    };

    const rawResult = await processContentLoader(loadContentNode as any, env);
    let structuredResult = isStructuredValue(rawResult) ? rawResult : wrapLoadContentValue(rawResult);

    if (valueNode.fields && valueNode.fields.length > 0) {
      for (const field of valueNode.fields) {
        structuredResult = await accessField(structuredResult, field, { env });
      }
    }

    return structuredResult;
  };

  const evaluatePath = async (valueNode: any): Promise<string> => {
    const filePath = await interpolateWithSecurity(valueNode.segments);
    return readFileWithPolicy(env, filePath, sourceLocation ?? undefined);
  };

  const evaluateSection = async (valueNode: any): Promise<string> => {
    const filePath = await interpolateWithSecurity(valueNode.path);
    const sectionName = await interpolateWithSecurity(valueNode.section);
    const fileContent = await readFileWithPolicy(env, filePath, sourceLocation ?? undefined);

    let resolvedValue: string;
    try {
      const { llmxmlInstance } = await import('@interpreter/utils/llmxml-instance');
      resolvedValue = await llmxmlInstance.getSection(fileContent, sectionName, {
        includeNested: true,
        includeTitle: true
      });
    } catch {
      resolvedValue = extractSectionFallback(fileContent, sectionName);
    }

    const asSection = resolveAsSection(withClause);
    if (asSection) {
      const header = await interpolateWithSecurity(asSection);
      resolvedValue = applyHeaderTransform(resolvedValue, header);
    }

    return resolvedValue;
  };

  const evaluateLoadContent = async (valueNode: any): Promise<unknown> => {
    const { processContentLoader } = await import('../content-loader');

    const asSection = resolveAsSection(withClause);
    if (asSection) {
      applyAsSectionTransformToLoadContentNode(valueNode, asSection);
    }

    return processContentLoader(valueNode, env);
  };

  return {
    evaluateFileReference,
    evaluateLoadContent,
    evaluatePath,
    evaluateSection
  };
}
