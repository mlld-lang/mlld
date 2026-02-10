import { Environment } from '@interpreter/env/Environment';
import { MlldError, MlldSecurityError } from '@core/errors';
import type { SourceLocation } from '@core/types';
import { llmxmlInstance } from '../utils/llmxml-instance';
import type { LoadContentResult } from '@core/types/load-content';
import { LoadContentResultImpl } from './load-content';
import { wrapLoadContentValue } from '../utils/load-content-structured';
import * as path from 'path';
import type { AstResult, AstPattern } from './ast-extractor';
import { processPipeline } from './pipeline/unified-processor';
import { wrapStructured, isStructuredValue, ensureStructuredValue, asText } from '../utils/structured-value';
import type { StructuredValue, StructuredValueType, StructuredValueMetadata } from '../utils/structured-value';
import { InterpolationContext } from '../core/interpolation-context';
import { mergeDescriptors } from '@core/types/security';
import { isLoadContentResult } from '@core/types/load-content';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { ContentSourceReconstruction } from './content-loader/source-reconstruction';
import { PolicyAwareReadHelper } from './content-loader/policy-aware-read';
import { AstPatternResolution } from './content-loader/ast-pattern-resolution';
import { AstVariantLoader } from './content-loader/ast-variant-loader';
import { HtmlConversionHelper } from './content-loader/html-conversion-helper';
import { ContentLoaderUrlHandler } from './content-loader/url-handler';
import { ContentLoaderSecurityMetadataHelper } from './content-loader/security-metadata';
import { ContentLoaderFileHandler } from './content-loader/single-file-loader';
import { ContentLoaderGlobHandler } from './content-loader/glob-loader';

const sourceReconstruction = new ContentSourceReconstruction();
const policyAwareReadHelper = new PolicyAwareReadHelper();
const astPatternResolution = new AstPatternResolution();
const htmlConversionHelper = new HtmlConversionHelper();
const securityMetadataHelper = new ContentLoaderSecurityMetadataHelper();

async function interpolateAndRecord(
  nodes: any,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  return sourceReconstruction.interpolateAndRecord(nodes, env, context);
}

