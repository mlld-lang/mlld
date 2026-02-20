import { MlldError, MlldSecurityError } from '@core/errors';
import type { SourceLocation } from '@core/types';
import type { LoadContentResult } from '@core/types/load-content';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import { asText } from '@interpreter/utils/structured-value';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import type { Environment } from '@interpreter/env/Environment';
import { processPipeline } from '../pipeline/unified-processor';
import { LoadContentResultImpl } from '../load-content';
import type { AstResult, AstPattern } from '../ast-extractor';
import { AstVariantLoader } from './ast-variant-loader';
import type { ContentSourceReconstruction } from './source-reconstruction';
import type { AstPatternResolution } from './ast-pattern-resolution';
import type { ContentLoaderSecurityMetadataHelper } from './security-metadata';
import type { ContentLoaderFileHandler } from './single-file-loader';
import type { ContentLoaderGlobHandler } from './glob-loader';
import type { ContentLoaderTransformHelper } from './transform-utils';
import type { ContentLoaderFinalizationAdapter } from './finalization-adapter';
import type { ContentLoaderUrlHandler } from './url-handler';

export type ContentLoaderProcessResult =
  | string
  | LoadContentResult
  | LoadContentResult[]
  | Array<AstResult | null>
  | string[]
  | StructuredValue;

export interface ContentLoaderOrchestratorDependencies {
  sourceReconstruction: ContentSourceReconstruction;
  astPatternResolution: AstPatternResolution;
  securityMetadataHelper: ContentLoaderSecurityMetadataHelper;
  fileHandler: ContentLoaderFileHandler;
  globHandler: ContentLoaderGlobHandler;
  transformHelper: ContentLoaderTransformHelper;
  finalizationAdapter: ContentLoaderFinalizationAdapter;
  createUrlHandler: () => ContentLoaderUrlHandler;
  readFileWithPolicy: (pathOrUrl: string, env: Environment, sourceLocation?: SourceLocation) => Promise<string>;
  formatRelativePath: (env: Environment, targetPath: string) => string;
}

export class ContentLoaderOrchestrator {
  constructor(private readonly dependencies: ContentLoaderOrchestratorDependencies) {}

  async process(node: any, env: Environment): Promise<ContentLoaderProcessResult> {
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

    const hasTransform = options?.transform?.type === 'template';
    const hasPipes = pipes && pipes.length > 0;

    let pathOrUrl: string;
    const actualSource = this.normalizeSource(source);

    if (actualSource.type === 'path') {
      pathOrUrl = await this.dependencies.sourceReconstruction.reconstructPath(actualSource, env);
    } else if (actualSource.type === 'url') {
      pathOrUrl = this.dependencies.sourceReconstruction.reconstructUrl(actualSource);
    } else {
      throw new MlldError(`Unknown content loader source type: ${actualSource.type}`, {
        sourceType: actualSource.type,
        expected: ['path', 'url']
      });
    }

    const nullableSource = this.dependencies.sourceReconstruction.stripNullableSuffix(pathOrUrl);
    pathOrUrl = nullableSource.pathOrUrl;
    const isGlob = this.isGlobPattern(pathOrUrl);

    if (ast && actualSource.type === 'path') {
      return this.processAstBranch({
        pathOrUrl,
        isGlob,
        ast,
        sourceLocation,
        env,
        hasPipes,
        pipes,
        hasTransform,
        options
      });
    }

    try {
      if (env.isURL(pathOrUrl)) {
        const urlHandler = this.dependencies.createUrlHandler();
        const urlLoadResult = await urlHandler.load({
          pathOrUrl,
          options,
          pipes,
          hasPipes,
          env,
          policyEnforcer
        });

        if (urlLoadResult.kind === 'array') {
          return this.dependencies.finalizationAdapter.finalizeLoaderResult(urlLoadResult.value, {
            type: 'array',
            metadata: urlLoadResult.metadata
          });
        }

        if (urlLoadResult.kind === 'text') {
          return this.dependencies.finalizationAdapter.finalizeLoaderResult(urlLoadResult.value, {
            type: 'text',
            metadata: urlLoadResult.metadata
          });
        }

        return this.dependencies.finalizationAdapter.finalizeLoaderResult(urlLoadResult.value, {
          type: 'object',
          text: urlLoadResult.text,
          metadata: urlLoadResult.metadata
        });
      }

      if (isGlob) {
        return await this.processGlobBranch({
          pathOrUrl,
          options,
          env,
          sourceLocation,
          hasTransform,
          hasPipes,
          pipes
        });
      }

      return await this.processSingleFileBranch({
        pathOrUrl,
        options,
        env,
        sourceLocation,
        hasTransform,
        hasPipes,
        pipes,
        policyEnforcer
      });
    } catch (error: any) {
      if (error instanceof MlldSecurityError) {
        throw error;
      }

      if (error.message && error.message.includes('Unknown transform:')) {
        throw error;
      }

      if (error.message && error.message.includes('Access denied:')) {
        throw new MlldError(error.message, {
          path: pathOrUrl,
          error: error.message
        });
      }

      if (isOptional) {
        if (isGlob) {
          return this.dependencies.finalizationAdapter.finalizeLoaderResult([], { type: 'array' });
        }
        return null as any;
      }

      if (typeof error?.message === 'string' && error.message.startsWith('File not found:')) {
        throw new MlldError(error.message, {
          path: pathOrUrl,
          error: error.message
        });
      }

      let errorMessage = `Failed to load content: ${pathOrUrl}`;
      const isJsonParseError = error instanceof MlldError
        && (error.code === 'JSON_PARSE_ERROR' || error.code === 'JSONL_PARSE_ERROR');
      if (isJsonParseError && typeof error.message === 'string' && error.message.length > 0) {
        errorMessage += `\n\n${error.message}`;
      }
      const hasAngleBracket = pathOrUrl.includes('<') || pathOrUrl.includes('>');
      if (!hasAngleBracket && !pathOrUrl.startsWith('/') && !pathOrUrl.startsWith('@') && !env.isURL(pathOrUrl)) {
        errorMessage += '\n\nHint: Paths are relative to mlld files. You can make them relative to your project root with the `@base/` prefix';
      }

      throw new MlldError(errorMessage, {
        path: pathOrUrl,
        error: error.message
      });
    }
  }

