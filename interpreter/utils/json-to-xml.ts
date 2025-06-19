/**
 * Convert JSON data to SCREAMING_SNAKE_CASE XML format
 * Compatible with llmxml's style
 */

/**
 * Convert a string to SCREAMING_SNAKE_CASE
 */
function toScreamingSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase to snake_case
    .replace(/[\s\-\.]+/g, '_') // spaces, hyphens, dots to underscores
    .replace(/[^A-Z0-9_]/gi, '') // remove non-alphanumeric except underscores
    .toUpperCase()
    .replace(/^_+|_+$/g, ''); // trim underscores
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert JSON to XML string
 */
export function jsonToXml(data: unknown, rootTag?: string): string {
  const lines: string[] = [];
  
  function convertValue(value: unknown, tagName: string, indent: string = ''): void {
    if (value === null || value === undefined) {
      // Skip null/undefined values
      return;
    }
    
    const tag = toScreamingSnakeCase(tagName);
    
    if (Array.isArray(value)) {
      // For arrays, create a container and items
      lines.push(`${indent}<${tag}>`);
      value.forEach((item, index) => {
        convertValue(item, `item`, indent + '  ');
      });
      lines.push(`${indent}</${tag}>`);
    } else if (typeof value === 'object' && value !== null) {
      // For objects, create nested tags
      const entries = Object.entries(value);
      if (entries.length === 0) {
        // Empty object
        lines.push(`${indent}<${tag} />`);
      } else if (rootTag && indent === '') {
        // Root level object without wrapper
        entries.forEach(([key, val]) => {
          convertValue(val, key, indent);
        });
      } else {
        // Nested object with wrapper
        lines.push(`${indent}<${tag}>`);
        entries.forEach(([key, val]) => {
          convertValue(val, key, indent + '  ');
        });
        lines.push(`${indent}</${tag}>`);
      }
    } else {
      // Primitive values
      const content = escapeXml(String(value));
      lines.push(`${indent}<${tag}>${content}</${tag}>`);
    }
  }
  
  // Handle root level
  if (Array.isArray(data)) {
    convertValue(data, rootTag || 'ROOT');
  } else if (typeof data === 'object' && data !== null) {
    // For root objects, output properties directly without wrapper
    // This matches the expected test output: <NAME>Alice</NAME><AGE>30</AGE>
    Object.entries(data).forEach(([key, value]) => {
      convertValue(value, key, '');
    });
  } else {
    // Primitive at root
    return `<DOCUMENT>${escapeXml(String(data))}</DOCUMENT>`;
  }
  
  return lines.join('\n');
}