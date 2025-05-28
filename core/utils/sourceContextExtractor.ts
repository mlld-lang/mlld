import { IFileSystemService } from '@services/fs/IFileSystemService';
import { FormattedLocation } from './locationFormatter';

export interface SourceLine {
  number: number;
  content: string;
  isErrorLine: boolean;
}

export interface SourceContext {
  file?: string;
  lines: SourceLine[];
  errorLine: number;
  errorColumn: number;
}

export interface ExtractSourceContextOptions {
  contextLines?: number;
  maxLineLength?: number;
}

export class SourceContextExtractor {
  private fileCache = new Map<string, string[]>();

  constructor(private fileSystem: IFileSystemService) {}

  async extractContext(
    location: FormattedLocation,
    options: ExtractSourceContextOptions = {}
  ): Promise<SourceContext | null> {
    const { contextLines = 2, maxLineLength = 120 } = options;

    if (!location.file || !location.line) {
      return null;
    }

    try {
      const lines = await this.getFileLines(location.file);
      const errorLineIndex = location.line - 1;
      
      if (errorLineIndex < 0 || errorLineIndex >= lines.length) {
        return null;
      }

      const startLine = Math.max(0, errorLineIndex - contextLines);
      const endLine = Math.min(lines.length - 1, errorLineIndex + contextLines);

      const contextLines_: SourceLine[] = [];
      
      for (let i = startLine; i <= endLine; i++) {
        let content = lines[i];
        
        if (content.length > maxLineLength) {
          const column = location.column || 1;
          const start = Math.max(0, column - 40);
          const end = Math.min(content.length, start + maxLineLength);
          content = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
        }

        contextLines_.push({
          number: i + 1,
          content,
          isErrorLine: i === errorLineIndex
        });
      }

      return {
        file: location.file,
        lines: contextLines_,
        errorLine: location.line,
        errorColumn: location.column || 1
      };
    } catch (error) {
      return null;
    }
  }

  private async getFileLines(filePath: string): Promise<string[]> {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }

    try {
      const content = await this.fileSystem.readFile(filePath);
      const lines = content.split('\n');
      this.fileCache.set(filePath, lines);
      return lines;
    } catch (error) {
      throw error;
    }
  }

  clearCache(): void {
    this.fileCache.clear();
  }
}