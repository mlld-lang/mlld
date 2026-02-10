import type { SourceLocation } from '@core/types';
import type { LoadContentResult } from '@core/types/load-content';
import type { Environment } from '@interpreter/env/Environment';
import { enforceFilesystemAccess } from '@interpreter/policy/filesystem-policy';
import * as path from 'path';
import { LoadContentResultImpl, LoadContentResultHTMLImpl } from '../load-content';
import { extractHtmlMetadata } from './html-metadata';

export interface SingleFileLoaderDependencies {
  convertHtmlToMarkdown: (html: string, sourceUrl: string) => Promise<string>;
  isSectionListPattern: (sectionNode: any) => boolean;
  getSectionListLevel: (sectionNode: any) => number;
  listSections: (content: string, level?: number) => string[];
  extractSectionName: (sectionNode: any, env: Environment) => Promise<string>;
  extractSection: (
    content: string,
    sectionName: string,
    renamedTitle?: any,
    fileContext?: LoadContentResult,
    env?: Environment
  ) => Promise<string>;
  formatRelativePath: (env: Environment, targetPath: string) => string;
}

export interface SingleFileLoaderInput {
  filePath: string;
  options: any;
  env: Environment;
  sourceLocation?: SourceLocation;
  resolvedPathOverride?: string;
}

export class ContentLoaderFileHandler {
  constructor(private readonly dependencies: SingleFileLoaderDependencies) {}

  async load(input: SingleFileLoaderInput): Promise<LoadContentResult | string | string[]> {
    const resolvedPath = input.resolvedPathOverride ?? (await input.env.resolvePath(input.filePath));
    enforceFilesystemAccess(input.env, 'read', resolvedPath, input.sourceLocation);
    const rawContent = await input.env.readFile(resolvedPath);

    if (resolvedPath.endsWith('.html') || resolvedPath.endsWith('.htm')) {
      return this.loadHtmlFile(rawContent, resolvedPath, input.options, input.env);
    }

    return this.loadTextFile(rawContent, resolvedPath, input.options, input.env);
  }

  private async loadHtmlFile(
    rawContent: string,
    resolvedPath: string,
    options: any,
    env: Environment
  ): Promise<LoadContentResult | string | string[]> {
    const markdownContent = await this.dependencies.convertHtmlToMarkdown(rawContent, `file://${resolvedPath}`);

    if (options?.section) {
      if (this.dependencies.isSectionListPattern(options.section)) {
        const level = this.dependencies.getSectionListLevel(options.section);
        return this.dependencies.listSections(markdownContent, level);
      }

      const sectionName = await this.dependencies.extractSectionName(options.section, env);
      const fileContext = this.createFileContext(rawContent, resolvedPath, env);
      const sectionContent = await this.dependencies.extractSection(
        markdownContent,
        sectionName,
        options.section.renamed,
        fileContext,
        env
      );
      const metadata = extractHtmlMetadata(rawContent);
      return new LoadContentResultHTMLImpl({
        content: sectionContent,
        rawHtml: rawContent,
        filename: path.basename(resolvedPath),
        relative: this.dependencies.formatRelativePath(env, resolvedPath),
        absolute: resolvedPath,
        title: metadata.title,
        description: metadata.description
      });
    }

    const metadata = extractHtmlMetadata(rawContent);
    return new LoadContentResultHTMLImpl({
      content: markdownContent,
      rawHtml: rawContent,
      filename: path.basename(resolvedPath),
      relative: this.dependencies.formatRelativePath(env, resolvedPath),
      absolute: resolvedPath,
      title: metadata.title,
      description: metadata.description
    });
  }

  private async loadTextFile(
    rawContent: string,
    resolvedPath: string,
    options: any,
    env: Environment
  ): Promise<LoadContentResult | string | string[]> {
    if (options?.section) {
      if (this.dependencies.isSectionListPattern(options.section)) {
        const level = this.dependencies.getSectionListLevel(options.section);
        return this.dependencies.listSections(rawContent, level);
      }

      const sectionName = await this.dependencies.extractSectionName(options.section, env);
      const fileContext = this.createFileContext(rawContent, resolvedPath, env);
      const sectionContent = await this.dependencies.extractSection(
        rawContent,
        sectionName,
        options.section.renamed,
        fileContext,
        env
      );
      return new LoadContentResultImpl({
        content: sectionContent,
        filename: path.basename(resolvedPath),
        relative: this.dependencies.formatRelativePath(env, resolvedPath),
        absolute: resolvedPath,
        _rawContent: rawContent
      });
    }

    return new LoadContentResultImpl({
      content: rawContent,
      filename: path.basename(resolvedPath),
      relative: this.dependencies.formatRelativePath(env, resolvedPath),
      absolute: resolvedPath
    });
  }

  private createFileContext(rawContent: string, resolvedPath: string, env: Environment): LoadContentResultImpl {
    return new LoadContentResultImpl({
      content: rawContent,
      filename: path.basename(resolvedPath),
      relative: this.dependencies.formatRelativePath(env, resolvedPath),
      absolute: resolvedPath
    });
  }
}
