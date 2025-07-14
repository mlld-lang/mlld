import { Environment } from '@interpreter/env/Environment';
import { MlldError } from '@core/errors';
import { llmxmlInstance } from '../utils/llmxml-instance';
import { LoadContentResult, LoadContentResultImpl, LoadContentResultURLImpl, createLoadContentResultArray, createRenamedContentArray } from '@core/types/load-content';
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

  // Check if we have a transform template
  const hasTransform = options?.transform?.type === 'template';
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('[content-loader] processContentLoader called');
    console.log('[content-loader] Options:', JSON.stringify(options, null, 2));
    console.log('[content-loader] Has transform:', hasTransform);
    if (hasTransform) {
      console.log('[content-loader] Transform parts:', JSON.stringify(options.transform.parts, null, 2));
    }
  }

  // Reconstruct the path/URL string from the source
  let pathOrUrl: string;
  
  // The source could be the path object directly (from file reference interpolation)
  // or it could be wrapped in a node with source.type
  const actualSource = source.type === 'path' || source.type === 'url' ? source : 
                       (source.segments && source.raw !== undefined) ? { ...source, type: 'path' } :
                       source;
  
  if (actualSource.type === 'path') {
    pathOrUrl = await reconstructPath(actualSource, env);
  } else if (actualSource.type === 'url') {
    pathOrUrl = reconstructUrl(actualSource);
  } else {
    throw new MlldError(`Unknown content loader source type: ${actualSource.type}`, {
      sourceType: actualSource.type,
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
        // URLs don't have frontmatter, so no file context for rename interpolation
        const sectionContent = await extractSection(processedContent, sectionName, options.section.renamed, undefined, env);
        
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
      const results = await loadGlobPattern(pathOrUrl, options, env);
      
      // Apply transform if specified
      if (hasTransform && options.transform) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.log('[content-loader] Applying transform to', results.length, 'results');
          console.log('[content-loader] Transform:', JSON.stringify(options.transform, null, 2));
        }
        return await applyTransformToResults(results, options.transform, env);
      }
      
      return results;
    }
    
    // Single file loading
    const result = await loadSingleFile(pathOrUrl, options, env);
    
    // Apply transform if specified (for single file)
    if (hasTransform && options.transform) {
      const transformed = await applyTransformToResults([result], options.transform, env);
      return transformed[0]; // Return single result
    }
    
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
  const rawContent = await env.readFile(filePath);
  const resolvedPath = await env.resolvePath(filePath);
  
  // Check if this is an HTML file and convert to Markdown
  if (resolvedPath.endsWith('.html') || resolvedPath.endsWith('.htm')) {
    const markdownContent = await convertHtmlToMarkdown(rawContent, `file://${resolvedPath}`);
    
    // Extract section if specified
    if (options?.section) {
      const sectionName = await extractSectionName(options.section, env);
      // Create file context for rename interpolation
      const fileContext = new LoadContentResultImpl({
        content: rawContent,
        filename: path.basename(resolvedPath),
        relative: `./${path.relative(env.getBasePath(), resolvedPath)}`,
        absolute: resolvedPath
      });
      
      const sectionContent = await extractSection(markdownContent, sectionName, options.section.renamed, fileContext, env);
      
      // Extract HTML metadata
      const dom = new JSDOM(rawContent);
      const doc = dom.window.document;
      
      const title = doc.querySelector('title')?.textContent || '';
      const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || 
                         doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
      
      // Import the HTML result class
      const { LoadContentResultHTMLImpl } = await import('@core/types/load-content');
      
      // Always return LoadContentResult to maintain metadata
      const result = new LoadContentResultHTMLImpl({
        content: sectionContent,
        rawHtml: rawContent,
        filename: path.basename(resolvedPath),
        relative: `./${path.relative(env.getBasePath(), resolvedPath)}`,
        absolute: resolvedPath,
        title: title || undefined,
        description: description || undefined
      });
      return result;
    }
    
    // Extract HTML metadata
    const dom = new JSDOM(rawContent);
    const doc = dom.window.document;
    
    const title = doc.querySelector('title')?.textContent || '';
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || 
                       doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    
    // Import the HTML result class
    const { LoadContentResultHTMLImpl } = await import('@core/types/load-content');
    
    // Create HTML-specific LoadContentResult with metadata
    const result = new LoadContentResultHTMLImpl({
      content: markdownContent,
      rawHtml: rawContent,
      filename: path.basename(resolvedPath),
      relative: `./${path.relative(env.getBasePath(), resolvedPath)}`,
      absolute: resolvedPath,
      title: title || undefined,
      description: description || undefined
    });
    
    return result;
  }
  
  // Extract section if specified (for non-HTML files)
  if (options?.section) {
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('[loadSingleFile] Section options:', JSON.stringify(options.section, null, 2));
    }
    const sectionName = await extractSectionName(options.section, env);
    // Create file context for rename interpolation
    const fileContext = new LoadContentResultImpl({
      content: rawContent,
      filename: path.basename(resolvedPath),
      relative: `./${path.relative(env.getBasePath(), resolvedPath)}`,
      absolute: resolvedPath
    });
    
    const sectionContent = await extractSection(rawContent, sectionName, options.section.renamed, fileContext, env);
    
    // Always return LoadContentResult to maintain metadata
    // The result will have the section content but preserve the full file for frontmatter parsing
    const result = new LoadContentResultImpl({
      content: sectionContent,
      filename: path.basename(resolvedPath),
      relative: `./${path.relative(env.getBasePath(), resolvedPath)}`,
      absolute: resolvedPath,
      // Pass the full raw content so frontmatter can be parsed
      _rawContent: rawContent
    });
    return result;
  }
  
  // Create regular LoadContentResult (for non-HTML files)
  const result = new LoadContentResultImpl({
    content: rawContent,
    filename: path.basename(resolvedPath),
    relative: `./${path.relative(env.getBasePath(), resolvedPath)}`,
    absolute: resolvedPath
  });
  
  return result;
}

