// String operations are legitimate in this file for YAML frontmatter preprocessing
// This file preprocesses YAML frontmatter before parsing to handle edge cases like
// unquoted @ symbols in package names. This preprocessing is necessary because YAML
// parsers interpret @ as special characters, requiring pre-parse string manipulation.

import * as yaml from 'js-yaml';
import { MlldParseError } from '@core/errors';

/**
 * Preprocess YAML content to handle common issues
 * @param content Raw YAML content
 * @returns Processed YAML content
 */
function preprocessYAML(content: string): string {
  // Split into lines and process each line
  const lines = content.split('\n');
  const processedLines = lines.map(line => {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      return line;
    }
    
    // Check if line is a key-value pair
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      
      // If value contains special characters that need quoting and isn't already quoted
      if (value && !isQuoted(value) && needsQuoting(value)) {
        return `${key}: "${value}"`;
      }
    }
    
    return line;
  });
  
  return processedLines.join('\n');
}

/**
 * Check if a value is already quoted
 */
function isQuoted(value: string): boolean {
  return (value.startsWith('"') && value.endsWith('"')) ||
         (value.startsWith("'") && value.endsWith("'"));
}

/**
 * Check if a value needs quoting for YAML
 */
function needsQuoting(value: string): boolean {
  // Quote if contains @ at the beginning (common in npm-style module names)
  if (value.startsWith('@')) {
    return true;
  }
  
  // Quote if contains other special YAML characters that might cause issues
  return /[{}[\],|>*&!%@`]/.test(value);
}

/**
 * Parse YAML frontmatter content
 * @param content Raw YAML content from FrontmatterNode
 * @returns Parsed JavaScript object
 */
export function parseFrontmatter(content: string): any {
  try {
    // Preprocess YAML content to handle common issues
    const processedContent = preprocessYAML(content);
    
    // Parse YAML with FAILSAFE_SCHEMA to avoid automatic date conversion
    const parsed = yaml.load(processedContent, { schema: yaml.FAILSAFE_SCHEMA });
    
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