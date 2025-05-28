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
  private fileCache = new Map<string, { lines: string[]; timestamp: number }>();
  private maxCacheSize = 100;
  private cacheTtl = 60000; // 1 minute

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
    const now = Date.now();
    const cached = this.fileCache.get(filePath);
    
    // Check if we have a valid cached entry
    if (cached && (now - cached.timestamp) < this.cacheTtl) {
      return cached.lines;
    }

    try {
      const content = await this.fileSystem.readFile(filePath);
      const lines = content.split('\n');
      
      // Clean cache if it's getting too large
      if (this.fileCache.size >= this.maxCacheSize) {
        this.cleanCache();
      }
      
      this.fileCache.set(filePath, { lines, timestamp: now });
      return lines;
    } catch (error) {
      throw error;
    }
  }

  private cleanCache(): void {
    const now = Date.now();
    const entries = Array.from(this.fileCache.entries());
    
    // Remove expired entries first
    const expiredKeys = entries
      .filter(([_, cache]) => (now - cache.timestamp) >= this.cacheTtl)
      .map(([key]) => key);
    
    expiredKeys.forEach(key => this.fileCache.delete(key));
    
    // If still too large, remove oldest entries
    if (this.fileCache.size >= this.maxCacheSize) {
      const sortedEntries = entries
        .filter(([key]) => !expiredKeys.includes(key))
        .sort(([_, a], [__, b]) => a.timestamp - b.timestamp);
      
      const toRemove = sortedEntries.slice(0, sortedEntries.length - this.maxCacheSize + 10);
      toRemove.forEach(([key]) => this.fileCache.delete(key));
    }
  }

  clearCache(): void {
    this.fileCache.clear();
  }
}