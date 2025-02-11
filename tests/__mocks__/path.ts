import { vi } from 'vitest';

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
}

/**
 * Creates a mock implementation of the Node.js path module.
 * Handles both ESM and CJS module formats and provides platform-specific behavior.
 * 
 * @param options Configuration options for the path mock
 * @returns A mock implementation of the path module
 */
export async function createPathMock(options: PathMockOptions = {}) {
  // Get the original path module to preserve core functionality
  const actualPath = await vi.importActual<typeof import('path')>('path');
  
  const platform = options.platform || process.platform;
  const isWindows = platform === 'win32';

  // Create the default mock with basic properties
  const defaultMock = {
    sep: options.sep || (isWindows ? '\\' : '/'),
    delimiter: options.delimiter || (isWindows ? ';' : ':'),
  };

  // Core path functions that are mostly platform-independent
  const coreFunctions = {
    normalize: function(this: any, p: string) {
      if (typeof p !== 'string') {
        return '';  // Return empty string for non-string input
      }
      // Handle absolute paths
      if (p.startsWith('/')) {
        const normalized = p.replace(/\\/g, '/').replace(/\/+/g, '/');
        return isWindows ? normalized.replace(/\//g, '\\') : normalized;
      }
      // Handle special variables
      if (p.startsWith('$HOMEPATH/') || p.startsWith('$~/') || p.startsWith('$PROJECTPATH/') || p.startsWith('$./')) {
        return p;
      }
      // Handle other paths
      const normalized = p.replace(/\\/g, '/').replace(/\/+/g, '/');
      return isWindows ? normalized.replace(/\//g, '\\') : normalized;
    },
    
    join: function(this: any, ...paths: string[]) {
      const separator = this.sep;
      // Filter out falsy values and empty strings
      const validPaths = paths.filter(p => p && typeof p === 'string');
      
      // If any path starts with a special variable, return it with the rest appended
      for (const p of validPaths) {
        if (p.startsWith('$HOMEPATH/') || p.startsWith('$~/') || p.startsWith('$PROJECTPATH/') || p.startsWith('$./')) {
          const rest = validPaths.slice(validPaths.indexOf(p) + 1);
          return p + (rest.length ? separator + rest.join(separator) : '');
        }
      }
      
      // Otherwise join normally
      return validPaths.join(separator);
    },
    
    resolve: function(this: any, ...paths: string[]) {
      const separator = this.sep;
      return paths.filter(p => p).join(separator);
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
  };

  // Bind core functions to defaultMock and wrap in vi.fn()
  Object.entries(coreFunctions).forEach(([key, fn]) => {
    const boundFn = fn.bind(defaultMock);
    defaultMock[key] = vi.fn(boundFn);
  });

  // Create posix mock with bound functions
  const posixMock = {
    ...actualPath.posix,
    sep: '/',
    delimiter: ':',
  };
  Object.entries(coreFunctions).forEach(([key, fn]) => {
    const boundFn = fn.bind(posixMock);
    posixMock[key] = vi.fn(boundFn);
  });

  // Create win32 mock with bound functions
  const win32Mock = {
    ...actualPath.win32,
    sep: '\\',
    delimiter: ';',
  };
  Object.entries(coreFunctions).forEach(([key, fn]) => {
    const boundFn = fn.bind(win32Mock);
    win32Mock[key] = vi.fn(boundFn);
  });

  // Add platform-specific mocks to default mock
  Object.assign(defaultMock, {
    posix: posixMock,
    win32: win32Mock,
  });

  // Return the mock with proper ESM/CJS compatibility
  return {
    __esModule: true,
    default: defaultMock,
    ...defaultMock,
  };
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
    Object.values(mock)
      .filter(value => typeof value === 'function' && 'mockReset' in value)
      .forEach(fn => (fn as any).mockReset());
  },
};

// Export a default instance for direct imports, using the current platform
export default await createPathMock();