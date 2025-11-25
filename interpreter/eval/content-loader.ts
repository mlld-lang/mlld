import { Environment } from '@interpreter/env/Environment';
import { MlldError } from '@core/errors';
import { llmxmlInstance } from '../utils/llmxml-instance';
import type { LoadContentResult } from '@core/types/load-content';
import { LoadContentResultImpl, LoadContentResultURLImpl, LoadContentResultHTMLImpl } from './load-content';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';
import { wrapLoadContentValue } from '../utils/load-content-structured';
import { glob } from 'tinyglobby';
import * as path from 'path';
import { extractAst, type AstResult } from './ast-extractor';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import type { ArrayVariable, Variable } from '@core/types/variable/VariableTypes';
import { createRenamedContentVariable, createLoadContentResultVariable, extractVariableValue } from '@interpreter/utils/variable-migration';
import { processPipeline } from './pipeline/unified-processor';
import { wrapStructured, isStructuredValue, ensureStructuredValue, asText } from '../utils/structured-value';
import type { StructuredValue, StructuredValueType, StructuredValueMetadata } from '../utils/structured-value';
import { InterpolationContext } from '../core/interpolation-context';
import type { SecurityDescriptor } from '@core/types/security';

async function interpolateAndRecord(
  nodes: any,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  const { interpolate } = await import('../core/interpreter');
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
}
/**
 * Check if a path contains glob patterns
 */
function isGlobPattern(path: string): boolean {
  return /[\*\?\{\}\[\]]/.test(path);
}

function getRelativeBasePath(env: Environment): string {
  // Prefer inferred project root; fall back to the current file directory when unavailable
  const projectRoot = env.getProjectRoot?.() ?? env.getBasePath();
  return projectRoot || env.getFileDirectory();
}

function formatRelativePath(env: Environment, targetPath: string): string {
  const basePath = path.resolve(getRelativeBasePath(env));
  const absoluteTarget = path.resolve(targetPath);
  const relative = path.relative(basePath, absoluteTarget);
  return relative ? `./${relative}` : './';
}

/**
 * Process content loading expressions (<file.md> syntax)
 * Loads content from files or URLs and optionally extracts sections
 * Now supports glob patterns and returns metadata-rich results
 */
