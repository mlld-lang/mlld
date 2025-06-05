import * as path from 'path';
import type { IPathService } from './IPathService';

/**
 * Path service implementation for the interpreter
 */
export class PathService implements IPathService {
  // Basic path operations
  resolve(...segments: string[]): string {
    return path.resolve(...segments);
  }
  
  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
  
  join(...segments: string[]): string {
    return path.join(...segments);
  }
  
  dirname(filePath: string): string {
    return path.dirname(filePath);
  }
  
  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }
  
  extname(filePath: string): string {
    return path.extname(filePath);
  }
  
  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }
  
  normalize(filePath: string): string {
    return path.normalize(filePath);
  }
  
  // URL support
  isURL(path: string): boolean {
    try {
      const url = new URL(path);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
  
  async validateURL(url: string): Promise<string> {
    if (!this.isURL(url)) {
      throw new Error(`Invalid URL: ${url}`);
    }
    // For now, just return the URL if it's valid
    // In the future, we can add security checks, domain allowlists, etc.
    return url;
  }
  
  async fetchURL(url: string): Promise<{ content: string; headers?: Record<string, string> }> {
    // Validate URL first
    await this.validateURL(url);
    
    // Use Node's built-in fetch (available in Node 18+)
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    
    const content = await response.text();
    const headers: Record<string, string> = {};
    
    // Convert headers to plain object
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    return { content, headers };
  }
}