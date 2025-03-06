import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Service for securely resolving project paths
 */
export class ProjectPathResolver {
  // Common project markers in order of specificity
  private static PROJECT_MARKERS = [
    'meld.json',
    '.git',
    'package.json',
    'pyproject.toml',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    'Gemfile',
    'composer.json',
    'go.mod',
    '.mld'
  ];

  /**
   * Securely resolve project root with security constraints
   */
  async resolveProjectRoot(startDir: string): Promise<string> {
    // First priority: Look for meld.json
    const meldConfigPath = await this.findFileUpwards('meld.json', startDir);
    
    if (meldConfigPath) {
      const configDir = path.dirname(meldConfigPath);
      try {
        const configContent = await fs.readFile(meldConfigPath, 'utf-8');
        const config = JSON.parse(configContent);
        
        // If projectRoot is specified in config
        if (config.projectRoot) {
          const specifiedPath = path.resolve(configDir, config.projectRoot);
          
          // Security check: Ensure the path is within the config directory
          if (!this.isSubdirectoryOf(specifiedPath, configDir)) {
            // Fail silently and use the config directory instead
            return configDir;
          }
          
          return specifiedPath;
        }
        
        // If meld.json exists but doesn't specify projectRoot, use its directory
        return configDir;
      } catch (e) {
        // If we can't parse the config, use its directory
        return path.dirname(meldConfigPath);
      }
    }
    
    // Second priority: Auto-detect using project markers
    for (const marker of ProjectPathResolver.PROJECT_MARKERS) {
      const markerPath = await this.findFileUpwards(marker, startDir);
      if (markerPath) {
        return path.dirname(markerPath);
      }
    }
    
    // Last resort: Use current directory
    return startDir;
  }
  
  /**
   * Check if a path is a subdirectory of another path
   */
  private isSubdirectoryOf(child: string, parent: string): boolean {
    const relativePath = path.relative(parent, child);
    return relativePath !== '' && 
           !relativePath.startsWith('..') && 
           !path.isAbsolute(relativePath);
  }
  
  /**
   * Find a file by walking up the directory tree
   */
  private async findFileUpwards(filename: string, startDir: string): Promise<string | null> {
    let currentDir = startDir;
    const root = path.parse(currentDir).root;
    
    // Walk up until we hit the filesystem root
    while (currentDir !== root) {
      const filePath = path.join(currentDir, filename);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile() || stats.isDirectory()) {
          return filePath;
        }
      } catch (e) {
        // File doesn't exist, continue
      }
      
      // Move up one directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // We've reached the root
        break;
      }
      currentDir = parentDir;
    }
    
    return null;
  }
} 