  private async processAstBranch(context: {
    pathOrUrl: string;
    isGlob: boolean;
    ast: AstPattern[];
    sourceLocation?: SourceLocation;
    env: Environment;
    hasPipes: boolean;
    pipes: any[];
    hasTransform: boolean;
    options: any;
  }): Promise<ContentLoaderProcessResult> {
    const astVariantLoader = new AstVariantLoader({
      readContent: async (candidatePath, candidateLocation) =>
        this.dependencies.readFileWithPolicy(candidatePath, context.env, candidateLocation),
      formatRelativePath: (targetPath) => this.dependencies.formatRelativePath(context.env, targetPath)
    });

    const astPatterns = await this.dependencies.astPatternResolution.resolveVariables(context.ast, context.env);
    const patternFamily = this.dependencies.astPatternResolution.validateFamilies(astPatterns);

    if (patternFamily.hasNameList) {
      const nameResults = await astVariantLoader.loadNameList({
        source: context.pathOrUrl,
        isGlob: context.isGlob,
        sourceLocation: context.sourceLocation,
        env: context.env,
        filter: this.dependencies.astPatternResolution.getNameListFilter(astPatterns)
      });

      if (context.hasPipes) {
        const piped = await processPipeline({
          value: nameResults,
          env: context.env,
          node: { pipes: context.pipes }
        });
        return this.dependencies.finalizationAdapter.finalizeLoaderResult(piped, { type: 'array' });
      }

      return this.dependencies.finalizationAdapter.finalizeLoaderResult(nameResults, { type: 'array' });
    }

    const astResults = await astVariantLoader.loadContent({
      source: context.pathOrUrl,
      isGlob: context.isGlob,
      sourceLocation: context.sourceLocation,
      env: context.env,
      patterns: astPatterns
    });

    if (context.hasTransform && context.options?.transform) {
      const transformed = await this.dependencies.transformHelper.applyTemplateToAstResults(
        astResults,
        context.options.transform,
        context.env
      );
      return this.dependencies.finalizationAdapter.finalizeLoaderResult(
        context.isGlob ? transformed : transformed[0] ?? '',
        { type: 'text' }
      );
    }

    if (context.hasPipes) {
      const piped = await processPipeline({
        value: astResults,
        env: context.env,
        node: { pipes: context.pipes }
      });
      return this.dependencies.finalizationAdapter.finalizeLoaderResult(
        piped,
        Array.isArray(astResults) ? { type: 'array' } : undefined
      );
    }

    return this.dependencies.finalizationAdapter.finalizeLoaderResult(astResults, { type: 'array' });
  }