async function readFileWithPolicy(
  pathOrUrl: string,
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<string> {
  return policyAwareReadHelper.read(pathOrUrl, env, sourceLocation);
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

const fileHandler = new ContentLoaderFileHandler({
  convertHtmlToMarkdown: (html, sourceUrl) => htmlConversionHelper.convertToMarkdown(html, sourceUrl),
  isSectionListPattern,
  getSectionListLevel,
  listSections,
  extractSectionName,
  extractSection,
  formatRelativePath
});

const globHandler = new ContentLoaderGlobHandler({
  readContent: (filePath, targetEnv, sourceLocation) => readFileWithPolicy(filePath, targetEnv, sourceLocation),
  convertHtmlToMarkdown: (html, sourceUrl) => htmlConversionHelper.convertToMarkdown(html, sourceUrl),
  isSectionListPattern,
  getSectionListLevel,
  listSections,
  extractSectionName,
  extractSection,
  getRelativeBasePath,
  formatRelativePath,
  buildFileSecurityDescriptor: (filePath, targetEnv, policyEnforcer) =>
    securityMetadataHelper.buildFileSecurityDescriptor(filePath, targetEnv, policyEnforcer),
  attachSecurity: (result, descriptor) => securityMetadataHelper.attachSecurity(result, descriptor)
});

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
    pathOrUrl = await sourceReconstruction.reconstructPath(actualSource, env);
  } else if (actualSource.type === 'url') {
    pathOrUrl = sourceReconstruction.reconstructUrl(actualSource);
  } else {
    throw new MlldError(`Unknown content loader source type: ${actualSource.type}`, {
      sourceType: actualSource.type,
      expected: ['path', 'url']
    });
  }

  // Check for nullable suffix (trailing ?) - makes glob return empty array instead of erroring
  // The ? suffix means "optional" - if no files match, return empty array rather than error
  // Must strip this before glob processing since ? is also a glob wildcard character
  const nullableSource = sourceReconstruction.stripNullableSuffix(pathOrUrl);
  pathOrUrl = nullableSource.pathOrUrl;

  // Detect glob pattern from the path (after stripping nullable suffix)
  const isGlob = isGlobPattern(pathOrUrl);

  // AST extraction takes precedence for local files
  if (ast && actualSource.type === 'path') {
    const astVariantLoader = new AstVariantLoader({
      readContent: async (candidatePath, candidateLocation) =>
        readFileWithPolicy(candidatePath, env, candidateLocation),
      formatRelativePath: (targetPath) => formatRelativePath(env, targetPath)
    });
    const astPatterns = await astPatternResolution.resolveVariables(ast as AstPattern[], env);
    const patternFamily = astPatternResolution.validateFamilies(astPatterns);

    // Handle name-list patterns: ??, fn??, var??, class??, etc.
    if (patternFamily.hasNameList) {
      const nameResults = await astVariantLoader.loadNameList({
        source: pathOrUrl,
        isGlob,
        sourceLocation,
        env,
        filter: astPatternResolution.getNameListFilter(astPatterns)
      });

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
    const astResults = await astVariantLoader.loadContent({
      source: pathOrUrl,
      isGlob,
      sourceLocation,
      env,
      patterns: astPatterns
    });

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
      const urlHandler = new ContentLoaderUrlHandler({
        convertHtmlToMarkdown: (html, url) => htmlConversionHelper.convertToMarkdown(html, url),
        isSectionListPattern,
        getSectionListLevel,
        listSections,
        extractSectionName,
        extractSection,
        runPipeline: async (value, pipelineEnv, pipelinePipes) => processPipeline({
          value,
          env: pipelineEnv,
          node: { pipes: pipelinePipes }
        })
      });
      const urlLoadResult = await urlHandler.load({
        pathOrUrl,
        options,
        pipes,
        hasPipes,
        env,
        policyEnforcer
      });

      if (urlLoadResult.kind === 'array') {
        return finalizeLoaderResult(urlLoadResult.value, {
          type: 'array',
          metadata: urlLoadResult.metadata
        });
      }

      if (urlLoadResult.kind === 'text') {
        return finalizeLoaderResult(urlLoadResult.value, {
          type: 'text',
          metadata: urlLoadResult.metadata
        });
      }

      return finalizeLoaderResult(urlLoadResult.value, {
        type: 'object',
        text: urlLoadResult.text,
        metadata: urlLoadResult.metadata
      });
    }
    
    // Handle glob patterns for file paths
    if (isGlob) {
      const results = await globHandler.load({
        pattern: pathOrUrl,
        options,
        env,
        sourceLocation
      });
      
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
    const fileSecurityDescriptor = await securityMetadataHelper.buildFileSecurityDescriptor(
      resolvedFilePath,
      env,
      policyEnforcer
    );
    const securityMetadata = securityMetadataHelper.toFinalizationMetadata(fileSecurityDescriptor);
    const result = await fileHandler.load({
      filePath: pathOrUrl,
      options,
      env,
      resolvedPathOverride: resolvedFilePath,
      sourceLocation
    });

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSectionByHeading(content: string, sectionName: string): string | null {
  const lines = content.split('\n');
  const normalizedName = sectionName.replace(/^#+\s*/, '').trim();
  const escapedName = escapeRegExp(normalizedName);
  const sectionRegex = new RegExp(`^#{1,6}\\s+${escapedName}\\s*$`, 'i');
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const lineForMatch = line.trimEnd();
    if (!inSection && sectionRegex.test(lineForMatch)) {
      inSection = true;
      sectionLevel = lineForMatch.match(/^#+/)?.[0].length || 0;
      sectionLines.push(lineForMatch);
      continue;
    }

    if (inSection) {
      const headerMatch = lineForMatch.match(/^(#{1,6})\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        break;
      }
      sectionLines.push(lineForMatch);
    }
  }

  if (!inSection) {
    return null;
  }

  return sectionLines.join('\n').trim();
}

/**
 * Extract a section from markdown content
 */
async function extractSection(content: string, sectionName: string, renamedTitle?: any, fileContext?: LoadContentResult, env?: Environment): Promise<string> {
  try {
    let extracted: string | null | undefined;
    try {
      extracted = await llmxmlInstance.getSection(content, sectionName, {
        includeNested: true
      });
    } catch (llmxmlError: any) {
      extracted = null;
    }

    if (!extracted) {
      extracted = extractSectionByHeading(content, sectionName);
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
