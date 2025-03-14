import { vi } from 'vitest';
import type { PlatformPath } from 'path';
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';

/**
 * Path mock configuration options
 */
export interface PathMockOptions {
  /** Platform to simulate ('win32' | 'posix') */
  platform?: NodeJS.Platform;
  /** Custom path separator */
  sep?: string;
  /** Custom path delimiter */
  delimiter?: string;
  /** Test root directory */
  testRoot?: string;
  /** Test home directory */
  testHome?: string;
  /** Test project directory */
  testProject?: string;
}

let testRoot = '/Users/adam/dev/meld/test/_tmp';
let testHome = '/Users/adam/dev/meld/test/_tmp/home';
let testProject = '/Users/adam/dev/meld/test/_tmp/project';

type PathSeparator = '/' | '\\';

interface PathMock {
  [key: string]: any;
  sep: PathSeparator;
  delimiter: string;
  normalize: (path: string) => string;
  join: (...paths: string[]) => string;
  resolve: (...paths: string[]) => string;
  dirname: (path: string) => string;
  basename: (path: string) => string;
  extname: (path: string) => string;
  isAbsolute: (path: string) => boolean;
  relative: (from: string, to: string) => string;
  parse: (path: string) => { root: string; dir: string; base: string; ext: string; name: string };
  format: (pathObject: { root?: string; dir?: string; base?: string; ext?: string; name?: string }) => string;
  toNamespacedPath: (path: string) => string;
  matchesGlob: (path: string, pattern: string) => boolean;
  posix: PathMock;
  win32: PathMock;
}

/**
 * Injectable path mock service for DI compatibility
 */
@injectable()
@Service('MockPathService for testing')
export class MockPathService {
  private options: PathMockOptions;
  private mockInstance: PathMock | null = null;
  
  constructor(options: PathMockOptions = {}) {
    this.options = options;
  }
  
  /**
   * Initialize the mock path service
   */
  async initialize(): Promise<PathMock> {
    if (!this.mockInstance) {
      this.mockInstance = await createPathMock(this.options);
    }
    return this.mockInstance;
  }
  
  /**
   * Get the mock instance
   */
  getMock(): PathMock {
    if (!this.mockInstance) {
      throw new Error('MockPathService not initialized');
    }
    return this.mockInstance;
  }
  
  /**
   * Reset the mock instance
   */
  async reset(): Promise<void> {
    this.mockInstance = await createPathMock(this.options);
  }
  
  /**
   * Create a Windows-specific path mock
   */
  async createWindowsMock(): Promise<PathMock> {
    return createPathMock({ ...this.options, platform: 'win32' });
  }
  
  /**
   * Create a POSIX-specific path mock
   */
  async createPosixMock(): Promise<PathMock> {
    return createPathMock({ ...this.options, platform: 'darwin' });
  }
}

/**
 * Creates a mock implementation of the Node.js path module.
 * Handles both ESM and CJS module formats and provides platform-specific behavior.
 * 
 * @param options Configuration options for the path mock
 * @returns A mock implementation of the path module
 */