  private async processGlobBranch(context: {
    pathOrUrl: string;
    options: any;
    env: Environment;
    sourceLocation?: SourceLocation;
    hasTransform: boolean;
    hasPipes: boolean;
    pipes: any[];
  }): Promise<ContentLoaderProcessResult> {
    const results = await this.dependencies.globHandler.load({
      pattern: context.pathOrUrl,
      options: context.options,
      env: context.env,
      sourceLocation: context.sourceLocation
    });

    if (context.hasTransform && context.options.transform) {
      const transformedResults = await this.dependencies.transformHelper.applyTransformToResults(
        results,
        context.options.transform,
        context.env
      );
      return this.dependencies.finalizationAdapter.finalizeLoaderResult(transformedResults, { type: 'array' });
    }

    if (context.hasPipes) {
      const pipedResults = await Promise.all(
        results.map(async (result) => {
          const pipedContent = await processPipeline({
            value: typeof result === 'string' ? result : result.content,
            env: context.env,
            node: { pipes: context.pipes }
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
      return this.dependencies.finalizationAdapter.finalizeLoaderResult(pipedResults, { type: 'array' });
    }

    return this.dependencies.finalizationAdapter.finalizeLoaderResult(results, { type: 'array' });
  }

  private async processSingleFileBranch(context: {
    pathOrUrl: string;
    options: any;
    env: Environment;
    sourceLocation?: SourceLocation;
    hasTransform: boolean;
    hasPipes: boolean;
    pipes: any[];
    policyEnforcer: PolicyEnforcer;
  }): Promise<ContentLoaderProcessResult> {
    const resolvedFilePath = await context.env.resolvePath(context.pathOrUrl);
    const fileSecurityDescriptor = await this.dependencies.securityMetadataHelper.buildFileSecurityDescriptor(
      resolvedFilePath,
      context.env,
      context.policyEnforcer
    );
    const securityMetadata = this.dependencies.securityMetadataHelper.toFinalizationMetadata(fileSecurityDescriptor);

    const result = await this.dependencies.fileHandler.load({
      filePath: context.pathOrUrl,
      options: context.options,
      env: context.env,
      resolvedPathOverride: resolvedFilePath,
      sourceLocation: context.sourceLocation
    });

    if (Array.isArray(result)) {
      if (context.hasPipes) {
        const piped = await processPipeline({
          value: result,
          env: context.env,
          node: { pipes: context.pipes }
        });
        return this.dependencies.finalizationAdapter.finalizeLoaderResult(piped, {
          type: 'array',
          metadata: securityMetadata
        });
      }
      return this.dependencies.finalizationAdapter.finalizeLoaderResult(result, {
        type: 'array',
        metadata: securityMetadata
      });
    }

    if (context.hasTransform && context.options.transform) {
      const transformed = await this.dependencies.transformHelper.applyTransformToResults(
        [result],
        context.options.transform,
        context.env
      );
      return this.dependencies.finalizationAdapter.finalizeLoaderResult(transformed[0], {
        type: typeof transformed[0] === 'string' ? 'text' : 'object',
        metadata: securityMetadata
      });
    }

    if (context.hasPipes) {
      if (typeof result === 'string') {
        const pipedString = await processPipeline({
          value: result,
          env: context.env,
          node: { pipes: context.pipes }
        });
        return this.dependencies.finalizationAdapter.finalizeLoaderResult(pipedString, {
          type: 'text',
          metadata: securityMetadata
        });
      }

      const pipedContent = await processPipeline({
        value: result.content,
        env: context.env,
        node: { pipes: context.pipes }
      });
      const pipedResult = new LoadContentResultImpl({
        content: pipedContent,
        filename: result.filename,
        relative: result.relative,
        absolute: result.absolute,
        _rawContent: result._rawContent
      });
      return this.dependencies.finalizationAdapter.finalizeLoaderResult(pipedResult, {
        type: 'object',
        text: asText(pipedContent),
        metadata: securityMetadata
      });
    }

    return this.dependencies.finalizationAdapter.finalizeLoaderResult(result, {
      type: typeof result === 'string' ? 'text' : 'object',
      text: typeof result === 'string' ? result : result.content,
      metadata: securityMetadata
    });
  }

  private normalizeSource(source: any): any {
    if (source?.type === 'path' || source?.type === 'url') {
      return source;
    }

    if (source?.segments && source?.raw !== undefined) {
      return {
        ...source,
        type: 'path'
      };
    }

    return source;
  }

  private isGlobPattern(input: string): boolean {
    return /[\*\?\{\}\[\]]/.test(input);
  }
}
