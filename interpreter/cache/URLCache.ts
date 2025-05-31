import { Cache } from '@core/registry/Cache';
import { LockFile } from '@core/registry/LockFile';
import type { TTLOption, TrustLevel, SecurityOptions } from '@core/types/primitives';

export interface URLCacheEntry {
  url: string;
  hash: string;
  cachedAt: string;
  ttl: TTLOption;
  trust: TrustLevel;
  configuredBy: string; // Which variable configured this
  expiresAt: string;
}

export interface URLCacheMetadata {
  source: string;
  ttl: TTLOption;
  trust: TrustLevel;
  configuredBy: string;
}

export class URLCache {
  private lockFile: LockFile;
  private contentCache: Cache;

  constructor(
    contentCache: Cache,
    lockFile: LockFile
  ) {
    this.contentCache = contentCache;
    this.lockFile = lockFile;
  }

  /**
   * Check if a URL/path should be cached (remote only)
   */
  private shouldCache(url: string): boolean {
    // Don't cache local file paths
    if (this.isLocalPath(url)) {
      return false;
    }

    // Don't cache localhost URLs
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return false;
    }

    // Cache all other URLs
    return true;
  }

  /**
   * Check if a path is a local file path
   */
  private isLocalPath(path: string): boolean {
    // Explicit local path patterns
    if (path.startsWith('./') ||
        path.startsWith('../') ||
        path.startsWith('/') ||
        path.startsWith('~/') ||
        path.startsWith('file://')) {
      return true;
    }
    
    // Try parsing as URL - if it fails, it's likely a relative local path
    try {
      new URL(path);
      return false; // Successfully parsed as URL, not a local path
    } catch {
      // Failed to parse as URL, likely a relative path like "lib/file.txt"
      return true;
    }
  }

  /**
   * Fetch URL content with caching based on security options
   */
  async fetchURL(
    url: string, 
    security?: SecurityOptions, 
    configuredBy: string = 'unknown'
  ): Promise<string> {
    const ttl = security?.ttl || this.getDefaultTTL();
    const trust = security?.trust || 'verify';

    // Check if we should cache this URL
    if (!this.shouldCache(url)) {
      // For local paths, just fetch without caching or trust validation
      // Local paths are inherently trusted as they're under user control
      return this.fetchFresh(url);
    }

    // Check trust level for remote URLs only
    await this.checkTrust(url, trust);

    // Check cache
    const cached = await this.checkCache(url, ttl);
    if (cached) {
      return cached;
    }

    // Fetch fresh content
    const content = await this.fetchFresh(url);

    // Cache the content
    await this.cacheContent(url, content, ttl, trust, configuredBy);

    return content;
  }

  /**
   * Check if cached content is still valid
   */
  private async checkCache(url: string, ttl: TTLOption): Promise<string | null> {
    const entry = await this.getCacheEntry(url);
    if (!entry) {
      return null;
    }

    // Check if cache has expired
    if (this.isCacheExpired(entry, ttl)) {
      // Clean up expired cache
      await this.invalidateCache(url);
      return null;
    }

    // Try to get content from cache
    try {
      const content = await this.contentCache.get(entry.hash);
      return content;
    } catch (error) {
      // Cache corrupted, remove entry
      await this.invalidateCache(url);
      return null;
    }
  }

  /**
   * Fetch fresh content from URL or local path
   */
  private async fetchFresh(url: string): Promise<string> {
    // Handle local file paths
    if (this.isLocalPath(url)) {
      throw new Error(`URLCache should not be used for local file paths: ${url}. Use Environment.readFile() instead.`);
    }
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
  }

  /**
   * Cache content with metadata
   */
  private async cacheContent(
    url: string,
    content: string,
    ttl: TTLOption,
    trust: TrustLevel,
    configuredBy: string
  ): Promise<void> {
    // Store content in cache and get hash
    const hash = await this.contentCache.set(content, {
      source: url,
      cachedAt: new Date().toISOString(),
      ttl: ttl,
      trust: trust
    });

    // Update lock file with cache entry
    await this.updateLockFile(url, hash, ttl, trust, configuredBy);
  }

  /**
   * Check trust level and throw if not allowed
   */
  private async checkTrust(url: string, trust: TrustLevel): Promise<void> {
    switch (trust) {
      case 'never':
        throw new Error(`URL access denied by trust policy: ${url}`);
      
      case 'verify':
        // For now, just verify it's HTTPS
        if (!url.startsWith('https://')) {
          throw new Error(`Insecure URL not allowed with trust verify: ${url}`);
        }
        break;
      
      case 'always':
        // Always allow
        break;
      
      default:
        throw new Error(`Unknown trust level: ${trust}`);
    }
  }

  /**
   * Get cache entry from lock file
   */
  private async getCacheEntry(url: string): Promise<URLCacheEntry | null> {
    try {
      // Check if lock file has URL cache section
      const lockData = (this.lockFile as any).data;
      if (!lockData.cache?.urls?.[url]) {
        return null;
      }

      return lockData.cache.urls[url];
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if cache entry has expired
   */
  private isCacheExpired(entry: URLCacheEntry, currentTTL: TTLOption): boolean {
    // If TTL is 'live', always fetch fresh
    if (currentTTL.type === 'special' && currentTTL.value === 0) {
      return true;
    }

    // If TTL is 'static', never expire
    if (currentTTL.type === 'special' && currentTTL.value === -1) {
      return false;
    }

    // Calculate expiration based on cached time and TTL
    const cachedAt = new Date(entry.cachedAt);
    const ttlSeconds = this.getTTLSeconds(currentTTL);
    const expiresAt = new Date(cachedAt.getTime() + (ttlSeconds * 1000));
    
    return new Date() > expiresAt;
  }

  /**
   * Convert TTL option to seconds
   */
  private getTTLSeconds(ttl: TTLOption): number {
    if (ttl.seconds !== undefined) {
      return ttl.seconds;
    }

    if (ttl.type === 'special') {
      // Handle special TTL values
      if (ttl.value === 0) return 0; // live
      if (ttl.value === -1) return Infinity; // static
    }

    if (ttl.type === 'duration' && ttl.value && ttl.unit) {
      return this.convertToSeconds(ttl.value, ttl.unit);
    }

    // Default to 24 hours
    return 86400;
  }

  /**
   * Convert duration to seconds
   */
  private convertToSeconds(value: number, unit: string): number {
    switch (unit.toLowerCase()) {
      case 's':
      case 'sec':
      case 'second':
      case 'seconds':
        return value;
      case 'm':
      case 'min':
      case 'minute':
      case 'minutes':
        return value * 60;
      case 'h':
      case 'hr':
      case 'hour':
      case 'hours':
        return value * 3600;
      case 'd':
      case 'day':
      case 'days':
        return value * 86400;
      case 'w':
      case 'week':
      case 'weeks':
        return value * 604800;
      default:
        throw new Error(`Unknown time unit: ${unit}`);
    }
  }

  /**
   * Get default TTL (24 hours)
   */
  private getDefaultTTL(): TTLOption {
    return {
      type: 'duration',
      value: 24,
      unit: 'hours',
      seconds: 86400
    };
  }

  /**
   * Update lock file with cache entry
   */
  private async updateLockFile(
    url: string,
    hash: string,
    ttl: TTLOption,
    trust: TrustLevel,
    configuredBy: string
  ): Promise<void> {
    try {
      // Get current lock file data
      const lockData = (this.lockFile as any).data;
      
      // Initialize cache section if it doesn't exist
      if (!lockData.cache) {
        lockData.cache = {};
      }
      if (!lockData.cache.urls) {
        lockData.cache.urls = {};
      }

      // Add cache entry
      lockData.cache.urls[url] = {
        hash,
        cachedAt: new Date().toISOString(),
        ttl: this.serializeTTL(ttl),
        trust,
        configuredBy,
        expiresAt: this.calculateExpirationTime(ttl)
      };

      // Mark lock file as dirty and save
      (this.lockFile as any).isDirty = true;
      await this.lockFile.save();
    } catch (error) {
      console.warn(`Failed to update lock file for URL cache: ${error.message}`);
    }
  }

  /**
   * Serialize TTL for lock file storage
   */
  private serializeTTL(ttl: TTLOption): string {
    if (ttl.type === 'special') {
      if (ttl.value === 0) return 'live';
      if (ttl.value === -1) return 'static';
    }
    
    if (ttl.type === 'duration' && ttl.value && ttl.unit) {
      return `${ttl.value}${ttl.unit}`;
    }
    
    return '24h'; // default
  }

  /**
   * Calculate expiration time for lock file
   */
  private calculateExpirationTime(ttl: TTLOption): string {
    if (ttl.type === 'special') {
      if (ttl.value === 0) return 'live';
      if (ttl.value === -1) return 'never';
    }

    const seconds = this.getTTLSeconds(ttl);
    if (seconds === Infinity) return 'never';
    
    const expiresAt = new Date(Date.now() + (seconds * 1000));
    return expiresAt.toISOString();
  }

  /**
   * Invalidate cache entry
   */
  private async invalidateCache(url: string): Promise<void> {
    try {
      const lockData = (this.lockFile as any).data;
      if (lockData.cache?.urls?.[url]) {
        delete lockData.cache.urls[url];
        (this.lockFile as any).isDirty = true;
        await this.lockFile.save();
      }
    } catch (error) {
      console.warn(`Failed to invalidate cache for ${url}: ${error.message}`);
    }
  }

  /**
   * Clear all cached URLs
   */
  async clearCache(): Promise<void> {
    try {
      const lockData = (this.lockFile as any).data;
      if (lockData.cache?.urls) {
        lockData.cache.urls = {};
        (this.lockFile as any).isDirty = true;
        await this.lockFile.save();
      }
    } catch (error) {
      console.warn(`Failed to clear URL cache: ${error.message}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{ totalUrls: number; expiredUrls: number; totalSize: number }> {
    try {
      const lockData = (this.lockFile as any).data;
      const urls = lockData.cache?.urls || {};
      
      let expiredCount = 0;
      const now = new Date();
      
      for (const entry of Object.values(urls) as URLCacheEntry[]) {
        if (entry.expiresAt !== 'never' && entry.expiresAt !== 'live') {
          const expiresAt = new Date(entry.expiresAt);
          if (now > expiresAt) {
            expiredCount++;
          }
        }
      }

      return {
        totalUrls: Object.keys(urls).length,
        expiredUrls: expiredCount,
        totalSize: 0 // Would need to calculate from content cache
      };
    } catch (error) {
      return { totalUrls: 0, expiredUrls: 0, totalSize: 0 };
    }
  }
}