import * as crypto from 'crypto';

/**
 * Interface for module content with hash information
 */
export interface ModuleContent {
  content: string;
  hash: string;
  metadata?: {
    source: string;
    timestamp: Date;
    size: number;
  };
}

/**
 * Hash utilities for content-addressed module storage
 */
export class HashUtils {
  /**
   * Generate SHA-256 hash of content
   * @param content - The content to hash
   * @returns 64-character hex string hash
   */
  static hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate SRI-style integrity hash (sha256-base64)
   * @param content - The content to hash
   * @returns SRI-formatted integrity string
   */
  static integrity(content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('base64');
    return `sha256-${hash}`;
  }

  /**
   * Verify content against a hash
   * @param content - The content to verify
   * @param expectedHash - The expected SHA-256 hash (hex)
   * @returns true if content matches hash
   */
  static verify(content: string, expectedHash: string): boolean {
    const actualHash = this.hash(content);
    return actualHash === expectedHash;
  }

  /**
   * Verify content against SRI integrity string
   * @param content - The content to verify
   * @param integrity - The SRI integrity string (e.g., "sha256-...")
   * @returns true if content matches integrity
   */
  static verifyIntegrity(content: string, integrity: string): boolean {
    const actualIntegrity = this.integrity(content);
    return actualIntegrity === integrity;
  }

  /**
   * Get short hash (first n characters)
   * @param fullHash - The full 64-character hash
   * @param length - Number of characters (default 8)
   * @returns Short hash string
   */
  static shortHash(fullHash: string, length: number = 8): string {
    return fullHash.substring(0, length);
  }

  /**
   * Expand short hash to full hash by searching cache
   * @param shortHash - The short hash to expand
   * @param availableHashes - List of full hashes to search
   * @returns Full hash if unique match found, null otherwise
   */
  static expandHash(shortHash: string, availableHashes: string[]): string | null {
    const matches = availableHashes.filter(hash => hash.startsWith(shortHash));
    
    if (matches.length === 1) {
      return matches[0];
    } else if (matches.length === 0) {
      return null;
    } else {
      // Multiple matches - ambiguous
      throw new Error(`Ambiguous short hash '${shortHash}' matches ${matches.length} hashes`);
    }
  }

  /**
   * Get cache directory path for a hash
   * Uses first 2 characters as subdirectory for better filesystem performance
   * @param hash - The full hash
   * @returns Path components [prefix, rest] for directory structure
   */
  static getCachePathComponents(hash: string): { prefix: string; rest: string } {
    return {
      prefix: hash.substring(0, 2),
      rest: hash.substring(2)
    };
  }

  /**
   * Create module content object with hash
   * @param content - The module content
   * @param source - The source URL/path
   * @returns ModuleContent object
   */
  static createModuleContent(content: string, source: string): ModuleContent {
    return {
      content,
      hash: this.hash(content),
      metadata: {
        source,
        timestamp: new Date(),
        size: Buffer.byteLength(content, 'utf8')
      }
    };
  }

  /**
   * Compare two hashes in constant time to prevent timing attacks
   * @param hash1 - First hash
   * @param hash2 - Second hash
   * @returns true if hashes match
   */
  static secureCompare(hash1: string, hash2: string): boolean {
    if (hash1.length !== hash2.length) {
      return false;
    }
    
    const buffer1 = Buffer.from(hash1);
    const buffer2 = Buffer.from(hash2);
    
    return crypto.timingSafeEqual(buffer1, buffer2);
  }
}