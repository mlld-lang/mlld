import { MlldError } from '@core/errors';
import type { LoadContentResult } from '@core/types/load-content';
import type { Environment } from '@interpreter/env/Environment';
import { llmxmlInstance } from '../../utils/llmxml-instance';

export interface SectionUtilityDependencies {
  interpolateAndRecord: (nodes: any[], env: Environment) => Promise<string>;
}

interface SectionSelectorItem {
  query: string;
  optional: boolean;
}

interface ParsedSectionSelector {
  includes: SectionSelectorItem[];
  excludes: SectionSelectorItem[];
}

interface HeadingRange {
  title: string;
  normalized: string;
  level: number;
  startLine: number;
  endLine: number;
}

interface LineRange {
  startLine: number;
  endLine: number;
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
      const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
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
      const parsedSelector = this.parseSectionSelector(sectionName);
      const headings = this.getHeadingRanges(content);

      const includeMatches = this.resolveSelectorItems(parsedSelector.includes, headings, {
        failOnMissing: true
      });
      if (includeMatches.length === 0) {
        return '';
      }

      const excludeMatches = this.resolveSelectorItems(parsedSelector.excludes, headings, {
        failOnMissing: false
      });

      if (renamedTitle && includeMatches.length > 1) {
        throw new MlldError('Renaming multiple sections is not supported yet', {
          includeCount: includeMatches.length,
          selector: sectionName
        });
      }

