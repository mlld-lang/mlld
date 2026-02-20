import type { LoadContentResult } from '@core/types/load-content';
import { makeSecurityDescriptor } from '@core/types/security';
import { LoadContentResultURLImpl } from '../load-content';
import type { StructuredValueMetadata } from '../../utils/structured-value';
import { asText } from '../../utils/structured-value';
import type { Environment } from '@interpreter/env/Environment';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';

export interface UrlHandlerDependencies {
  convertHtmlToMarkdown: (html: string, url: string) => Promise<string>;
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
  runPipeline: (value: unknown, env: Environment, pipes: any[]) => Promise<unknown>;
}

export interface UrlHandlerInput {
  pathOrUrl: string;
  options: any;
  pipes?: any[];
  hasPipes: boolean;
  env: Environment;
  policyEnforcer: PolicyEnforcer;
}

export type UrlHandlerOutput =
  | { kind: 'array'; value: unknown; metadata: StructuredValueMetadata }
  | { kind: 'text'; value: unknown; metadata: StructuredValueMetadata }
  | { kind: 'object'; value: LoadContentResultURLImpl; metadata: StructuredValueMetadata; text: string };

export class ContentLoaderUrlHandler {
  constructor(private readonly dependencies: UrlHandlerDependencies) {}

  async load(input: UrlHandlerInput): Promise<UrlHandlerOutput> {
    const urlDescriptor = makeSecurityDescriptor({
      taint: ['src:network'],
      sources: [input.pathOrUrl]
    });
    const urlMetadata: StructuredValueMetadata = {
      url: input.pathOrUrl,
      security: input.policyEnforcer.applyDefaultTrustLabel(urlDescriptor) ?? urlDescriptor
    };
    const response = await input.env.fetchURLWithMetadata(input.pathOrUrl);

    let processedContent = response.content;
    const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
    if (contentType.includes('text/html')) {
      processedContent = await this.dependencies.convertHtmlToMarkdown(response.content, input.pathOrUrl);
    }

    if (input.options?.section) {
      if (this.dependencies.isSectionListPattern(input.options.section)) {
        const level = this.dependencies.getSectionListLevel(input.options.section);
        const sections = this.dependencies.listSections(processedContent, level);
        if (input.hasPipes && input.pipes) {
          const pipedSections = await this.dependencies.runPipeline(sections, input.env, input.pipes);
          return { kind: 'array', value: pipedSections, metadata: urlMetadata };
        }
        return { kind: 'array', value: sections, metadata: urlMetadata };
      }

      const sectionName = await this.dependencies.extractSectionName(input.options.section, input.env);
      // URLs do not have frontmatter, so there is no file context for rename interpolation.
      const sectionContent = await this.dependencies.extractSection(
        processedContent,
        sectionName,
        input.options.section.renamed,
        undefined,
        input.env
      );
      if (input.hasPipes && input.pipes) {
        const pipedSection = await this.dependencies.runPipeline(sectionContent, input.env, input.pipes);
        return { kind: 'text', value: pipedSection, metadata: urlMetadata };
      }
      return { kind: 'text', value: sectionContent, metadata: urlMetadata };
    }

    const urlResult = new LoadContentResultURLImpl({
      content: processedContent,
      rawContent: response.content,
      url: input.pathOrUrl,
      headers: response.headers,
      status: response.status
    });

    if (input.hasPipes && input.pipes) {
      const pipedContent = await this.dependencies.runPipeline(urlResult.content, input.env, input.pipes);
      const pipedResult = new LoadContentResultURLImpl({
        content: pipedContent,
        rawContent: response.content,
        url: input.pathOrUrl,
        headers: response.headers,
        status: response.status
      });
      return {
        kind: 'object',
        value: pipedResult,
        metadata: urlMetadata,
        text: asText(pipedContent)
      };
    }

    return {
      kind: 'object',
      value: urlResult,
      metadata: urlMetadata,
      text: urlResult.content
    };
  }
}
