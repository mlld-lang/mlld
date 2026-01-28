import { Environment } from '@interpreter/env/Environment';
import { MlldError, MlldDirectiveError, MlldSecurityError } from '@core/errors';
import type { SourceLocation } from '@core/types';
import { llmxmlInstance } from '../utils/llmxml-instance';
import type { LoadContentResult } from '@core/types/load-content';
import { LoadContentResultImpl, LoadContentResultURLImpl, LoadContentResultHTMLImpl } from './load-content';
import { wrapLoadContentValue } from '../utils/load-content-structured';
import { glob } from 'tinyglobby';
import * as path from 'path';
import { extractAst, extractNames, hasNameListPattern, hasContentPattern, type AstResult, type AstPattern } from './ast-extractor';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import { processPipeline } from './pipeline/unified-processor';
import { wrapStructured, isStructuredValue, ensureStructuredValue, asText } from '../utils/structured-value';
import type { StructuredValue, StructuredValueType, StructuredValueMetadata } from '../utils/structured-value';
import { InterpolationContext } from '../core/interpolation-context';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { labelsForPath } from '@core/security/paths';
import { extractVariableValue } from '../utils/variable-resolution';
import { isLoadContentResult } from '@core/types/load-content';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { enforceFilesystemAccess } from '@interpreter/policy/filesystem-policy';

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

