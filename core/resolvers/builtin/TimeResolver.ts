import { 
  Resolver, 
  ResolverContent, 
  ResolverCapabilities,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError, ResolverErrorCode } from '@core/errors';

/**
 * Built-in resolver for time/date values with format support
 */
export class TimeResolver implements Resolver {
  name = 'TIME';
  description = 'Provides current time/date with format support';
  type = 'input' as const;
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    contexts: { import: true, path: true, output: false },
    supportedContentTypes: ['text', 'data'],
    defaultContentType: 'text',
    priority: 1,
    cache: { strategy: 'none' } // TIME is always computed fresh
  };

  constructor() {
    // No caching needed - TIME is always computed fresh
  }

  canResolve(ref: string): boolean {
    // Match @TIME or @TIME/format
    const cleanRef = ref.replace(/^@/, '');
    return cleanRef === 'TIME' || cleanRef.startsWith('TIME/');
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
          source: 'TIME',
          timestamp: currentTime
        }
      };
    }
    
    // Import context - return structured data
    if (config.context === 'import') {
      const exports: Record<string, string> = {};
      // If no specific imports requested, provide all common formats
      const formats = config.requestedImports || ['iso', 'unix', 'date', 'time', 'datetime', 'timestamp'];
      
      for (const format of formats) {
        exports[format] = this.formatTimestamp(currentTime, format);
      }
      
      return {
        content: JSON.stringify(exports),
        contentType: 'data',
        metadata: {
          source: 'TIME',
          timestamp: currentTime
        }
      };
    }
    
    throw new ResolverError(
      'TIME resolver only supports variable and import contexts',
      ResolverErrorCode.UNSUPPORTED_CONTEXT,
      {
        resolverName: this.name,
        context: config?.context,
        operation: 'resolve'
      }
    );
  }

  /**
   * Format time according to requested format
   */
  private formatTimestamp(date: Date, format: string): string {
    // Handle named formats
    switch (format.toLowerCase()) {
      case 'iso':
        return date.toISOString();
      
      case 'unix':
        return Math.floor(date.getTime() / 1000).toString();
      
      case 'date':
        return this.formatCustom(date, 'YYYY-MM-DD');
      
      case 'time':
        return this.formatCustom(date, 'HH:mm:ss');
      
      case 'datetime':
        return this.formatCustom(date, 'YYYY-MM-DD HH:mm:ss');
      
      default:
        // Assume it's a custom format string
        return this.formatCustom(date, format);
    }
  }

  /**
   * Format date with custom format string
   */
  private formatCustom(date: Date, format: string): string {
    // Use UTC methods to avoid timezone issues
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');

    return format
      .replace(/YYYY/g, String(year))
      .replace(/YY/g, String(year).slice(-2))
      .replace(/MM/g, month)
      .replace(/M/g, String(date.getUTCMonth() + 1))
      .replace(/DD/g, day)
      .replace(/D/g, String(date.getUTCDate()))
      .replace(/HH/g, hours)
      .replace(/H/g, String(date.getUTCHours()))
      .replace(/mm/g, minutes)
      .replace(/m/g, String(date.getUTCMinutes()))
      .replace(/ss/g, seconds)
      .replace(/s/g, String(date.getUTCSeconds()))
      .replace(/SSS/g, milliseconds);
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
   * Get default value for when TIME is used as a variable
   * This handles the mock time logic for tests
   */
  getDefaultValue(): string {
    const mockTime = process.env.MLLD_MOCK_TIME;
    if (mockTime) {
      // If it's a number, return it as-is (Unix timestamp)
      if (/^\d+$/.test(mockTime)) {
        return mockTime;
      }
      // Otherwise parse as ISO string and return ISO format
      return new Date(mockTime).toISOString();
    }
    // Default to current time in ISO format
    return new Date().toISOString();
  }
}