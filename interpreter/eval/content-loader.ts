import { Environment } from '@interpreter/env/Environment';
import { MlldError } from '@core/errors';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { LoadContentResult, LoadContentResultImpl } from './load-content-types';
import fastGlob from 'fast-glob';
import * as path from 'path';

/**
 * Check if a path contains glob patterns
 */
function isGlobPattern(path: string): boolean {
  return /[\*\?\{\}\[\]]/.test(path);
}

/**
 * Process content loading expressions (<file.md> syntax)
 * Loads content from files or URLs and optionally extracts sections
 * Now supports glob patterns and returns metadata-rich results
 */
export async function processContentLoader(node: any, env: Environment): Promise<string | LoadContentResult | LoadContentResult[]> {
  if (!node || node.type !== 'load-content') {
    throw new MlldError('Invalid content loader node', {
      node: node ? node.type : 'null',
      expected: 'load-content'
    });
  }

  const { source, options } = node;

  if (!source) {
    throw new MlldError('Content loader expression missing source', {
      node: node
    });
  }

  // Reconstruct the path/URL string from the source
  let pathOrUrl: string;
  if (source.type === 'path') {
    pathOrUrl = reconstructPath(source);
  } else if (source.type === 'url') {
    pathOrUrl = reconstructUrl(source);
  } else {
    throw new MlldError(`Unknown content loader source type: ${source.type}`, {
      sourceType: source.type,
      expected: ['path', 'url']
    });
  }

  // Detect glob pattern from the path
  const isGlob = isGlobPattern(pathOrUrl);

  try {
    // URLs can't be globs
    if (env.isURL(pathOrUrl)) {
      const content = await env.fetchURL(pathOrUrl);
      
      // Extract section if specified
      if (options?.section) {
        const sectionName = await extractSectionName(options.section, env);
        const sectionContent = await extractSection(content, sectionName, options.section.renamed);
        
        // For URLs with sections, return plain string (backward compatibility)
        return sectionContent;
      }
      
      // For URLs without sections, return plain string (backward compatibility)
      return content;
    }
    
    // Handle glob patterns for file paths
    if (isGlob) {
      return await loadGlobPattern(pathOrUrl, options, env);
    }
    
    // Single file loading
    const result = await loadSingleFile(pathOrUrl, options, env);
    
    // Always return the full LoadContentResult object
    // The smart object will handle string conversion when needed
    return result;
  } catch (error: any) {
    throw new MlldError(`Failed to load content: ${pathOrUrl}`, {
      path: pathOrUrl,
      error: error.message
    });
  }
}

/**
 * Load a single file and return LoadContentResult
 */
async function loadSingleFile(filePath: string, options: any, env: Environment): Promise<LoadContentResult> {
  // Let Environment handle path resolution and fuzzy matching
  const content = await env.readFile(filePath);
  const resolvedPath = await env.resolvePath(filePath);
  
  
  // Extract section if specified
  let finalContent = content;
  if (options?.section) {
    const sectionName = await extractSectionName(options.section, env);
    finalContent = await extractSection(content, sectionName, options.section.renamed);
  }
  
  // Create LoadContentResult with metadata
  const result = new LoadContentResultImpl({
    content: finalContent,
    filename: path.basename(resolvedPath),
    relative: `./${path.relative(env.getBasePath(), resolvedPath)}`,
    absolute: resolvedPath
  });
  
  return result;
}

/**
 * Load files matching a glob pattern
 */
