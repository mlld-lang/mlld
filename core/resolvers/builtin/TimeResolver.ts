import { 
  Resolver, 
  ResolverContent, 
  ResolverCapabilities,
  ResolverType
} from '@core/resolvers/types';
import { ResolverError } from '@core/errors';

/**
 * Built-in resolver for time/date values with format support
 */
export class TimeResolver implements Resolver {
  name = 'TIME';
  description = 'Provides current time/date with format support';
  type = 'input' as const;
  
  capabilities: ResolverCapabilities = {
    io: { read: true, write: false, list: false },
    needs: { network: false, cache: false, auth: false },
    contexts: { import: true, path: false, output: false },
    resourceType: 'function',
    priority: 1,
    cache: { strategy: 'none' }, // TIME is always computed fresh
    supportedFormats: [
      'iso',
      'unix', 
      'date',
      'time',
      'datetime',
      'YYYY-MM-DD',
      'HH:mm:ss',
      'YYYY-MM-DD HH:mm:ss',
      'custom'
    ]
  };

  constructor() {
    // No caching needed - TIME is always computed fresh
  }

  canResolve(ref: string): boolean {
    // Match @TIME or @TIME/format
    const cleanRef = ref.replace(/^@/, '');
    return cleanRef === 'TIME' || cleanRef.startsWith('TIME/');
  }

  async resolve(ref: string): Promise<ResolverContent> {
    // Extract format from reference if provided
    const cleanRef = ref.replace(/^@/, '');
    const parts = cleanRef.split('/');
    const format = parts.length > 1 ? parts.slice(1).join('/') : 'iso';

    // Generate time based on format
    const now = this.getMockedTime() || new Date();
    const formattedTime = this.formatTime(now, format);

    return {
      content: formattedTime,
      metadata: {
        source: 'TIME',
        timestamp: now
      }
    };
  }

  /**
   * Format time according to requested format
   */
  private formatTime(date: Date, format: string): string {
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

    return format
      .replace(/YYYY/g, String(year))
      .replace(/YY/g, String(year).slice(-2))
      .replace(/MM/g, month)
      .replace(/M/g, String(date.getMonth() + 1))
      .replace(/DD/g, day)
      .replace(/D/g, String(date.getDate()))
      .replace(/HH/g, hours)
      .replace(/H/g, String(date.getHours()))
      .replace(/mm/g, minutes)
      .replace(/m/g, String(date.getMinutes()))
      .replace(/ss/g, seconds)
      .replace(/s/g, String(date.getSeconds()))
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
   * Get exportable data for imports
   */
  async getExportData(format?: string): Promise<Record<string, any>> {
    // For import { "format" as alias } from @TIME
    if (format && this.capabilities.supportedFormats?.includes(format)) {
      const result = await this.resolve(`@TIME/${format}`);
      return { [format]: result.content };
    }

    // For import { * } from @TIME - return common formats
    const commonFormats = ['iso', 'unix', 'date', 'time', 'datetime'];
    const data: Record<string, string> = {};
    
    for (const fmt of commonFormats) {
      const result = await this.resolve(`@TIME/${fmt}`);
      data[fmt] = result.content;
    }
    
    return data;
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