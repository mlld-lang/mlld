import * as yaml from 'js-yaml';
import { MlldParseError } from '@core/errors';

/**
 * Parse YAML frontmatter content
 * @param content Raw YAML content from FrontmatterNode
 * @returns Parsed JavaScript object
 */
export function parseFrontmatter(content: string): any {
  try {
    // Parse YAML with FAILSAFE_SCHEMA to avoid automatic date conversion
    const parsed = yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA });
    
    // Handle edge cases
    if (parsed === null || parsed === undefined) {
      return {};
    }
    
    // If YAML contains multiple documents, use only the first
    if (Array.isArray(parsed)) {
      return parsed[0] || {};
    }
    
    return parsed;
  } catch (error: any) {
    // Extract line/column information from YAML error if available
    const line = error.mark?.line ?? 1;
    const column = error.mark?.column ?? 1;
    
    throw new MlldParseError(
      `Invalid YAML frontmatter: ${error.reason || error.message}`,
      { 
        start: { line, column, offset: 0 },
        end: { line, column, offset: 0 }
      }
    );
  }
}