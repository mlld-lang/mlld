const INTERNAL_NAMESPACE_FIELDS = new Set(['fm', 'frontmatter', '__meta__']);

export function resolveNamespaceFrontmatter(namespaceObject: any): Record<string, unknown> | undefined {
  if (!namespaceObject || typeof namespaceObject !== 'object') {
    return undefined;
  }

  const frontmatter =
    namespaceObject.fm || namespaceObject.frontmatter || namespaceObject.__meta__;
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    return undefined;
  }

  return Object.keys(frontmatter).length > 0
    ? (frontmatter as Record<string, unknown>)
    : undefined;
}

export function isNamespaceInternalField(key: string): boolean {
  return INTERNAL_NAMESPACE_FIELDS.has(key);
}

export function formatNamespaceExecutable(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, any>;
  if (candidate.__executable) {
    const params = Array.isArray(candidate.paramNames) ? candidate.paramNames : [];
    return `<function(${params.join(', ')})>`;
  }

  if (candidate.type === 'executable') {
    const definition = candidate.value || candidate.definition;
    const params = Array.isArray(definition?.paramNames) ? definition.paramNames : [];
    return `<function(${params.join(', ')})>`;
  }

  return undefined;
}
