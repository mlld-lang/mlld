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
