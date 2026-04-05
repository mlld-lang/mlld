import type { SourceLocation } from '@core/types';
import { isContinueLiteral, isDoneLiteral } from '@core/types/control';
import type { SecurityDescriptor } from '@core/types/security';
import { interpolate } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { Environment } from '@interpreter/env/Environment';
import {
  maskPlainMlldTemplateFences,
  restorePlainMlldTemplateFences
} from '@interpreter/eval/template-fence-literals';
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import * as path from 'path';

export function isLoopControlValue(value: unknown): boolean {
  const unwrapped = isStructuredValue(value) ? asData(value) : value;

  if (unwrapped && typeof unwrapped === 'object') {
    if ('__whileControl' in (unwrapped as Record<string, unknown>)) {
      return true;
    }
    if (isDoneLiteral(unwrapped as any) || isContinueLiteral(unwrapped as any)) {
      return true;
    }
    if ('valueType' in (unwrapped as Record<string, unknown>)) {
      const valueType = (unwrapped as any).valueType;
      return valueType === 'retry';
    }
  }

  return unwrapped === 'done' || unwrapped === 'continue' || unwrapped === 'retry';
}

export async function interpolateAndRecord(
  nodes: unknown,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes as any, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });

  if (descriptors.length > 0) {
    const merged = descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }

  return text;
}

export async function resolveExeDescription(raw: unknown, env: Environment): Promise<string | undefined> {
  if (typeof raw === 'string') {
    return raw;
  }

  if (raw && typeof raw === 'object' && 'needsInterpolation' in raw && Array.isArray((raw as any).parts)) {
    return interpolate((raw as any).parts, env, InterpolationContext.Default);
  }

  return undefined;
}

async function resolveExecutableWithClauseValue(
  raw: unknown,
  env: Environment
): Promise<unknown> {
  let value = raw;
  if (value && typeof value === 'object' && 'type' in (value as Record<string, unknown>)) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    value = result.value;
  }

  if (isStructuredValue(value)) {
    return asData(value);
  }

  return value;
}

export async function resolveExeControlArgs(
  raw: unknown,
  env: Environment,
  paramNames: readonly string[]
): Promise<string[] | undefined> {
  return resolveExecutableArgListMetadata(raw, env, paramNames, 'controlArgs');
}

export async function resolveExeUpdateArgs(
  raw: unknown,
  env: Environment,
  paramNames: readonly string[]
): Promise<string[] | undefined> {
  return resolveExecutableArgListMetadata(raw, env, paramNames, 'updateArgs');
}

export async function resolveExeExactPayloadArgs(
  raw: unknown,
  env: Environment,
  paramNames: readonly string[]
): Promise<string[] | undefined> {
  return resolveExecutableArgListMetadata(raw, env, paramNames, 'exactPayloadArgs');
}

async function resolveExecutableArgListMetadata(
  raw: unknown,
  env: Environment,
  paramNames: readonly string[],
  fieldName: 'controlArgs' | 'updateArgs' | 'exactPayloadArgs'
): Promise<string[] | undefined> {
  if (raw === undefined) {
    return undefined;
  }

  const value = await resolveExecutableWithClauseValue(raw, env);

  if (!Array.isArray(value)) {
    throw new Error(`Executable ${fieldName} must be an array of parameter names`);
  }

  const knownParams = new Set(paramNames);
  const normalized: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new Error(`Executable ${fieldName} entries must be strings`);
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      throw new Error(`Executable ${fieldName} entries must be non-empty strings`);
    }
    if (!knownParams.has(trimmed)) {
      throw new Error(`Executable ${fieldName} entry '${trimmed}' is not a declared parameter`);
    }
    if (!normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized;
}

export function validateExecutableAuthorizationMetadata(options: {
  controlArgs?: readonly string[];
  updateArgs?: readonly string[];
  exactPayloadArgs?: readonly string[];
}): void {
  const controlArgs = new Set(options.controlArgs ?? []);
  const updateOverlap = (options.updateArgs ?? []).filter(argName => controlArgs.has(argName));
  if (updateOverlap.length > 0) {
    throw new Error(
      `Executable updateArgs must be disjoint from controlArgs: ${updateOverlap.join(', ')}`
    );
  }

  const exactPayloadControlArgs = (options.exactPayloadArgs ?? []).filter(argName => controlArgs.has(argName));
  if (exactPayloadControlArgs.length > 0) {
    throw new Error(
      `Executable exactPayloadArgs must reference non-control parameters: ${exactPayloadControlArgs.join(', ')}`
    );
  }
}