      let extracted: string;
      if (includeMatches.length === 1 && excludeMatches.length === 0) {
        extracted = await this.extractSingleMatchedSection(content, includeMatches[0].title);
      } else {
        const includeRanges = this.toMergedRanges(includeMatches);
        const excludeRanges = this.toMergedRanges(excludeMatches);
        const finalRanges = this.subtractRanges(includeRanges, excludeRanges);
        extracted = this.extractByRanges(content, finalRanges);
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
      if (error instanceof MlldError) {
        throw error;
      }
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

  private normalizeHeading(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private parseSectionSelector(sectionName: string): ParsedSectionSelector {
    const selector = sectionName.trim();
    const { includePart, excludePart } = this.splitIncludeExclude(selector);
    const includes = this.parseSelectorItems(includePart, 'include');
    if (includes.length === 0) {
      throw new MlldError('Invalid section selector: include set cannot be empty', {
        selector: sectionName
      });
    }
    const excludes = excludePart ? this.parseSelectorItems(excludePart, 'exclude') : [];
    return { includes, excludes };
  }

  private splitIncludeExclude(selector: string): { includePart: string; excludePart?: string } {
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < selector.length; i += 1) {
      const ch = selector[i];
      const prev = i > 0 ? selector[i - 1] : '';
      if (quote) {
        if (ch === quote && prev !== '\\') {
          quote = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ';') {
        const rest = selector.slice(i + 1);
        if (/^\s*!?#/.test(rest)) {
          return {
            includePart: selector.slice(0, i),
            excludePart: rest
          };
        }
      }
    }
    return { includePart: selector };
  }

  private splitOutsideQuotes(input: string, delimiter: ',' | ';'): string[] {
    let quote: '"' | "'" | null = null;
    const parts: string[] = [];
    let current = '';
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      const prev = i > 0 ? input[i - 1] : '';
      if (quote) {
        current += ch;
        if (ch === quote && prev !== '\\') {
          quote = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === delimiter) {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    parts.push(current);
    return parts;
  }

  private parseSelectorItems(rawPart: string, mode: 'include' | 'exclude'): SectionSelectorItem[] {
    let part = rawPart.trim();
    if (!part) {
      return [];
    }

    if (mode === 'exclude') {
      if (!part.startsWith('#') && !part.startsWith('!#')) {
        throw new MlldError('Invalid exclude selector: expected "# section" or "!# section" after ";"', {
          selector: rawPart
        });
      }
      if (part.startsWith('!#')) {
        part = part.slice(2).trim();
      } else if (part.startsWith('#')) {
        part = part.slice(1).trim();
      }
    }

    const rawItems = this.splitOutsideQuotes(part, ',');
    return rawItems
      .map(raw => this.parseSelectorItem(raw, mode))
      .filter((item): item is SectionSelectorItem => item !== null);
  }

  private parseSelectorItem(rawItem: string, mode: 'include' | 'exclude'): SectionSelectorItem | null {
    let item = rawItem.trim();
    if (!item) {
      return null;
    }

    if (mode === 'include' && item.includes('!#')) {
      throw new MlldError('Invalid section selector: use "; !# section" to start exclude selectors', {
        selectorItem: rawItem
      });
    }

    if (item.startsWith('!#')) {
      if (mode === 'include') {
        throw new MlldError('Invalid section selector: use "; !# section" to start exclude selectors', {
          selectorItem: rawItem
        });
      }
      item = item.slice(2).trim();
    } else if (item.startsWith('#')) {
      item = item.slice(1).trim();
    }

    let optional = false;
    if (item.endsWith('?') && !item.endsWith('??')) {
      optional = true;
      item = item.slice(0, -1).trim();
    }

    if (
      (item.startsWith('"') && item.endsWith('"')) ||
      (item.startsWith("'") && item.endsWith("'"))
    ) {
      const quote = item[0];
      const inner = item.slice(1, -1);
      const escapedQuote = quote === '"' ? /\\"/g : /\\'/g;
      item = inner.replace(escapedQuote, quote).replace(/\\\\/g, '\\').trim();
    }

    if (!item) {
      throw new MlldError('Invalid section selector: section name cannot be empty', {
        selectorItem: rawItem
      });
    }

    return {
      query: item,
      optional
    };
  }

  private getHeadingRanges(content: string): HeadingRange[] {
    const lines = content.split('\n');
    const headings: HeadingRange[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trimEnd();
      const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
      if (!match) {
        continue;
      }
      const title = match[2].trim();
      headings.push({
        title,
        normalized: this.normalizeHeading(title),
        level: match[1].length,
        startLine: i,
        endLine: lines.length
      });
    }

    for (let i = 0; i < headings.length; i += 1) {
      const current = headings[i];
      for (let j = i + 1; j < headings.length; j += 1) {
        if (headings[j].level <= current.level) {
          current.endLine = headings[j].startLine;
          break;
        }
      }
    }

    return headings;
  }

  private resolveSelectorItems(
    items: SectionSelectorItem[],
    headings: HeadingRange[],
    options: { failOnMissing: boolean }
  ): HeadingRange[] {
    const resolved: HeadingRange[] = [];
    const availableSections = headings.map(heading => heading.title);
    for (const item of items) {
      const matched = this.findFirstMatchingHeading(headings, item.query);
      if (matched) {
        resolved.push(matched);
        continue;
      }

      if (options.failOnMissing && !item.optional) {
        throw new MlldError(`Section "${item.query}" not found in content`, {
          sectionName: item.query,
          availableSections,
          hint: 'Use "Section"? to make missing includes optional'
        });
      }
    }
    return resolved;
  }

  private findFirstMatchingHeading(headings: HeadingRange[], query: string): HeadingRange | null {
    const normalizedQuery = this.normalizeHeading(query.replace(/^#+\s*/, '').trim());
    if (!normalizedQuery) {
      return null;
    }
    for (const heading of headings) {
      if (heading.normalized.startsWith(normalizedQuery)) {
        return heading;
      }
    }
    return null;
  }

  private toMergedRanges(headings: HeadingRange[]): LineRange[] {
    if (headings.length === 0) {
      return [];
    }
    const ranges = headings
      .map(heading => ({ startLine: heading.startLine, endLine: heading.endLine }))
      .sort((a, b) => a.startLine - b.startLine);

    const merged: LineRange[] = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (!last || range.startLine > last.endLine) {
        merged.push({ ...range });
      } else {
        last.endLine = Math.max(last.endLine, range.endLine);
      }
    }
    return merged;
  }

  private subtractRanges(includes: LineRange[], excludes: LineRange[]): LineRange[] {
    if (includes.length === 0 || excludes.length === 0) {
      return includes;
    }

    let result: LineRange[] = includes.map(range => ({ ...range }));
    for (const exclude of excludes) {
      const next: LineRange[] = [];
      for (const include of result) {
        if (exclude.endLine <= include.startLine || exclude.startLine >= include.endLine) {
          next.push(include);
          continue;
        }
        if (exclude.startLine > include.startLine) {
          next.push({
            startLine: include.startLine,
            endLine: exclude.startLine
          });
        }
        if (exclude.endLine < include.endLine) {
          next.push({
            startLine: exclude.endLine,
            endLine: include.endLine
          });
        }
      }
      result = next;
    }
    return result;
  }

  private extractByRanges(content: string, ranges: LineRange[]): string {
    if (ranges.length === 0) {
      return '';
    }
    const lines = content.split('\n');
    const chunks = ranges
      .map(range => lines.slice(range.startLine, range.endLine).join('\n').trim())
      .filter(Boolean);
    return chunks.join('\n\n').trim();
  }

  private async extractSingleMatchedSection(content: string, sectionName: string): Promise<string> {
    return this.extractSectionByHeading(content, sectionName) ?? '';
  }

  private extractSectionByHeading(content: string, sectionName: string): string | null {
    const headings = this.getHeadingRanges(content);
    const matched = this.findFirstMatchingHeading(headings, sectionName);
    if (!matched) {
      return null;
    }
    return this.extractByRanges(content, [{ startLine: matched.startLine, endLine: matched.endLine }]);
  }

  private async getAvailableSections(content: string): Promise<string[]> {
    try {
      const headings = await llmxmlInstance.getHeadings(content);
      return headings.map(heading => heading.title);
    } catch {
      const sections: string[] = [];
      const lines = content.split('\n');

      for (const line of lines) {
        const match = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
        if (match) {
          sections.push(match[1]);
        }
      }

      return sections;
    }
  }
}
