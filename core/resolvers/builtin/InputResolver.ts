import { 
  Resolver, 
  ResolverContent, 
  ResolverCapabilities,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError, ResolverErrorCode } from '@core/errors';

/**
 * Built-in resolver for input data (stdin + environment variables)
 */
export class InputResolver implements Resolver {
  name = 'input';
  description = 'Provides merged stdin and environment variable data';
  type = 'input' as const;
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['data', 'text'],
    defaultContentType: 'data',  // Usually JSON from stdin
    priority: 1,
    cache: { 
      strategy: 'memory', // Memory cache for session duration
      ttl: { duration: -1 } // Never expire during session
    }
  };

  private inputData: Record<string, any> | null = null;
  private stdinContent: string | undefined;

  constructor(stdinContent?: string) {
    this.stdinContent = stdinContent;
  }

  canResolve(ref: string): boolean {
    const cleanRef = ref.replace(/^@/, '');
    return cleanRef === 'input' || cleanRef.startsWith('input/');
  }

  async resolve(ref: string, config?: any): Promise<ResolverContent> {
    // Initialize input data if not already done
    if (!this.inputData) {
      await this.initializeInputData();
    }

    // Variable context - return all input data as JSON
    if (!config?.context || config.context === 'variable') {
      const metadata = {
        source: 'input',
        timestamp: new Date(),
        taint: ['src:user']
      };
      return {
        content: JSON.stringify(this.inputData, null, 2),
        contentType: 'data',
        mx: metadata,
        metadata
      };
    }
    
    // Import context - return requested fields
    if (config.context === 'import') {
      const exports: Record<string, any> = {};
      const imports = config.requestedImports || [];
      
      if (imports.length === 0) {
        // Import all
        const exportData = { ...this.inputData };
        delete exportData._meta;
        const metadata = {
          source: 'input',
          timestamp: new Date(),
          taint: ['src:user']
        };
        return {
          content: JSON.stringify(exportData),
          contentType: 'data',
          mx: metadata,
          metadata
        };
      }
      
      // Import specific fields
      for (const fieldName of imports) {
        const value = this.getFieldValue(fieldName);
        if (value !== null) {
          exports[fieldName] = value;
        }
      }
      
      const metadata = {
        source: 'input',
        timestamp: new Date(),
        taint: ['src:user']
      };
      return {
        content: JSON.stringify(exports),
        contentType: 'data',
        mx: metadata,
        metadata
      };
    }
    
    throw new ResolverError(
      'input resolver only supports variable and import contexts',
      ResolverErrorCode.UNSUPPORTED_CONTEXT,
      {
        resolverName: this.name,
        context: config?.context,
        operation: 'resolve'
      }
    );
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
        // Keep the full variable name including MLLD_ prefix
        filtered[key] = value;
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
      case 'content':
        // Return stdin content directly (same as 'text')
        return this.inputData.stdin || '';
      
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
   * Update stdin content (for testing or dynamic updates)
   */
  setStdinContent(content: string): void {
    this.stdinContent = content;
    this.inputData = null; // Reset to force re-initialization
  }
}
