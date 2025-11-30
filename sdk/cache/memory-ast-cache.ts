import { parse } from '@grammar/parser';
import { initializePatterns, enhanceParseError } from '@core/errors/patterns/init';
import { MlldParseError, ErrorSeverity } from '@core/errors';
import type { IFileSystemService } from '@services/fs/IFileSystemService';

interface CacheEntry {
  ast: any;
  source: string;
}

export class MemoryAstCache {
  private readonly cache = new Map<string, CacheEntry>();

  async get(filePath: string, fileSystem: IFileSystemService): Promise<CacheEntry> {
    const source = await fileSystem.readFile(filePath);
    const cached = this.cache.get(filePath);
    if (cached && cached.source === source) {
      return cached;
    }

    const ast = await this.parseSource(source, filePath);
    const entry = { ast, source };
    this.cache.set(filePath, entry);
    return entry;
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }

  private async parseSource(source: string, filePath: string): Promise<any> {
    await initializePatterns();
    const parseResult = await parse(source);

    if (!parseResult.success || parseResult.error) {
      const parseError = parseResult.error || new Error('Unknown parse error');
      const enhancedError = await enhanceParseError(parseError, source, filePath);
      if (enhancedError) {
        throw enhancedError;
      }

      const location = (parseError as any).location;
      const position = location?.start || location || undefined;

      throw new MlldParseError(parseError.message, position, {
        severity: ErrorSeverity.Fatal,
        cause: parseError,
        filePath,
        context: {
          sourceContent: source
        }
      });
    }

    return parseResult.ast;
  }
}
