/**
 * Template tag for multiline strings with proper indentation handling.
 * Preserves directives at the beginning of lines while removing common indentation.
 * 
 * @param strings - Template string parts
 * @param values - Template values to interpolate
 * @returns Dedented string with preserved line-beginning directives
 */
export function meld(strings: TemplateStringsArray, ...values: any[]): string {
  const raw = String.raw({ raw: strings }, ...values);
  
  // Remove leading/trailing empty lines
  const trimmed = raw.replace(/^\n+|\n+$/g, '');
  
  // Split into lines
  const lines = trimmed.split('\n');
  
  // Find minimum indentation (excluding lines that start with @ for directives)
  const indentations = lines
    .filter(line => line.trim().length > 0 && !line.trimStart().startsWith('@'))
    .map(line => line.match(/^(\s*)/)[0].length);
  
  const minIndent = indentations.length ? Math.min(...indentations) : 0;
  
  // Process each line
  const processed = lines.map(line => {
    // If it's a directive (starts with @ after trimming), ensure it's at the beginning
    if (line.trimStart().startsWith('@')) {
      return line.trimStart();
    }
    // Otherwise dedent by the minimum indent
    return line.length >= minIndent ? line.substring(minIndent) : line;
  });
  
  return processed.join('\n');
} 