export async function createPathMock(options: PathMockOptions = {}): Promise<PathMock> {
  // Get the original path module to preserve core functionality
  const actualPath = await vi.importActual<typeof import('path')>('path');
  
  const platform = options.platform || process.platform;
  const isWindows = platform === 'win32';

  // Set test directories
  testRoot = options.testRoot || '/Users/adam/dev/meld/test/_tmp';
  testHome = options.testHome || '/Users/adam/dev/meld/test/_tmp/home';
  testProject = options.testProject || '/Users/adam/dev/meld/test/_tmp/project';

  // Core path functions that are mostly platform-independent
  const coreFunctions = {
    normalize: function(this: any, p: string) {
      if (typeof p !== 'string') {
        return '';  // Return empty string for non-string input
      }

      // Resolve special variables
      if (p.startsWith('$HOMEPATH/')) {
        p = p.replace('$HOMEPATH/', testHome + '/');
      } else if (p.startsWith('$~/')) {
        p = p.replace('$~/', testHome + '/');
      } else if (p.startsWith('$PROJECTPATH/')) {
        p = p.replace('$PROJECTPATH/', testProject + '/');
      } else if (p.startsWith('$./')) {
        p = p.replace('$./', testProject + '/');
      }

      // Handle absolute paths
      if (p.startsWith('/')) {
        const normalized = p.replace(/\\/g, '/').replace(/\/+/g, '/');
        return isWindows ? normalized.replace(/\//g, '\\') : normalized;
      }

      // Handle other paths
      const normalized = p.replace(/\\/g, '/').replace(/\/+/g, '/');
      return isWindows ? normalized.replace(/\//g, '\\') : normalized;
    },
    
    join: function(this: any, ...paths: string[]) {
      const separator = this.sep;
      // Filter out falsy values and empty strings
      const validPaths = paths.filter(p => p && typeof p === 'string');
      
      // If any path starts with a special variable, resolve it first
      const resolvedPaths = validPaths.map(p => {
        if (p.startsWith('$HOMEPATH/')) {
          return p.replace('$HOMEPATH/', testHome + '/');
        } else if (p.startsWith('$~/')) {
          return p.replace('$~/', testHome + '/');
        } else if (p.startsWith('$PROJECTPATH/')) {
          return p.replace('$PROJECTPATH/', testProject + '/');
        } else if (p.startsWith('$./')) {
          return p.replace('$./', testProject + '/');
        }
        return p;
      });
      
      // Join paths
      return resolvedPaths.join(separator);
    },
    
    resolve: function(this: any, ...paths: string[]) {
      const separator = this.sep;
      const resolvedPaths = paths.filter(p => p).map(p => {
        if (p.startsWith('$HOMEPATH/')) {
          return p.replace('$HOMEPATH/', testHome + '/');
        } else if (p.startsWith('$~/')) {
          return p.replace('$~/', testHome + '/');
        } else if (p.startsWith('$PROJECTPATH/')) {
          return p.replace('$PROJECTPATH/', testProject + '/');
        } else if (p.startsWith('$./')) {
          return p.replace('$./', testProject + '/');
        }
        return p;
      });
      return resolvedPaths.join(separator);
    },
    
    dirname: function(this: any, p: string) {
      const separator = this.sep;
      const normalized = isWindows ? p.replace(/\//g, '\\') : p.replace(/\\/g, '/');
      const parts = normalized.split(separator);
      return parts.slice(0, -1).join(separator) || separator;
    },
    
    basename: function(this: any, p: string) {
      const separator = this.sep;
      const normalized = isWindows ? p.replace(/\//g, '\\') : p.replace(/\\/g, '/');
      return normalized.split(separator).pop() || '';
    },
    
    extname: function(this: any, p: string) {
      const base = p.split(this.sep).pop() || '';
      return base.includes('.') ? '.' + base.split('.').pop() : '';
    },
    
    isAbsolute: function(this: any, p: string) {
      if (typeof p !== 'string') {
        return false;
      }
      // Handle special variables as absolute paths
      if (p.startsWith('$HOMEPATH/') || p.startsWith('$~/') || p.startsWith('$PROJECTPATH/') || p.startsWith('$./')) {
        return true;
      }
      if (isWindows) {
        return /^([A-Z]:|\\)/i.test(p);
      }
      return p.startsWith('/');
    },
    
    relative: function(this: any, from: string, to: string) {
      const separator = this.sep;
      const fromParts = from.split(separator).filter(Boolean);
      const toParts = to.split(separator).filter(Boolean);
      let i = 0;
      while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
        i++;
      }
      const upCount = fromParts.length - i;
      const downParts = toParts.slice(i);
      return [...Array(upCount).fill('..'), ...downParts].join(separator);
    },
    
    parse: function(this: any, p: string) {
      const separator = this.sep;
      const normalized = isWindows ? p.replace(/\//g, '\\') : p.replace(/\\/g, '/');
      const parts = normalized.split(separator);
      const base = parts.pop() || '';
      return {
        root: isWindows ? (p.match(/^[A-Z]:/i)?.[0] || '') : '/',
        dir: parts.join(separator),
        base,
        ext: base.includes('.') ? '.' + base.split('.').pop() : '',
        name: base.split('.')[0]
      };
    },
    
    format: function(this: any, pathObject: any) {
      const separator = this.sep;
      const dir = pathObject.dir || '';
      const base = pathObject.base || '';
      return dir ? `${dir}${separator}${base}` : base;
    },

    toNamespacedPath: function(this: any, p: string) {
      return p;
    },

    matchesGlob: function(this: any, p: string, pattern: string) {
      return true;
    }
  };

  // Create the default mock with basic properties
  const defaultMock: PathMock = {
    sep: (options.sep || (isWindows ? '\\' : '/')) as PathSeparator,
    delimiter: options.delimiter || (isWindows ? ';' : ':'),
    ...coreFunctions,
    join: function(...paths: string[]) {
      return paths.join(defaultMock.sep);
    },
    resolve: function(...paths: string[]) {
      return paths.join(defaultMock.sep);
    }
  } as PathMock;

  // Bind core functions to defaultMock and wrap in vi.fn()
  Object.entries(coreFunctions).forEach(([key, fn]) => {
    const boundFn = fn.bind(defaultMock);
    defaultMock[key] = vi.fn(boundFn);
  });

  // Create posix mock with bound functions
  const posixMock: PathMock = {
    ...actualPath.posix,
    sep: '/' as PathSeparator,
    delimiter: ':',
    ...coreFunctions
  } as PathMock;
  Object.entries(coreFunctions).forEach(([key, fn]) => {
    const boundFn = fn.bind(posixMock);
    posixMock[key] = vi.fn(boundFn);
  });

  // Create win32 mock with bound functions
  const win32Mock: PathMock = {
    ...actualPath.win32,
    sep: '\\' as PathSeparator,
    delimiter: ';',
    ...coreFunctions
  } as PathMock;
  Object.entries(coreFunctions).forEach(([key, fn]) => {
    const boundFn = fn.bind(win32Mock);
    win32Mock[key] = vi.fn(boundFn);
  });

  // Add platform-specific mocks to default mock
  defaultMock.posix = posixMock;
  defaultMock.win32 = win32Mock;

  // Return both named exports and default export
  return defaultMock;
}

/**
 * Test utilities for working with path mocks
 */
export const pathTestUtils = {
  /**
   * Creates a Windows-specific path mock
   */
  createWindowsMock: () => createPathMock({ platform: 'win32' }),

  /**
   * Creates a POSIX-specific path mock
   */
  createPosixMock: () => createPathMock({ platform: 'darwin' }),

  /**
   * Creates a path mock with custom separator
   */
  createWithSeparator: (sep: string) => createPathMock({ sep }),

  /**
   * Resets all mock function call histories
   */
  resetMocks: (mock: any) => {
    Object.assign(mock, createPathMock());
  },
  
  /**
   * Creates a DI-compatible MockPathService
   */
  createMockPathService: (options: PathMockOptions = {}) => {
    return new MockPathService(options);
  }
};

// Export a default instance for direct imports, using the current platform
export default await createPathMock();