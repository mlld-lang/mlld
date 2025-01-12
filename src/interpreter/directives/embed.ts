import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';
import { interpretSubDirectives } from '../subInterpreter.js';
import * as fs from 'fs';
import * as path from 'path';

interface EmbedDirectiveData {
  kind: 'embed';
  path: string;
  section?: string;
  items?: string[];
  interpret?: boolean;
}

class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'embed';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
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
      content = fs.readFileSync(data.path, 'utf8');
    } catch (error) {
      throw new MeldDirectiveError(
        `Failed to read file: ${error.message}`,
        'embed',
        node.location?.start
      );
    }

    // Extract section if specified
    if (data.section) {
      const sectionContent = this.extractSection(content, data.section);
      if (!sectionContent) {
        throw new MeldDirectiveError(
          `Section "${data.section}" not found in content`,
          'embed',
          node.location?.start
        );
      }
      content = sectionContent;
    }

    // Extract items if specified
    if (data.items) {
      const itemContent = this.extractItems(content, data.items);
      if (!itemContent) {
        throw new MeldDirectiveError(
          `Items not found in content: ${data.items.join(', ')}`,
          'embed',
          node.location?.start
        );
      }
      content = itemContent;
    }

    // If interpret flag is set, process nested directives
    if (data.interpret) {
      interpretSubDirectives(content, state, node.location?.start);
    } else {
      // Otherwise, add content as text node
      state.addNode({
        type: 'Text',
        content,
        location: node.location
      });
    }
  }

  private extractSection(content: string, sectionTitle: string): string | null {
    const lines = content.split('\n');
    let inSection = false;
    let sectionContent: string[] = [];
    let currentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(#{1,6})\s+(.+)$/);

      if (match) {
        const level = match[1].length;
        const title = match[2];

        if (title === sectionTitle) {
          inSection = true;
          currentLevel = level;
          sectionContent.push(line);
        } else if (inSection) {
          if (level <= currentLevel) {
            break;
          }
          sectionContent.push(line);
        }
      } else if (inSection) {
        sectionContent.push(line);
      }
    }

    return sectionContent.length > 0 ? sectionContent.join('\n') : null;
  }

  private extractItems(content: string, items: string[]): string | null {
    const lines = content.split('\n');
    const itemContent: string[] = [];
    let inItem = false;
    let currentItem = '';
    let currentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(#{1,6})\s+(.+)$/);

      if (match) {
        const level = match[1].length;
        const title = match[2];

        if (items.includes(title)) {
          if (inItem) {
            itemContent.push('');  // Add separator between items
          }
          inItem = true;
          currentItem = title;
          currentLevel = level;
          itemContent.push(line);
        } else if (inItem) {
          if (level <= currentLevel) {
            inItem = false;
          } else {
            itemContent.push(line);
          }
        }
      } else if (inItem) {
        itemContent.push(line);
      }
    }

    return itemContent.length > 0 ? itemContent.join('\n') : null;
  }
}

export const embedDirectiveHandler = new EmbedDirectiveHandler(); 