async function readFileWithPolicy(
  pathOrUrl: string,
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<string> {
  if (env.isURL(pathOrUrl)) {
    return env.readFile(pathOrUrl);
  }
  const resolvedPath = await env.resolvePath(pathOrUrl);
  enforceFilesystemAccess(env, 'read', resolvedPath, sourceLocation);
  return env.readFile(resolvedPath);
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

  const { source, options, pipes, ast, optional } = node;
  const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
  const sourceLocation = node.location ?? undefined;
  const isOptional = optional === true;

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

  // Check for nullable suffix (trailing ?) - makes glob return empty array instead of erroring
  // The ? suffix means "optional" - if no files match, return empty array rather than error
  // Must strip this before glob processing since ? is also a glob wildcard character
  let isNullable = false;
  if (pathOrUrl.endsWith('?')) {
    isNullable = true;
    pathOrUrl = pathOrUrl.slice(0, -1);
  }

  // Detect glob pattern from the path (after stripping nullable suffix)
  const isGlob = isGlobPattern(pathOrUrl);

  // AST extraction takes precedence for local files
  if (ast && actualSource.type === 'path') {
    let astPatterns = ast as AstPattern[];

    // Resolve variables in patterns (type-filter-var, name-list-var)
    astPatterns = await Promise.all(astPatterns.map(async pattern => {
      if (pattern.type === 'type-filter-var') {
        const variable = env.getVariable(pattern.identifier);
        if (!variable) {
          throw new MlldDirectiveError(
            `Variable @${pattern.identifier} is not defined`,
            { identifier: pattern.identifier }
          );
        }
        const varValue = await extractVariableValue(variable, env);
        const filter = varValue ? String(varValue) : undefined;
        if (!filter) {
          throw new MlldDirectiveError(
            `Variable @${pattern.identifier} is empty`,
            { identifier: pattern.identifier }
          );
        }
        return { type: 'type-filter', filter, usage: pattern.usage };
      } else if (pattern.type === 'name-list-var') {
        const variable = env.getVariable(pattern.identifier);
        if (!variable) {
          throw new MlldDirectiveError(
            `Variable @${pattern.identifier} is not defined`,
            { identifier: pattern.identifier }
          );
        }
        const varValue = await extractVariableValue(variable, env);
        const filter = varValue ? String(varValue) : undefined;
        if (!filter) {
          throw new MlldDirectiveError(
            `Variable @${pattern.identifier} is empty`,
            { identifier: pattern.identifier }
          );
        }
        return { type: 'name-list', filter, usage: pattern.usage };
      }
      return pattern;
    })) as AstPattern[];

    // Validate: cannot mix content patterns with name-list patterns
    const hasNames = hasNameListPattern(astPatterns);
    const hasContent = hasContentPattern(astPatterns);
    if (hasNames && hasContent) {
      throw new MlldDirectiveError(
        'Cannot mix content selectors with name-list selectors',
        { patterns: astPatterns.map(p => p.type) }
      );
    }

    // Handle name-list patterns: ??, fn??, var??, class??, etc.
    if (hasNames) {
      const loadNameResults = async (): Promise<string[] | Array<{ names: string[]; file: string; relative: string; absolute: string }>> => {
        // Get the filter from the first name-list pattern (variables already resolved above)
        const namePattern = astPatterns.find(p =>
          p.type === 'name-list' || p.type === 'name-list-all'
        );
        const filter = namePattern?.type === 'name-list' ? namePattern.filter : undefined;
        // name-list-all has no filter (returns all names)

        if (isGlob) {
          // For glob patterns, return per-file structure with metadata
          const baseDir = env.getFileDirectory();
          const matches = await glob(pathOrUrl, {
            cwd: baseDir,
            absolute: true,
            followSymlinks: true,
            ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
          });
          const results: Array<{ names: string[]; file: string; relative: string; absolute: string }> = [];
          const fileList = Array.isArray(matches) ? matches : [];
          for (const filePath of fileList) {
            try {
              const content = await readFileWithPolicy(filePath, env, sourceLocation);
              const names = extractNames(content, filePath, filter);
              if (names.length > 0) {
                results.push({
                  names,
                  file: path.basename(filePath),
                  relative: formatRelativePath(env, filePath),
                  absolute: filePath
                });
              }
            } catch (error: any) {
              if (error instanceof MlldSecurityError) {
                throw error;
              }
              // skip unreadable files
            }
          }
          return results;
        }

        // Single file - return plain string array
        const content = await readFileWithPolicy(pathOrUrl, env, sourceLocation);
        return extractNames(content, pathOrUrl, filter);
      };

      const nameResults = await loadNameResults();

      if (hasPipes) {
        const piped = await processPipeline({
          value: nameResults,
          env,
          node: { pipes }
        });
        return finalizeLoaderResult(piped, { type: 'array' });
      }

      return finalizeLoaderResult(nameResults, { type: 'array' });
    }

    // Handle content patterns (definitions, type filters, wildcards)
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
            const content = await readFileWithPolicy(filePath, env, sourceLocation);
            const extracted = extractAst(content, filePath, astPatterns);
            for (const entry of extracted) {
              if (entry) {
                aggregated.push({ ...entry, file: filePath });
              } else {
                aggregated.push(null);
              }
            }
          } catch (error: any) {
            if (error instanceof MlldSecurityError) {
              throw error;
            }
            // skip unreadable files
          }
        }
        return aggregated;
      }

      const content = await readFileWithPolicy(pathOrUrl, env, sourceLocation);
      return extractAst(content, pathOrUrl, astPatterns);
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
      const urlDescriptor = makeSecurityDescriptor({
        taint: ['src:network'],
        sources: [pathOrUrl]
      });
      const urlMetadata: StructuredValueMetadata = {
        url: pathOrUrl,
        security: policyEnforcer.applyDefaultTrustLabel(urlDescriptor) ?? urlDescriptor
      };
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
        // Handle section-list patterns (??, ##??, etc.)
        if (isSectionListPattern(options.section)) {
          const level = getSectionListLevel(options.section);
          const sections = listSections(processedContent, level);

          if (hasPipes) {
            const piped = await processPipeline({
              value: sections,
              env,
              node: { pipes }
            });
            return finalizeLoaderResult(piped, { type: 'array', metadata: urlMetadata });
          }

          return finalizeLoaderResult(sections, { type: 'array', metadata: urlMetadata });
        }

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
          return finalizeLoaderResult(pipedSection, { type: 'text', metadata: urlMetadata });
        }

        // For URLs with sections, return plain string (backward compatibility)
        return finalizeLoaderResult(sectionContent, { type: 'text', metadata: urlMetadata });
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
        return finalizeLoaderResult(pipedResult, { type: 'object', text: asText(pipedContent), metadata: urlMetadata });
      }
      
      return finalizeLoaderResult(urlResult, { type: 'object', text: urlResult.content, metadata: urlMetadata });
    }
    
    // Handle glob patterns for file paths
    if (isGlob) {
      const results = await loadGlobPattern(pathOrUrl, options, env, sourceLocation);
      
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
    const resolvedFilePath = await env.resolvePath(pathOrUrl);
    const fileDescriptor = makeSecurityDescriptor({
      taint: ['src:file', ...labelsForPath(resolvedFilePath)],
      sources: [resolvedFilePath]
    });
    const fileSecurityDescriptor = policyEnforcer.applyDefaultTrustLabel(fileDescriptor) ?? fileDescriptor;
    const securityMetadata = { security: fileSecurityDescriptor };
    const result = await loadSingleFile(
      pathOrUrl,
      options,
      env,
      pipes,
      resolvedFilePath,
      sourceLocation
    );

    // Handle array results (from section-list patterns)
    if (Array.isArray(result)) {
      if (hasPipes) {
        const piped = await processPipeline({
          value: result,
          env,
          node: { pipes }
        });
        return finalizeLoaderResult(piped, { type: 'array', metadata: securityMetadata });
      }
      return finalizeLoaderResult(result, { type: 'array', metadata: securityMetadata });
    }

    // Apply transform if specified (for single file)
    if (hasTransform && options.transform) {
      const transformed = await applyTransformToResults([result], options.transform, env);
      return finalizeLoaderResult(transformed[0], {
        type: typeof transformed[0] === 'string' ? 'text' : 'object',
        metadata: securityMetadata
      });
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
        return finalizeLoaderResult(pipedString, { type: 'text', metadata: securityMetadata });
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
        return finalizeLoaderResult(pipedResult, {
          type: 'object',
          text: asText(pipedContent),
          metadata: securityMetadata
        });
      }
    }

    // Always return the full LoadContentResult object
    // The smart object will handle string conversion when needed
    return finalizeLoaderResult(result, {
      type: typeof result === 'string' ? 'text' : 'object',
      text: typeof result === 'string' ? result : result.content,
      metadata: securityMetadata
    });
  } catch (error: any) {
    if (error instanceof MlldSecurityError) {
      throw error;
    }
    if (process.env.DEBUG_CONTENT_LOADER) {
      console.log(`ERROR in processContentLoader: ${error.message}`);
      console.log(`Error stack:`, error.stack);
    }

    // If this is a pipeline/transform error, re-throw it directly to preserve the original error
    if (error.message && error.message.includes('Unknown transform:')) {
      throw error;
    }

    // If this is a security/access denial, preserve the clear error message
    if (error.message && error.message.includes('Access denied:')) {
      throw new MlldError(error.message, {
        path: pathOrUrl,
        error: error.message
      });
    }

    // If optional loading (<path>?), return null for single files, [] for globs
    if (isOptional) {
      if (isGlob) {
        return finalizeLoaderResult([], { type: 'array' });
      }
      return null as any;
    }

    // Otherwise, treat it as a file loading error
    let errorMessage = `Failed to load content: ${pathOrUrl}`;

    // Add helpful hint for relative paths (but not for XML/HTML ambiguity cases)
    const hasAngleBracket = pathOrUrl.includes('<') || pathOrUrl.includes('>');
    if (!hasAngleBracket && !pathOrUrl.startsWith('/') && !pathOrUrl.startsWith('@') && !env.isURL(pathOrUrl)) {
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
async function loadSingleFile(
  filePath: string,
  options: any,
  env: Environment,
  pipes?: any[],
  resolvedPathOverride?: string,
  sourceLocation?: SourceLocation
): Promise<LoadContentResult | string | string[]> {
  const hasPipes = pipes && pipes.length > 0;
  const resolvedPath = resolvedPathOverride ?? (await env.resolvePath(filePath));
  // Let Environment handle path resolution and fuzzy matching
  enforceFilesystemAccess(env, 'read', resolvedPath, sourceLocation);
  const rawContent = await env.readFile(resolvedPath);
  
  // Check if this is an HTML file and convert to Markdown
  if (resolvedPath.endsWith('.html') || resolvedPath.endsWith('.htm')) {
    const markdownContent = await convertHtmlToMarkdown(rawContent, `file://${resolvedPath}`);
    
    // Extract section if specified
    if (options?.section) {
      // Handle section-list patterns (??, ##??, etc.)
      if (isSectionListPattern(options.section)) {
        const level = getSectionListLevel(options.section);
        const sections = listSections(markdownContent, level);
        // Return array directly - pipes will be handled by caller
        return sections;
      }

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
    // Handle section-list patterns (??, ##??, etc.)
    if (isSectionListPattern(options.section)) {
      const level = getSectionListLevel(options.section);
      const sections = listSections(rawContent, level);
      // Return array directly - pipes will be handled by caller
      return sections;
    }

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
async function loadGlobPattern(
  pattern: string,
  options: any,
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<LoadContentResult[] | string[]> {
  const relativeBase = getRelativeBasePath(env);
  let globCwd = env.getFileDirectory();
  let globPattern = pattern;

  if (pattern.startsWith('@base/')) {
    globCwd = relativeBase;
    globPattern = pattern.slice('@base/'.length);
  } else if (pattern.startsWith('@root/')) {
    globCwd = relativeBase;
    globPattern = pattern.slice('@root/'.length);
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
      const rawContent = await readFileWithPolicy(filePath, env, sourceLocation);
      
      // Check if this is an HTML file
      if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
        const markdownContent = await convertHtmlToMarkdown(rawContent, `file://${filePath}`);
        
        // Skip files if section extraction is requested and section doesn't exist
        if (options?.section) {
          // Handle section-list patterns (??, ##??, etc.)
          if (isSectionListPattern(options.section)) {
            const level = getSectionListLevel(options.section);
            const sections = listSections(markdownContent, level);
            // For glob patterns with section lists, preserve per-file structure
            if (sections.length > 0) {
              results.push({
                names: sections,
                file: path.basename(filePath),
                relative: computeRelative(filePath),
                absolute: filePath
              } as any);
            }
            continue;
          }

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
          // Handle section-list patterns (??, ##??, etc.)
          if (isSectionListPattern(options.section)) {
            const level = getSectionListLevel(options.section);
            const sections = listSections(rawContent, level);
            // For glob patterns with section lists, preserve per-file structure
            if (sections.length > 0) {
              results.push({
                names: sections,
                file: path.basename(filePath),
                relative: computeRelative(filePath),
                absolute: filePath
              } as any);
            }
            continue;
          }

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
      if (error instanceof MlldSecurityError) {
        throw error;
      }
      // Skip files that can't be read
      continue;
    }
  }

  // Return the results array directly
  // The caller will handle wrapping with wrapStructured if needed
  return results as LoadContentResult[] | string[];
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
/**
 * Check if section node is a section-list pattern
 */
function isSectionListPattern(sectionNode: any): boolean {
  return sectionNode?.identifier?.type === 'section-list';
}

/**
 * Get level from section-list pattern
 */
function getSectionListLevel(sectionNode: any): number {
  return sectionNode?.identifier?.level ?? 0;
}

async function extractSectionName(sectionNode: any, env: Environment): Promise<string> {
  if (!sectionNode || !sectionNode.identifier) {
    throw new MlldError('Invalid section node', {
      node: sectionNode
    });
  }

  // Section identifier might be Text, VariableReference, array of nodes, or section-list
  const identifier = sectionNode.identifier;

  if (identifier.type === 'section-list') {
    throw new MlldError('Section list patterns (??) should be handled separately', {
      identifierType: identifier.type
    });
  }

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
 * List section headings from markdown content
 * @param content - Markdown content to extract headings from
 * @param level - Heading level to filter (0 = all levels, 1 = H1, 2 = H2, etc.)
 * @returns Array of heading titles (strings)
 */
function listSections(content: string, level?: number): string[] {
  const lines = content.split('\n');
  const headings: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const headingLevel = match[1].length;
      const title = match[2].trim();

      // Filter by level if specified (level 0 means all headings)
      if (level === undefined || level === 0 || headingLevel === level) {
        headings.push(title);
      }
    }
  }

  return headings;
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
      // Check for placeholder: either part.type === 'placeholder' or FileReference with source.type === 'placeholder'
      const isPlaceholder = part.type === 'placeholder' ||
        (part.type === 'FileReference' && part.source?.type === 'placeholder');

      if (isPlaceholder) {
        // Handle <> and <>.field references
        if (part.fields && part.fields.length > 0) {
          // Access fields on the result
          let value: any = result;
          for (const field of part.fields) {
            if (value && typeof value === 'object') {
              const fieldName = field.value;
              // Handle .mx accessor - use the mx getter on LoadContentResult
              if (fieldName === 'mx' && typeof value.mx === 'object') {
                value = value.mx;
              } else {
                value = value[fieldName];
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
  // Single LoadContentResult - wrap with JSON parsing
  if (isLoadContentResult(value)) {
    const structured = wrapLoadContentValue(value) as StructuredValue;
    const metadata = mergeMetadata(structured.metadata, options?.metadata);
    if (!metadata || metadata === structured.metadata) {
      return structured as any;
    }
    return wrapStructured(structured, structured.type, structured.text, metadata) as any;
  }

  // Array of LoadContentResult - wrap to ensure JSON parsing for each item
  if (Array.isArray(value) && value.length > 0 && isLoadContentResult(value[0])) {
    const structured = wrapLoadContentValue(value) as StructuredValue;
    const metadata = mergeMetadata(structured.metadata, options?.metadata);
    if (!metadata || metadata === structured.metadata) {
      return structured as any;
    }
    return wrapStructured(structured, structured.type, structured.text, metadata) as any;
  }

  if (isStructuredValue(value)) {
    const metadata = mergeMetadata(value.metadata, options?.metadata);
    if (!options?.type && !options?.text && (!metadata || metadata === value.metadata)) {
      return value;
    }
    return wrapStructured(value, options?.type, options?.text, metadata);
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
    if (Array.isArray(value)) {
      // Check if it's an array of LoadContentResult objects
      if (value.length > 0 && isLoadContentResult(value[0])) {
        // Concatenate file contents with \n\n separator
        return value.map(item => item.content ?? '').join('\n\n');
      }
      // For other arrays (like string arrays from renamed content)
      return value.map(item => String(item)).join('\n\n');
    }
    return String(value ?? '');
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
  const baseSecurity = base?.security;
  const extraSecurity = extra?.security;
  const mergedSecurity =
    baseSecurity && extraSecurity
      ? mergeDescriptors(baseSecurity, extraSecurity)
      : baseSecurity ?? extraSecurity;

  const merged = {
    source: 'load-content' as const,
    ...(base || {}),
    ...(extra || {})
  } as StructuredValueMetadata;

  if (mergedSecurity) {
    merged.security = mergedSecurity;
  }

  return merged;
}
