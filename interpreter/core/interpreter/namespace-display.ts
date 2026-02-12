import {
  formatNamespaceExecutable,
  isNamespaceInternalField,
  resolveNamespaceFrontmatter
} from './namespace-shared';

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

  const frontmatter = resolveNamespaceFrontmatter(namespaceObject);
  if (frontmatter) {
    cleaned.frontmatter = frontmatter;
  }

  let hasExports = false;

  for (const [key, value] of Object.entries(namespaceObject)) {
    if (!isNamespaceInternalField(key)) {
      hasExports = true;
      const executableDisplay = formatNamespaceExecutable(value);
      if (executableDisplay) {
        cleaned.exports.executables[key] = executableDisplay;
      } else if (value && typeof value === 'object' && (value as any).value !== undefined) {
        cleaned.exports.variables[key] = (value as any).value;
      } else {
        cleaned.exports.variables[key] = value;
      }
    }
  }

  const hasFrontmatter = Boolean(frontmatter);
  if (!hasFrontmatter && !hasExports) {
    return '{}';
  }

  if (!hasFrontmatter) {
    delete cleaned.frontmatter;
  }

  return JSON.stringify(cleaned, null, 2);
}
