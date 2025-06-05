import { describe, it, expect } from 'vitest';
import { HashUtils } from './HashUtils';

describe('HashUtils', () => {
  const testContent = 'Hello, mlld module system!';
  const expectedHash = 'a6f3ef1c4de0ed5f8f7a6d5e8c9b2a1f3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f';
  const expectedIntegrity = 'sha256-pvPvHE3g7V+Pem1ejJsqHzxNXm96i5wNHi86S1xtfo8=';

  describe('hash', () => {
    it('should generate consistent SHA-256 hash', () => {
      const hash1 = HashUtils.hash(testContent);
      const hash2 = HashUtils.hash(testContent);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = HashUtils.hash('content1');
      const hash2 = HashUtils.hash('content2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty content', () => {
      const hash = HashUtils.hash('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle unicode content', () => {
      const hash = HashUtils.hash('Hello 世界 🌍');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('integrity', () => {
    it('should generate SRI-formatted integrity hash', () => {
      const integrity = HashUtils.integrity(testContent);
      
      expect(integrity).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
      expect(integrity.startsWith('sha256-')).toBe(true);
    });

    it('should generate consistent integrity hashes', () => {
      const integrity1 = HashUtils.integrity(testContent);
      const integrity2 = HashUtils.integrity(testContent);
      
      expect(integrity1).toBe(integrity2);
    });
  });

  describe('verify', () => {
    it('should verify matching content and hash', () => {
      const content = 'test content';
      const hash = HashUtils.hash(content);
      
      expect(HashUtils.verify(content, hash)).toBe(true);
    });

    it('should reject non-matching content and hash', () => {
      const content = 'test content';
      const wrongHash = HashUtils.hash('different content');
      
      expect(HashUtils.verify(content, wrongHash)).toBe(false);
    });
  });

  describe('verifyIntegrity', () => {
    it('should verify matching content and integrity', () => {
      const content = 'test content';
      const integrity = HashUtils.integrity(content);
      
      expect(HashUtils.verifyIntegrity(content, integrity)).toBe(true);
    });

    it('should reject non-matching content and integrity', () => {
      const content = 'test content';
      const wrongIntegrity = HashUtils.integrity('different content');
      
      expect(HashUtils.verifyIntegrity(content, wrongIntegrity)).toBe(false);
    });
  });

  describe('shortHash', () => {
    it('should return first n characters of hash', () => {
      const fullHash = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890';
      
      expect(HashUtils.shortHash(fullHash)).toBe('a1b2c3d4');
      expect(HashUtils.shortHash(fullHash, 4)).toBe('a1b2');
      expect(HashUtils.shortHash(fullHash, 12)).toBe('a1b2c3d4e5f6');
    });
  });

  describe('expandHash', () => {
    const hashes = [
      'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
      'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567891',
      'b2c3d4e5f6789012345678901234567890123456789012345678901234567890'
    ];

    it('should expand unique short hash', () => {
      expect(HashUtils.expandHash('b2c3', hashes)).toBe(hashes[2]);
    });

    it('should return null for non-existent hash', () => {
      expect(HashUtils.expandHash('c3d4', hashes)).toBe(null);
    });

    it('should throw error for ambiguous short hash', () => {
      expect(() => HashUtils.expandHash('a1b2', hashes)).toThrow(/Ambiguous short hash/);
    });
  });

  describe('getCachePathComponents', () => {
    it('should split hash into prefix and rest', () => {
      const hash = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890';
      const { prefix, rest } = HashUtils.getCachePathComponents(hash);
      
      expect(prefix).toBe('a1');
      expect(rest).toBe('b2c3d4e5f6789012345678901234567890123456789012345678901234567890');
      expect(prefix + rest).toBe(hash);
    });
  });

  describe('createModuleContent', () => {
    it('should create module content with hash and metadata', () => {
      const content = 'module content';
      const source = 'https://example.com/module.mld';
      
      const moduleContent = HashUtils.createModuleContent(content, source);
      
      expect(moduleContent.content).toBe(content);
      expect(moduleContent.hash).toBe(HashUtils.hash(content));
      expect(moduleContent.metadata).toBeDefined();
      expect(moduleContent.metadata!.source).toBe(source);
      expect(moduleContent.metadata!.timestamp).toBeInstanceOf(Date);
      expect(moduleContent.metadata!.size).toBe(Buffer.byteLength(content, 'utf8'));
    });
  });

  describe('secureCompare', () => {
    it('should return true for matching hashes', () => {
      const hash = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890';
      expect(HashUtils.secureCompare(hash, hash)).toBe(true);
    });

    it('should return false for different hashes', () => {
      const hash1 = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890';
      const hash2 = 'b1b2c3d4e5f6789012345678901234567890123456789012345678901234567890';
      expect(HashUtils.secureCompare(hash1, hash2)).toBe(false);
    });

    it('should return false for different length strings', () => {
      expect(HashUtils.secureCompare('short', 'longer')).toBe(false);
    });
  });
});