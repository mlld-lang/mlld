import type { MlldNode, WithClause } from '@core/types';

export type RunCodeOperationType = 'sh' | 'node' | 'js' | 'py' | 'prose';

/**
 * Extract raw text content from nodes without interpolation.
 * This keeps code block whitespace and indentation intact.
 */
export function extractRawTextContent(nodes: MlldNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(node.content || '');
      continue;
    }
    if (node.type === 'Newline') {
      parts.push('\n');
      continue;
    }
    parts.push(String((node as any).value || (node as any).content || ''));
  }

  const rawContent = parts.join('');
  return rawContent.replace(/^\n/, '');
}

/**
 * Remove the common leading indentation from non-empty lines.
 * Relative indentation remains unchanged.
 */
export function dedentCommonIndent(src: string): string {
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

  return lines
    .map(line => (line.trim().length === 0 ? '' : line.slice(minIndent!)))
    .join('\n');
}

function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase();
}

export function resolveRunCodeOpType(language: string): RunCodeOperationType | null {
  const normalized = normalizeLanguage(language);
  if (!normalized) {
    return null;
  }

  if (normalized === 'bash' || normalized === 'sh' || normalized === 'shell') {
    return 'sh';
  }
  if (normalized === 'node' || normalized === 'nodejs') {
    return 'node';
  }
  if (normalized === 'js' || normalized === 'javascript') {
    return 'js';
  }
  if (normalized === 'py' || normalized === 'python') {
    return 'py';
  }
  if (normalized === 'prose') {
    return 'prose';
  }

  return null;
}

export function mergeAuthUsing(
  base: WithClause | undefined,
  override: WithClause | undefined
): Pick<WithClause, 'auth' | 'using'> | undefined {
  const auth = override?.auth ?? base?.auth;
  const using = override?.using ?? base?.using;
  if (!auth && !using) {
    return undefined;
  }

  return {
    ...(auth ? { auth } : {}),
    ...(using ? { using } : {})
  };
}
