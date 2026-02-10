import type { SourceLocation } from '@core/types';
import { MlldSecurityError } from '@core/errors';
import type { LoadContentResult } from '@core/types/load-content';
import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { glob } from 'tinyglobby';
import * as path from 'path';
import { JSDOM } from 'jsdom';
import { LoadContentResultImpl, LoadContentResultHTMLImpl } from '../load-content';

export interface GlobLoaderDependencies {
  readContent: (filePath: string, env: Environment, sourceLocation?: SourceLocation) => Promise<string>;
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
  getRelativeBasePath: (env: Environment) => string;
  formatRelativePath: (env: Environment, targetPath: string) => string;
  buildFileSecurityDescriptor: (
    filePath: string,
    env: Environment,
    policyEnforcer: PolicyEnforcer
  ) => Promise<SecurityDescriptor>;
  attachSecurity: <T extends LoadContentResult>(result: T, descriptor: SecurityDescriptor) => T;
}

export interface GlobLoaderInput {
  pattern: string;
  options: any;
  env: Environment;
  sourceLocation?: SourceLocation;
}

interface HtmlMetadata {
  title?: string;
  description?: string;
}

interface ResolvedPattern {
  globCwd: string;
  globPattern: string;
}

const DEFAULT_GLOB_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'];

export class ContentLoaderGlobHandler {
  constructor(private readonly dependencies: GlobLoaderDependencies) {}

  async load(input: GlobLoaderInput): Promise<LoadContentResult[] | string[]> {
    const { globCwd, globPattern } = this.resolvePattern(input.pattern, input.env);
    const policyEnforcer = new PolicyEnforcer(input.env.getPolicySummary());

    let matches = await glob(globPattern, {
      cwd: globCwd,
      absolute: true,
      followSymlinks: true,
      ignore: DEFAULT_GLOB_IGNORE
    });
    matches.sort();

    const results: Array<LoadContentResult | string> = [];
    for (const filePath of matches) {
      try {
        const rawContent = await this.dependencies.readContent(filePath, input.env, input.sourceLocation);
        const fileSecurityDescriptor = await this.dependencies.buildFileSecurityDescriptor(filePath, input.env, policyEnforcer);
        const relativePath = this.dependencies.formatRelativePath(input.env, filePath);

        if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
          await this.collectHtmlFileResult({
            filePath,
            rawContent,
            relativePath,
            options: input.options,
            env: input.env,
            descriptor: fileSecurityDescriptor,
            results
          });
          continue;
        }

        await this.collectTextFileResult({
          filePath,
          rawContent,
          relativePath,
          options: input.options,
          env: input.env,
          descriptor: fileSecurityDescriptor,
          results
        });
      } catch (error: any) {
        if (error instanceof MlldSecurityError) {
          throw error;
        }
      }
    }

    return results as LoadContentResult[] | string[];
  }

  private resolvePattern(pattern: string, env: Environment): ResolvedPattern {
    const relativeBase = this.dependencies.getRelativeBasePath(env);
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

    return { globCwd, globPattern };
  }

  private async collectHtmlFileResult(args: {
    filePath: string;
    rawContent: string;
    relativePath: string;
    options: any;
    env: Environment;
    descriptor: SecurityDescriptor;
    results: Array<LoadContentResult | string>;
  }): Promise<void> {
    const markdownContent = await this.dependencies.convertHtmlToMarkdown(args.rawContent, `file://${args.filePath}`);

    if (args.options?.section) {
      if (this.dependencies.isSectionListPattern(args.options.section)) {
        const level = this.dependencies.getSectionListLevel(args.options.section);
        const sections = this.dependencies.listSections(markdownContent, level);
        if (sections.length > 0) {
          args.results.push({
            names: sections,
            file: path.basename(args.filePath),
            relative: args.relativePath,
            absolute: args.filePath
          } as any);
        }
        return;
      }

      const sectionName = await this.dependencies.extractSectionName(args.options.section, args.env);
      try {
        const fileContext = this.createFileContext(args.rawContent, args.filePath, args.relativePath);
        const sectionContent = await this.dependencies.extractSection(
          markdownContent,
          sectionName,
          args.options.section.renamed,
          fileContext,
          args.env
        );
        if (args.options.section.renamed) {
          args.results.push(sectionContent);
          return;
        }

        const metadata = this.extractHtmlMetadata(args.rawContent);
        const result = new LoadContentResultHTMLImpl({
          content: sectionContent,
          rawHtml: args.rawContent,
          filename: path.basename(args.filePath),
          relative: args.relativePath,
          absolute: args.filePath,
          title: metadata.title,
          description: metadata.description
        });
        args.results.push(this.dependencies.attachSecurity(result, args.descriptor));
      } catch {
        // Skip files that do not contain the requested section.
      }
      return;
    }

    const metadata = this.extractHtmlMetadata(args.rawContent);
    const result = new LoadContentResultHTMLImpl({
      content: markdownContent,
      rawHtml: args.rawContent,
      filename: path.basename(args.filePath),
      relative: args.relativePath,
      absolute: args.filePath,
      title: metadata.title,
      description: metadata.description
    });
    args.results.push(this.dependencies.attachSecurity(result, args.descriptor));
  }

  private async collectTextFileResult(args: {
    filePath: string;
    rawContent: string;
    relativePath: string;
    options: any;
    env: Environment;
    descriptor: SecurityDescriptor;
    results: Array<LoadContentResult | string>;
  }): Promise<void> {
    if (args.options?.section) {
      if (this.dependencies.isSectionListPattern(args.options.section)) {
        const level = this.dependencies.getSectionListLevel(args.options.section);
        const sections = this.dependencies.listSections(args.rawContent, level);
        if (sections.length > 0) {
          args.results.push({
            names: sections,
            file: path.basename(args.filePath),
            relative: args.relativePath,
            absolute: args.filePath
          } as any);
        }
        return;
      }

      const sectionName = await this.dependencies.extractSectionName(args.options.section, args.env);
      try {
        const fileContext = this.createFileContext(args.rawContent, args.filePath, args.relativePath);
        const sectionContent = await this.dependencies.extractSection(
          args.rawContent,
          sectionName,
          args.options.section.renamed,
          fileContext,
          args.env
        );
        if (args.options.section.renamed) {
          args.results.push(sectionContent);
          return;
        }

        const result = new LoadContentResultImpl({
          content: sectionContent,
          filename: path.basename(args.filePath),
          relative: args.relativePath,
          absolute: args.filePath,
          _rawContent: args.rawContent
        });
        args.results.push(this.dependencies.attachSecurity(result, args.descriptor));
      } catch {
        // Skip files that do not contain the requested section.
      }
      return;
    }

    const result = new LoadContentResultImpl({
      content: args.rawContent,
      filename: path.basename(args.filePath),
      relative: args.relativePath,
      absolute: args.filePath
    });
    args.results.push(this.dependencies.attachSecurity(result, args.descriptor));
  }

  private createFileContext(rawContent: string, absolutePath: string, relativePath: string): LoadContentResultImpl {
    return new LoadContentResultImpl({
      content: rawContent,
      filename: path.basename(absolutePath),
      relative: relativePath,
      absolute: absolutePath
    });
  }

  private extractHtmlMetadata(rawContent: string): HtmlMetadata {
    const dom = new JSDOM(rawContent);
    const doc = dom.window.document;
    const title = doc.querySelector('title')?.textContent || '';
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    return {
      title: title || undefined,
      description: description || undefined
    };
  }
}