/**
 * Load files matching a glob pattern
 */
async function loadGlobPattern(pattern: string, options: any, env: Environment): Promise<LoadContentResult[] | string[]> {
  // Resolve the pattern relative to current directory
  const baseDir = env.getBasePath();
  
  
  // Use tinyglobby to find matching files
  let matches: string[];
  try {
    matches = await glob(pattern, {
      cwd: baseDir,
      absolute: true,
      followSymlinks: true,
      // Ignore common non-text files
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
    });
  } catch (globError: any) {
    throw globError;
  }
  
  // Sort by filename for consistent ordering
  matches.sort();
  
  // Load each matching file
  const results: (LoadContentResult | string)[] = [];
  
  for (const filePath of matches) {
    try {
      const rawContent = await env.readFile(filePath);
      
      // Check if this is an HTML file
      if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
        const markdownContent = await convertHtmlToMarkdown(rawContent, `file://${filePath}`);
        
        // Skip files if section extraction is requested and section doesn't exist
        if (options?.section) {
          const sectionName = await extractSectionName(options.section, env);
          try {
            // Create file context for rename interpolation
            const fileContext = new LoadContentResultImpl({
              content: rawContent,
              filename: path.basename(filePath),
              relative: `./${path.relative(baseDir, filePath)}`,
              absolute: filePath
            });
            
            const sectionContent = await extractSection(markdownContent, sectionName, options.section.renamed, fileContext, env);
            
            // If there's a rename, return the string directly
            if (options.section.renamed) {
              results.push(sectionContent);
            } else {
              // Extract HTML metadata even for sections
              const dom = new JSDOM(rawContent);
              const doc = dom.window.document;
              
              const title = doc.querySelector('title')?.textContent || '';
              const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || 
                                 doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
              
              const { LoadContentResultHTMLImpl } = await import('@core/types/load-content');
              
              // Use HTML result to preserve metadata
              results.push(new LoadContentResultHTMLImpl({
                content: sectionContent,
                rawHtml: rawContent,
                filename: path.basename(filePath),
                relative: `./${path.relative(baseDir, filePath)}`,
                absolute: filePath,
                title: title || undefined,
                description: description || undefined
              }));
            }
          } catch (error: any) {
            // Skip files without the requested section
            continue;
          }
        } else {
          // No section extraction, create HTML result with metadata
          const dom = new JSDOM(rawContent);
          const doc = dom.window.document;
          
          const title = doc.querySelector('title')?.textContent || '';
          const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || 
                             doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
          
          const { LoadContentResultHTMLImpl } = await import('@core/types/load-content');
          
          results.push(new LoadContentResultHTMLImpl({
            content: markdownContent,
            rawHtml: rawContent,
            filename: path.basename(filePath),
            relative: `./${path.relative(baseDir, filePath)}`,
            absolute: filePath,
            title: title || undefined,
            description: description || undefined
          }));
        }
      } else {
        // Non-HTML file handling
        if (options?.section) {
          if (process.env.MLLD_DEBUG === 'true') {
            console.log('[loadGlobPattern] Section options for file', filePath, ':', JSON.stringify(options.section, null, 2));
          }
          const sectionName = await extractSectionName(options.section, env);
          try {
            // Create file context for rename interpolation
            const fileContext = new LoadContentResultImpl({
              content: rawContent,
              filename: path.basename(filePath),
              relative: `./${path.relative(baseDir, filePath)}`,
              absolute: filePath
            });
            
            const sectionContent = await extractSection(rawContent, sectionName, options.section.renamed, fileContext, env);
            
            // If there's a rename, we're returning a transformed string that should be used directly
            if (options.section.renamed) {
              if (process.env.MLLD_DEBUG === 'true') {
                console.log('[loadGlobPattern] Renamed section content:', sectionContent);
              }
              // For renamed sections, return the string directly (will be collected as string array)
              results.push(sectionContent as any); // Type assertion needed because results is LoadContentResult[]
            } else {
              // Create result with section content, preserving raw content for frontmatter
              results.push(new LoadContentResultImpl({
                content: sectionContent,
                filename: path.basename(filePath),
                relative: `./${path.relative(baseDir, filePath)}`,
                absolute: filePath,
                _rawContent: rawContent
              }));
            }
          } catch (error: any) {
            // Skip files without the requested section
            continue;
          }
        } else {
          // No section extraction, include full content
          results.push(new LoadContentResultImpl({
            content: rawContent,
            filename: path.basename(filePath),
            relative: `./${path.relative(baseDir, filePath)}`,
            absolute: filePath
          }));
        }
      }
    } catch (error: any) {
      // Skip files that can't be read
      continue;
    }
  }
  
  // Type assertion based on what we're returning
  if (options?.section?.renamed) {
    return createRenamedContentArray(results as string[]);
  } else {
    return createLoadContentResultArray(results as LoadContentResult[]);
  }
}

