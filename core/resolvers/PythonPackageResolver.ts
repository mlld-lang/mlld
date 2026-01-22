import * as path from 'path';
import * as fs from 'fs';
import { execSync, spawnSync } from 'child_process';
import type {
  Resolver,
  ResolverContent,
  ResolverCapabilities,
  ResolverType,
  ContentInfo,
  ResolverOptions
} from './types';
import {
  PythonPackageManagerFactory,
  type IPythonPackageManager
} from '@core/registry/python/PythonPackageManager';
import {
  VirtualEnvironmentManager,
  type VirtualEnvironmentContext
} from '@core/registry/python/VirtualEnvironmentManager';
import {
  PythonLockFile,
  type PythonLockEntry
} from '@core/registry/python/PythonLockFile';
import {
  PythonModuleCache,
  type PythonCacheEntry
} from '@core/registry/python/PythonModuleCache';

export interface PythonPackageResolverOptions {
  projectRoot?: string;
  venvPath?: string;
  packageManager?: IPythonPackageManager;
  lockFile?: PythonLockFile;
  moduleCache?: PythonModuleCache;
}

/**
 * Resolver for Python packages.
 *
 * Handles @py/package and @python/package references:
 * - @py/numpy -> imports numpy package
 * - @py/pandas:DataFrame -> imports specific object from pandas
 * - @python/requests -> alias for @py/requests
 *
 * Python packages are introspected for their exports and can be used
 * in mlld scripts via the /exe directive.
 */
export class PythonPackageResolver implements Resolver {
  readonly name = 'py';
  readonly description = 'Python package resolver for pip/uv packages';
  readonly type: ResolverType = 'input';

