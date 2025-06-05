import * as fs from 'fs';
import * as path from 'path';
import { MlldImportError } from '@core/errors';
import { LockFile, LockEntry } from './LockFile';
import { Cache } from './Cache';

export interface RegistryModule {
  gist: string;
  description: string;
  tags: string[];
  created: string;
}

export interface Registry {
  version: string;
  updated: string;
  author: string;
  modules: Record<string, RegistryModule>;
}

export interface Advisory {
  id: string;
  created: string;
  severity: 'high' | 'medium' | 'low';
  affects: string[];  // Module names
  gists: string[];    // Gist IDs
  type: string;
  description: string;
  recommendation: string;
}

export interface AdvisoryFile {
  version: string;
  advisories: Advisory[];
}

export class RegistryResolver {
  private registryCache: Map<string, { data: Registry | null; timestamp: number }> = new Map();
  private advisoryCache: Map<string, { data: AdvisoryFile | null; timestamp: number }> = new Map();
  private readonly cacheTimeout = 3600000; // 1 hour

  constructor(
    private readonly lockFile: LockFile,
    private readonly cache: Cache,
    private readonly registryUrl = 'https://raw.githubusercontent.com/mlld-lang/registry/main'
  ) {}

  async resolve(importPath: string): Promise<string> {
    // Handle mlld://user/module format
    if (!importPath.startsWith('mlld://')) {
      return importPath;
    }

    // Remove mlld:// prefix
    const fullPath = importPath.slice(7);
    
    // Check if it's already a gist reference (has slash after gist/)
    if (fullPath.startsWith('gist/')) {
      return importPath;
    }

    // Parse username/module format
    const parts = fullPath.split('/');
    if (parts.length !== 2) {
      throw new MlldImportError(`Invalid module path format. Expected mlld://username/module, got: ${importPath}`);
    }
    
    const [username, moduleName] = parts;

    // Fetch the user's registry
    const registry = await this.fetchUserRegistry(username);
    const module = registry.modules[moduleName];
    
    if (!module) {
      throw new MlldImportError(`Module '${moduleName}' not found in ${username}'s registry`);
    }

    // Check advisories (from user's advisory file)
    const advisories = await this.checkUserAdvisories(username, moduleName, module.gist);
    if (advisories.length > 0) {
      await this.displayAdvisories(advisories);
      // In Phase 1, we just warn - don't block
    }

    // Return the resolved gist path with username
    return `mlld://gist/${username}/${module.gist}`;
  }

