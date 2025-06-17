import * as prettier from 'prettier';

/**
 * Format markdown content using Prettier
 * This ensures consistent formatting of the output
 */
export async function formatMarkdown(content: string): Promise<string> {
  try {
    // First check if the content has intentional trailing spaces
    // We'll preserve them by replacing with a placeholder
    const TRAILING_SPACE_MARKER = '⟪MLLD_TRAILING_SPACE⟫';
    const lines = content.split('\n');
    const trailingSpaceInfo = lines.map(line => {
      const match = line.match(/(\s+)$/);
      return match ? match[1].length : 0;
    });
    
    // Replace trailing spaces with marker
    const markedContent = lines.map(line => {
      return line.replace(/\s+$/, TRAILING_SPACE_MARKER);
    }).join('\n');
    
    // Format with prettier using markdown parser
    const formatted = await prettier.format(markedContent, {
      parser: 'markdown',
      // Preserve existing line breaks where possible
      proseWrap: 'preserve',
      // Use 80 character line length for wrapping
      printWidth: 80,
      // Ensure consistent spacing
      tabWidth: 2,
      useTabs: false,
      // Don't add trailing commas in markdown code blocks
      trailingComma: 'none',
      // Single quotes in code blocks
      singleQuote: true,
      // Preserve empty lines
      endOfLine: 'lf'
    });
    
    // Restore trailing spaces
    const formattedLines = formatted.split('\n');
    const restoredLines = formattedLines.map((line, index) => {
      if (line.includes(TRAILING_SPACE_MARKER)) {
        // Find the original line index (may have changed due to formatting)
        // For now, just replace all markers with a single space if they had trailing space
        const originalIndex = Math.min(index, trailingSpaceInfo.length - 1);
        const spaceCount = trailingSpaceInfo[originalIndex] || 0;
        if (spaceCount > 0) {
          return line.replace(new RegExp(TRAILING_SPACE_MARKER, 'g'), ' '.repeat(spaceCount));
        }
      }
      return line.replace(new RegExp(TRAILING_SPACE_MARKER, 'g'), '');
    });
    
    return restoredLines.join('\n');
  } catch (error) {
    // If prettier fails, return the original content
    console.warn('Prettier formatting failed:', error);
    return content;
  }
}

/**
 * Options for markdown formatting
 */
export interface MarkdownFormatOptions {
  // Whether to format the output (default: true)
  enabled?: boolean;
  // Prettier options to override defaults
  prettierOptions?: prettier.Options;
}

/**
 * Format markdown with custom options
 */
export async function formatMarkdownWithOptions(
  content: string, 
  options: MarkdownFormatOptions = {}
): Promise<string> {
  if (options.enabled === false) {
    return content;
  }
  
  try {
    // First check if the content has intentional trailing spaces
    const TRAILING_SPACE_MARKER = '⟪MLLD_TRAILING_SPACE⟫';
    const lines = content.split('\n');
    const trailingSpaceInfo = lines.map(line => {
      const match = line.match(/(\s+)$/);
      return match ? match[1].length : 0;
    });
    
    // Replace trailing spaces with marker
    const markedContent = lines.map(line => {
      return line.replace(/\s+$/, TRAILING_SPACE_MARKER);
    }).join('\n');
    
    const prettierOptions: prettier.Options = {
      parser: 'markdown',
      proseWrap: 'preserve',
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      trailingComma: 'none',
      singleQuote: true,
      endOfLine: 'lf',
      ...options.prettierOptions
    };
    
    const formatted = await prettier.format(markedContent, prettierOptions);
    
    // Restore trailing spaces
    const formattedLines = formatted.split('\n');
    const restoredLines = formattedLines.map((line, index) => {
      if (line.includes(TRAILING_SPACE_MARKER)) {
        // Find the original line index (may have changed due to formatting)
        // For now, just replace all markers with a single space if they had trailing space
        const originalIndex = Math.min(index, trailingSpaceInfo.length - 1);
        const spaceCount = trailingSpaceInfo[originalIndex] || 0;
        if (spaceCount > 0) {
          return line.replace(new RegExp(TRAILING_SPACE_MARKER, 'g'), ' '.repeat(spaceCount));
        }
      }
      return line.replace(new RegExp(TRAILING_SPACE_MARKER, 'g'), '');
    });
    
    return restoredLines.join('\n');
  } catch (error) {
    console.warn('Prettier formatting failed:', error);
    return content;
  }
}