  readonly capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: true },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['module', 'data'],
    defaultContentType: 'module',
    priority: 50,
    cache: { strategy: 'persistent' }
  };

  private projectRoot: string;
  private venvManager: VirtualEnvironmentManager;
  private packageManager: IPythonPackageManager;
  private lockFile: PythonLockFile;
  private moduleCache: PythonModuleCache;
  private venvContext: VirtualEnvironmentContext | null = null;

  constructor(options: PythonPackageResolverOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.venvManager = new VirtualEnvironmentManager(this.projectRoot);
    this.packageManager = options.packageManager ?? PythonPackageManagerFactory.getDefault();
    this.lockFile = options.lockFile ?? new PythonLockFile(
      path.join(this.projectRoot, 'mlld-lock.json')
    );
    this.moduleCache = options.moduleCache ?? new PythonModuleCache();
  }

  canResolve(ref: string, config?: any): boolean {
    return ref.startsWith('@py/') || ref.startsWith('@python/');
  }

  async resolve(ref: string, options?: ResolverOptions): Promise<ResolverContent> {
    const { packageName, objectPath } = this.parseReference(ref);

    // Ensure venv is available
    await this.ensureVenv();

    // Check if package is installed
    const isInstalled = await this.isPackageInstalled(packageName);

    if (!isInstalled) {
      // Try to install the package
      const lockEntry = await this.lockFile.getPackage(packageName);
      const version = lockEntry?.version;

      const installResult = await this.packageManager.install(
        [{ name: packageName, version }],
        { venvPath: this.venvContext?.path }
      );

      if (!installResult.success) {
        throw new Error(
          `Failed to install Python package '${packageName}': ${installResult.error || 'unknown error'}`
        );
      }

      // Update lock file
      if (installResult.packages && installResult.packages.length > 0) {
        const pkg = installResult.packages[0];
        await this.lockFile.setPackage(packageName, {
          version: pkg.version,
          resolved: pkg.resolved || '',
          resolvedHash: pkg.resolvedHash || '',
          source: 'pypi',
          integrity: pkg.integrity || '',
          fetchedAt: new Date().toISOString()
        });
        await this.lockFile.save();
      }
    }

    // Generate module content for the package
    const moduleContent = await this.generateModuleContent(packageName, objectPath);

    return {
      content: moduleContent,
      contentType: 'module',
      mx: {
        source: `py://${packageName}${objectPath ? ':' + objectPath : ''}`,
        timestamp: new Date()
      }
    };
  }

  async list(prefix: string, config?: any): Promise<ContentInfo[]> {
    await this.ensureVenv();

    // List installed packages
    const packages = await this.listInstalledPackages();

    return packages.map(pkg => ({
      path: `@py/${pkg.name}`,
      type: 'file' as const,
      metadata: {
        version: pkg.version,
        location: pkg.location
      }
    }));
  }

  /**
   * Parse a Python package reference into components
   */
  private parseReference(ref: string): { packageName: string; objectPath?: string } {
    // Remove @py/ or @python/ prefix
    const withoutPrefix = ref.replace(/^@(py|python)\//, '');

    // Check for object path (e.g., pandas:DataFrame)
    const colonIndex = withoutPrefix.indexOf(':');
    if (colonIndex > 0) {
      return {
        packageName: withoutPrefix.substring(0, colonIndex),
        objectPath: withoutPrefix.substring(colonIndex + 1)
      };
    }

    return { packageName: withoutPrefix };
  }

  /**
   * Ensure virtual environment is available
   */
  private async ensureVenv(): Promise<void> {
    if (this.venvContext) {
      return;
    }

    // Try to get or create venv
    this.venvContext = await this.venvManager.getOrCreateVenv({
      projectRoot: this.projectRoot
    });
  }

  /**
   * Check if a package is installed in the venv
   */
  private async isPackageInstalled(packageName: string): Promise<boolean> {
    if (!this.venvContext) {
      return false;
    }

    const pythonPath = this.venvContext.pythonPath;

    try {
      const result = spawnSync(pythonPath, [
        '-c',
        `import ${packageName.replace('-', '_')}`
      ], {
        timeout: 10000,
        encoding: 'utf8'
      });

      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * List all installed packages in the venv
   */
  private async listInstalledPackages(): Promise<Array<{
    name: string;
    version: string;
    location?: string;
  }>> {
    if (!this.venvContext) {
      return [];
    }

    const pipPath = this.venvContext.pipPath;

    try {
      const result = spawnSync(pipPath, ['list', '--format=json'], {
        timeout: 30000,
        encoding: 'utf8'
      });

      if (result.status !== 0) {
        return [];
      }

      const packages = JSON.parse(result.stdout);
      return packages.map((pkg: any) => ({
        name: pkg.name,
        version: pkg.version,
        location: pkg.location
      }));
    } catch {
      return [];
    }
  }

  /**
   * Generate mlld module content for a Python package
   */
  private async generateModuleContent(
    packageName: string,
    objectPath?: string
  ): Promise<string> {
    if (!this.venvContext) {
      throw new Error('Virtual environment not available');
    }

    const pythonPath = this.venvContext.pythonPath;
    const normalizedName = packageName.replace('-', '_');

    // Generate introspection script
    const introspectScript = objectPath
      ? this.generateObjectIntrospectScript(normalizedName, objectPath)
      : this.generatePackageIntrospectScript(normalizedName);

    try {
      const result = spawnSync(pythonPath, ['-c', introspectScript], {
        timeout: 30000,
        encoding: 'utf8'
      });

      if (result.status !== 0) {
        throw new Error(result.stderr || 'Failed to introspect package');
      }

      const exports = JSON.parse(result.stdout);
      return this.generateMlldModule(packageName, exports, objectPath);
    } catch (error) {
      throw new Error(
        `Failed to introspect Python package '${packageName}': ${(error as Error).message}`
      );
    }
  }

  /**
   * Generate Python script to introspect a package's public API
   */
  private generatePackageIntrospectScript(moduleName: string): string {
    return `
import json
import ${moduleName}

exports = {}
for name in dir(${moduleName}):
    if name.startswith('_'):
        continue
    obj = getattr(${moduleName}, name)
    obj_type = type(obj).__name__

    info = {'type': obj_type}

    if callable(obj):
        info['callable'] = True
        if hasattr(obj, '__doc__') and obj.__doc__:
            info['doc'] = obj.__doc__.split('\\n')[0][:100]

    exports[name] = info

print(json.dumps(exports))
`;
  }

  /**
   * Generate Python script to introspect a specific object
   */
  private generateObjectIntrospectScript(moduleName: string, objectPath: string): string {
    const parts = objectPath.split('.');
    let accessor = moduleName;
    for (const part of parts) {
      accessor += `.${part}`;
    }

    return `
import json
import ${moduleName}

obj = ${accessor}
obj_type = type(obj).__name__

info = {
    'name': '${objectPath}',
    'type': obj_type,
    'callable': callable(obj)
}

if hasattr(obj, '__doc__') and obj.__doc__:
    info['doc'] = obj.__doc__[:500]

if callable(obj):
    import inspect
    try:
        sig = inspect.signature(obj)
        info['signature'] = str(sig)
        info['params'] = [p.name for p in sig.parameters.values()]
    except (ValueError, TypeError):
        pass

print(json.dumps({'${objectPath}': info}))
`;
  }

  /**
   * Generate mlld module content from introspection data
   */
  private generateMlldModule(
    packageName: string,
    exports: Record<string, any>,
    objectPath?: string
  ): string {
    const lines: string[] = [
      `---`,
      `# Python package: ${packageName}${objectPath ? `:${objectPath}` : ''}`,
      `# Auto-generated mlld module for Python interop`,
      `---`,
      ``
    ];

    for (const [name, info] of Object.entries(exports)) {
      if (info.callable) {
        // Generate an executable function wrapper
        lines.push(`/exe ${name}(..args) #[py]`);
        lines.push(`\`\`\`python`);
        lines.push(`import ${packageName.replace('-', '_')}`);
        if (objectPath) {
          lines.push(`result = ${packageName.replace('-', '_')}.${objectPath}(*args)`);
        } else {
          lines.push(`result = ${packageName.replace('-', '_')}.${name}(*args)`);
        }
        lines.push(`print(result)`);
        lines.push(`\`\`\``);
        lines.push(``);
      } else {
        // Generate a variable export
        lines.push(`/var ${name} = @py/${packageName}:${name}`);
        lines.push(``);
      }
    }

    // Add exports
    lines.push(`/export ${Object.keys(exports).join(', ')}`);

    return lines.join('\n');
  }
}

/**
 * Alias resolver for @python/ prefix
 */
export class PythonAliasResolver implements Resolver {
  readonly name = 'python';
  readonly description = 'Alias for Python package resolver (routes to @py/)';
  readonly type: ResolverType = 'input';

  readonly capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: true },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['module', 'data'],
    defaultContentType: 'module',
    priority: 51,
    cache: { strategy: 'persistent' }
  };

  private pyResolver: PythonPackageResolver;

  constructor(options: PythonPackageResolverOptions = {}) {
    this.pyResolver = new PythonPackageResolver(options);
  }

  canResolve(ref: string, config?: any): boolean {
    return ref.startsWith('@python/');
  }

  async resolve(ref: string, options?: ResolverOptions): Promise<ResolverContent> {
    // Rewrite to @py/ and delegate
    const rewritten = ref.replace('@python/', '@py/');
    return this.pyResolver.resolve(rewritten, options);
  }

  async list(prefix: string, config?: any): Promise<ContentInfo[]> {
    return this.pyResolver.list(prefix, config);
  }
}