async function loadGlobPattern(pattern: string, options: any, env: Environment): Promise<LoadContentResult[]> {
  // Resolve the pattern relative to current directory
  const baseDir = env.getBasePath();
  
  // Use fast-glob to find matching files
  const matches = await fastGlob(pattern, {
    cwd: baseDir,
    absolute: true,
    followSymbolicLinks: true,
    // Ignore common non-text files
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
  });
  
  // Sort by filename for consistent ordering
  matches.sort();
  
  // Load each matching file
  const results: LoadContentResult[] = [];
  
  for (const filePath of matches) {
    try {
      const content = await env.readFile(filePath);
      
      // Skip files if section extraction is requested and section doesn't exist
      if (options?.section) {
        const sectionName = await extractSectionName(options.section, env);
        try {
          const sectionContent = await extractSection(content, sectionName, options.section.renamed);
          
          // Create result with section content
          results.push(new LoadContentResultImpl({
            content: sectionContent,
            filename: path.basename(filePath),
            relative: `./${path.relative(baseDir, filePath)}`,
            absolute: filePath
          }));
        } catch (error: any) {
          // Skip files without the requested section
          continue;
        }
      } else {
        // No section extraction, include full content
        results.push(new LoadContentResultImpl({
          content: content,
          filename: path.basename(filePath),
          relative: `./${path.relative(baseDir, filePath)}`,
          absolute: filePath
        }));
      }
    } catch (error: any) {
      // Skip files that can't be read
      continue;
    }
  }
  
  return results;
}

/**
 * Reconstruct path string from path AST node
 */
function reconstructPath(pathNode: any): string {
  if (!pathNode.segments || !Array.isArray(pathNode.segments)) {
    return (pathNode.raw || '').trim();
  }

  const reconstructed = pathNode.segments.map((segment: any) => {
    if (segment.type === 'Text') {
      return segment.content;
    } else if (segment.type === 'PathSeparator') {
      return segment.value;
    } else if (segment.type === 'VariableReference') {
      // For now, throw error - variable interpolation in paths needs env context
      throw new MlldError('Variable interpolation in content loader paths not yet implemented', {
        variable: segment.identifier
      });
    }
    return '';
  }).join('');
  
  // Trim the final path to handle trailing spaces before section markers
  return reconstructed.trim();
}

/**
 * Reconstruct URL string from URL AST node
 */
function reconstructUrl(urlNode: any): string {
  if (urlNode.raw) {
    return urlNode.raw;
  }
  
  // Reconstruct from parts
  const { protocol, host, path } = urlNode;
  return `${protocol}://${host}${path || ''}`;
}


/**
 * Extract section name from section AST node
 */
async function extractSectionName(sectionNode: any, env: Environment): Promise<string> {
  if (!sectionNode || !sectionNode.identifier) {
    throw new MlldError('Invalid section node', {
      node: sectionNode
    });
  }

  // Section identifier might be Text, VariableReference, or array of nodes
  const identifier = sectionNode.identifier;
  
  if (identifier.type === 'Text') {
    return identifier.content;
  } else if (identifier.type === 'VariableReference') {
    // Import interpolate function
    const { interpolate } = await import('../core/interpreter');
    // Handle variable reference as section name
    return await interpolate([identifier], env);
  } else if (Array.isArray(identifier)) {
    // Handle array of nodes (with potential variable interpolation)
    const { interpolate } = await import('../core/interpreter');
    return await interpolate(identifier, env);
  }

  throw new MlldError('Unable to extract section name', {
    identifierType: identifier.type
  });
}

/**
 * Extract a section from markdown content
 */
async function extractSection(content: string, sectionName: string, renamedTitle?: string): Promise<string> {
  try {
    let extracted;
    try {
      extracted = await llmxmlInstance.getSection(content, sectionName, {
        includeNested: true
      });
    } catch (llmxmlError: any) {
      throw llmxmlError;
    }

    if (!extracted) {
      throw new MlldError(`Section "${sectionName}" not found in content`, {
        sectionName: sectionName,
        availableSections: await getAvailableSections(content)
      });
    }

    // If renamed, apply header transformation
    if (renamedTitle) {
      // Import the shared header transform function
      const { applyHeaderTransform } = await import('./show');
      return applyHeaderTransform(extracted, renamedTitle);
    }

    return extracted;
  } catch (error: any) {
    throw new MlldError(`Failed to extract section: ${error.message}`, {
      sectionName: sectionName,
      error: error.message
    });
  }
}

/**
 * Get list of available sections in markdown content (for error messages)
 */
async function getAvailableSections(content: string): Promise<string[]> {
  try {
    const headings = await llmxmlInstance.getHeadings(content);
    return headings.map(h => h.title);
  } catch {
    // Fallback to simple regex if llmxml fails
    const sections: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^#+\s+(.+)$/);
      if (match) {
        sections.push(match[1]);
      }
    }
    
    return sections;
  }
}