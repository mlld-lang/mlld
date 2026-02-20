import { execSync, spawn } from 'child_process';

/**
 * Python package information
 */
export interface PythonPackage {
  name: string;
  version: string;
  location?: string;
}

/**
 * Python package installation result
 */
export interface PythonInstallResult {
  package: string;
  version?: string;
  status: 'installed' | 'already-installed' | 'failed';
  error?: Error;
  location?: string;
}

/**
 * Python package resolution result
 */
export interface PythonVersionResolution {
  name: string;
  version: string;
  requires?: string[];
}

/**
 * Options for Python package manager operations
 */
export interface PythonPackageOptions {
  venvPath?: string;
  timeout?: number;
  cwd?: string;
}

/**
 * Abstract interface for Python package management.
 * Supports both pip and uv as underlying package managers.
 */
export interface IPythonPackageManager {
  /**
   * Name of the package manager (e.g., 'pip', 'uv')
   */
  readonly name: string;

  /**
   * Check if this package manager is available on the system
   */
  isAvailable(): Promise<boolean>;

  /**
   * Install a package
   * @param spec Package specifier (e.g., 'requests', 'numpy>=2.0')
   * @param options Installation options
   */
  install(spec: string, options?: PythonPackageOptions): Promise<PythonInstallResult>;

  /**
   * List installed packages
   * @param options Query options
   */
  list(options?: PythonPackageOptions): Promise<PythonPackage[]>;

  /**
   * Check if a package is available/installed
   * @param name Package name
   * @param options Query options
   */
  checkAvailable(name: string, options?: PythonPackageOptions): Promise<boolean>;

  /**
   * Get dependencies for a package
   * @param name Package name
   * @param options Query options
   */
  getDependencies(name: string, options?: PythonPackageOptions): Promise<Record<string, string>>;

  /**
   * Resolve version for a package specifier
   * @param spec Package specifier
   * @param options Query options
   */
  resolveVersion(spec: string, options?: PythonPackageOptions): Promise<PythonVersionResolution>;
}

/**
 * Base implementation with common functionality
 */
abstract class BasePythonPackageManager implements IPythonPackageManager {
  abstract readonly name: string;

  abstract isAvailable(): Promise<boolean>;
  abstract install(spec: string, options?: PythonPackageOptions): Promise<PythonInstallResult>;
  abstract list(options?: PythonPackageOptions): Promise<PythonPackage[]>;
  abstract resolveVersion(spec: string, options?: PythonPackageOptions): Promise<PythonVersionResolution>;

  async checkAvailable(name: string, options?: PythonPackageOptions): Promise<boolean> {
    try {
      const packages = await this.list(options);
      return packages.some(pkg => pkg.name.toLowerCase() === name.toLowerCase());
    } catch {
      return false;
    }
  }

  async getDependencies(name: string, options?: PythonPackageOptions): Promise<Record<string, string>> {
    try {
      const resolution = await this.resolveVersion(name, options);
      const deps: Record<string, string> = {};
      if (resolution.requires) {
        for (const req of resolution.requires) {
          // Parse requirement spec like "requests>=2.0,<3.0"
          const match = req.match(/^([a-zA-Z0-9_-]+)(.*)$/);
          if (match) {
            deps[match[1]] = match[2] || '*';
          }
        }
      }
      return deps;
    } catch {
      return {};
    }
  }

  /**
   * Get Python executable path for a venv
   */
  protected getPythonPath(options?: PythonPackageOptions): string {
    if (options?.venvPath) {
      // Platform-specific venv Python path
      const isWindows = process.platform === 'win32';
      return isWindows
        ? `${options.venvPath}\\Scripts\\python.exe`
        : `${options.venvPath}/bin/python`;
    }
    return 'python3';
  }

  /**
   * Execute a command and return stdout
   */
  protected async execCommand(
    command: string,
    args: string[],
    options?: PythonPackageOptions
  ): Promise<string> {
    const timeout = options?.timeout ?? 60000;
    const cwd = options?.cwd;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, {
        cwd,
        shell: true,
        timeout
      });

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        reject(err);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });
    });
  }
}

/**
 * pip-based package manager implementation
 */
export class PipPackageManager extends BasePythonPackageManager {
  readonly name = 'pip';

