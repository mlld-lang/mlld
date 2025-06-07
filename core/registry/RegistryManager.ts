import * as path from 'path';
import { LockFile } from './LockFile';
import { Cache } from './Cache';
import { RegistryResolver } from './RegistryResolver';
import { StatsCollector } from './StatsCollector';
import { MlldImportError } from '@core/errors';

export interface RegistryConfig {
  enabled?: boolean;
  cacheDir?: string;
  lockFile?: string;
  registryUrl?: string;
  telemetry?: {
    enabled?: boolean;
  };
}

export class RegistryManager {
  private lockFile: LockFile;
  private cache: Cache;
  private resolver: RegistryResolver;
  private stats: StatsCollector;
  
  constructor(
    basePath: string,
    config: RegistryConfig = {}
  ) {
    const mlldDir = path.join(basePath, '.mlld');
    
    // Initialize components
    this.lockFile = new LockFile(
      config.lockFile || path.join(mlldDir, 'mlld.lock.json')
    );
    
    this.cache = new Cache(
      config.cacheDir || path.join(mlldDir, 'cache')
    );
    
    this.resolver = new RegistryResolver(
      this.lockFile,
      this.cache,
      config.registryUrl
    );
    
    this.stats = new StatsCollector(
      mlldDir,
      config.telemetry?.enabled ?? false
    );
  }

  // Main entry point for resolving imports
  async resolveImport(importPath: string): Promise<string> {
    // Only handle mlld:// imports
    if (!importPath.startsWith('mlld://')) {
      return importPath;
    }

    // Check lock file first
    const locked = this.lockFile.getImport(importPath);
    if (locked) {
      // Try cache
      const cached = await this.cache.get(locked.resolved, locked.gistRevision);
      if (cached) {
        await this.stats.track(importPath, 'cache-hit');
        return cached;
      }
      
      // Need to fetch the locked version
      return this.fetchLocked(importPath, locked);
    }

    // New import - resolve through registry
    const resolved = await this.resolver.resolve(importPath);
    await this.stats.track(importPath, 'import');
    
    // The resolved path will be handled by the gist importer
    return resolved;
  }

  // Called after a successful gist import to lock it
  async lockGistImport(
    originalPath: string,
    resolvedGistPath: string,
    gistRevision: string,
    content: string
  ): Promise<void> {
    const integrity = await this.lockFile.calculateIntegrity(content);
    
    await this.lockFile.addImport(originalPath, {
      resolved: resolvedGistPath,
      gistRevision,
      integrity,
      approvedAt: new Date().toISOString(),
      approvedBy: process.env.USER || 'unknown'
    });
    
    // Cache the content
    await this.cache.store(resolvedGistPath, content, {
      importPath: originalPath,
      gistRevision,
      integrity
    });
  }

  // CLI command: mlld install
  async installFromLock(): Promise<void> {
    const imports = this.lockFile.getAllImports();
    console.log(`Installing ${Object.keys(imports).length} modules...`);
    
    for (const [importPath, entry] of Object.entries(imports)) {
      // Check cache first
      const cached = await this.cache.get(entry.resolved, entry.gistRevision);
      if (cached) {
        console.log(`✓ ${importPath} (cached)`);
        continue;
      }
      
      // Fetch and cache
      console.log(`↓ ${importPath}...`);
      await this.fetchLocked(importPath, entry);
      await this.stats.track(importPath, 'install');
    }
    
    console.log('✓ All modules installed');
  }

  // CLI command: mlld update [module]
  async updateModule(moduleName?: string): Promise<void> {
    if (moduleName) {
      // Update specific module
      const importPath = moduleName.startsWith('mlld://') 
        ? moduleName 
        : `mlld://${moduleName}`;
      
      const locked = this.lockFile.getImport(importPath);
      if (!locked) {
        throw new MlldImportError(`Module not found in lock file: ${moduleName}`);
      }
      
      // Re-resolve to get latest
      console.log(`Updating ${moduleName}...`);
      const resolved = await this.resolver.resolve(importPath);
      
      // Remove old lock and cache
      await this.lockFile.removeImport(importPath);
      await this.cache.invalidate(locked.resolved, locked.gistRevision);
      
      await this.stats.track(importPath, 'update');
      console.log(`✓ Updated ${moduleName}`);
    } else {
      // Update all modules
      const imports = this.lockFile.getAllImports();
      for (const importPath of Object.keys(imports)) {
        const moduleName = importPath.replace('mlld://', '');
        await this.updateModule(moduleName);
      }
    }
  }

  // CLI command: mlld audit
  async audit(): Promise<void> {
    const imports = this.lockFile.getAllImports();
    console.log(`Auditing ${Object.keys(imports).length} modules...\n`);
    
    let advisoryCount = 0;
    
    for (const [importPath, entry] of Object.entries(imports)) {
      // Parse username/module from import path
      const fullPath = importPath.replace('mlld://', '');
      const parts = fullPath.split('/');
      if (parts.length !== 2) continue;
      
      const [username, moduleName] = parts;
      
      // Extract gist ID from resolved path
      const gistMatch = entry.resolved.match(/gist\.githubusercontent\.com\/([^\/]+)\/([^\/]+)/);
      const gistId = gistMatch ? gistMatch[2] : '';
      
      const advisories = await this.resolver.checkUserAdvisories(username, moduleName, gistId);
      if (advisories.length > 0) {
        console.log(`⚠️  ${username}/${moduleName}:`);
        for (const advisory of advisories) {
          console.log(`   ${advisory.severity}: ${advisory.description}`);
          advisoryCount++;
        }
        console.log('');
      }
    }
    
    if (advisoryCount === 0) {
      console.log('✓ No security advisories found');
    } else {
      console.log(`Found ${advisoryCount} advisories`);
    }
  }

