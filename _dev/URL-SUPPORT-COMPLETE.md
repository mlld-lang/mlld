# URL Content Resolution Architectural Plan

## Implementation Strategy with Embed Refactoring Consideration

This implementation plan is designed to work alongside ongoing embed refactoring efforts. We'll implement the architectural improvements in phases, with a clear stopping point before touching the EmbedDirectiveHandler.

## Phase 1: Create URLContentResolver Service (Independent Change)

In this phase, we'll create the new URL content resolver without modifying any existing functionality. This ensures no disruption to ongoing work.

### 1.1 Create Directory Structure
```bash
mkdir -p /services/resolution/URLContentResolver/errors
```

### 1.2 Create IURLCache Interface
```typescript
// @services/resolution/URLContentResolver/IURLCache.ts
// Copy from existing /services/fs/PathService/IURLCache.ts
```

### 1.3 Create URLCache Implementation
```typescript
// @services/resolution/URLContentResolver/URLCache.ts
// Copy from existing /services/fs/PathService/URLCache.ts
```

### 1.4 Create URL Error Classes
Copy all files from `/services/fs/PathService/errors/url/` to `/services/resolution/URLContentResolver/errors/`, updating import paths.

### 1.5 Create IURLContentResolver Interface
```typescript
// @services/resolution/URLContentResolver/IURLContentResolver.ts
import type { URLResponse, URLFetchOptions } from './IURLCache.js';

/**
 * Options for URL validation and operations
 */
export interface URLValidationOptions {
  /**
   * Allowed protocols
   * @default ['http', 'https']
   */
  allowedProtocols?: string[];
  
  /**
   * Domain allowlist (if empty, all domains allowed unless blocklisted)
   */
  allowedDomains?: string[];
  
  /**
   * Domain blocklist (overrides allowlist)
   */
  blockedDomains?: string[];
  
  /**
   * Maximum response size in bytes
   * @default 5MB
   */
  maxResponseSize?: number;
  
  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
}

/**
 * Service for resolving content from URLs
 * 
 * This service is responsible for:
 * 1. Validating URLs against security policies
 * 2. Fetching content from URLs
 * 3. Caching URL responses
 * 4. Managing URL-specific errors
 */
export interface IURLContentResolver {
  /**
   * Validate a URL according to security policy.
   * 
   * @param url - The URL to validate
   * @param options - Validation options
   * @returns The validated URL
   * @throws {URLValidationError} If URL is invalid
   * @throws {URLSecurityError} If URL is blocked by security policy
   */
  validateURL(url: string, options?: URLValidationOptions): Promise<string>;

  /**
   * Fetch content from a URL with caching.
   * 
   * @param url - The URL to fetch
   * @param options - Fetch options
   * @returns The URL response with content and metadata
   * @throws {URLFetchError} If fetch fails
   * @throws {URLSecurityError} If URL is blocked or response too large
   */
  fetchURL(url: string, options?: URLFetchOptions): Promise<URLResponse>;

  /**
   * Clear the URL cache.
   * 
   * @param url - Optional specific URL to clear
   */
  clearCache(url?: string): void;

  /**
   * Get the current size of the URL cache.
   * 
   * @returns The number of cached URLs
   */
  getCacheSize(): number;
}
```

### 1.6 Implement URLContentResolver