  async isAvailable(): Promise<boolean> {
    try {
      execSync('python3 -m pip --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async install(spec: string, options?: PythonPackageOptions): Promise<PythonInstallResult> {
    const pythonPath = this.getPythonPath(options);

    try {
      const result = await this.execCommand(
        pythonPath,
        ['-m', 'pip', 'install', '--quiet', spec],
        options
      );

      // Try to extract version from pip output or check installed version
      const packages = await this.list(options);
      const pkgName = spec.split(/[<>=!@\[]/)[0];
      const installed = packages.find(p => p.name.toLowerCase() === pkgName.toLowerCase());

      return {
        package: pkgName,
        version: installed?.version,
        status: 'installed',
        location: installed?.location
      };
    } catch (error) {
      // Check if already installed
      const pkgName = spec.split(/[<>=!@\[]/)[0];
      const isInstalled = await this.checkAvailable(pkgName, options);
      if (isInstalled) {
        const packages = await this.list(options);
        const installed = packages.find(p => p.name.toLowerCase() === pkgName.toLowerCase());
        return {
          package: pkgName,
          version: installed?.version,
          status: 'already-installed',
          location: installed?.location
        };
      }

      return {
        package: pkgName,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  async list(options?: PythonPackageOptions): Promise<PythonPackage[]> {
    const pythonPath = this.getPythonPath(options);

    try {
      const output = await this.execCommand(
        pythonPath,
        ['-m', 'pip', 'list', '--format=json'],
        options
      );

      const packages: Array<{ name: string; version: string }> = JSON.parse(output);
      return packages.map(pkg => ({
        name: pkg.name,
        version: pkg.version
      }));
    } catch {
      return [];
    }
  }

  async resolveVersion(spec: string, options?: PythonPackageOptions): Promise<PythonVersionResolution> {
    const pythonPath = this.getPythonPath(options);
    const pkgName = spec.split(/[<>=!@\[]/)[0];

    try {
      // Use pip show to get package info
      const output = await this.execCommand(
        pythonPath,
        ['-m', 'pip', 'show', pkgName],
        options
      );

      // Parse pip show output
      const lines = output.split('\n');
      let version = '';
      let requires: string[] = [];

      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();

        if (key === 'Version') {
          version = value;
        } else if (key === 'Requires') {
          requires = value ? value.split(',').map(r => r.trim()).filter(Boolean) : [];
        }
      }

      return {
        name: pkgName,
        version,
        requires
      };
    } catch (error) {
      throw new Error(`Failed to resolve version for ${spec}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * uv-based package manager implementation
 * uv is a fast Python package installer written in Rust
 */
export class UvPackageManager extends BasePythonPackageManager {
  readonly name = 'uv';

  async isAvailable(): Promise<boolean> {
    try {
      execSync('uv --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async install(spec: string, options?: PythonPackageOptions): Promise<PythonInstallResult> {
    const pkgName = spec.split(/[<>=!@\[]/)[0];

    try {
      const args = ['pip', 'install', spec];

      // Add venv targeting if specified
      if (options?.venvPath) {
        args.push('--python', this.getPythonPath(options));
      }

      await this.execCommand('uv', args, options);

      // Get installed version
      const packages = await this.list(options);
      const installed = packages.find(p => p.name.toLowerCase() === pkgName.toLowerCase());

      return {
        package: pkgName,
        version: installed?.version,
        status: 'installed',
        location: installed?.location
      };
    } catch (error) {
      // Check if already installed
      const isInstalled = await this.checkAvailable(pkgName, options);
      if (isInstalled) {
        const packages = await this.list(options);
        const installed = packages.find(p => p.name.toLowerCase() === pkgName.toLowerCase());
        return {
          package: pkgName,
          version: installed?.version,
          status: 'already-installed',
          location: installed?.location
        };
      }

      return {
        package: pkgName,
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  async list(options?: PythonPackageOptions): Promise<PythonPackage[]> {
    try {
      const args = ['pip', 'list', '--format=json'];

      if (options?.venvPath) {
        args.push('--python', this.getPythonPath(options));
      }

      const output = await this.execCommand('uv', args, options);
      const packages: Array<{ name: string; version: string }> = JSON.parse(output);
      return packages.map(pkg => ({
        name: pkg.name,
        version: pkg.version
      }));
    } catch {
      return [];
    }
  }

  async resolveVersion(spec: string, options?: PythonPackageOptions): Promise<PythonVersionResolution> {
    const pkgName = spec.split(/[<>=!@\[]/)[0];

    try {
      const args = ['pip', 'show', pkgName];

      if (options?.venvPath) {
        args.push('--python', this.getPythonPath(options));
      }

      const output = await this.execCommand('uv', args, options);

      // Parse uv pip show output (same format as pip)
      const lines = output.split('\n');
      let version = '';
      let requires: string[] = [];

      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();

        if (key === 'Version') {
          version = value;
        } else if (key === 'Requires') {
          requires = value ? value.split(',').map(r => r.trim()).filter(Boolean) : [];
        }
      }

      return {
        name: pkgName,
        version,
        requires
      };
    } catch (error) {
      throw new Error(`Failed to resolve version for ${spec}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Factory to get the appropriate package manager.
 * Prefers uv if available, falls back to pip.
 */
export class PythonPackageManagerFactory {
  private static uvManager?: UvPackageManager;
  private static pipManager?: PipPackageManager;
  private static detectedManager?: IPythonPackageManager;
  private static detectionPromise?: Promise<IPythonPackageManager>;

  /**
   * Get a package manager instance by name
   */
  static getByName(name: 'pip' | 'uv'): IPythonPackageManager {
    if (name === 'uv') {
      if (!this.uvManager) {
        this.uvManager = new UvPackageManager();
      }
      return this.uvManager;
    }

    if (!this.pipManager) {
      this.pipManager = new PipPackageManager();
    }
    return this.pipManager;
  }

  /**
   * Auto-detect and return the best available package manager.
   * Prefers uv for speed, falls back to pip.
   */
  static async getDefault(): Promise<IPythonPackageManager> {
    if (this.detectedManager) {
      return this.detectedManager;
    }

    // Avoid multiple concurrent detections
    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    this.detectionPromise = this.detect();
    this.detectedManager = await this.detectionPromise;
    return this.detectedManager;
  }

  private static async detect(): Promise<IPythonPackageManager> {
    // Try uv first (faster)
    const uv = this.getByName('uv');
    if (await uv.isAvailable()) {
      return uv;
    }

    // Fall back to pip
    const pip = this.getByName('pip');
    if (await pip.isAvailable()) {
      return pip;
    }

    throw new Error('No Python package manager available. Please install pip or uv.');
  }

  /**
   * Clear cached manager instances (useful for testing)
   */
  static reset(): void {
    this.uvManager = undefined;
    this.pipManager = undefined;
    this.detectedManager = undefined;
    this.detectionPromise = undefined;
  }
}
