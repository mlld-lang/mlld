export function normalizeAutoverifyPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^template\s+(.+)$/i);
  const raw = match ? match[1] : trimmed;
  const unquoted = stripOuterQuotes(raw).trim();
  return unquoted || null;
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

export function buildTemplateAstFromContent(content: string): any[] {
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

export function extractTemplateNodes(value: unknown): any[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const candidateValues = (candidate as any).values;
  if (candidateValues && Array.isArray(candidateValues.content)) {
    return candidateValues.content as any[];
  }
  if (Array.isArray(candidate.content)) {
    return candidate.content as any[];
  }
  if (Array.isArray(candidate.template)) {
    return candidate.template as any[];
  }
  if (candidate.template && typeof candidate.template === 'object') {
    const inner = candidate.template as Record<string, unknown>;
    if (Array.isArray((inner as any).content)) {
      return (inner as any).content as any[];
    }
  }
  return null;
}

export function normalizeSignedVariableName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}
