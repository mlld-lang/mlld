import { Environment } from '@interpreter/env/Environment';
import { MlldError } from '@core/errors';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { LoadContentResult, LoadContentResultImpl, LoadContentResultURLImpl } from '@core/types/load-content';
import { glob } from 'tinyglobby';
import * as path from 'path';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';

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
      // Fetch URL with metadata
      const response = await env.fetchURLWithMetadata(pathOrUrl);
      
      // Process content based on content type
      let processedContent = response.content;
      const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
      
      // For HTML content, convert to markdown using Readability + Turndown
      if (contentType.includes('text/html')) {
        processedContent = await convertHtmlToMarkdown(response.content, pathOrUrl);
      }
      
      // Extract section if specified
      if (options?.section) {
        const sectionName = await extractSectionName(options.section, env);
        const sectionContent = await extractSection(processedContent, sectionName, options.section.renamed);
        
        // For URLs with sections, return plain string (backward compatibility)
        return sectionContent;
      }
      
      // Create rich URL result with metadata
      const urlResult = new LoadContentResultURLImpl({
        content: processedContent,    // Markdown for HTML, raw content for others
        rawContent: response.content,  // Always the raw response
        url: pathOrUrl,
        headers: response.headers,
        status: response.status
      });
      
      return urlResult;
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
 * Load a single file and return LoadContentResult or string (if section extracted)
 */
async function loadSingleFile(filePath: string, options: any, env: Environment): Promise<LoadContentResult | string> {
  // Let Environment handle path resolution and fuzzy matching
  let content = await env.readFile(filePath);
  const resolvedPath = await env.resolvePath(filePath);
  
  // Check if this is an HTML file and convert to Markdown
  if (resolvedPath.endsWith('.html') || resolvedPath.endsWith('.htm')) {
    content = await convertHtmlToMarkdown(content, `file://${resolvedPath}`);
  }
  
  // Extract section if specified
  if (options?.section) {
    const sectionName = await extractSectionName(options.section, env);
    const sectionContent = await extractSection(content, sectionName, options.section.renamed);
    
    // For backward compatibility, return plain string when section is extracted
    return sectionContent;
  }
  
  // Create LoadContentResult with metadata (only when no section extraction)
  const result = new LoadContentResultImpl({
    content: content,
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
  
  // Use tinyglobby to find matching files
  const matches = await glob(pattern, {
    cwd: baseDir,
    absolute: true,
    followSymlinks: true,
    // Ignore common non-text files
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
  });
  
  // Sort by filename for consistent ordering
  matches.sort();
  
  // Load each matching file
  const results: LoadContentResult[] = [];
  
  for (const filePath of matches) {
    try {
      let content = await env.readFile(filePath);
      
      // Check if this is an HTML file and convert to Markdown
      if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
        content = await convertHtmlToMarkdown(content, `file://${filePath}`);
      }
      
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

/**
 * Convert HTML to Markdown using Readability + Turndown
 */
async function convertHtmlToMarkdown(html: string, url: string): Promise<string> {
  try {
    // Create DOM from HTML
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (!article) {
      // If Readability can't extract an article, fall back to full HTML conversion
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*',
        strongDelimiter: '**'
      });
      return turndownService.turndown(html);
    }
    
    // Convert the extracted article content to Markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**'
    });
    
    // Build markdown with article metadata
    let markdown = '';
    if (article.title) {
      markdown += `# ${article.title}\n\n`;
    }
    if (article.byline) {
      markdown += `*By ${article.byline}*\n\n`;
    }
    // Skip excerpt for now - it's being added even when we don't want it
    // if (article.excerpt) {
    //   markdown += `> ${article.excerpt}\n\n`;
    // }
    
    // Convert main content
    markdown += turndownService.turndown(article.content);
    
    return markdown;
  } catch (error) {
    // If conversion fails, return the original HTML
    console.warn('Failed to convert HTML to Markdown:', error);
    return html;
  }
}