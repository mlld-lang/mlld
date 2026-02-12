const PLAIN_MLLD_FENCE_REGEX =
  /(^|\r?\n)([ \t]*```[ \t]*mlld(?!-run)\b[^\r\n]*\r?\n[\s\S]*?\r?\n[ \t]*```[ \t]*(?=\r?\n|$))/gi;

interface MaskedTemplateFences {
  maskedContent: string;
  literalBlocks: Map<string, string>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskPlainMlldTemplateFences(content: string): MaskedTemplateFences {
  const literalBlocks = new Map<string, string>();
  let index = 0;

  const maskedContent = content.replace(
    PLAIN_MLLD_FENCE_REGEX,
    (_match: string, lineBoundary: string, literalBlock: string) => {
      const token = `__MLLD_TEMPLATE_LITERAL_FENCE_${index}__`;
      index += 1;
      literalBlocks.set(token, literalBlock);
      return `${lineBoundary}${token}`;
    }
  );

  return { maskedContent, literalBlocks };
}

function restoreTextNode(
  node: Record<string, unknown>,
  tokenPattern: RegExp,
  literalBlocks: Map<string, string>
): Record<string, unknown>[] {
  const content = typeof node.content === 'string' ? node.content : '';
  if (!content) {
    return [node];
  }

  tokenPattern.lastIndex = 0;
  if (!tokenPattern.test(content)) {
    return [node];
  }

  tokenPattern.lastIndex = 0;
  const segments = content.split(tokenPattern);
  const restoredNodes: Record<string, unknown>[] = [];

  for (const segment of segments) {
    if (!segment) {
      continue;
    }

    const literal = literalBlocks.get(segment);
    restoredNodes.push({
      ...node,
      content: literal ?? segment
    });
  }

  return restoredNodes.length > 0 ? restoredNodes : [node];
}

function restoreObjectNode(
  node: Record<string, unknown>,
  tokenPattern: RegExp,
  literalBlocks: Map<string, string>
): Record<string, unknown> {
  const restored: Record<string, unknown> = { ...node };

  for (const [key, value] of Object.entries(restored)) {
    if (Array.isArray(value)) {
      restored[key] = restoreNodeArray(value, tokenPattern, literalBlocks);
      continue;
    }

    if (value && typeof value === 'object') {
      restored[key] = restoreObjectNode(value as Record<string, unknown>, tokenPattern, literalBlocks);
    }
  }

  return restored;
}

function restoreNodeArray(
  nodes: unknown[],
  tokenPattern: RegExp,
  literalBlocks: Map<string, string>
): unknown[] {
  const restored: unknown[] = [];

  for (const item of nodes) {
    if (Array.isArray(item)) {
      restored.push(restoreNodeArray(item, tokenPattern, literalBlocks));
      continue;
    }

    if (!item || typeof item !== 'object') {
      restored.push(item);
      continue;
    }

    const node = item as Record<string, unknown>;
    if (node.type === 'Text' && typeof node.content === 'string') {
      restored.push(...restoreTextNode(node, tokenPattern, literalBlocks));
      continue;
    }

    restored.push(restoreObjectNode(node, tokenPattern, literalBlocks));
  }

  return restored;
}

export function restorePlainMlldTemplateFences(
  nodes: any[],
  literalBlocks: Map<string, string>
): any[] {
  if (literalBlocks.size === 0) {
    return nodes;
  }

  const tokens = Array.from(literalBlocks.keys()).map(escapeRegExp);
  if (tokens.length === 0) {
    return nodes;
  }

  const tokenPattern = new RegExp(`(${tokens.join('|')})`, 'g');
  return restoreNodeArray(nodes, tokenPattern, literalBlocks) as any[];
}

export function restorePlainMlldTemplateFenceText(
  text: string,
  literalBlocks: Map<string, string>
): string {
  let restored = text;
  for (const [token, literal] of literalBlocks) {
    restored = restored.split(token).join(literal);
  }
  return restored;
}
