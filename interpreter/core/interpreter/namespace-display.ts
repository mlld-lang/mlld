/**
 * Clean namespace objects for display.
 * Shows frontmatter and exported values without internal metadata keys.
 */
export function cleanNamespaceForDisplay(namespaceObject: any): string {
  const cleaned: any = {
    frontmatter: {},
    exports: {
      variables: {},
      executables: {}
    }
  };

  const fm = namespaceObject.fm || namespaceObject.frontmatter || namespaceObject.__meta__;
  if (fm && Object.keys(fm).length > 0) {
    cleaned.frontmatter = fm;
  }

  const internalFields = ['fm', 'frontmatter', '__meta__'];
  let hasExports = false;

  for (const [key, value] of Object.entries(namespaceObject)) {
    if (!internalFields.includes(key)) {
      hasExports = true;
      if (value && typeof value === 'object' && (value as any).__executable) {
        const params = (value as any).paramNames || [];
        cleaned.exports.executables[key] = `<function(${params.join(', ')})>`;
      } else if (value && typeof value === 'object' && (value as any).type === 'executable') {
        const def = (value as any).value || (value as any).definition;
        const params = def?.paramNames || [];
        cleaned.exports.executables[key] = `<function(${params.join(', ')})>`;
      } else if (value && typeof value === 'object' && (value as any).value !== undefined) {
        cleaned.exports.variables[key] = (value as any).value;
      } else {
        cleaned.exports.variables[key] = value;
      }
    }
  }

  const hasFrontmatter = fm && Object.keys(fm).length > 0;
  if (!hasFrontmatter && !hasExports) {
    return '{}';
  }

  if (!hasFrontmatter) {
    delete cleaned.frontmatter;
  }

  return JSON.stringify(cleaned, null, 2);
}
