import type { DirectiveNode } from '@core/types';
import { MlldImportError } from '@core/errors';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { NeedsDeclaration } from '@core/policy/needs';
import type { Environment } from '../../env/Environment';
import type { SerializedGuardDefinition } from '../../guards';
import type { ModuleProcessingResult } from './ModuleContentProcessor';
import type { ImportResolution } from './ImportPathResolver';
import { minimatch } from 'minimatch';
import * as path from 'path';

const DIRECTORY_INDEX_FILENAME = 'index.mld';
const DEFAULT_DIRECTORY_IMPORT_SKIP_DIRS = ['_*', '.*'] as const;

type ProcessModuleContent = (
  resolution: ImportResolution,
  directive: DirectiveNode
) => Promise<ModuleProcessingResult>;

type EnforceModuleNeeds = (needs: NeedsDeclaration | undefined, source?: string) => void;

export class DirectoryImportHandler {
  constructor(
    private readonly processModuleContent: ProcessModuleContent,
    private readonly enforceModuleNeeds: EnforceModuleNeeds
  ) {}

  async maybeProcessDirectoryImport(
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<ModuleProcessingResult | null> {
    if (resolution.type !== 'file') {
      return null;
    }

    if (resolution.importType === 'templates') {
      return null;
    }

    const fsService = env.getFileSystemService();
    if (typeof fsService.isDirectory !== 'function') {
      return null;
    }

    const baseDir = resolution.resolvedPath;
    const isDir = await fsService.isDirectory(baseDir);
    if (!isDir) {
      return null;
    }

    return this.processDirectoryImport(fsService, baseDir, resolution, directive, env);
  }

  private async processDirectoryImport(
    fsService: IFileSystemService,
    baseDir: string,
    resolution: ImportResolution,
    directive: DirectiveNode,
    env: Environment
  ): Promise<ModuleProcessingResult> {
    if (typeof fsService.readdir !== 'function' || typeof fsService.stat !== 'function') {
      throw new MlldImportError('Directory import requires filesystem access', {
        code: 'DIRECTORY_IMPORT_FS_UNAVAILABLE',
        details: { path: baseDir }
      });
    }

    const skipDirs = this.getDirectoryImportSkipDirs(directive, baseDir);
    const moduleObject: Record<string, any> = {};
    const guardDefinitions: SerializedGuardDefinition[] = [];

    const entries = await fsService.readdir(baseDir);
    for (const entry of entries) {
      const fullPath = path.join(baseDir, entry);
      const stat = await fsService
        .stat(fullPath)
        .catch(() => ({ isDirectory: () => false, isFile: () => false }));
      if (!stat.isDirectory()) {
        continue;
      }

      if (this.shouldSkipDirectory(entry, skipDirs)) {
        continue;
      }

      const indexPath = path.join(fullPath, DIRECTORY_INDEX_FILENAME);
      const hasIndex = await fsService.exists(indexPath).catch(() => false);
      if (!hasIndex) {
        continue;
      }

      const indexStat = await fsService
        .stat(indexPath)
        .catch(() => ({ isDirectory: () => false, isFile: () => false }));
      if (!indexStat.isFile()) {
        continue;
      }

      const childResolution: ImportResolution = {
        type: 'file',
        resolvedPath: indexPath,
        importType: resolution.importType
      };

      const childResult = await this.processModuleContent(childResolution, directive);
      this.enforceModuleNeeds(childResult.moduleNeeds, indexPath);

      const key = this.sanitizeDirectoryKey(entry);
      if (key in moduleObject) {
        throw new MlldImportError(`Duplicate directory import key '${key}' under ${baseDir}`, {
          code: 'DIRECTORY_IMPORT_DUPLICATE_KEY',
          details: { path: baseDir, key, entries: [entry] }
        });
      }

      moduleObject[key] = childResult.moduleObject;
      if (childResult.guardDefinitions && childResult.guardDefinitions.length > 0) {
        guardDefinitions.push(...childResult.guardDefinitions);
      }
    }

    if (Object.keys(moduleObject).length === 0) {
      throw new MlldImportError(`No ${DIRECTORY_INDEX_FILENAME} modules found under ${baseDir}`, {
        code: 'DIRECTORY_IMPORT_EMPTY',
        details: { path: baseDir, index: DIRECTORY_INDEX_FILENAME }
      });
    }

    const childEnv = env.createChild(baseDir);
    childEnv.setCurrentFilePath(baseDir);

    return {
      moduleObject,
      frontmatter: null,
      childEnvironment: childEnv,
      guardDefinitions
    };
  }

  private getDirectoryImportSkipDirs(directive: DirectiveNode, baseDir: string): string[] {
    const withClause = (directive.meta?.withClause || directive.values?.withClause) as any | undefined;
    if (!withClause || !('skipDirs' in withClause)) {
      return [...DEFAULT_DIRECTORY_IMPORT_SKIP_DIRS];
    }

    const value = (withClause as any).skipDirs as unknown;
    return this.parseStringArrayOption(value, { option: 'skipDirs', source: baseDir });
  }

  private parseStringArrayOption(
    value: unknown,
    context: { option: string; source: string }
  ): string[] {
    if (Array.isArray(value)) {
      const coerced = value.map(item => this.coerceStringLiteral(item)).filter((v): v is string => v !== null);
      if (coerced.length !== value.length) {
        throw new MlldImportError(`Import with { ${context.option}: [...] } only supports string values`, {
          code: 'DIRECTORY_IMPORT_INVALID_OPTION',
          details: { option: context.option, source: context.source }
        });
      }
      return coerced;
    }

    if (this.isArrayLiteralAst(value)) {
      const coerced = value.items.map(item => this.coerceStringLiteral(item)).filter((v): v is string => v !== null);
      if (coerced.length !== value.items.length) {
        throw new MlldImportError(`Import with { ${context.option}: [...] } only supports string values`, {
          code: 'DIRECTORY_IMPORT_INVALID_OPTION',
          details: { option: context.option, source: context.source }
        });
      }
      return coerced;
    }

    throw new MlldImportError(`Import with { ${context.option}: [...] } expects an array`, {
      code: 'DIRECTORY_IMPORT_INVALID_OPTION',
      details: { option: context.option, source: context.source }
    });
  }

  private isArrayLiteralAst(value: unknown): value is { type: 'array'; items: unknown[] } {
    return Boolean(
      value &&
        typeof value === 'object' &&
        'type' in value &&
        (value as any).type === 'array' &&
        'items' in value &&
        Array.isArray((value as any).items)
    );
  }

  private coerceStringLiteral(value: unknown): string | null {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object') {
      if ((value as any).type === 'Literal' && (value as any).valueType === 'string') {
        return String((value as any).value ?? '');
      }

      if ('content' in value && Array.isArray((value as any).content)) {
        const parts = (value as any).content as any[];
        const hasOnlyLiteralOrText = parts.every(
          node =>
            node &&
            typeof node === 'object' &&
            ((node.type === 'Literal' && 'value' in node) || (node.type === 'Text' && 'content' in node))
        );
        if (!hasOnlyLiteralOrText) {
          return null;
        }
        return parts.map(node => (node.type === 'Literal' ? String(node.value ?? '') : String(node.content ?? ''))).join('');
      }
    }

    return null;
  }

  private shouldSkipDirectory(dirName: string, patterns: string[]): boolean {
    return patterns.some(pattern => minimatch(dirName, pattern, { dot: true }));
  }

  private sanitizeDirectoryKey(name: string): string {
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return sanitized.length > 0 ? sanitized : 'module';
  }
}