export async function processContentLoader(node: any, env: Environment): Promise<string | LoadContentResult | LoadContentResult[] | Array<AstResult | null> | string[] | StructuredValue> {
  if (!node || node.type !== 'load-content') {
    throw new MlldError('Invalid content loader node', {
      node: node ? node.type : 'null',
      expected: 'load-content'
    });
  }

  const { source, options, pipes, ast } = node;

  if (!source) {
    throw new MlldError('Content loader expression missing source', {
      node: node
    });
  }

  // Check if we have a transform template
  const hasTransform = options?.transform?.type === 'template';
  // Check if we have pipes
  const hasPipes = pipes && pipes.length > 0;

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

  // AST extraction takes precedence for local files
  if (ast && actualSource.type === 'path') {
    const loadAstResults = async (): Promise<Array<AstResult | null>> => {
      if (isGlob) {
        const baseDir = env.getFileDirectory();
        const matches = await glob(pathOrUrl, {
          cwd: baseDir,
          absolute: true,
          followSymlinks: true,
          ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
        });
        const aggregated: Array<AstResult | null> = [];
        const fileList = Array.isArray(matches) ? matches : [];
        for (const filePath of fileList) {
          try {
            const content = await env.readFile(filePath);
            const extracted = extractAst(content, filePath, ast);
            for (const entry of extracted) {
              if (entry) {
                aggregated.push({ ...entry, file: filePath });
              } else {
                aggregated.push(null);
              }
            }
          } catch {
            // skip unreadable files
          }
        }
        return aggregated;
      }

      const content = await env.readFile(pathOrUrl);
      return extractAst(content, pathOrUrl, ast);
    };

    const astResults = await loadAstResults();

    if (hasTransform && options?.transform) {
      const transformed = await applyTemplateToAstResults(astResults, options.transform, env);
      return finalizeLoaderResult(isGlob ? transformed : transformed[0] ?? '', { type: 'text' });
    }

    if (hasPipes) {
      const piped = await processPipeline({
        value: astResults,
        env,
        node: { pipes }
      });
      return finalizeLoaderResult(piped, Array.isArray(astResults) ? { type: 'array' } : undefined);
    }

    return finalizeLoaderResult(astResults, { type: 'array' });
  }

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
        
        // Apply pipes if present
        if (hasPipes) {
          const pipedSection = await processPipeline({
            value: sectionContent,
            env,
            node: { pipes }
          });
          return finalizeLoaderResult(pipedSection, { type: 'text', metadata: { url: pathOrUrl } });
        }
        
        // For URLs with sections, return plain string (backward compatibility)
        return finalizeLoaderResult(sectionContent, { type: 'text', metadata: { url: pathOrUrl } });
      }
      
      // Create rich URL result with metadata
      const urlResult = new LoadContentResultURLImpl({
        content: processedContent,    // Markdown for HTML, raw content for others
        rawContent: response.content,  // Always the raw response
        url: pathOrUrl,
        headers: response.headers,
        status: response.status
      });
      
      // Apply pipes if present
      if (hasPipes) {
        // For LoadContentResult objects, apply pipes to the content
        const pipedContent = await processPipeline({
          value: urlResult.content,
          env,
          node: { pipes }
        });
        // Return a new result with piped content
        const pipedResult = new LoadContentResultURLImpl({
          content: pipedContent,
          rawContent: response.content,
          url: pathOrUrl,
          headers: response.headers,
          status: response.status
        });
        return finalizeLoaderResult(pipedResult, { type: 'object', text: asText(pipedContent), metadata: { url: pathOrUrl } });
      }
      
      return finalizeLoaderResult(urlResult, { type: 'object', text: urlResult.content, metadata: { url: pathOrUrl } });
    }
    
    // Handle glob patterns for file paths
    if (isGlob) {
      const results = await loadGlobPattern(pathOrUrl, options, env);
      
      // Apply transform if specified
      if (hasTransform && options.transform) {
        const transformedResults = await applyTransformToResults(results, options.transform, env);
        return finalizeLoaderResult(transformedResults, { type: 'array' });
      }
      
      // Apply pipes if present
      if (hasPipes) {
        // For arrays of results, apply pipes to each result's content
        const pipedResults = await Promise.all(
          results.map(async (result) => {
            const pipedContent = await processPipeline({
              value: typeof result === 'string' ? result : result.content,
              env,
              node: { pipes }
            });
            if (typeof result === 'string') {
              return pipedContent;
            }
            return new LoadContentResultImpl({
              content: pipedContent,
              filename: result.filename,
              relative: result.relative,
              absolute: result.absolute,
              _rawContent: result._rawContent
            });
          })
        );
        return finalizeLoaderResult(pipedResults, { type: 'array' });
      }
      
      return finalizeLoaderResult(results, { type: 'array' });
    }
    
    // Single file loading
    const result = await loadSingleFile(pathOrUrl, options, env);
    
    // Apply transform if specified (for single file)
    if (hasTransform && options.transform) {
      const transformed = await applyTransformToResults([result], options.transform, env);
      return finalizeLoaderResult(transformed[0], { type: typeof transformed[0] === 'string' ? 'text' : 'object' });
    }
    
    // Apply pipes if present
    if (hasPipes) {
      // Check if result is a string (from section extraction) or LoadContentResult
      if (typeof result === 'string') {
        const pipedString = await processPipeline({
          value: result,
          env,
          node: { pipes }
        });
        return finalizeLoaderResult(pipedString, { type: 'text' });
      } else {
        // For LoadContentResult objects, apply pipes to the content
        const pipedContent = await processPipeline({
          value: result.content,
          env,
          node: { pipes }
        });
        // Return a new result with piped content
        const pipedResult = new LoadContentResultImpl({
          content: pipedContent,
          filename: result.filename,
          relative: result.relative,
          absolute: result.absolute,
          _rawContent: result._rawContent
        });
        return finalizeLoaderResult(pipedResult, { type: 'object', text: asText(pipedContent) });
      }
    }

    // Always return the full LoadContentResult object
    // The smart object will handle string conversion when needed
    return finalizeLoaderResult(result, { type: typeof result === 'string' ? 'text' : 'object', text: typeof result === 'string' ? result : result.content });
  } catch (error: any) {
    if (process.env.DEBUG_CONTENT_LOADER) {
      console.log(`ERROR in processContentLoader: ${error.message}`);
      console.log(`Error stack:`, error.stack);
    }
    
    // If this is a pipeline/transform error, re-throw it directly to preserve the original error
    if (error.message && error.message.includes('Unknown transform:')) {
      throw error;
    }
    
    // Otherwise, treat it as a file loading error
    let errorMessage = `Failed to load content: ${pathOrUrl}`;
    
    // Add helpful hint for relative paths
    if (!pathOrUrl.startsWith('/') && !pathOrUrl.startsWith('@') && !env.isURL(pathOrUrl)) {
      errorMessage += `\n\nHint: Paths are relative to mlld files. You can make them relative to your project root with the \`@base/\` prefix`;
    }
    
    throw new MlldError(errorMessage, {
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
        relative: formatRelativePath(env, resolvedPath),
        absolute: resolvedPath
      });
      
      const sectionContent = await extractSection(markdownContent, sectionName, options.section.renamed, fileContext, env);
      
      // Extract HTML metadata
      const dom = new JSDOM(rawContent);
      const doc = dom.window.document;
      
      const title = doc.querySelector('title')?.textContent || '';
      const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || 
                         doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
      
      // Always return LoadContentResult to maintain metadata
      const result = new LoadContentResultHTMLImpl({
        content: sectionContent,
        rawHtml: rawContent,
        filename: path.basename(resolvedPath),
        relative: formatRelativePath(env, resolvedPath),
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
    
    // Create HTML-specific LoadContentResult with metadata
    const result = new LoadContentResultHTMLImpl({
      content: markdownContent,
      rawHtml: rawContent,
      filename: path.basename(resolvedPath),
      relative: formatRelativePath(env, resolvedPath),
      absolute: resolvedPath,
      title: title || undefined,
      description: description || undefined
    });
    
    return result;
  }
  
  // Extract section if specified (for non-HTML files)
  if (options?.section) {
    const sectionName = await extractSectionName(options.section, env);
    // Create file context for rename interpolation
    const fileContext = new LoadContentResultImpl({
      content: rawContent,
      filename: path.basename(resolvedPath),
      relative: formatRelativePath(env, resolvedPath),
      absolute: resolvedPath
    });
    
    const sectionContent = await extractSection(rawContent, sectionName, options.section.renamed, fileContext, env);
    
    // Always return LoadContentResult to maintain metadata
    // The result will have the section content but preserve the full file for frontmatter parsing
    const result = new LoadContentResultImpl({
      content: sectionContent,
      filename: path.basename(resolvedPath),
      relative: formatRelativePath(env, resolvedPath),
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
    relative: formatRelativePath(env, resolvedPath),
    absolute: resolvedPath
  });
  
  return result;
}

/**
 * Load files matching a glob pattern
 */
async function loadGlobPattern(pattern: string, options: any, env: Environment): Promise<LoadContentResult[] | string[]> {
  const relativeBase = getRelativeBasePath(env);
  let globCwd = env.getFileDirectory();
  let globPattern = pattern;

  if (pattern.startsWith('@base/')) {
    globCwd = relativeBase;
    globPattern = pattern.slice('@base/'.length);
  } else if (path.isAbsolute(pattern)) {
    globCwd = path.parse(pattern).root || '/';
    globPattern = path.relative(globCwd, pattern);
  }

  const computeRelative = (filePath: string): string => formatRelativePath(env, filePath);

  // Use tinyglobby to find matching files
  let matches: string[];
  try {
    matches = await glob(globPattern, {
      cwd: globCwd,
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
              relative: computeRelative(filePath),
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
              
              // Use HTML result to preserve metadata
              results.push(new LoadContentResultHTMLImpl({
                content: sectionContent,
                rawHtml: rawContent,
                filename: path.basename(filePath),
                relative: computeRelative(filePath),
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
          
          results.push(new LoadContentResultHTMLImpl({
            content: markdownContent,
            rawHtml: rawContent,
            filename: path.basename(filePath),
            relative: computeRelative(filePath),
            absolute: filePath,
            title: title || undefined,
            description: description || undefined
          }));
        }
      } else {
        // Non-HTML file handling
        if (options?.section) {
          const sectionName = await extractSectionName(options.section, env);
          try {
            // Create file context for rename interpolation
            const fileContext = new LoadContentResultImpl({
              content: rawContent,
              filename: path.basename(filePath),
              relative: computeRelative(filePath),
              absolute: filePath
            });
            
            const sectionContent = await extractSection(rawContent, sectionName, options.section.renamed, fileContext, env);
            
            // If there's a rename, we're returning a transformed string that should be used directly
            if (options.section.renamed) {
              // For renamed sections, return the string directly (will be collected as string array)
              results.push(sectionContent as any); // Type assertion needed because results is LoadContentResult[]
            } else {
              // Create result with section content, preserving raw content for frontmatter
              results.push(new LoadContentResultImpl({
                content: sectionContent,
                filename: path.basename(filePath),
                relative: computeRelative(filePath),
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
            relative: computeRelative(filePath),
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
    // Create RenamedContentArray Variable
    const arrayValue = results as string[];
    
    // Create Variable with RenamedContentArray behavior
    const variable = createRenamedContentVariable(arrayValue, {
      name: 'glob-result',
      fromGlobPattern: true,
      globPattern: pattern,
      fileCount: arrayValue.length
    });
    
    // Extract the value with behaviors preserved
    const arrayWithBehaviors = extractVariableValue(variable);
    
    // For compatibility, still return the array but with behaviors and tagging
    return arrayWithBehaviors;
  } else {
    // Create LoadContentResultArray Variable
    const loadContentArray = results as LoadContentResult[];
    
    // Create Variable with LoadContentResultArray behavior
    const variable = createLoadContentResultVariable(loadContentArray, {
      name: 'glob-result',
      fromGlobPattern: true,
      globPattern: pattern,
      fileCount: loadContentArray.length
    });
    
    // Extract the value with behaviors preserved
    const arrayWithBehaviors = extractVariableValue(variable);
    
    // For compatibility, still return the array but with behaviors and tagging
    return arrayWithBehaviors;
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
    const interpolated = await interpolateAndRecord(pathNode.segments, env);
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
    return await interpolateAndRecord([identifier], env);
  } else if (Array.isArray(identifier)) {
    return await interpolateAndRecord(identifier, env);
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
      
      let finalTitle: string;
      
      // Check if renamedTitle is a template object or a string
      if (typeof renamedTitle === 'object' && renamedTitle.type === 'rename-template') {
        // It's a template with parts that need interpolation
        if (!fileContext) {
          throw new MlldError('File context required for template interpolation in rename', {
            sectionName: sectionName
          });
        }
        
        
        // Create an environment for interpolation with the file context bound to <>
        // Process the template parts, replacing placeholders with actual values
        const processedParts: any[] = [];
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
        finalTitle = await interpolateAndRecord(processedParts, env);
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
  // Interpolate the processed template for each result
  const transformed: string[] = [];
  
  
  for (const result of results) {
    
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
          for (const field of part.fields) {
            if (value && typeof value === 'object') {
              const fieldName = field.value;
              value = value[fieldName];
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
    const transformedContent = await interpolateAndRecord(processedParts, childEnv);
    transformed.push(transformedContent);
  }
  
  return transformed;
}

async function applyTemplateToAstResults(
  results: Array<AstResult | null>,
  transform: any,
  env: Environment
): Promise<string[]> {
  const transformed: string[] = [];

  for (const result of results) {
    const templateParts = transform.parts || [];
    const processedParts: any[] = [];

    for (const part of templateParts) {
      if (part.type === 'placeholder') {
        if (!result) {
          processedParts.push({ type: 'Text', content: '' });
          continue;
        }

        if (part.fields && part.fields.length > 0) {
          let value: any = result;
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
            content: value !== undefined && value !== null ? String(value) : ''
          });
        } else {
          processedParts.push({
            type: 'Text',
            content: result.code ?? ''
          });
        }
      } else {
        processedParts.push(part);
      }
    }

    const childEnv = env.createChild();
    const transformedContent = await interpolateAndRecord(processedParts, childEnv);
    transformed.push(transformedContent);
  }

  return transformed;
}

function finalizeLoaderResult<T>(
  value: T,
  options?: { type?: StructuredValueType; text?: string; metadata?: StructuredValueMetadata }
): T | StructuredValue {
  if (isStructuredValue(value)) {
    const metadata = mergeMetadata(value.metadata, options?.metadata);
    if (!options?.type && !options?.text && (!metadata || metadata === value.metadata)) {
      return value;
    }
    return wrapStructured(value, options?.type, options?.text, metadata);
  }

  if (isLoadContentResult(value) || isLoadContentResultArray(value)) {
    const wrapped = wrapLoadContentValue(value);
    const metadata = mergeMetadata(wrapped.metadata, options?.metadata);
    const text = options?.text ?? wrapped.text;
    return wrapStructured(wrapped, wrapped.type, text, metadata);
  }

  const inferredType = options?.type ?? inferLoaderType(value);
  const text = options?.text ?? deriveLoaderText(value, inferredType);
  const metadata = mergeMetadata(undefined, options?.metadata);
  return ensureStructuredValue(value, inferredType, text, metadata);
}

function inferLoaderType(value: unknown): StructuredValueType {
  if (typeof value === 'string') {
    return 'text';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return 'object';
}

function deriveLoaderText(value: unknown, type: StructuredValueType): string {
  if (type === 'text') {
    return typeof value === 'string' ? value : String(value ?? '');
  }

  if (type === 'array') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value ?? '');
    }
  }

  if (type === 'object' && value && typeof value === 'object' && 'content' in value && typeof (value as any).content === 'string') {
    return (value as any).content;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? '');
  }
}

function mergeMetadata(base: StructuredValueMetadata | undefined, extra: StructuredValueMetadata | undefined): StructuredValueMetadata | undefined {
  const merged = {
    source: 'load-content' as const,
    ...(base || {}),
    ...(extra || {})
  } as StructuredValueMetadata;
  return merged;
}
