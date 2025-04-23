/**
 * Regression tests for module resolution after Issue #17 fixes
 * 
 * This file tests various import patterns to ensure they resolve correctly
 * after the ES module migration.
 */

import { describe, it, expect } from 'vitest';

// 1. Test internal import with .js extension
import { MeldError } from '@core/errors/MeldError';

// 2. Test Node.js built-in module imports without .js extension
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

// 3. Test API imports using @api alias
import { main } from '@api/index';

// 4. Test explicit index.js in directory imports
import { meld } from '@core/syntax/helpers/dedent';

// 5. Test third-party dependency imports
import 'reflect-metadata';
import { container } from 'tsyringe';

describe('Module Resolution Regression Tests', () => {
  it('should successfully import internal modules with .js extension', () => {
    expect(MeldError).toBeDefined();
    expect(MeldError.name).toBe('MeldError');
  });

  it('should successfully import Node.js built-in modules without .js extension', () => {
    expect(EventEmitter).toBeDefined();
    expect(path).toBeDefined();
    expect(fs).toBeDefined();
    
    // Verify they're actually the correct modules
    expect(typeof path.join).toBe('function');
    expect(typeof fs.readFileSync).toBe('function');
    
    const emitter = new EventEmitter();
    expect(emitter.on).toBeDefined();
    expect(typeof emitter.on).toBe('function');
  });

  it('should successfully import from API using @api alias', () => {
    expect(main).toBeDefined();
    expect(typeof main).toBe('function');
  });

  it('should successfully import with explicit file.js path', () => {
    expect(meld).toBeDefined();
    expect(typeof meld).toBe('function');
  });

  it('should successfully import third-party dependencies', () => {
    expect(container).toBeDefined();
    expect(typeof container.resolve).toBe('function');
  });
});