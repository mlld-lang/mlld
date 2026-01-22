import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { PythonPackageManagerFactory, type IPythonPackageManager } from './PythonPackageManager';

/**
 * Virtual environment context information
 */
export interface VirtualEnvironmentContext {
  /** Absolute path to the venv directory */
  path: string;
  /** Python version in the venv (e.g., "3.11.0") */
  pythonVersion: string;
  /** Path to site-packages directory */
  sitePackagesPath: string;
  /** Whether this venv is currently active in the environment */
  isActive: boolean;
  /** Path to the Python executable */
  pythonPath: string;
}

/**
 * Options for creating a virtual environment
 */
export interface VenvCreateOptions {
  /** Use uv instead of python -m venv (faster) */
  useUv?: boolean;
  /** Python version to use (e.g., "3.11") */
  pythonVersion?: string;
  /** Force recreation if venv already exists */
  force?: boolean;
}

/**
 * Python configuration from mlld-config.json
 */
export interface PythonConfig {
  /** Path to venv relative to project root (e.g., ".venv") */
  venv?: string;
  /** Preferred package manager ("pip" | "uv" | "auto") */
  manager?: 'pip' | 'uv' | 'auto';
}

/**
 * Manages Python virtual environments for mlld projects.
 * Handles venv creation, detection, and activation context.
 */
export class VirtualEnvironmentManager {
  private projectRoot: string;
  private cachedContext?: VirtualEnvironmentContext;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Get the virtual environment context for this project.
   * Creates one if specified in config and doesn't exist.
   */
  async getOrCreateVenv(config?: PythonConfig): Promise<VirtualEnvironmentContext | undefined> {
    // Check if there's an active venv in the environment
    const activeVenv = await this.getActiveVenv();
    if (activeVenv) {
      return activeVenv;
    }

    // Check for configured venv path
    const venvPath = config?.venv
      ? path.resolve(this.projectRoot, config.venv)
      : path.resolve(this.projectRoot, '.venv');

    // Check if venv exists
    if (await this.venvExists(venvPath)) {
      return this.getVenvContext(venvPath);
    }

    // If config specifies a venv, create it
    if (config?.venv) {
      return this.createVenv(venvPath, {
        useUv: config.manager === 'uv' || config.manager === 'auto'
      });
    }

    return undefined;
  }

  /**
   * Check if a virtual environment is currently active in the shell
   */
  async isVenvActive(): Promise<boolean> {
    return process.env.VIRTUAL_ENV !== undefined;
  }

  /**
   * Get the currently active virtual environment path
   */
  async getActivePath(): Promise<string | undefined> {
    return process.env.VIRTUAL_ENV;
  }

  /**
   * Get context for the currently active virtual environment
   */
  async getActiveVenv(): Promise<VirtualEnvironmentContext | undefined> {
    const activePath = await this.getActivePath();
    if (!activePath) {
      return undefined;
    }

    return this.getVenvContext(activePath);
  }

