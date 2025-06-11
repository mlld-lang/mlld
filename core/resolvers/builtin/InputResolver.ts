import { 
  Resolver, 
  ResolverContent, 
  ResolverCapabilities,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError } from '@core/errors';

/**
 * Built-in resolver for input data (stdin + environment variables)
 */
export class InputResolver implements Resolver {
  name = 'INPUT';
  description = 'Provides merged stdin and environment variable data';
  type = 'input' as const;
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    needs: { network: false, cache: false, auth: false },
    contexts: { import: true, path: false, output: false },
    resourceType: 'function',
    priority: 1,
    cache: { 
      strategy: 'memory', // Memory cache for session duration
      ttl: { duration: -1 } // Never expire during session
    },
    supportedFormats: ['json', 'text', 'env', 'stdin']
  };

  private inputData: Record<string, any> | null = null;
  private stdinContent: string | undefined;

  constructor(stdinContent?: string) {
    this.stdinContent = stdinContent;
  }

  canResolve(ref: string): boolean {
    const cleanRef = ref.replace(/^@/, '');
    return cleanRef === 'INPUT' || cleanRef.startsWith('INPUT/');
  }

  async resolve(ref: string): Promise<ResolverContent> {
    // Initialize input data if not already done
    if (!this.inputData) {
      await this.initializeInputData();
    }

    // Extract format/field from reference
    const cleanRef = ref.replace(/^@/, '');
    const parts = cleanRef.split('/');
    const field = parts.length > 1 ? parts.slice(1).join('/') : null;

    // Get requested data
    let result: any;
    if (field) {
      // Specific field requested
      result = this.getFieldValue(field);
    } else {
      // All input data
      result = this.inputData;
    }

    return {
      content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      metadata: {
        source: 'INPUT',
        timestamp: new Date(),
        // No hash needed for function resolvers
      }
    };
  }

  /**
   * Initialize input data from stdin and environment
   */
  private async initializeInputData(): Promise<void> {
    const stdin = await this.readStdin();
    const envVars = this.getEnvironmentVariables();

    // Merge stdin and environment data
    this.inputData = {
      ...envVars,
      ...stdin
    };

    // Special handling for common patterns
    if (stdin.config || stdin.data) {
      // If stdin has config/data structure, preserve it at top level
      this.inputData.config = stdin.config;
      this.inputData.data = stdin.data;
    }

    // Add metadata
    this.inputData._meta = {
      source: 'INPUT',
      timestamp: new Date().toISOString(),
      hasStdin: Object.keys(stdin).length > 0,
      envVarCount: Object.keys(envVars).length
    };
  }

  /**
   * Read and parse stdin content
   */
  private async readStdin(): Promise<Record<string, any>> {
    try {
      // Use provided stdin content or try to read from process.stdin
      const content = this.stdinContent || '';
      
      if (!content) {
        return {};
      }

      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(content);
        return typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed };
      } catch {
        // If not JSON, treat as plain text
        return { stdin: content.trim() };
      }
    } catch (error) {
      // No stdin available
      return {};
    }
  }

  /**
   * Get filtered environment variables
   */
  private getEnvironmentVariables(): Record<string, string> {
    const filtered: Record<string, string> = {};
    
    // Include all MLLD_ prefixed variables
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('MLLD_') && value !== undefined) {
        // Remove MLLD_ prefix for cleaner access
        const cleanKey = key.substring(5);
        filtered[cleanKey] = value;
      }
    }

    // Include specific common variables
    const includeVars = ['NODE_ENV', 'DEBUG', 'CI', 'HOME', 'USER', 'PATH'];
    for (const varName of includeVars) {
      if (process.env[varName] !== undefined) {
        filtered[varName] = process.env[varName]!;
      }
    }

    return filtered;
  }

  /**
   * Get field value from input data
   */
  private getFieldValue(field: string): any {
    if (!this.inputData) {
      return null;
    }

    // Handle special format requests
    switch (field.toLowerCase()) {
      case 'json':
        return this.inputData;
      
      case 'text':
        return this.inputData.stdin || '';
      
      case 'env':
        // Return only environment variables
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(this.inputData)) {
          if (typeof value === 'string' && key !== 'stdin' && key !== '_meta') {
            env[key] = value;
          }
        }
        return env;
      
      case 'stdin':
        // Return only stdin data
        const stdinData = { ...this.inputData };
        delete stdinData._meta;
        // Remove env vars
        for (const key of Object.keys(stdinData)) {
          if (typeof stdinData[key] === 'string' && key !== 'stdin') {
            delete stdinData[key];
          }
        }
        return stdinData;
    }

    // Handle nested field access (e.g., config.database.host)
    const parts = field.split('.');
    let current: any = this.inputData;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }
    
    return current;
  }

  /**
   * Get exportable data for imports
   */
  async getExportData(field?: string): Promise<Record<string, any>> {
    // Initialize if needed
    if (!this.inputData) {
      await this.initializeInputData();
    }

    // For specific field imports
    if (field) {
      const value = this.getFieldValue(field);
      return { [field]: value };
    }

    // For import { * } from @INPUT
    // Return all top-level fields except metadata
    const exportData = { ...this.inputData };
    delete exportData._meta;
    
    return exportData;
  }

  /**
   * Update stdin content (for testing or dynamic updates)
   */
  setStdinContent(content: string): void {
    this.stdinContent = content;
    this.inputData = null; // Reset to force re-initialization
  }
}