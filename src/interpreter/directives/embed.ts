import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler } from './types';
import { InterpreterState } from '../state/state';
import { MeldEmbedError } from '../errors/errors';
import { parseMeld } from '../parser';

class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string): boolean {
    return kind === '@embed' || kind === 'embed';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const { path, section, items, headerLevel, underHeader, interpret } = node.data || {};

    if (!path) {
      throw new MeldEmbedError('Embed path is required', node.location?.start);
    }

    // Resolve path relative to current file
    const currentDir = dirname(state.getCurrentFilePath() || '');
    const embedPath = join(currentDir, path);

    // Check if file exists
    if (!existsSync(embedPath)) {
      throw new MeldEmbedError('File not found', node.location?.start);
    }

    try {
      // Read content
      let content = readFileSync(embedPath, 'utf-8');

      // Extract section if specified
      if (section) {
        content = this.extractSection(content, section);
      }

      // Extract specific items if specified
      if (items) {
        content = this.extractItems(content, items);
      }

      // Adjust header levels if specified
      if (headerLevel) {
        content = this.adjustHeaderLevels(content, headerLevel);
      }

      // Add content under specified header
      if (underHeader) {
        content = `# ${underHeader}\n\n${content}`;
      }

      if (interpret) {
        // Parse and interpret content if requested
        const nodes = parseMeld(content);
        const embedState = new InterpreterState();
        embedState.parentState = state;
        embedState.setCurrentFilePath(embedPath);
        const { interpretMeld } = require('../interpreter');
        interpretMeld(nodes, embedState);
        state.mergeFrom(embedState);
      } else {
        // Add content as text node
        state.addNode({
          type: 'Text',
          content,
          location: node.location
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new MeldEmbedError(
          `Failed to embed content: ${error.message}`,
          node.location?.start
        );
      }
      throw error;
    }
  }

  private extractSection(content: string, sectionName: string): string {
    const lines = content.split('\n');
    const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`);
    const startIndex = lines.findIndex(line => sectionRegex.test(line));

    if (startIndex === -1) {
      throw new Error(`Section "${sectionName}" not found in content`);
    }

    const headerLevel = lines[startIndex].match(/^#+/)?.[0].length || 1;
    const endIndex = lines.slice(startIndex + 1).findIndex(line => {
      const match = line.match(/^(#+)/);
      return match && match[0].length <= headerLevel;
    });

    return endIndex === -1
      ? lines.slice(startIndex).join('\n')
      : lines.slice(startIndex, startIndex + endIndex + 1).join('\n');
  }

  private extractItems(content: string, items: string[]): string {
    const lines = content.split('\n');
    const result: string[] = [];

    for (const item of items) {
      const itemRegex = new RegExp(`^#+\\s+${item}\\s*$`);
      const startIndex = lines.findIndex(line => itemRegex.test(line));

      if (startIndex === -1) {
        throw new Error(`Item "${item}" not found in content`);
      }

      const headerLevel = lines[startIndex].match(/^#+/)?.[0].length || 1;
      const endIndex = lines.slice(startIndex + 1).findIndex(line => {
        const match = line.match(/^(#+)/);
        return match && match[0].length <= headerLevel;
      });

      result.push(
        endIndex === -1
          ? lines.slice(startIndex).join('\n')
          : lines.slice(startIndex, startIndex + endIndex + 1).join('\n')
      );
    }

    return result.join('\n\n');
  }

  private adjustHeaderLevels(content: string, baseLevel: number): string {
    return content.replace(/^(#+)/gm, match => {
      const currentLevel = match.length;
      const newLevel = currentLevel + baseLevel - 1;
      return '#'.repeat(Math.min(newLevel, 6));
    });
  }
}

export const embedDirectiveHandler = new EmbedDirectiveHandler(); 