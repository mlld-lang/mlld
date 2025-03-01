# URL Support in Meld - Fresh Implementation Plan

## Overview

This document outlines the plan for implementing URL support in Meld from a clean slate. We are taking a fresh approach with a strong focus on testing and incremental development.

## Guiding Principles

1. **Test-driven from day one**
   - No feature will be considered complete without passing tests
   - All implementations must have test coverage before being merged

2. **Incremental development**
   - Build small, focused components that do one thing well
   - Only move to the next phase when current phase is fully tested and stable

3. **Simplicity over complexity**
   - Prefer simple solutions that are easier to test and maintain
   - Avoid premature optimization and feature creep

## Implementation Phases

Each phase must fully satisfy its exit criteria before work on the next phase can begin.

### Phase 1: Core URL Fetching and Testing Infrastructure (Priority: Highest)

**Objective**: Create a minimal, reliable URL fetching service with robust testing infrastructure.

**Tasks**:
- Design a simple URLService interface with minimal methods
- Create reliable MockHTTPServer for testing
- Implement basic URL fetching with proper error handling
- Develop simple in-memory caching

**Exit Criteria**:
- [ ] URLService successfully fetches content from URLs
- [ ] URLService properly handles network errors
- [ ] Basic caching works correctly
- [ ] URL validation rejects invalid URLs
- [ ] All tests pass consistently
- [ ] MockHTTPServer reliably starts and stops in tests

### Phase 2: Integration with Meld Directives (Priority: High)

**Objective**: Enable URL imports and embeds within Meld documents.

**Tasks**:
- Add URL detection to PathService
- Update ImportDirectiveHandler to support URLs
- Update EmbedDirectiveHandler to support URLs
- Update ParserService to properly handle URL paths (leveraging existing meld-ast support)
- Implement circular reference detection for URLs

**Implementation Notes**:
- The meld-ast dependency already supports URLs through a `url: true` flag on path nodes
- ParserService should leverage this flag to distinguish between file paths and URLs
- Directive handlers need to check this flag to determine how to process the path

**Exit Criteria**:
- [ ] PathService correctly identifies URLs
- [ ] ParserService properly processes path nodes with `url: true` flag
- [ ] Import directives can load content from URLs
- [ ] Embed directives can include content from URLs
- [ ] Circular references across files and URLs are detected
- [ ] All integration tests pass consistently

### Phase 3: Caching and Performance (Priority: Medium)

**Objective**: Optimize URL fetching performance and resource usage.

**Tasks**:
- Implement configurable cache expiration
- Add memory usage controls
- Create response size limits
- Implement basic rate limiting

**Exit Criteria**:
- [ ] Cache expiration works as expected
- [ ] Memory usage stays within acceptable limits
- [ ] Large responses are handled properly
- [ ] Rate limiting prevents excessive requests
- [ ] Performance tests show acceptable response times

### Phase 4: Security Features (Priority: Medium)

**Objective**: Ensure secure URL handling.

**Tasks**:
- Create URL allowlist/blocklist functionality
- Implement domain restrictions
- Add protocol validation
- Create basic audit logging

**Exit Criteria**:
- [ ] Blocked URLs are properly rejected
- [ ] Domain restrictions work as expected
- [ ] Only allowed protocols are accepted
- [ ] URL access attempts are properly logged
- [ ] Security tests verify protection against common issues

### Phase 5: Advanced Features (Priority: Low)

**Objective**: Add optional enhancements after core functionality is stable.

**Tasks**:
- Implement custom headers support
- Add content type handling
- Create persistent cache
- Develop concurrent request handling

**Exit Criteria**:
- [ ] Custom headers are properly applied
- [ ] Different content types are handled correctly
- [ ] Persistent cache survives application restarts
- [ ] Concurrent requests are managed properly
- [ ] All previous tests continue to pass

## Component Design

### URLService

The central service responsible for fetching and managing URL content.

```typescript
/**
 * Service for fetching content from URLs
 */
export interface IURLService {
  /**
   * Fetch content from a URL
   * @param url The URL to fetch
   * @param options Optional fetch configuration
   * @returns The URL response with content and metadata
   */
  fetchURL(url: string, options?: URLFetchOptions): Promise<URLResponse>;
  
  /**
   * Check if a URL is allowed based on security rules
   * @param url The URL to validate
   * @returns True if the URL is allowed, false otherwise
   */
  isAllowed(url: string): boolean;
  
  /**
   * Clear the URL cache
   * @param url Optional specific URL to clear
   */
  clearCache(url?: string): void;
}
```

### ParserService Integration

The ParserService needs to be updated to properly handle URL paths. Fortunately, the meld-ast dependency already provides support for URLs.

