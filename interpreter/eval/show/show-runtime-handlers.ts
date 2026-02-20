import type { DirectiveNode, SourceLocation } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { interpolate } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';

export interface ShowRuntimeHandlerParams {
  directive: DirectiveNode;
  env: Environment;
  directiveLocation: SourceLocation | null;
  collectInterpolatedDescriptor: (descriptor?: SecurityDescriptor) => void;
}

export interface ShowRuntimeResult {
  content: string;
  resultValue: unknown;
}

function extractRawTextContent(nodes: any[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(node.content || '');
    } else if (node.type === 'Newline') {
      parts.push('\n');
    } else {
      parts.push(String((node as any).value || (node as any).content || ''));
    }
  }
  return parts.join('').replace(/^\n/, '');
}

function dedentCommonIndent(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let minIndent: number | null = null;

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const match = line.match(/^[ \t]*/);
    const indent = match ? match[0].length : 0;
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
    }
    if (minIndent === 0) {
      break;
    }
  }

  if (!minIndent) {
    return src;
  }
  return lines.map(line => (line.trim().length === 0 ? '' : line.slice(minIndent!))).join('\n');
}

function buildExecutionContext(
  directive: DirectiveNode,
  env: Environment,
  directiveLocation: SourceLocation | null
): Record<string, unknown> {
  return {
    sourceLocation: directiveLocation,
    directiveNode: directive,
    filePath: env.getCurrentFilePath(),
    directiveType: 'show'
  };
}

export async function evaluateShowCommand({
  directive,
  env,
  directiveLocation,
  collectInterpolatedDescriptor
}: ShowRuntimeHandlerParams): Promise<ShowRuntimeResult> {
  const commandNodes = directive.values?.command;
  if (!commandNodes) {
    throw new Error('Show command directive missing command');
  }

  const command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand, {
    collectSecurityDescriptor: collectInterpolatedDescriptor
  });
  const executionContext = buildExecutionContext(directive, env, directiveLocation);
  const content = await env.executeCommand(command, undefined, executionContext);
  return { content, resultValue: content };
}

export async function evaluateShowCode({
  directive,
  env,
  directiveLocation
}: ShowRuntimeHandlerParams): Promise<ShowRuntimeResult> {
  const codeNodes = directive.values?.code;
  const langNodes = directive.values?.lang;

  if (!codeNodes || !langNodes) {
    throw new Error('Show code directive missing code or language');
  }

  const lang = extractRawTextContent(langNodes);
  const code = dedentCommonIndent(extractRawTextContent(codeNodes));
  const executionContext = buildExecutionContext(directive, env, directiveLocation);
  const content = await env.executeCode(code, lang, {}, executionContext);
  return { content, resultValue: content };
}