```typescript
// @services/resolution/URLContentResolver/URLContentResolver.ts
import { injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { URLCache } from './URLCache.js';
import type { IURLCache, URLResponse, URLFetchOptions } from './IURLCache.js';
import type { IURLContentResolver, URLValidationOptions } from './IURLContentResolver.js';
import { 
  URLError, 
  URLValidationError, 
  URLSecurityError, 
  URLFetchError 
} from './errors/index.js';

@injectable()
@Service({
  description: 'Service for resolving content from URLs'
})
export class URLContentResolver implements IURLContentResolver {
  private urlCache: IURLCache;
  
  /**
   * Default options for URL validation
   */
  private defaultURLValidationOptions: URLValidationOptions = {
    allowedProtocols: ['http', 'https'],
    allowedDomains: [],
    blockedDomains: [],
    maxResponseSize: 5 * 1024 * 1024, // 5MB
    timeout: 30000 // 30 seconds
  };

  constructor() {
    // Initialize URL cache with default size
    this.urlCache = new URLCache(100);
  }

  /**
   * Check if a string is a valid URL.
   * 
   * @param url - String to check
   * @returns True if the string is a valid URL
   */
  private isValidURL(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return !!parsedUrl.protocol && !!parsedUrl.host;
    } catch {
      return false;
    }
  }

  /**
   * Validate a URL according to security policy.
   * 
   * @param url - The URL to validate
   * @param options - Validation options
   * @returns The validated URL
   */
  async validateURL(url: string, options?: URLValidationOptions): Promise<string> {
    // Combine provided options with defaults
    const opts = {
      ...this.defaultURLValidationOptions,
      ...options
    };
    
    // Validate URL format
    if (!this.isValidURL(url)) {
      throw new URLValidationError(url, 'Invalid URL format');
    }
    
    // Parse URL for validation
    const parsedUrl = new URL(url);
    
    // Check protocol
    if (opts.allowedProtocols && !opts.allowedProtocols.includes(parsedUrl.protocol.replace(':', ''))) {
      throw new URLSecurityError(
        url, 
        `Protocol not allowed: ${parsedUrl.protocol}. Allowed protocols: ${opts.allowedProtocols.join(', ')}`
      );
    }
    
    // Check domain against allowlist if configured
    if (opts.allowedDomains && opts.allowedDomains.length > 0) {
      const domain = parsedUrl.hostname;
      if (!opts.allowedDomains.some(allowed => domain === allowed || domain.endsWith('.' + allowed))) {
        throw new URLSecurityError(
          url, 
          `Domain not allowed: ${domain}. Allowed domains: ${opts.allowedDomains.join(', ')}`
        );
      }
    }
    
    // Check domain against blocklist (overrides allowlist)
    if (opts.blockedDomains && opts.blockedDomains.length > 0) {
      const domain = parsedUrl.hostname;
      if (opts.blockedDomains.some(blocked => domain === blocked || domain.endsWith('.' + blocked))) {
        throw new URLSecurityError(
          url, 
          `Domain blocked: ${domain}`
        );
      }
    }
    
    return url;
  }

  /**
   * Fetch content from a URL with caching.
   * 
   * @param url - The URL to fetch
   * @param options - Fetch options
   * @returns The URL response with content and metadata
   */
  async fetchURL(url: string, options?: URLFetchOptions): Promise<URLResponse> {
    // Combine provided options with defaults
    const opts: Required<URLFetchOptions> = {
      bypassCache: false,
      headers: {},
      timeout: this.defaultURLValidationOptions.timeout!,
      ...options
    };
    
    // Check cache first unless bypass requested
    if (!opts.bypassCache && this.urlCache.has(url)) {
      const cached = this.urlCache.get(url);
      if (cached) {
        // Return cached response with fromCache flag
        return {
          ...cached,
          fromCache: true
        };
      }
    }
    
    try {
      // Validate URL before fetching
      await this.validateURL(url, {
        timeout: opts.timeout
      });
      
      // Use fetch API to get content
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeout);
      
      const response = await fetch(url, {
        headers: opts.headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new URLFetchError(url, `HTTP error ${response.status}`, response.status);
      }
      
      // Check content size if possible
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.defaultURLValidationOptions.maxResponseSize!) {
        throw new URLSecurityError(url, `Response too large: ${contentLength} bytes`);
      }
      
      // Get content
      const content = await response.text();
      
      // Check actual content size
      if (content.length > this.defaultURLValidationOptions.maxResponseSize!) {
        throw new URLSecurityError(url, `Response too large: ${content.length} bytes`);
      }
      
      // Create response object
      const urlResponse: URLResponse = {
        content,
        metadata: {
          statusCode: response.status,
          contentType: response.headers.get('content-type') || 'text/plain',
          lastModified: response.headers.get('last-modified') || undefined
        },
        fromCache: false,
        url
      };
      
      // Store in cache
      this.urlCache.set(url, urlResponse);
      
      return urlResponse;
    } catch (error) {
      if (error instanceof URLError) {
        throw error;
      }
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new URLFetchError(url, `Request timed out after ${opts.timeout}ms`);
      }
      
      throw new URLFetchError(url, (error as Error).message, undefined, error as Error);
    }
  }

  /**
   * Clear the URL cache.
   * 
   * @param url - Optional specific URL to clear
   */
  clearCache(url?: string): void {
    this.urlCache.clear(url);
  }

  /**
   * Get the current size of the URL cache.
   * 
   * @returns The number of cached URLs
   */
  getCacheSize(): number {
    return this.urlCache.size();
  }
}
```

### 1.7 Create Barrel File for Exports

```typescript
// @services/resolution/URLContentResolver/index.ts
export * from './IURLCache.js';
export * from './IURLContentResolver.js';
export * from './URLContentResolver.js';
export * from './errors/index.js';
```

