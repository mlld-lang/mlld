import { promises as fs } from 'fs';
import { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './types.js';
import { MeldDirectiveError } from '../errors.js';
import { InterpreterState } from '../state/state.js';
import { interpretSubDirectives } from '../subInterpreter.js';

interface EmbedDirectiveData {
  kind: DirectiveKind;
  path: string;
  section?: string;
  items?: string[];
  headerLevel?: number;
  underHeader?: string;
  interpret?: boolean;
}

export class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'embed';
  }

  async handle(node: DirectiveNode, state: InterpreterState): Promise<void> {
    const data = node.directive as EmbedDirectiveData;

    if (!data.path) {
      throw new MeldDirectiveError(
        'Embed directive requires a path',
        'embed',
        node.location?.start
      );
    }

    // Read file content
    let content: string;
    try {
      content = await fs.readFile(data.path, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new MeldDirectiveError(
          'File not found',
          'embed',
          node.location?.start
        );
      }
      throw new MeldDirectiveError(
        `Failed to read file: ${err.message}`,
        'embed',
        node.location?.start
      );
    }

    // Extract section if specified
    if (data.section) {
      content = this.extractSection(content, data.section);
    }

    // Extract items if specified
    if (data.items) {
      content = this.extractItems(content, data.items);
    }

    // Adjust header levels if specified
    if (data.headerLevel !== undefined || data.underHeader) {
      content = this.adjustHeaderLevels(content, data.headerLevel, data.underHeader);
    }

    // Interpret nested directives if specified
    if (data.interpret) {
      interpretSubDirectives(content, state, node.location?.start);
    } else {
      state.addNode({
        type: 'Text',
        content,
        location: node.location
      });
    }
  }

  private extractSection(content: string, sectionName: string): string {
    const lines = content.split('\n');
    const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`);
    let result = '';
    let inSection = false;
    let currentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#+)\s+/);

      if (headerMatch) {
        const level = headerMatch[1].length;

        if (sectionRegex.test(line)) {
          inSection = true;
          currentLevel = level;
          continue;
        } else if (inSection && level <= currentLevel) {
          break;
        }
      }

      if (inSection) {
        result += (result ? '\n' : '') + line;
      }
    }

    return result;
  }

  private extractItems(content: string, items: string[]): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let currentItem = '';

    for (const line of lines) {
      const itemMatch = line.match(/^#+\s+(.+)$/);
      if (itemMatch) {
        const itemName = itemMatch[1].trim();
        if (items.includes(itemName)) {
          if (currentItem) {
            result.push(currentItem.trim());
          }
          currentItem = line;
        } else if (currentItem) {
          currentItem += '\n' + line;
        }
      } else if (currentItem) {
        currentItem += '\n' + line;
      }
    }

    if (currentItem) {
      result.push(currentItem.trim());
    }

    return result.join('\n\n');
  }

  private adjustHeaderLevels(content: string, baseLevel?: number, underHeader?: string): string {
    let lines = content.split('\n');
    let minLevel = 6;

    // Find minimum header level in content
    for (const line of lines) {
      const headerMatch = line.match(/^(#+)\s+/);
      if (headerMatch) {
        minLevel = Math.min(minLevel, headerMatch[1].length);
      }
    }

    // Calculate level adjustment
    let levelAdjustment = 0;
    if (baseLevel !== undefined) {
      levelAdjustment = baseLevel - minLevel;
    } else if (underHeader) {
      const underHeaderMatch = underHeader.match(/^(#+)\s+/);
      if (underHeaderMatch) {
        levelAdjustment = underHeaderMatch[1].length + 1 - minLevel;
      }
    }

    // Adjust header levels
    lines = lines.map(line => {
      const headerMatch = line.match(/^(#+)(\s+.+)$/);
      if (headerMatch) {
        const newLevel = Math.min(headerMatch[1].length + levelAdjustment, 6);
        return '#'.repeat(newLevel) + headerMatch[2];
      }
      return line;
    });

    // Add parent header if specified
    if (underHeader) {
      lines.unshift(underHeader, '');
    }

    return lines.join('\n');
  }
} 