import { Environment } from '@interpreter/env/Environment';
import type { SourceLocation } from '@core/types';
import { InterpolationContext } from '../core/interpolation-context';
import { processPipeline } from './pipeline/unified-processor';
import { ContentSourceReconstruction } from './content-loader/source-reconstruction';
import { PolicyAwareReadHelper } from './content-loader/policy-aware-read';
import { AstPatternResolution } from './content-loader/ast-pattern-resolution';
import { HtmlConversionHelper } from './content-loader/html-conversion-helper';
import { ContentLoaderUrlHandler } from './content-loader/url-handler';
import { ContentLoaderSecurityMetadataHelper } from './content-loader/security-metadata';
import { ContentLoaderFileHandler } from './content-loader/single-file-loader';
import { ContentLoaderGlobHandler } from './content-loader/glob-loader';
import { ContentLoaderSectionHelper } from './content-loader/section-utils';
import { ContentLoaderTransformHelper } from './content-loader/transform-utils';
import { ContentLoaderFinalizationAdapter } from './content-loader/finalization-adapter';
import {
  ContentLoaderOrchestrator,
  type ContentLoaderProcessResult
} from './content-loader/orchestrator';
import * as path from 'path';

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

function getRelativeBasePath(env: Environment): string {
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

const orchestrator = new ContentLoaderOrchestrator({
  sourceReconstruction,
  astPatternResolution,
  securityMetadataHelper,
  fileHandler,
  globHandler,
  transformHelper,
  finalizationAdapter,
  createUrlHandler: () =>
    new ContentLoaderUrlHandler({
      convertHtmlToMarkdown: (html, url) => htmlConversionHelper.convertToMarkdown(html, url),
      isSectionListPattern: (sectionNode) => sectionHelper.isSectionListPattern(sectionNode),
      getSectionListLevel: (sectionNode) => sectionHelper.getSectionListLevel(sectionNode),
      listSections: (content, level) => sectionHelper.listSections(content, level),
      extractSectionName: (sectionNode, targetEnv) => sectionHelper.extractSectionName(sectionNode, targetEnv),
      extractSection: (content, sectionName, renamedTitle, fileContext, targetEnv) =>
        sectionHelper.extractSection(content, sectionName, renamedTitle, fileContext, targetEnv),
      runPipeline: async (value, pipelineEnv, pipelinePipes) =>
        processPipeline({
          value,
          env: pipelineEnv,
          node: { pipes: pipelinePipes }
        })
    }),
  readFileWithPolicy,
  formatRelativePath
});

/**
 * Process content loading expressions (<file.md> syntax)
 * Loads content from files or URLs and optionally extracts sections.
 */
export async function processContentLoader(node: any, env: Environment): Promise<ContentLoaderProcessResult> {
  return orchestrator.process(node, env);
}