### 1.8 Register in DI Container

```typescript
// @core/di-config.ts

// Add URLContentResolver to container
container.register<IURLContentResolver>('IURLContentResolver', {
  useClass: URLContentResolver
});

// Update service initialization order - add it after ResolutionService
const serviceInitializationOrder = [
  // ...
  'IResolutionService',
  'IURLContentResolver', // Add here
  'IDirectiveService',
  // ...
];
```

### 1.9 Write Unit Tests

```typescript
// @tests/resolution/URLContentResolver.test.ts
// Basic tests for URL validation, fetching, and caching
```

## Phase 2: Backward-Compatible PathService Delegation

In this phase, we'll update PathService to delegate URL operations to URLContentResolver while maintaining its existing API.

### 2.1 Update PathService to Use URLContentResolver

```typescript
// @services/fs/PathService/PathService.ts

import { inject } from 'tsyringe';
import { IURLContentResolver, URLValidationOptions } from '@services/resolution/URLContentResolver/IURLContentResolver.js';
import type { URLResponse, URLFetchOptions } from '@services/resolution/URLContentResolver/IURLCache.js';

// In PathService class constructor:
constructor(
  @inject(ProjectPathResolver) private readonly projectPathResolver: ProjectPathResolver,
  @inject('IURLContentResolver') private readonly urlContentResolver: IURLContentResolver
) {
  // Existing constructor code...
}

// Keep the isURL method implementation unchanged
public isURL(path: string): boolean {
  try {
    const url = new URL(path);
    return !!url.protocol && !!url.host;
  } catch {
    return false;
  }
}

// Update validateURL to delegate to URLContentResolver
public async validateURL(url: string, options?: URLValidationOptions): Promise<string> {
  return this.urlContentResolver.validateURL(url, options);
}

// Update fetchURL to delegate to URLContentResolver
public async fetchURL(url: string, options?: URLFetchOptions): Promise<URLResponse> {
  return this.urlContentResolver.fetchURL(url, options);
}
```

### 2.2 Write Integration Tests

```typescript
// @tests/integration/PathServiceURLDelegation.test.ts
// Tests to ensure PathService properly delegates to URLContentResolver
```

## Phase 3: Update ImportDirectiveHandler (STOPPING POINT)

This is where we'll integrate the first directive handler and then stop to avoid conflicting with embed refactoring work.

### 3.1 Update ImportDirectiveHandler

```typescript
// @services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.ts

import { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver.js';

// In constructor:
constructor(
  // ...other dependencies
  @inject('IURLContentResolver') private urlContentResolver: IURLContentResolver,
  // ...
) {
  // ...
}

// In execute method, for URL handling section, replace:
// await this.pathService.validateURL(urlToFetch, urlOptions);
// const response = await this.pathService.fetchURL(urlToFetch, { ... });

// With:
await this.urlContentResolver.validateURL(urlToFetch, urlOptions);
const response = await this.urlContentResolver.fetchURL(urlToFetch, {
  bypassCache: false,
  timeout: urlOptions?.timeout
});
```

### 3.2 Write Import Handler Integration Tests

```typescript
// @tests/pipeline/ImportDirectiveURLIntegration.test.ts
// Tests to ensure ImportDirectiveHandler works with URLContentResolver
```

## STOPPING POINT

**We will stop implementation here to avoid conflicts with ongoing embed refactoring work.**

## Future Phases (After Embed Refactoring)

These phases would be implemented after the embed refactoring work is complete:

### Future Phase 4: Update EmbedDirectiveHandler
- Inject URLContentResolver
- Update URL handling to use URLContentResolver directly

### Future Phase 5: Clean Up PathService
- Deprecate URL methods in PathService
- Eventually remove URL methods from PathService

## Benefits of This Phased Approach

1. **Minimal Disruption**:
   - Phase 1 adds new code without touching existing functionality
   - Phase 2 maintains backward compatibility
   - Phase 3 updates only the Import handler, avoiding conflict with embed work

2. **Clear Stopping Point**:
   - Implementation pauses after Phase 3.1 (ImportDirectiveHandler)
   - EmbedDirectiveHandler modifications deferred until after refactoring

3. **Immediate Architectural Benefits**:
   - Proper separation of concerns
   - Better aligned with Resolution Services
   - Improved testability

4. **Future Flexibility**:
   - Clean migration path for eventual EmbedDirectiveHandler update
   - Option to remove PathService URL methods when ready

This approach gives us the architectural improvements we need while ensuring we don't conflict with ongoing embed refactoring work.