  async fetchUserRegistry(username: string): Promise<Registry> {
    // Check cache
    const now = Date.now();
    const cached = this.registryCache.get(username);
    if (cached && cached.data && (now - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.registryUrl}/${username}/registry.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch registry for ${username}: ${response.statusText}`);
      }

      const data = await response.json() as Registry;
      
      // Update cache
      this.registryCache.set(username, { data, timestamp: now });
      
      return data;
    } catch (error) {
      // If we have cached data, use it even if expired
      if (cached?.data) {
        console.warn(`Failed to fetch registry for ${username}, using cached version`);
        return cached.data;
      }
      throw new MlldImportError(`Failed to fetch registry for ${username}: ${error.message}`);
    }
  }

  async fetchUserAdvisories(username: string): Promise<AdvisoryFile> {
    // Check cache
    const now = Date.now();
    const cached = this.advisoryCache.get(username);
    if (cached && cached.data && (now - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.registryUrl}/${username}/advisories.json`);
      if (!response.ok) {
        // It's okay if advisories don't exist
        if (response.status === 404) {
          const emptyAdvisories = { version: '1.0.0', advisories: [] };
          this.advisoryCache.set(username, { data: emptyAdvisories, timestamp: now });
          return emptyAdvisories;
        }
        throw new Error(`Failed to fetch advisories: ${response.statusText}`);
      }

      const data = await response.json() as AdvisoryFile;
      
      // Update cache
      this.advisoryCache.set(username, { data, timestamp: now });
      
      return data;
    } catch (error) {
      // If we have cached data, use it even if expired
      if (cached?.data) {
        return cached.data;
      }
      // No advisories is not an error
      return { version: '1.0.0', advisories: [] };
    }
  }

  async checkUserAdvisories(username: string, moduleName: string, gistId: string): Promise<Advisory[]> {
    const { advisories } = await this.fetchUserAdvisories(username);
    
    return advisories.filter(advisory =>
      advisory.affects.includes(moduleName) ||
      advisory.gists.includes(gistId)
    );
  }

  private async displayAdvisories(advisories: Advisory[]): Promise<void> {
    console.warn('\n⚠️  Security Advisories Found:\n');
    
    for (const advisory of advisories) {
      const icon = {
        high: '🔴',
        medium: '🟡',
        low: '🟢'
      }[advisory.severity];
      
      console.warn(`${icon} ${advisory.severity.toUpperCase()}: ${advisory.id}`);
      console.warn(`   Type: ${advisory.type}`);
      console.warn(`   Description: ${advisory.description}`);
      console.warn(`   Recommendation: ${advisory.recommendation}`);
      console.warn('');
    }
  }

  // Get info about a module (for mlld info command)
  async getModuleInfo(fullPath: string): Promise<RegistryModule & { name: string; username: string }> {
    // Parse username/module format
    const parts = fullPath.split('/');
    if (parts.length !== 2) {
      throw new MlldImportError(`Invalid module path format. Expected username/module, got: ${fullPath}`);
    }
    
    const [username, moduleName] = parts;
    const registry = await this.fetchUserRegistry(username);
    const module = registry.modules[moduleName];
    
    if (!module) {
      throw new MlldImportError(`Module '${moduleName}' not found in ${username}'s registry`);
    }
    
    return { name: moduleName, username, ...module };
  }

  // Search modules (for mlld search command)
  async searchModules(query: string): Promise<Array<{ name: string; author: string } & RegistryModule>> {
    // First try to use the global index if available
    try {
      const response = await fetch(`${this.registryUrl}/_index/modules.json`);
      if (response.ok) {
        const index = await response.json();
        const results: Array<{ name: string; author: string } & RegistryModule> = [];
        const lowerQuery = query.toLowerCase();
        
        for (const [fullName, module] of Object.entries(index.modules as Record<string, any>)) {
          if (
            fullName.toLowerCase().includes(lowerQuery) ||
            module.description.toLowerCase().includes(lowerQuery) ||
            module.tags.some((tag: string) => tag.toLowerCase().includes(lowerQuery))
          ) {
            const [author, name] = fullName.split('/');
            results.push({ name, author, ...module });
          }
        }
        
        return results;
      }
    } catch {
      // Fall back to user-specific search
    }
    
    // Fallback: search specific user if query contains /
    if (query.includes('/')) {
      const [username, searchQuery] = query.split('/', 2);
      return this.searchUserModules(username, searchQuery || '');
    }
    
    return [];
  }
  
  // Search user's modules specifically
  async searchUserModules(username: string, query: string): Promise<Array<{ name: string; author: string } & RegistryModule>> {
    const registry = await this.fetchUserRegistry(username);
    const results: Array<{ name: string; author: string } & RegistryModule> = [];
    
    const lowerQuery = query.toLowerCase();
    
    for (const [name, module] of Object.entries(registry.modules || {})) {
      if (
        name.toLowerCase().includes(lowerQuery) ||
        module.description.toLowerCase().includes(lowerQuery) ||
        module.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      ) {
        results.push({ name, author: username, ...module });
      }
    }
    
    return results;
  }
  
  // Search MCP servers
  async searchServers(query: string): Promise<Array<{ name: string; author: string; repository: string; capabilities: string[]; description: string; tags: string[] }>> {
    try {
      const response = await fetch(`${this.registryUrl}/_index/servers.json`);
      if (response.ok) {
        const index = await response.json();
        const results: Array<any> = [];
        const lowerQuery = query.toLowerCase();
        
        for (const [fullName, server] of Object.entries(index.servers as Record<string, any>)) {
          if (
            fullName.toLowerCase().includes(lowerQuery) ||
            server.description.toLowerCase().includes(lowerQuery) ||
            server.tags.some((tag: string) => tag.toLowerCase().includes(lowerQuery)) ||
            server.capabilities.some((cap: string) => cap.toLowerCase().includes(lowerQuery))
          ) {
            const [author, name] = fullName.split('/');
            results.push({ name, author, ...server });
          }
        }
        
        return results;
      }
    } catch {
      // No global index available
    }
    
    return [];
  }
}