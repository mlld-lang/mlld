import { parse } from '@grammar/parser';
import { initializePatterns, enhanceParseError } from '@core/errors/patterns/init';
import { MlldParseError, ErrorSeverity } from '@core/errors';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { MlldMode } from '@core/types/mode';
import { performance } from 'node:perf_hooks';

interface CacheEntry {
  ast: any;
  source: string;
  parseDurationMs: number;
}

export class MemoryAstCache {
  private readonly cache = new Map<string, CacheEntry>();

  async get(
    filePath: string,
    fileSystem: IFileSystemService,
    mode: MlldMode
  ): Promise<CacheEntry & { cacheHit: boolean }> {
    const source = await fileSystem.readFile(filePath);
    const cacheKey = `${filePath}:${mode}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.source === source) {
      return { ...cached, cacheHit: true, parseDurationMs: 0 };
    }

    const parseStart = performance.now();
    const ast = await this.parseSource(source, filePath);
    const entry = { ast, source, parseDurationMs: performance.now() - parseStart };
    this.cache.set(cacheKey, entry);
    return { ...entry, cacheHit: false };
  }

  invalidate(filePath: string, mode: MlldMode): void {
    const cacheKey = `${filePath}:${mode}`;
    this.cache.delete(cacheKey);
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