  // CLI command: mlld search <query>
  async search(query: string): Promise<void> {
    const results = await this.resolver.searchModules(query);
    
    if (results.length === 0) {
      console.log('No modules found');
      // If no global index, suggest user-specific search
      if (!query.includes('/')) {
        console.log('\nTry searching a specific user: mlld search username/query');
      }
      return;
    }
    
    console.log(`Found ${results.length} modules:\n`);
    
    for (const module of results.slice(0, 10)) {
      console.log(`  ${module.author}/${module.name}`);
      console.log(`    ${module.description}`);
      console.log(`    Tags: ${module.tags.join(', ')}`);
      console.log('');
    }
    
    if (results.length > 10) {
      console.log(`... and ${results.length - 10} more`);
    }
  }
  
  // CLI command: mlld search-servers <query>
  async searchServers(query: string): Promise<void> {
    const results = await this.resolver.searchServers(query);
    
    if (results.length === 0) {
      console.log('No MCP servers found');
      return;
    }
    
    console.log(`Found ${results.length} MCP servers:\n`);
    
    for (const server of results.slice(0, 10)) {
      console.log(`  ${server.author}/${server.name}`);
      console.log(`    ${server.description}`);
      console.log(`    Repository: ${server.repository}`);
      console.log(`    Capabilities: ${server.capabilities.join(', ')}`);
      console.log(`    Tags: ${server.tags.join(', ')}`);
      console.log('');
    }
    
    if (results.length > 10) {
      console.log(`... and ${results.length - 10} more`);
    }
  }

  // CLI command: mlld info <module>
  async info(modulePath: string): Promise<void> {
    // Ensure we have username/module format
    if (!modulePath.includes('/')) {
      console.log('Module path must include username. Format: username/module');
      return;
    }
    
    const module = await this.resolver.getModuleInfo(modulePath);
    
    console.log(`\nModule: ${module.username}/${module.name}`);
    console.log(`Description: ${module.description}`);
    console.log(`Gist: https://gist.github.com/${module.username}/${module.gist}`);
    console.log(`Tags: ${module.tags.join(', ')}`);
    console.log(`Created: ${new Date(module.created).toLocaleDateString()}`);
    
    // Check if installed
    const importPath = `mlld://${module.username}/${module.name}`;
    const locked = this.lockFile.getImport(importPath);
    if (locked) {
      console.log(`\nInstalled: Yes`);
      console.log(`Version: ${locked.gistRevision.slice(0, 8)}`);
      console.log(`Approved: ${new Date(locked.approvedAt).toLocaleDateString()}`);
    } else {
      console.log(`\nInstalled: No`);
    }
    
    // Check advisories
    const advisories = await this.resolver.checkUserAdvisories(module.username, module.name, module.gist);
    if (advisories.length > 0) {
      console.log('\n⚠️  Security Advisories:');
      for (const advisory of advisories) {
        console.log(`   ${advisory.severity}: ${advisory.description}`);
      }
    }
  }

  // CLI command: mlld stats
  async showStats(): Promise<void> {
    const stats = await this.stats.aggregateStats();
    
    if (Object.keys(stats.modules).length === 0) {
      console.log('No usage statistics available');
      return;
    }
    
    console.log('\nModule Usage Statistics:');
    console.log('┌─────────────────────────┬──────────┬───────────┬─────────┐');
    console.log('│ Module                  │ Imports  │ Cache Hits│ Updates │');
    console.log('├─────────────────────────┼──────────┼───────────┼─────────┤');
    
    for (const [module, data] of Object.entries(stats.modules)) {
      const name = module.replace('mlld://', '').padEnd(23);
      const imports = data.imports.toString().padStart(8);
      const cacheHits = data.cacheHits.toString().padStart(10);
      const updates = data.updates.toString().padStart(7);
      console.log(`│ ${name} │ ${imports} │ ${cacheHits} │ ${updates} │`);
    }
    
    console.log('└─────────────────────────┴──────────┴───────────┴─────────┘');
    console.log(`\nPeriod: ${new Date(stats.period.start).toLocaleDateString()} - ${new Date(stats.period.end).toLocaleDateString()}`);
  }

  // Get components for direct access
  getLockFile(): LockFile { return this.lockFile; }
  getCache(): Cache { return this.cache; }
  getResolver(): RegistryResolver { return this.resolver; }
  getStats(): StatsCollector { return this.stats; }

  private async fetchLocked(importPath: string, locked: any): Promise<string> {
    // This would be implemented by the gist fetcher
    // For now, just return the resolved path
    console.warn('Fetching locked version not yet implemented');
    return locked.resolved;
  }
}