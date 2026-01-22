import { describe, it, expect, beforeAll } from 'vitest';
import {
  PipPackageManager,
  UvPackageManager,
  PythonPackageManagerFactory
} from './PythonPackageManager';

describe('PythonPackageManager', () => {
  describe('PipPackageManager', () => {
    const pip = new PipPackageManager();

    it('should have name "pip"', () => {
      expect(pip.name).toBe('pip');
    });

    it('should check availability', async () => {
      const available = await pip.isAvailable();
      // pip should be available on most systems with Python
      expect(typeof available).toBe('boolean');
    });

    it('should list packages', async () => {
      const available = await pip.isAvailable();
      if (!available) {
        return; // Skip if pip not available
      }

      const packages = await pip.list();
      expect(Array.isArray(packages)).toBe(true);
      // pip itself should be listed
      const hasPip = packages.some(p => p.name.toLowerCase() === 'pip');
      expect(hasPip).toBe(true);
    });

    it('should check if a standard library package is NOT available via pip', async () => {
      const available = await pip.isAvailable();
      if (!available) {
        return;
      }

      // 'os' is a stdlib module, not a pip package
      const hasOs = await pip.checkAvailable('os');
      expect(hasOs).toBe(false);
    });
  });

  describe('UvPackageManager', () => {
    const uv = new UvPackageManager();

    it('should have name "uv"', () => {
      expect(uv.name).toBe('uv');
    });

    it('should check availability', async () => {
      const available = await uv.isAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should list packages if available', async () => {
      const available = await uv.isAvailable();
      if (!available) {
        return; // Skip if uv not available
      }

      const packages = await uv.list();
      expect(Array.isArray(packages)).toBe(true);
    });
  });

  describe('PythonPackageManagerFactory', () => {
    beforeAll(() => {
      PythonPackageManagerFactory.reset();
    });

    it('should get pip by name', () => {
      const pip = PythonPackageManagerFactory.getByName('pip');
      expect(pip.name).toBe('pip');
    });

    it('should get uv by name', () => {
      const uv = PythonPackageManagerFactory.getByName('uv');
      expect(uv.name).toBe('uv');
    });

    it('should return same instance for repeated calls', () => {
      PythonPackageManagerFactory.reset();
      const pip1 = PythonPackageManagerFactory.getByName('pip');
      const pip2 = PythonPackageManagerFactory.getByName('pip');
      expect(pip1).toBe(pip2);
    });

    it('should auto-detect a package manager', async () => {
      PythonPackageManagerFactory.reset();
      const manager = await PythonPackageManagerFactory.getDefault();
      expect(manager.name === 'pip' || manager.name === 'uv').toBe(true);
    });

    it('should cache detected manager', async () => {
      PythonPackageManagerFactory.reset();
      const manager1 = await PythonPackageManagerFactory.getDefault();
      const manager2 = await PythonPackageManagerFactory.getDefault();
      expect(manager1).toBe(manager2);
    });
  });
});
