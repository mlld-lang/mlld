import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Header {
  level: number;
  text: string;
  line: number;
}

export class HeaderExtractor {
  private static readonly HEADER_REGEX = /^(#{1,6})\s+(.+)$/gm;

  /**
   * Extract headers from markdown content
   */
  static extractHeaders(content: string): Header[] {
    const headers: Header[] = [];
    let match;
    
    // Reset regex state
    this.HEADER_REGEX.lastIndex = 0;
    
    while ((match = this.HEADER_REGEX.exec(content)) !== null) {
      headers.push({
        level: match[1].length,
        text: match[2].trim(),
        line: content.substring(0, match.index).split('\n').length
      });
    }
    
    return headers;
  }

  /**
   * Extract headers from a file
   */
  static async extractHeadersFromFile(filePath: string): Promise<Header[]> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return this.extractHeaders(content);
    } catch (error) {
      console.error(`Failed to extract headers from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Get all markdown files in workspace
   */
  static async getAllMarkdownFiles(): Promise<vscode.Uri[]> {
    const files = await vscode.workspace.findFiles(
      '**/*.{md,mld}',
      '**/node_modules/**',
      100 // Limit to 100 files for performance
    );
    return files;
  }

  /**
   * Extract headers from all markdown files in workspace
   */
  static async extractAllHeaders(): Promise<Map<string, Header[]>> {
    const headerMap = new Map<string, Header[]>();
    const files = await this.getAllMarkdownFiles();
    
    await Promise.all(
      files.map(async (file) => {
        const headers = await this.extractHeadersFromFile(file.fsPath);
        if (headers.length > 0) {
          headerMap.set(file.fsPath, headers);
        }
      })
    );
    
    return headerMap;
  }

  /**
   * Format header for completion display
   */
  static formatHeaderForCompletion(header: Header, fileName: string): string {
    const prefix = '#'.repeat(header.level);
    const baseName = path.basename(fileName);
    return `${prefix} ${header.text} (${baseName})`;
  }
}