export async function resolveExeCorrelateControlArgs(
  raw: unknown,
  env: Environment
): Promise<boolean | undefined> {
  if (raw === undefined) {
    return undefined;
  }

  const value = await resolveExecutableWithClauseValue(raw, env);
  if (typeof value !== 'boolean') {
    throw new Error('Executable correlateControlArgs must be a boolean');
  }

  return value;
}

export function extractParamNames(params: unknown[]): string[] {
  return params
    .map(param => {
      if (typeof param === 'string') {
        return param;
      }

      if (param && typeof param === 'object' && (param as any).type === 'VariableReference') {
        return typeof (param as any).identifier === 'string' ? (param as any).identifier : '';
      }

      if (param && typeof param === 'object' && (param as any).type === 'Parameter') {
        return typeof (param as any).name === 'string' ? (param as any).name : '';
      }

      return '';
    })
    .filter(Boolean);
}

export function extractParamTypes(params: unknown[]): Record<string, string> {
  const paramTypes: Record<string, string> = {};

  for (const param of params) {
    if (!param || typeof param !== 'object' || (param as any).type !== 'Parameter') {
      continue;
    }

    const name = (param as any).name;
    const type = (param as any).paramType;
    if (typeof name === 'string' && typeof type === 'string' && type.length > 0) {
      paramTypes[name] = type;
    }
  }

  return paramTypes;
}

export interface ParsedTemplateFileResult {
  templateNodes: any[];
  templatePath: string;
  templateFileDirectory: string;
}

function buildTemplateAstFromContent(content: string): any[] {
  const ast: any[] = [];
  const regex = /@([A-Za-z_][\w\.]*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      ast.push({ type: 'Text', content: content.slice(lastIndex, match.index) });
    }
    ast.push({ type: 'VariableReference', identifier: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    ast.push({ type: 'Text', content: content.slice(lastIndex) });
  }

  return ast;
}

export async function parseTemplateFileNodes(
  pathNodes: unknown,
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<ParsedTemplateFileResult> {
  if (!Array.isArray(pathNodes) || pathNodes.length === 0) {
    throw new Error('Exec template-file directive missing path');
  }

  const evaluatedPath = await interpolate(pathNodes as any, env);
  const filePath = String(evaluatedPath);

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.att' && ext !== '.mtt') {
    throw new Error(`Unsupported template file extension for ${filePath}. Use .att (@var) or .mtt ({{var}}).`);
  }

  const resolvedTemplatePath = await env.resolvePath(filePath);
  const templateFileDirectory = env.isURL(resolvedTemplatePath)
    ? env.getFileDirectory()
    : path.dirname(resolvedTemplatePath);
  const fileContent = await readFileWithPolicy(env, filePath, sourceLocation ?? undefined);
  const { maskedContent, literalBlocks } = maskPlainMlldTemplateFences(fileContent);
  const { parseSync } = await import('@grammar/parser');
  const startRule = ext === '.mtt' ? 'TemplateBodyMtt' : 'TemplateBodyAtt';

  try {
    return {
      templateNodes: restorePlainMlldTemplateFences(parseSync(maskedContent, { startRule }), literalBlocks),
      templatePath: filePath,
      templateFileDirectory
    };
  } catch (err: any) {
    try {
      let normalized = maskedContent;
      if (ext === '.mtt') {
        normalized = normalized.replace(/{{\s*([A-Za-z_][\w\.]*)\s*}}/g, '@$1');
      }
      return {
        templateNodes: restorePlainMlldTemplateFences(buildTemplateAstFromContent(normalized), literalBlocks),
        templatePath: filePath,
        templateFileDirectory
      };
    } catch {
      throw new Error(`Failed to parse template file ${filePath}: ${err.message}`);
    }
  }
}
