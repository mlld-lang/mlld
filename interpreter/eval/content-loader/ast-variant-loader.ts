import type { SourceLocation } from '@core/types';
import { MlldSecurityError } from '@core/errors';
import type { Environment } from '@interpreter/env/Environment';
import { glob } from 'tinyglobby';
import * as path from 'path';
import { extractAst, extractNames, type AstPattern, type AstResult } from '../ast-extractor';

export interface AstNameListFileResult {
  names: string[];
  file: string;
  relative: string;
  absolute: string;
}

export interface AstContentTransport {
  readContent: (pathOrUrl: string, sourceLocation?: SourceLocation) => Promise<string>;
  formatRelativePath: (targetPath: string) => string;
}

interface AstVariantContext {
  source: string;
  isGlob: boolean;
  sourceLocation?: SourceLocation;
  env: Environment;
}

const DEFAULT_GLOB_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'];

export class AstVariantLoader {
  constructor(private readonly transport: AstContentTransport) {}

  async loadNameList(
    context: AstVariantContext & { filter?: string }
  ): Promise<string[] | AstNameListFileResult[]> {
    if (context.isGlob) {
      const matches = await this.collectGlobMatches(context.source, context.env);
      const results: AstNameListFileResult[] = [];
      for (const filePath of matches) {
        try {
          const content = await this.transport.readContent(filePath, context.sourceLocation);
          const names = extractNames(content, filePath, context.filter);
          if (names.length > 0) {
            results.push({
              names,
              file: path.basename(filePath),
              relative: this.transport.formatRelativePath(filePath),
              absolute: filePath
            });
          }
        } catch (error: any) {
          if (error instanceof MlldSecurityError) {
            throw error;
          }
          // skip unreadable files
        }
      }
      return results;
    }

    const content = await this.transport.readContent(context.source, context.sourceLocation);
    return extractNames(content, context.source, context.filter);
  }

  async loadContent(
    context: AstVariantContext & { patterns: AstPattern[] }
  ): Promise<Array<AstResult | null>> {
    if (context.isGlob) {
      const matches = await this.collectGlobMatches(context.source, context.env);
      const aggregated: Array<AstResult | null> = [];
      for (const filePath of matches) {
        try {
          const content = await this.transport.readContent(filePath, context.sourceLocation);
          const extracted = extractAst(content, filePath, context.patterns);
          for (const entry of extracted) {
            if (entry) {
              aggregated.push({ ...entry, file: filePath });
            } else {
              aggregated.push(null);
            }
          }
        } catch (error: any) {
          if (error instanceof MlldSecurityError) {
            throw error;
          }
          // skip unreadable files
        }
      }
      return aggregated;
    }

    const content = await this.transport.readContent(context.source, context.sourceLocation);
    return extractAst(content, context.source, context.patterns);
  }

  private async collectGlobMatches(pattern: string, env: Environment): Promise<string[]> {
    const baseDir = env.getFileDirectory();
    const matches = await glob(pattern, {
      cwd: baseDir,
      absolute: true,
      followSymlinks: true,
      ignore: DEFAULT_GLOB_IGNORE
    });
    return Array.isArray(matches) ? matches : [];
  }
}