/**
 * Reconstruct path string from path AST node
 */
async function reconstructPath(pathNode: any, env: Environment): Promise<string> {
  if (!pathNode.segments || !Array.isArray(pathNode.segments)) {
    return (pathNode.raw || '').trim();
  }

  // If segments contain variable references, we need to interpolate
  const hasVariables = pathNode.segments.some((seg: any) => seg.type === 'VariableReference');
  
  if (hasVariables) {
    // Import interpolate function to handle variable references
    const { interpolate } = await import('../core/interpreter');
    const interpolated = await interpolate(pathNode.segments, env);
    return interpolated.trim();
  }

  // No variables, simple reconstruction
  const reconstructed = pathNode.segments.map((segment: any) => {
    if (segment.type === 'Text') {
      return segment.content;
    } else if (segment.type === 'PathSeparator') {
      return segment.value;
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
async function extractSection(content: string, sectionName: string, renamedTitle?: any, fileContext?: LoadContentResult, env?: Environment): Promise<string> {
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
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('[extractSection] renamedTitle:', typeof renamedTitle, JSON.stringify(renamedTitle, null, 2));
      }
      
      let finalTitle: string;
      
      // Check if renamedTitle is a template object or a string
      if (typeof renamedTitle === 'object' && renamedTitle.type === 'rename-template') {
        // It's a template with parts that need interpolation
        if (!fileContext) {
          throw new MlldError('File context required for template interpolation in rename', {
            sectionName: sectionName
          });
        }
        
        if (process.env.MLLD_DEBUG === 'true') {
          console.log('[extractSection] Rename template parts:', JSON.stringify(renamedTitle.parts, null, 2));
        }
        
        // Create an environment for interpolation with the file context bound to <>
        const { interpolate } = await import('../core/interpreter');
        
        // Process the template parts, replacing placeholders with actual values
        const processedParts: any[] = [];
        if (process.env.MLLD_DEBUG === 'true') {
          console.log('[extractSection] Processing parts:', renamedTitle.parts?.map((p: any) => ({ type: p.type, source: p.source })));
        }
        for (const part of renamedTitle.parts || []) {
          if (part.type === 'FileReference' && part.source?.type === 'placeholder') {
            // Handle <> and <>.field references
            if (part.fields && part.fields.length > 0) {
              // Access fields on the file context
              let value: any = fileContext;
              for (const field of part.fields) {
                if (value && typeof value === 'object') {
                  value = value[field.value];
                } else {
                  value = undefined;
                  break;
                }
              }
              processedParts.push({
                type: 'Text',
                content: value !== undefined ? String(value) : ''
              });
            } else {
              // Just <> - use the extracted section content without the header
              // Remove the first line if it's a markdown header
              const lines = extracted.split('\n');
              let contentWithoutHeader = extracted;
              if (lines.length > 0 && lines[0].match(/^#+\s/)) {
                // Skip the header line
                contentWithoutHeader = lines.slice(1).join('\n').trim();
              }
              processedParts.push({
                type: 'Text',
                content: contentWithoutHeader
              });
            }
          } else {
            // Regular text parts
            processedParts.push(part);
          }
        }
        
        // Interpolate the processed template using the passed environment
        if (!env) {
          throw new MlldError('Environment required for template interpolation', {
            sectionName: sectionName
          });
        }
        finalTitle = await interpolate(processedParts, env);
      } else {
        // It's a plain string (legacy behavior)
        finalTitle = renamedTitle;
      }
      
      // Import the shared header transform function
      const { applyHeaderTransform } = await import('./show');
      return applyHeaderTransform(extracted, finalTitle);
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
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('=== Readability Output ===');
      console.log('Title:', article.title);
      console.log('Content HTML:', article.content.substring(0, 500));
      console.log('=== Markdown Output ===');
      console.log(markdown.substring(0, 500));
    }
    
    return markdown;
  } catch (error) {
    // If conversion fails, return the original HTML
    console.warn('Failed to convert HTML to Markdown:', error);
    return html;
  }
}

/**
 * Apply transform template to array of LoadContentResults
 */
async function applyTransformToResults(
  results: LoadContentResult[],
  transform: any,
  env: Environment
): Promise<string[]> {
  const { interpolate } = await import('../core/interpreter');
  const transformed: string[] = [];
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.log('[applyTransformToResults] Processing', results.length, 'results');
    console.log('[applyTransformToResults] Transform:', JSON.stringify(transform, null, 2));
    console.log('[applyTransformToResults] First result:', results[0]);
  }
  
  for (const result of results) {
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('[applyTransformToResults] Processing result:', {
        filename: result.filename,
        hasFm: !!result.fm,
        fmName: result.fm?.name,
        resultType: result.constructor.name,
        hasRawContent: !!result._rawContent
      });
    }
    
    // Create a child environment with the current result bound to <>
    const childEnv = env.createChild();
    
    // Create a special variable for <> placeholder
    const placeholderVar = {
      type: 'placeholder',
      value: result,
      // Make the LoadContentResult properties available
      fm: result.fm,
      content: result.content,
      filename: result.filename,
      relative: result.relative,
      absolute: result.absolute
    };
    
    // Process the template parts
    const templateParts = transform.parts || [];
    const processedParts: any[] = [];
    
    for (const part of templateParts) {
      if (part.type === 'placeholder') {
        // Handle <> and <>.field references
        if (part.fields && part.fields.length > 0) {
          // Access fields on the result
          let value: any = result;
          if (process.env.MLLD_DEBUG === 'true') {
            console.log('[applyTransformToResults] Accessing fields:', part.fields.map((f: any) => f.value));
          }
          for (const field of part.fields) {
            if (value && typeof value === 'object') {
              const fieldName = field.value;
              value = value[fieldName];
              if (process.env.MLLD_DEBUG === 'true') {
                console.log(`[applyTransformToResults] Field ${fieldName} = ${value}`);
              }
            } else {
              value = undefined;
              break;
            }
          }
          processedParts.push({
            type: 'Text',
            content: value !== undefined ? String(value) : ''
          });
        } else {
          // Just <> - use the content
          processedParts.push({
            type: 'Text',
            content: result.content
          });
        }
      } else {
        // Regular template parts (text, variables)
        processedParts.push(part);
      }
    }
    
    // Interpolate the processed template
    const transformedContent = await interpolate(processedParts, childEnv);
    transformed.push(transformedContent);
  }
  
  return transformed;
}