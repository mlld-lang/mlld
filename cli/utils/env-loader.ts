import * as fs from 'fs';
import * as path from 'path';

/**
 * Environment variable loader that supports .env files and MLLD_ prefix filtering
 */
export class EnvLoader {
  /**
   * Load environment variables from a file and apply them to process.env
   * Only applies variables with MLLD_ prefix for security
   * @param envFilePath Path to the .env file
   * @param strict Whether to throw if file doesn't exist (default: false)
   */
  static loadEnvFile(envFilePath: string, strict: boolean = false): void {
    try {
      console.log(`ENV DEBUG: Loading env file: ${envFilePath}`);
      if (!fs.existsSync(envFilePath)) {
        console.log(`ENV DEBUG: File not found: ${envFilePath}`);
        if (strict) {
          throw new Error(`Environment file not found: ${envFilePath}`);
        }
        return;
      }

      const content = fs.readFileSync(envFilePath, 'utf8');
      const vars = this.parseEnvFile(content);
      console.log(`ENV DEBUG: Parsed vars: ${Object.keys(vars)}`);
      
      // Only apply MLLD_ prefixed variables
      for (const [key, value] of Object.entries(vars)) {
        if (key.startsWith('MLLD_')) {
          process.env[key] = value;
          console.log(`ENV DEBUG: Set ${key}=${value.substring(0, 10)}...`);
        }
      }
    } catch (error) {
      console.log(`ENV DEBUG: Error loading env file: ${error}`);
      if (strict) {
        throw error;
      }
      // Silently ignore errors in non-strict mode
    }
  }

  /**
   * Load multiple environment files in order
   * Later files override earlier ones
   */
  static loadEnvFiles(envFilePaths: string[], strict: boolean = false): void {
    for (const filePath of envFilePaths) {
      this.loadEnvFile(filePath, strict);
    }
  }

  /**
   * Auto-discover and load common .env files in a directory
   * Loads in order: .env, .env.test (for test mode)
   * @param baseDir Directory to search for .env files
   * @param testMode Whether to also load .env.test
   */
  static autoLoadEnvFiles(baseDir: string, testMode: boolean = false): void {
    const envFiles: string[] = [];
    
    // Always check for .env
    const envFile = path.join(baseDir, '.env');
    if (fs.existsSync(envFile)) {
      envFiles.push(envFile);
    }
    
    // If in test mode, also check for .env.test
    if (testMode) {
      const testEnvFile = path.join(baseDir, '.env.test');
      if (fs.existsSync(testEnvFile)) {
        envFiles.push(testEnvFile);
      }
    }
    
    this.loadEnvFiles(envFiles);
  }

  /**
   * Parse .env file content into key-value pairs
   * Supports basic .env format:
   * - KEY=value
   * - KEY="value with spaces"
   * - KEY='single quoted value'
   * - # comments (ignored)
   * - empty lines (ignored)
   */
  private static parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (let line of lines) {
      // Remove comments and trim whitespace
      line = line.split('#')[0].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Find the first = sign
      const equalIndex = line.indexOf('=');
      if (equalIndex === -1) continue;
      
      const key = line.slice(0, equalIndex).trim();
      let value = line.slice(equalIndex + 1).trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      result[key] = value;
    }
    
    return result;
  }

  /**
   * Get all currently loaded MLLD_ environment variables
   */
  static getMlldEnvVars(): Record<string, string> {
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('MLLD_') && value !== undefined) {
        result[key] = value;
      }
    }
    
    return result;
  }
}