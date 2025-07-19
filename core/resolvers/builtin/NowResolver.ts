import { 
  Resolver, 
  ResolverContent, 
  ResolverCapabilities,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError, ResolverErrorCode } from '@core/errors';

/**
 * Built-in resolver for current timestamp
 */
export class NowResolver implements Resolver {
  name = 'now';
  description = 'Provides current timestamp';
  type = 'input' as const;
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: true, output: false },
    supportedContentTypes: ['text', 'data'],
    defaultContentType: 'text',
    priority: 1,
    cache: { strategy: 'none' } // now is always computed fresh
  };

  constructor() {
    // No caching needed - NOW is always computed fresh
  }

  canResolve(ref: string): boolean {
    // Match @now
    const cleanRef = ref.replace(/^@/, '');
    return cleanRef === 'now';
  }

  async resolve(ref: string, config?: any): Promise<ResolverContent> {
    // Get mocked time if available
    const currentTime = this.getMockedTime() || new Date();
    
    // Variable or path context - return ISO timestamp as text
    if (!config?.context || config.context === 'variable' || config.context === 'path') {
      return {
        content: currentTime.toISOString(),
        contentType: 'text',
        metadata: {
          source: 'now',
          timestamp: currentTime
        }
      };
    }
    
    // Import context - return structured data with common formats
    if (config.context === 'import') {
      const exports: Record<string, string> = {};
      const requestedImports = config.requestedImports || [];
      
      // If no specific imports requested, provide default exports
      if (requestedImports.length === 0) {
        exports.iso = currentTime.toISOString();
        exports.unix = Math.floor(currentTime.getTime() / 1000).toString();
        exports.date = currentTime.toISOString().split('T')[0];
        exports.time = currentTime.toTimeString().split(' ')[0];
      } else {
        // Process specific imports
        for (const importName of requestedImports) {
          if (importName === 'iso') {
            exports[importName] = currentTime.toISOString();
          } else if (importName === 'unix') {
            exports[importName] = Math.floor(currentTime.getTime() / 1000).toString();
          } else if (importName === 'date') {
            exports[importName] = currentTime.toISOString().split('T')[0];
          } else if (importName === 'time') {
            exports[importName] = currentTime.toTimeString().split(' ')[0];
          } else {
            // For custom format strings, just return ISO for now
            exports[importName] = currentTime.toISOString();
          }
        }
      }
      
      return {
        content: JSON.stringify(exports),
        contentType: 'data',
        metadata: {
          source: 'now',
          timestamp: currentTime
        }
      };
    }
    
    throw new ResolverError(
      'NOW resolver only supports variable and import contexts',
      ResolverErrorCode.UNSUPPORTED_CONTEXT,
      {
        resolverName: this.name,
        context: config?.context,
        operation: 'resolve'
      }
    );
  }


  /**
   * Get mocked time for testing
   */
  private getMockedTime(): Date | null {
    if (process.env.MLLD_MOCK_TIME) {
      // If it's a number, treat as Unix timestamp
      if (/^\d+$/.test(process.env.MLLD_MOCK_TIME)) {
        return new Date(parseInt(process.env.MLLD_MOCK_TIME) * 1000);
      }
      // Otherwise parse as ISO string
      return new Date(process.env.MLLD_MOCK_TIME);
    }
    return null;
  }

  /**
   * Get default value for when NOW is used as a variable
   * This handles the mock time logic for tests
   */
  getDefaultValue(): string {
    const currentTime = this.getMockedTime() || new Date();
    return currentTime.toISOString();
  }
}