/**
 * Path service interface for path operations
 */
export interface IPathService {
  resolve(...segments: string[]): string;
  relative(from: string, to: string): string;
  join(...segments: string[]): string;
  dirname(filePath: string): string;
  basename(filePath: string, ext?: string): string;
  extname(filePath: string): string;
  isAbsolute(filePath: string): boolean;
  normalize(filePath: string): string;
}