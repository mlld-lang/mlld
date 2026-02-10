import { Environment } from '@interpreter/env/Environment';
import { MlldError, MlldSecurityError } from '@core/errors';
import type { SourceLocation } from '@core/types';
import type { LoadContentResult } from '@core/types/load-content';
import { LoadContentResultImpl } from './load-content';
import * as path from 'path';
import type { AstResult, AstPattern } from './ast-extractor';
import { processPipeline } from './pipeline/unified-processor';
import { asText } from '../utils/structured-value';
import type { StructuredValue } from '../utils/structured-value';
import { InterpolationContext } from '../core/interpolation-context';
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
import { ContentLoaderSectionHelper } from './content-loader/section-utils';
import { ContentLoaderTransformHelper } from './content-loader/transform-utils';
import { ContentLoaderFinalizationAdapter } from './content-loader/finalization-adapter';

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

const sectionHelper = new ContentLoaderSectionHelper({
  interpolateAndRecord: (nodes, env) => interpolateAndRecord(nodes, env)
});
const transformHelper = new ContentLoaderTransformHelper({
  interpolateAndRecord: (nodes, env) => interpolateAndRecord(nodes, env)
});
const finalizationAdapter = new ContentLoaderFinalizationAdapter();

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
  isSectionListPattern: (sectionNode) => sectionHelper.isSectionListPattern(sectionNode),
  getSectionListLevel: (sectionNode) => sectionHelper.getSectionListLevel(sectionNode),
  listSections: (content, level) => sectionHelper.listSections(content, level),
  extractSectionName: (sectionNode, env) => sectionHelper.extractSectionName(sectionNode, env),
  extractSection: (content, sectionName, renamedTitle, fileContext, env) =>
    sectionHelper.extractSection(content, sectionName, renamedTitle, fileContext, env),
  formatRelativePath
});

const globHandler = new ContentLoaderGlobHandler({
  readContent: (filePath, targetEnv, sourceLocation) => readFileWithPolicy(filePath, targetEnv, sourceLocation),
  convertHtmlToMarkdown: (html, sourceUrl) => htmlConversionHelper.convertToMarkdown(html, sourceUrl),
  isSectionListPattern: (sectionNode) => sectionHelper.isSectionListPattern(sectionNode),
  getSectionListLevel: (sectionNode) => sectionHelper.getSectionListLevel(sectionNode),
  listSections: (content, level) => sectionHelper.listSections(content, level),
  extractSectionName: (sectionNode, env) => sectionHelper.extractSectionName(sectionNode, env),
  extractSection: (content, sectionName, renamedTitle, fileContext, env) =>
    sectionHelper.extractSection(content, sectionName, renamedTitle, fileContext, env),
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
        return finalizationAdapter.finalizeLoaderResult(piped, { type: 'array' });
      }

      return finalizationAdapter.finalizeLoaderResult(nameResults, { type: 'array' });
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
      const transformed = await transformHelper.applyTemplateToAstResults(astResults, options.transform, env);
      return finalizationAdapter.finalizeLoaderResult(isGlob ? transformed : transformed[0] ?? '', { type: 'text' });
    }

    if (hasPipes) {
      const piped = await processPipeline({
        value: astResults,
        env,
        node: { pipes }
      });
      return finalizationAdapter.finalizeLoaderResult(piped, Array.isArray(astResults) ? { type: 'array' } : undefined);
    }

    return finalizationAdapter.finalizeLoaderResult(astResults, { type: 'array' });
  }

  try {
    // URLs can't be globs
    if (env.isURL(pathOrUrl)) {
      const urlHandler = new ContentLoaderUrlHandler({
        convertHtmlToMarkdown: (html, url) => htmlConversionHelper.convertToMarkdown(html, url),
        isSectionListPattern: (sectionNode) => sectionHelper.isSectionListPattern(sectionNode),
        getSectionListLevel: (sectionNode) => sectionHelper.getSectionListLevel(sectionNode),
        listSections: (content, level) => sectionHelper.listSections(content, level),
        extractSectionName: (sectionNode, targetEnv) => sectionHelper.extractSectionName(sectionNode, targetEnv),
        extractSection: (content, sectionName, renamedTitle, fileContext, targetEnv) =>
          sectionHelper.extractSection(content, sectionName, renamedTitle, fileContext, targetEnv),
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
        return finalizationAdapter.finalizeLoaderResult(urlLoadResult.value, {
          type: 'array',
          metadata: urlLoadResult.metadata
        });
      }

      if (urlLoadResult.kind === 'text') {
        return finalizationAdapter.finalizeLoaderResult(urlLoadResult.value, {
          type: 'text',
          metadata: urlLoadResult.metadata
        });
      }

      return finalizationAdapter.finalizeLoaderResult(urlLoadResult.value, {
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
        const transformedResults = await transformHelper.applyTransformToResults(results, options.transform, env);
        return finalizationAdapter.finalizeLoaderResult(transformedResults, { type: 'array' });
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
        return finalizationAdapter.finalizeLoaderResult(pipedResults, { type: 'array' });
      }

      return finalizationAdapter.finalizeLoaderResult(results, { type: 'array' });
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
        return finalizationAdapter.finalizeLoaderResult(piped, { type: 'array', metadata: securityMetadata });
      }
      return finalizationAdapter.finalizeLoaderResult(result, { type: 'array', metadata: securityMetadata });
    }

    // Apply transform if specified (for single file)
    if (hasTransform && options.transform) {
      const transformed = await transformHelper.applyTransformToResults([result], options.transform, env);
      return finalizationAdapter.finalizeLoaderResult(transformed[0], {
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
        return finalizationAdapter.finalizeLoaderResult(pipedString, { type: 'text', metadata: securityMetadata });
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
        return finalizationAdapter.finalizeLoaderResult(pipedResult, {
          type: 'object',
          text: asText(pipedContent),
          metadata: securityMetadata
        });
      }
    }

    // Always return the full LoadContentResult object
    // The smart object will handle string conversion when needed
    return finalizationAdapter.finalizeLoaderResult(result, {
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
        return finalizationAdapter.finalizeLoaderResult([], { type: 'array' });
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
