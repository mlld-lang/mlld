import type { DirectiveNode, SourceLocation } from '@core/types';
import type { OutputTargetFile } from '@core/types/output';
import type { Environment } from '../env/Environment';
import type { EvalResult, EvaluationContext } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { evaluateOutputSource } from './output';
import { materializeDisplayValue } from '../utils/display-materialization';
import { formatJSONL } from './output-shared';
import { MlldDirectiveError } from '@core/errors';
import * as path from 'path';
import type { SecurityDescriptor } from '@core/types/security';

interface AppendOptions {
  location?: SourceLocation;
  directiveKind?: string;
  format?: string;
}

/**
 * Evaluate the /append directive.
 * Appends the evaluated source to a file target.
 */
export async function evaluateAppend(
  directive: DirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  if (env.getIsImporting()) {
    return { value: null, env };
  }

  if (!directive.meta?.hasSource) {
    throw new MlldDirectiveError(
      '/append requires source content before the target',
      'append',
      { location: directive.location }
    );
  }

  const sourceType = directive.meta?.sourceType;
  if (!sourceType) {
    throw new MlldDirectiveError(
      'Unable to determine append source type',
      'append',
      { location: directive.location }
    );
  }

  const target = directive.values?.target as OutputTargetFile | undefined;
  if (!target || target.type !== 'file') {
    throw new MlldDirectiveError(
      '/append supports file targets only',
      'append',
      { location: directive.location }
    );
  }

  const sourceResult = await evaluateOutputSource(directive, env, sourceType, context);
  let content = sourceResult.text;
  const descriptorSource = sourceResult.rawValue;
  const materialized = materializeDisplayValue(
    descriptorSource ?? content,
    undefined,
    descriptorSource ?? content,
    content
  );
  content = materialized.text;
  if (materialized.descriptor) {
    env.recordSecurityDescriptor(materialized.descriptor);
  }
  const format = typeof directive.meta?.format === 'string' ? directive.meta?.format : undefined;
  await appendContentToFile(target, content, env, {
    location: directive.location,
    directiveKind: 'append',
    format
  });

  (env as any).hasExplicitOutput = true;
  return { value: '', env };
}

export async function appendContentToFile(
  target: OutputTargetFile,
  content: string,
  env: Environment,
  options: AppendOptions
): Promise<void> {
  const resolvedPath = await resolveAppendPath(target, env);
  const directiveKind = options.directiveKind ?? 'append';
  const { payload, format } = formatAppendPayload(resolvedPath, content, {
    location: options.location,
    directiveKind,
    format: options.format
  });

  const fileSystem = (env as any).fileSystem;
  if (!fileSystem || typeof fileSystem.appendFile !== 'function') {
    throw new MlldDirectiveError(
      'File system not available for append directive',
      directiveKind,
      { location: options.location }
    );
  }

  await fileSystem.appendFile(resolvedPath, payload);

  env.emitEffect('file', payload, {
    path: resolvedPath,
    source: options.location,
    mode: 'append',
    metadata: { format }
  });
}

async function resolveAppendPath(
  target: OutputTargetFile,
  env: Environment
): Promise<string> {
  const descriptors: SecurityDescriptor[] = [];
  const interpolated = await interpolate(target.path, env, undefined, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  const merged =
    descriptors.length === 1
      ? descriptors[0]
      : descriptors.length > 1
        ? env.mergeSecurityDescriptors(...descriptors)
        : undefined;
  if (merged) {
    env.recordSecurityDescriptor(merged);
  }
  let resolvedPath = String(interpolated);

  if (!resolvedPath) {
    throw new MlldDirectiveError(
      'Append target path cannot be empty',
      'append'
    );
  }

  if (resolvedPath.startsWith('@base/')) {
    const projectRoot = env.getProjectRoot();
    resolvedPath = path.join(projectRoot, resolvedPath.substring(6));
  }

  if (!path.isAbsolute(resolvedPath)) {
    resolvedPath = path.resolve(env.getBasePath(), resolvedPath);
  }

  return resolvedPath;
}

function formatAppendPayload(
  resolvedPath: string,
  rawContent: string,
  options: AppendOptions
): { payload: string; format: 'jsonl' | 'text' } {
  const directiveKind = options.directiveKind ?? 'append';
  const extension = path.extname(resolvedPath).toLowerCase();
  const explicitFormat = options.format ? String(options.format).toLowerCase() : undefined;

  if (extension === '.json') {
    throw new MlldDirectiveError(
      'Cannot append to .json files. Use a .jsonl extension for JSON lines output.',
      directiveKind,
      { location: options.location }
    );
  }

  if (explicitFormat && explicitFormat !== 'jsonl' && explicitFormat !== 'text') {
    throw new MlldDirectiveError(
      `Unsupported /append format "${explicitFormat}". Allowed formats: jsonl, text.`,
      directiveKind,
      { location: options.location }
    );
  }

  const treatAsJsonl = explicitFormat === 'jsonl' || extension === '.jsonl';

  if (treatAsJsonl) {
    if (extension !== '.jsonl') {
      throw new MlldDirectiveError(
        'JSONL format requires a .jsonl file extension.',
        directiveKind,
        { location: options.location }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      throw new MlldDirectiveError(
        'Content appended to .jsonl must be valid JSON. Provide a variable or template that resolves to JSON data.',
        directiveKind,
        { location: options.location, cause: error instanceof Error ? error : undefined }
      );
    }
    const formatted = formatJSONL(parsed);
    return { payload: ensureTrailingNewline(formatted), format: 'jsonl' };
  }

  return { payload: ensureTrailingNewline(rawContent), format: 'text' };
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}