  /**
   * Check if a virtual environment exists at the given path
   */
  async venvExists(venvPath: string): Promise<boolean> {
    try {
      const pythonPath = this.getPythonPathForVenv(venvPath);
      await fs.promises.access(pythonPath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new virtual environment
   */
  async createVenv(
    venvPath: string,
    options: VenvCreateOptions = {}
  ): Promise<VirtualEnvironmentContext> {
    const resolvedPath = path.resolve(this.projectRoot, venvPath);

    // Check if already exists and not forcing
    if (!options.force && await this.venvExists(resolvedPath)) {
      return this.getVenvContext(resolvedPath);
    }

    // Remove existing if forcing
    if (options.force && fs.existsSync(resolvedPath)) {
      await fs.promises.rm(resolvedPath, { recursive: true, force: true });
    }

    // Try uv first if requested
    if (options.useUv) {
      const uvAvailable = await this.isUvAvailable();
      if (uvAvailable) {
        await this.createVenvWithUv(resolvedPath, options.pythonVersion);
        return this.getVenvContext(resolvedPath);
      }
    }

    // Fall back to python -m venv
    await this.createVenvWithPython(resolvedPath, options.pythonVersion);
    return this.getVenvContext(resolvedPath);
  }

  /**
   * Get the site-packages path for a virtual environment
   */
  async resolveSitePackages(venvPath?: string): Promise<string> {
    const resolvedVenvPath = venvPath
      ? path.resolve(this.projectRoot, venvPath)
      : await this.getActivePath();

    if (!resolvedVenvPath) {
      throw new Error('No virtual environment path specified and no active venv found');
    }

    const context = await this.getVenvContext(resolvedVenvPath);
    return context.sitePackagesPath;
  }

  /**
   * Get the Python executable path for a virtual environment
   */
  getPythonPathForVenv(venvPath: string): string {
    const isWindows = process.platform === 'win32';
    return isWindows
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');
  }

  /**
   * Get full context for a virtual environment
   */
  async getVenvContext(venvPath: string): Promise<VirtualEnvironmentContext> {
    const resolvedPath = path.resolve(venvPath);
    const pythonPath = this.getPythonPathForVenv(resolvedPath);

    // Get Python version
    const pythonVersion = await this.getPythonVersion(pythonPath);

    // Get site-packages path
    const sitePackagesPath = await this.getSitePackagesPath(pythonPath);

    // Check if this venv is currently active
    const activePath = await this.getActivePath();
    const isActive = activePath !== undefined && path.resolve(activePath) === resolvedPath;

    return {
      path: resolvedPath,
      pythonVersion,
      sitePackagesPath,
      isActive,
      pythonPath
    };
  }

  /**
   * Get Python configuration from mlld-config.json
   */
  async getPythonConfig(): Promise<PythonConfig | undefined> {
    const configPath = path.join(this.projectRoot, 'mlld-config.json');

    try {
      const content = await fs.promises.readFile(configPath, 'utf8');
      const config = JSON.parse(content);
      return config.python as PythonConfig | undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get a package manager configured for this project's venv
   */
  async getPackageManager(): Promise<IPythonPackageManager> {
    const config = await this.getPythonConfig();

    if (config?.manager && config.manager !== 'auto') {
      return PythonPackageManagerFactory.getByName(config.manager);
    }

    return PythonPackageManagerFactory.getDefault();
  }

  // Private helpers

  private async isUvAvailable(): Promise<boolean> {
    try {
      execSync('uv --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private async createVenvWithUv(venvPath: string, pythonVersion?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['venv', venvPath];

      if (pythonVersion) {
        args.push('--python', pythonVersion);
      }

      const child = spawn('uv', args, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`uv venv failed: ${stderr}`));
        }
      });

      child.on('error', reject);
    });
  }

  private async createVenvWithPython(venvPath: string, pythonVersion?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const pythonCmd = pythonVersion ? `python${pythonVersion}` : 'python3';
      const args = ['-m', 'venv', venvPath];

      const child = spawn(pythonCmd, args, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`python -m venv failed: ${stderr}`));
        }
      });

      child.on('error', reject);
    });
  }

  private async getPythonVersion(pythonPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(pythonPath, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          // Parse "Python 3.11.0" -> "3.11.0"
          const match = stdout.trim().match(/Python\s+(\S+)/);
          resolve(match ? match[1] : 'unknown');
        } else {
          reject(new Error('Failed to get Python version'));
        }
      });

      child.on('error', reject);
    });
  }

  private async getSitePackagesPath(pythonPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(pythonPath, [
        '-c',
        'import site; print(site.getsitepackages()[0])'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          // Fall back to lib/pythonX.Y/site-packages
          const venvPath = path.dirname(path.dirname(pythonPath));
          resolve(path.join(venvPath, 'lib', 'python3', 'site-packages'));
        }
      });

      child.on('error', reject);
    });
  }
}
