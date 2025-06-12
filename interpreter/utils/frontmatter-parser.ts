import matter from 'gray-matter';
import * as yaml from 'js-yaml';
import { MlldParseError } from '@core/errors';

/**
 * Parse YAML frontmatter content using gray-matter
 * @param content Raw YAML content from FrontmatterNode (without the --- delimiters)
 * @returns Parsed JavaScript object
 */
export function parseFrontmatter(content: string): any {
  try {
    // gray-matter expects the full document with --- delimiters
    // Since we only get the YAML content without delimiters, we need to wrap it
    const fullDocument = `---\n${content}\n---\n`;
    
    // Use gray-matter with custom YAML engine to avoid date parsing
    // FAILSAFE_SCHEMA only supports strings, arrays, and plain objects (no date conversion)
    const parsed = matter(fullDocument, {
      engines: {
        yaml: {
          parse: (input: string) => yaml.load(input, { schema: yaml.FAILSAFE_SCHEMA }),
          stringify: (obj: any) => yaml.dump(obj, { schema: yaml.FAILSAFE_SCHEMA })
        }
      }
    });
    
    // Return the parsed frontmatter data
    return parsed.data || {};
  } catch (error: any) {
    // gray-matter doesn't provide line/column info like js-yaml does
    // but it's much more robust at parsing various frontmatter formats
    throw new MlldParseError(
      `Invalid YAML frontmatter: ${error.message}`,
      { 
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 }
      }
    );
  }
}