import { vi } from 'vitest';

interface PathMock {
  sep: string;
  delimiter: string;
  normalize: (p: string) => string;
  join: (...paths: string[]) => string;
  isAbsolute: (p: string) => boolean;
  dirname: (p: string) => string;
  relative: (from: string, to: string) => string;
  posix?: PathMock;
  win32?: PathMock;
  [key: string]: any; // Allow dynamic property assignment
}

// Create the core functions first
const coreFunctions = {
  normalize(this: PathMock, p: string) {
    // If the path is undefined, return undefined
    if (!p) return p;

    // If the path starts with a special variable, return it as is
    if (p.startsWith('$HOMEPATH/') || p.startsWith('$~/') || p.startsWith('$PROJECTPATH/') || p.startsWith('$./')) {
      return p;
    }

    // For real paths, normalize them using the platform-specific separator
    return p.split(/[/\\]+/).join(this.sep);
  },

  join(this: PathMock, ...paths: string[]) {
    // Filter out falsy values and empty strings
    const validPaths = paths.filter(p => p && typeof p === 'string');
    
    // If any path starts with a special variable, return it with the rest appended
    for (const p of validPaths) {
      if (p.startsWith('$HOMEPATH/') || p.startsWith('$~/') || p.startsWith('$PROJECTPATH/') || p.startsWith('$./')) {
        const rest = validPaths.slice(validPaths.indexOf(p) + 1);
        return p + (rest.length ? this.sep + rest.join(this.sep) : '');
      }
    }
    
    // Otherwise join normally
    return validPaths.join(this.sep);
  },

  isAbsolute(this: PathMock, p: string) {
    return p.startsWith('/') || /^[A-Z]:/i.test(p);
  },

  dirname(this: PathMock, p: string) {
    const parts = p.split(this.sep);
    return parts.slice(0, -1).join(this.sep) || '.';
  },

  relative(this: PathMock, from: string, to: string) {
    // For special variables, return the path as is
    if (to.startsWith('$')) {
      return to;
    }
    
    // For real paths, calculate relative path
    const fromParts = from.split(this.sep);
    const toParts = to.split(this.sep);
    
    while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
      fromParts.shift();
      toParts.shift();
    }
    
    return [...Array(fromParts.length).fill('..'), ...toParts].join(this.sep);
  }
};

// Create the default mock with platform-specific properties
const defaultMock: PathMock = {
  sep: '/',
  delimiter: ':',
} as PathMock;

// Create platform-specific mocks
const posixMock: PathMock = {
  sep: '/',
  delimiter: ':',
} as PathMock;

const win32Mock: PathMock = {
  sep: '\\',
  delimiter: ';',
} as PathMock;

// Bind and wrap functions for each mock object
[defaultMock, posixMock, win32Mock].forEach(mock => {
  Object.entries(coreFunctions).forEach(([key, fn]) => {
    const boundFn = fn.bind(mock);
    mock[key] = vi.fn(boundFn);
  });
});

// Add platform-specific mocks to default mock
defaultMock.posix = posixMock;
defaultMock.win32 = win32Mock;

// Export the mock creation function
export async function createPathMock() {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    __esModule: true,
    // Spread actual path exports first
    ...actual,
    // Override with our mock implementations
    ...defaultMock,
    // Ensure default export exists and has all properties
    default: {
      ...actual,
      ...defaultMock
    }
  };
}

// Export the mock
export default defaultMock;
export const sep = defaultMock.sep;
export const delimiter = defaultMock.delimiter;
export const normalize = defaultMock.normalize;
export const join = defaultMock.join;
export const isAbsolute = defaultMock.isAbsolute;
export const dirname = defaultMock.dirname;
export const relative = defaultMock.relative;
export const posix = posixMock;
export const win32 = win32Mock; 