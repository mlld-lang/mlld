import prettier from 'prettier';

/**
 * Format content with Prettier
 * 
 * @param content The content to format
 * @param parser The parser to use (markdown, json, etc.)
 * @returns The formatted content
 */
export async function formatWithPrettier(content: string, parser: 'markdown' | 'json' | 'html' = 'markdown'): Promise<string> {
  try {
    return await prettier.format(content, {
      parser,
      // Use consistent settings for markdown
      proseWrap: 'preserve',
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      bracketSpacing: true,
      arrowParens: 'avoid',
    });
  } catch (error) {
    // If prettier fails, return the original content
    console.warn('Prettier formatting failed:', error);
    return content;
  }
}