# URL Functionality Implementation Plan

## Background

URL support in Meld allows users to fetch remote content via HTTP/HTTPS in directives like `@import` and `@embed`. While the core URL handling is implemented in `PathService` (`isURL()`, `validateURL()`, and `fetchURL()`), the directive handlers currently throw "not yet supported" errors when URLs are used.

## Implementation Overview

The implementation will enable URL support in directives by leveraging the existing functionality in PathService. All the necessary URL handling capabilities are already implemented, including security controls, validation, and caching. We only need to update the directive handlers to use this functionality.

## Implementation Tasks

### 1. Update EmbedDirectiveHandler

The `EmbedDirectiveHandler` implementation is simpler as it only needs to fetch content and doesn't need to parse it:

```typescript
// Replace the URL handling block in EmbedDirectiveHandler.ts:
if (isURLEmbed) {
  const urlToFetch = url || (typeof path === 'string' ? path : '');
  
  if (!urlToFetch) {
    throw new DirectiveError(
      'URL embedding requires a valid URL',
      this.kind,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  try {
    // Validate URL according to security policy
    await this.pathService.validateURL(urlToFetch, urlOptions);
    
    // Fetch content with caching
    const response = await this.pathService.fetchURL(urlToFetch, {
      bypassCache: false,
      timeout: urlOptions?.timeout
    });
    
    // Use the fetched content
    content = response.content;
    
    // Register source for debugging and error reporting
    if (typeof require === 'function') {
      try {
        const { registerSource, addMapping } = require('@core/utils/sourceMapUtils.js');
        registerSource(urlToFetch, content);
        
        if (node.location && node.location.start) {
          addMapping(
            urlToFetch,
            1, // Start at line 1 of the fetched content
            1, // Start at column 1
            node.location.start.line,
            node.location.start.column
          );
        }
      } catch (err) {
        this.logger.debug('Source mapping not available, skipping', { error: err });
      }
    }
  } catch (error) {
    // Handle URL-specific errors
    if (error instanceof URLValidationError || 
        error instanceof URLSecurityError || 
        error instanceof URLFetchError) {
      throw new DirectiveError(
        `URL embedding failed: ${error.message}`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { cause: error }
      );
    }
    throw error;
  }
}
```

### 2. Update ImportDirectiveHandler

The `ImportDirectiveHandler` implementation is more complex as it needs to:
- Fetch content from the URL
- Parse the content 
- Handle variables and circularity checking

```typescript
// Replace the URL handling block in ImportDirectiveHandler.ts:
if (isURLImport) {
  const urlToFetch = url || (typeof path === 'string' ? path : '');
  
  if (!urlToFetch) {
    throw new DirectiveError(
      'URL import requires a valid URL',
      this.kind,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  
  try {
    // Validate URL according to security policy
    await this.pathService.validateURL(urlToFetch, urlOptions);
    
    // Check for circular imports using the URL as the identifier
    try {
      this.circularityService.beginImport(urlToFetch);
    } catch (error: any) {
      throw new DirectiveError(
        `Circular import detected: ${error.message}`,
        this.kind,
        DirectiveErrorCode.CIRCULAR_REFERENCE
      );
    }
    
    // Fetch content with caching
    const response = await this.pathService.fetchURL(urlToFetch, {
      bypassCache: false,
      timeout: urlOptions?.timeout
    });
    
    // Set the URL as the resolved path for source mapping and error reporting
    resolvedFullPath = urlToFetch;
    fileContent = response.content;
    
    // Register for source mapping
    try {
      const { registerSource, addMapping } = require('@core/utils/sourceMapUtils.js');
      registerSource(resolvedFullPath, fileContent);
      
      if (node.location && node.location.start) {
        addMapping(
          resolvedFullPath,
          1, // Start at line 1 of the imported file
          1, // Start at column 1
          node.location.start.line,
          node.location.start.column
        );
      }
    } catch (err) {
      logger.debug('Source mapping not available, skipping', { error: err });
    }
  } catch (error) {
    // Wrap URL-specific errors
    if (error instanceof URLValidationError || 
        error instanceof URLSecurityError) {
      throw new DirectiveError(
        `URL validation error: ${error.message}`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { cause: error }
      );
    }
    
    if (error instanceof URLFetchError) {
      throw new DirectiveError(
        `Failed to fetch URL: ${error.message}`,
        this.kind,
        DirectiveErrorCode.FILE_NOT_FOUND, // Use FILE_NOT_FOUND for fetch errors
        { cause: error }
      );
    }
    
    // Re-throw other errors
    throw error;
  }
}
```

### 3. Update Import Statements

Both directive handlers need to import the URL error types:

```typescript
import { 
  URLError, 
  URLValidationError, 
  URLSecurityError, 
  URLFetchError 
} from '@services/fs/PathService/errors/url/index.js';
```

### 4. Add Tests

Add tests for URL functionality in both directives:

1. Simple URL fetch test
2. URL with security options test
3. Error cases:
   - Invalid URL format
   - Blocked domain
   - Network error
   - Response too large
4. Section extraction from URL content
5. URL caching test
6. Circular URL import test

## Testing Methodology

1. Use `nock` or similar library to mock HTTP responses for unit tests
2. Create a small set of integration tests that use real URLs (GitHub raw content)
3. Test with various security configurations
4. Verify cache behavior

## Security Considerations

1. Ensure that all security controls defined in `urlOptions` are respected
2. Verify size limit enforcement
3. Test domain allow/blocklist functionality
4. Test protocol restriction

## Backwards Compatibility

This implementation will maintain backward compatibility:
- URLs are only used when explicitly enabled with `allowURLs=true`
- All existing file-based functionality remains unchanged
- Error messages clearly indicate when URL usage is the cause

## Timeline

1. Update `EmbedDirectiveHandler` - 1 hour
2. Update `ImportDirectiveHandler` - 2 hours
3. Write tests - 2 hours
4. Manual testing and bug fixes - 1 hour

Total implementation time: ~6 hours