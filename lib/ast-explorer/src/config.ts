/**
 * Configuration for AST Explorer paths and options
 */
import * as path from 'path';
import * as fs from 'fs';

// Default path structure relative to the AST Explorer root
interface AstExplorerPaths {
  // Input paths (where to read from)
  parserPath: string;        // Path to parser module
  examplesDir: string;       // Directory with example files
  templatesDir: string;      // Templates directory
  
  // Output paths (where to write to)
  outputDir: string;         // Base output directory
  typesOutputDir: string;    // Directory for generated types
  snapshotsDir: string;      // Directory for AST snapshots
  fixturesDir: string;       // Directory for test fixtures
  docsOutputDir: string;     // Directory for generated docs
}

// Configuration with paths and options
export interface AstExplorerConfig {
  paths: AstExplorerPaths;
  options: {
    useMockParser: boolean;
    verbose: boolean;
  };
}

// Get project root path
function getProjectRoot(): string {
  // If running through bin with global paths set
  if (global.__astExplorerPaths?.projectRoot) {
    return global.__astExplorerPaths.projectRoot;
  }
  
  // Otherwise use the current directory as the starting point
  return process.cwd();
}

// Helper to resolve paths relative to the project root
function resolvePath(basePath: string, relativePath: string): string {
  return path.resolve(basePath, relativePath);
}

// Default configuration values
const defaultConfig: AstExplorerConfig = {
  paths: {
    // Default input paths
    parserPath: '../../grammar/parser.cjs',
    examplesDir: '../../grammar/examples',
    templatesDir: './templates',
    
    // Default output paths
    outputDir: './generated',
    typesOutputDir: './generated/types',
    snapshotsDir: './generated/snapshots',
    fixturesDir: './generated/fixtures',
    docsOutputDir: './generated/docs'
  },
  options: {
    useMockParser: false,
    verbose: false
  }
};

// Try to load config from file if it exists
export function loadConfig(configPath?: string): AstExplorerConfig {
  const projectRoot = getProjectRoot();
  const configFilePath = configPath || path.join(projectRoot, 'ast-explorer.config.json');
  
  // If config file exists, load and merge with defaults
  if (fs.existsSync(configFilePath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
      return {
        paths: { ...defaultConfig.paths, ...configData.paths },
        options: { ...defaultConfig.options, ...configData.options }
      };
    } catch (error) {
      console.warn(`Warning: Could not parse config file ${configFilePath}. Using defaults.`);
      return { ...defaultConfig };
    }
  }
  
  // Return default config if no config file exists
  return { ...defaultConfig };
}

// Create a configuration with resolved absolute paths
export function createConfig(configPath?: string): AstExplorerConfig {
  const config = loadConfig(configPath);
  const projectRoot = getProjectRoot();
  
  // Resolve all paths to absolute paths
  const resolvedPaths = Object.entries(config.paths).reduce((acc, [key, value]) => {
    acc[key as keyof AstExplorerPaths] = resolvePath(projectRoot, value);
    return acc;
  }, {} as AstExplorerPaths);
  
  return {
    paths: resolvedPaths,
    options: config.options
  };
}

// Global type declaration for the path helper
declare global {
  var __astExplorerPaths: {
    projectRoot: string;
    resolvePath: (relativePath: string) => string;
  } | undefined;
}

export default createConfig;