```typescript
/**
 * In meld-ast, path nodes already have a url flag:
 * {
 *   type: 'path',
 *   value: 'https://example.com/document.meld',
 *   url: true
 * }
 */

// ParserService should detect and honor this flag
export class ParserService {
  // Existing methods...
  
  /**
   * Process a directive node, handling URL paths appropriately
   */
  processDirective(node: DirectiveNode): void {
    // For path parameters, check if they're URLs
    if (node.parameters && node.parameters.path) {
      const pathParam = node.parameters.path;
      const isUrl = pathParam.url === true;
      
      // Use appropriate handler based on whether it's a URL or not
      if (isUrl) {
        // Use URL-specific processing
      } else {
        // Use file path processing
      }
    }
    
    // Remaining processing...
  }
}
```

### URLResponse

The structure returned from URL fetch operations.

```typescript
/**
 * Response from a URL fetch operation
 */
export interface URLResponse {
  /**
   * The content of the URL
   */
  content: string;
  
  /**
   * Response metadata
   */
  metadata: {
    statusCode: number;
    contentType: string;
    lastModified?: string;
    [key: string]: unknown;
  };
  
  /**
   * Whether the response was from cache
   */
  fromCache: boolean;
  
  /**
   * The URL that was fetched
   */
  url: string;
}
```

### URLCache

Simple caching mechanism for URL responses.

```typescript
/**
 * Cache for URL responses
 */
export interface IURLCache {
  /**
   * Get a cached response
   * @param url The URL to retrieve
   * @returns The cached response or null if not found
   */
  get(url: string): URLResponse | null;
  
  /**
   * Store a response in the cache
   * @param url The URL to cache
   * @param response The response to cache
   */
  set(url: string, response: URLResponse): void;
  
  /**
   * Clear the cache
   * @param url Optional specific URL to clear
   */
  clear(url?: string): void;
}
```

## Testing Infrastructure

### MockHTTPServer

A reliable HTTP server for testing URL functionality.

```typescript
/**
 * HTTP server for testing URL functionality
 */
export class MockHTTPServer {
  /**
   * Start the server
   * @returns Promise resolving to the base URL
   */
  start(): Promise<string>;
  
  /**
   * Stop the server
   */
  stop(): Promise<void>;
  
  /**
   * Register a content route
   * @param path The path to serve
   * @param content The content to return
   * @param contentType Optional content type
   */
  registerContent(path: string, content: string, contentType?: string): void;
  
  /**
   * Register a JSON route
   * @param path The path to serve
   * @param data The JSON data to return
   */
  registerJSON(path: string, data: object): void;
  
  /**
   * Register an error route
   * @param path The path to serve
   * @param statusCode HTTP status code
   * @param message Error message
   */
  registerError(path: string, statusCode: number, message: string): void;
}
```

## Test Strategy

### Unit Tests

**URLService Tests**
- Test fetching from valid URLs
- Test handling of network errors
- Test caching behavior
- Test URL validation

**URLCache Tests**
- Test storing and retrieving responses
- Test cache expiration
- Test cache size limits

**ParserService Tests**
- Test recognition of URL paths via `url: true` flag
- Test correct routing of URL vs. file paths
- Test error handling for malformed URLs

### Integration Tests

**Directive Handler Tests**
- Test importing from URLs
- Test embedding from URLs
- Test error handling in directives

**CircularityService Tests**
- Test detection of circular references across files and URLs

### End-to-End Tests

- Test complete Meld documents with URL imports and embeds
- Test error recovery scenarios
- Test with various URL types and content formats

## Implementation Approach

1. **Start with testing infrastructure**
   - Build and thoroughly test MockHTTPServer first
   - Create test utilities for URL testing

2. **Implement core URLService**
   - Start with minimal functionality
   - Add features incrementally with tests

3. **Integrate with directive handlers**
   - Add URL support to existing handlers
   - Leverage meld-ast's `url: true` flag in ParserService
   - Test extensively with different URLs

4. **Only then add advanced features**
   - Each feature must have tests written first
   - Each feature must pass all tests before merging

## Next Steps

1. Delete existing URL implementation and start fresh
2. Create robust MockHTTPServer implementation
3. Design and implement minimal URLService interface
4. Update ParserService to utilize meld-ast's URL flag
5. Add URL detection to PathService
6. Update directive handlers to support URLs
7. Implement testing for each component

## Conclusion

This fresh implementation plan focuses on building a reliable URL service from the ground up using a test-driven approach. By leveraging existing support in meld-ast and focusing on quality from the beginning, we will create a robust and maintainable solution for URL handling in Meld.
