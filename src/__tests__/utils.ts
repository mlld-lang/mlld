/**
 * Normalize content by removing extra whitespace for comparison
 */
export function normalizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

/**
 * Common XML patterns for testing
 */
export const XMLPatterns = {
  DocumentStart: (title: string) => 
    new RegExp(`<\\w+Document title="${title}">`),
  
  Section: (title: string, level: number) => 
    new RegExp(`<[\\w]+? title="${title}" hlevel="${level}">`),
  
  SpecialChars: {
    Ampersand: /&amp;/g,
    LessThan: /&lt;/g,
    GreaterThan: /&gt;/g
  }
} as const; 