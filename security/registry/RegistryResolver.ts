import { ImmutableCache } from '@security/cache';
import { MlldImportError } from '@core/errors';

export interface RegistryModule {
  gist: string;
  author: string;
  description: string;
  tags: string[];
}

export interface Registry {
  version: string;
  updated: string;
  modules: Record<string, RegistryModule>;
}

/**
 * Resolves mlld://registry/ URLs to their underlying gist URLs
 * Acts as "DNS for Gists" - providing human-friendly names
 */
export class RegistryResolver {
  private static readonly REGISTRY_URL = 
    'https://raw.githubusercontent.com/mlld-lang/registry/main/registry.json';
  private static readonly CACHE_KEY = 'registry:main';
  private static readonly CACHE_TTL = 3600000; // 1 hour
  
  constructor(private cache: ImmutableCache) {}
  
  /**
   * Check if a URL is a registry URL
   */
  isRegistryURL(url: string): boolean {
    return url.startsWith('mlld://registry/');
  }
  
  /**
   * Check if a URL is a gist URL
   */
  isGistURL(url: string): boolean {
    return url.startsWith('mlld://gist/');
  }
  
  /**
   * Resolve a registry URL to a gist URL
   * Example: mlld://registry/prompts/code-review → mlld://gist/anthropics/abc123
   */
  async resolveRegistryURL(registryURL: string): Promise<string> {
    if (!this.isRegistryURL(registryURL)) {
      throw new MlldImportError(`Not a registry URL: ${registryURL}`);
    }
    
    // Extract module name
    const moduleName = registryURL.replace('mlld://registry/', '');
    
    // Fetch registry (with caching)
    const registry = await this.fetchRegistry();
    
    // Look up module
    const module = registry.modules[moduleName];
    if (!module) {
      throw new MlldImportError(
        `Unknown registry module: ${moduleName}\n` +
        `Available modules: ${Object.keys(registry.modules).join(', ')}`
      );
    }
    
    // Return as gist URL
    return `mlld://gist/${module.gist}`;
  }
  
  /**
   * Get information about a registry module
   */
  async getModuleInfo(moduleName: string): Promise<RegistryModule | null> {
    const registry = await this.fetchRegistry();
    return registry.modules[moduleName] || null;
  }
  
  /**
   * Search registry modules
   */
  async searchModules(query: string): Promise<Array<[string, RegistryModule]>> {
    const registry = await this.fetchRegistry();
    const lowerQuery = query.toLowerCase();
    
    return Object.entries(registry.modules)
      .filter(([name, module]) => 
        name.toLowerCase().includes(lowerQuery) ||
        module.description.toLowerCase().includes(lowerQuery) ||
        module.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      )
      .slice(0, 10); // Limit results
  }
  
  /**
   * Fetch registry with caching
   */
  private async fetchRegistry(): Promise<Registry> {
    // Check cache first using the registry URL as key
    try {
      const cached = await this.cache.get(RegistryResolver.REGISTRY_URL);
      if (cached) {
        // Cache returns the raw content, parse it
        return JSON.parse(cached);
      }
    } catch (error) {
      // Cache miss or error, continue to fetch
    }
    
    // Fetch from GitHub
    const response = await fetch(RegistryResolver.REGISTRY_URL);
    if (!response.ok) {
      throw new MlldImportError(
        `Failed to fetch registry: ${response.statusText}`
      );
    }
    
    const text = await response.text();
    const registry = JSON.parse(text) as Registry;
    
    // Validate registry format
    if (!registry.version || !registry.modules) {
      throw new MlldImportError('Invalid registry format');
    }
    
    // Cache for next time using URL as key
    await this.cache.set(RegistryResolver.REGISTRY_URL, text);
    
    return registry;
  }
  
  /**
   * Transform a gist URL to the correct format
   * Handles both mlld://gist/ and GitHub URLs
   */
  transformGistURL(url: string): string {
    // Already in correct format
    if (url.startsWith('mlld://gist/')) {
      return url;
    }
    
    // GitHub gist URL
    if (url.includes('gist.github.com/')) {
      const match = url.match(/gist\.github\.com\/([^\/]+)\/([a-f0-9]+)/);
      if (match) {
        return `mlld://gist/${match[1]}/${match[2]}`;
      }
    }
    
    // Not a gist URL
    return url;
  }
  
  /**
   * Extract gist info from mlld://gist/ URL
   */
  parseGistURL(gistURL: string): { username: string; gistId: string } {
    if (!this.isGistURL(gistURL)) {
      throw new MlldImportError(`Not a gist URL: ${gistURL}`);
    }
    
    const parts = gistURL.split('/');
    if (parts.length < 4) {
      throw new MlldImportError(
        `Invalid gist URL format. Expected: mlld://gist/username/gistId`
      );
    }
    
    return {
      username: parts[2],
      gistId: parts[3]
    };
  }
}