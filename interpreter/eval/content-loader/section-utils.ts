import { MlldError } from '@core/errors';
import type { LoadContentResult } from '@core/types/load-content';
import type { Environment } from '@interpreter/env/Environment';
import { llmxmlInstance } from '../../utils/llmxml-instance';

export interface SectionUtilityDependencies {
  interpolateAndRecord: (nodes: any[], env: Environment) => Promise<string>;
}

export class ContentLoaderSectionHelper {
  constructor(private readonly dependencies: SectionUtilityDependencies) {}

  isSectionListPattern(sectionNode: any): boolean {
    return sectionNode?.identifier?.type === 'section-list';
  }

  getSectionListLevel(sectionNode: any): number {
    return sectionNode?.identifier?.level ?? 0;
  }

  async extractSectionName(sectionNode: any, env: Environment): Promise<string> {
    if (!sectionNode || !sectionNode.identifier) {
      throw new MlldError('Invalid section node', {
        node: sectionNode
      });
    }

    const identifier = sectionNode.identifier;
    if (identifier.type === 'section-list') {
      throw new MlldError('Section list patterns (??) should be handled separately', {
        identifierType: identifier.type
      });
    }

    if (identifier.type === 'Text') {
      return identifier.content;
    }
    if (identifier.type === 'VariableReference') {
      return this.dependencies.interpolateAndRecord([identifier], env);
    }
    if (Array.isArray(identifier)) {
      return this.dependencies.interpolateAndRecord(identifier, env);
    }

    throw new MlldError('Unable to extract section name', {
      identifierType: identifier.type
    });
  }

  listSections(content: string, level?: number): string[] {
    const lines = content.split('\n');
    const headings: string[] = [];

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) {
        continue;
      }
      const headingLevel = match[1].length;
      const title = match[2].trim();
      if (level === undefined || level === 0 || headingLevel === level) {
        headings.push(title);
      }
    }

    return headings;
  }

  async extractSection(
    content: string,
    sectionName: string,
    renamedTitle?: any,
    fileContext?: LoadContentResult,
    env?: Environment
  ): Promise<string> {
    try {
      let extracted: string | null | undefined;
      try {
        extracted = await llmxmlInstance.getSection(content, sectionName, {
          includeNested: true
        });
      } catch {
        extracted = null;
      }

      if (!extracted) {
        extracted = this.extractSectionByHeading(content, sectionName);
      }

      if (!extracted) {
        throw new MlldError(`Section "${sectionName}" not found in content`, {
          sectionName: sectionName,
          availableSections: await this.getAvailableSections(content)
        });
      }

      if (!renamedTitle) {
        return extracted;
      }

      const finalTitle = await this.buildRenameTitle(extracted, renamedTitle, fileContext, env, sectionName);
      const { applyHeaderTransform } = await import('../show');
      return applyHeaderTransform(extracted, finalTitle);
    } catch (error: any) {
      throw new MlldError(`Failed to extract section: ${error.message}`, {
        sectionName: sectionName,
        error: error.message
      });
    }
  }

  private async buildRenameTitle(
    extracted: string,
    renamedTitle: any,
    fileContext: LoadContentResult | undefined,
    env: Environment | undefined,
    sectionName: string
  ): Promise<string> {
    if (!(typeof renamedTitle === 'object' && renamedTitle.type === 'rename-template')) {
      return renamedTitle;
    }

    if (!fileContext) {
      throw new MlldError('File context required for template interpolation in rename', {
        sectionName: sectionName
      });
    }
    if (!env) {
      throw new MlldError('Environment required for template interpolation', {
        sectionName: sectionName
      });
    }

    const processedParts: any[] = [];
    for (const part of renamedTitle.parts || []) {
      if (part.type === 'FileReference' && part.source?.type === 'placeholder') {
        if (part.fields && part.fields.length > 0) {
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
          continue;
        }

        const lines = extracted.split('\n');
        let contentWithoutHeader = extracted;
        if (lines.length > 0 && lines[0].match(/^#+\s/)) {
          contentWithoutHeader = lines.slice(1).join('\n').trim();
        }
        processedParts.push({
          type: 'Text',
          content: contentWithoutHeader
        });
        continue;
      }

      processedParts.push(part);
    }

    return this.dependencies.interpolateAndRecord(processedParts, env);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private extractSectionByHeading(content: string, sectionName: string): string | null {
    const lines = content.split('\n');
    const normalizedName = sectionName.replace(/^#+\s*/, '').trim();
    const escapedName = this.escapeRegExp(normalizedName);
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

  private async getAvailableSections(content: string): Promise<string[]> {
    try {
      const headings = await llmxmlInstance.getHeadings(content);
      return headings.map(heading => heading.title);
    } catch {
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
}
