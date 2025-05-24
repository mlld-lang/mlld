/**
 * Simplified path service interface for the interpreter
 */
export interface IPathService {
  // Basic path operations
  resolve(...segments: string[]): string;
  relative(from: string, to: string): string;
  join(...segments: string[]): string;
  dirname(filePath: string): string;
  basename(filePath: string, ext?: string): string;
  extname(filePath: string): string;
  isAbsolute(filePath: string): boolean;
  normalize(filePath: string): string;
  
  // URL support
  isURL(path: string): boolean;
  validateURL(url: string): Promise<string>;
  fetchURL(url: string): Promise<{ content: string; headers?: Record<string, string> }>;
}