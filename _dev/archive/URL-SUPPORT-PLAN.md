# URL Support Implementation Plan for Interpreter Architecture

## Overview

This plan translates the URL support concepts from the old service-oriented architecture to our new interpreter-based architecture. The goal is to enable fetching remote content via HTTP/HTTPS in directives like `@import`, `@embed`, and `@path`.

## Current Architecture Context

- **Interpreter Pattern**: We now use a traditional recursive interpreter with an `evaluate()` function
- **Environment Class**: Combines state management with capabilities (file I/O, command execution)
- **Direct Evaluation**: Each directive evaluator handles its work directly, no service orchestration
- **No Services**: We've moved away from the service-oriented approach entirely

## URL Support Requirements (From Old Plans)

### Core Features
1. **URL Detection**: Recognize URLs vs file paths
2. **URL Validation**: Security and format validation
3. **Caching**: Cache fetched content to improve performance
4. **Security Controls**:
   - Domain allowlists and blocklists
   - Protocol restrictions (default: http/https only)
   - Response size limits
   - Request timeouts

### Usage Example
```mlld
// Import from URL
@import "https://example.com/data.mld"

// Embed content from URL
@embed "https://raw.githubusercontent.com/user/repo/main/README.md"

// Path reference to URL
@path apiEndpoint = "https://api.example.com/v1/data"
```

## Implementation Strategy for Interpreter

### 1. Add URL Support to Environment

Since our Environment class already handles file I/O, it's the natural place to add URL fetching capabilities.

```typescript
// interpreter/env/Environment.ts

export class Environment {
  // Existing properties...
  private urlCache: Map<string, { content: string; timestamp: number }> = new Map();
  private urlCacheMaxAge = 5 * 60 * 1000; // 5 minutes
  
  // URL validation options
  private urlOptions = {
    allowedProtocols: ['http', 'https'],
    allowedDomains: [] as string[],
    blockedDomains: [] as string[],
    maxResponseSize: 5 * 1024 * 1024, // 5MB
    timeout: 30000 // 30 seconds
  };

  // Check if a string is a URL
  isURL(path: string): boolean {
    try {
      const url = new URL(path);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  // Validate URL against security policy
  async validateURL(url: string): Promise<void> {
    const parsed = new URL(url);
    
    // Check protocol
    if (!this.urlOptions.allowedProtocols.includes(parsed.protocol.slice(0, -1))) {
      throw new Error(`Protocol not allowed: ${parsed.protocol}`);
    }
    
    // Check domain allowlist if configured
    if (this.urlOptions.allowedDomains.length > 0) {
      const allowed = this.urlOptions.allowedDomains.some(
        domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      );
      if (!allowed) {
        throw new Error(`Domain not allowed: ${parsed.hostname}`);
      }
    }
    
    // Check domain blocklist
    const blocked = this.urlOptions.blockedDomains.some(
      domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
    if (blocked) {
      throw new Error(`Domain blocked: ${parsed.hostname}`);
    }
  }

  // Fetch URL with caching
  async fetchURL(url: string): Promise<string> {
    // Check cache first
    const cached = this.urlCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.urlCacheMaxAge) {
      return cached.content;
    }
    
    // Validate URL
    await this.validateURL(url);
    
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.urlOptions.timeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      // Check content size
      const content = await response.text();
      if (content.length > this.urlOptions.maxResponseSize) {
        throw new Error(`Response too large: ${content.length} bytes`);
      }
      
      // Cache the response
      this.urlCache.set(url, { content, timestamp: Date.now() });
      
      return content;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.urlOptions.timeout}ms`);
      }
      throw error;
    }
  }

  // Update readFile to handle URLs
  async readFile(pathOrUrl: string): Promise<string> {
    if (this.isURL(pathOrUrl)) {
      return this.fetchURL(pathOrUrl);
    }
    // Existing file reading logic...
    return this.originalReadFile(pathOrUrl);
  }

  // Configure URL options (could be called from CLI with flags)
  setURLOptions(options: Partial<typeof this.urlOptions>): void {
    Object.assign(this.urlOptions, options);
  }
}
```

### 2. Update Import Evaluator

The import evaluator needs to handle URL imports with proper error handling and circular import detection.

```typescript
// interpreter/eval/import.ts

async function evaluateImport(node: ImportDirective, env: Environment): Promise<string> {
  const { path, allowURLs = false } = node;
  
  // Resolve the path (could be a variable)
  const resolvedPath = await resolvePath(path, env);
  
  // Check if URL support is needed
  if (env.isURL(resolvedPath)) {
    if (!allowURLs) {
      throw new Error(`URL imports require allowURLs=true: ${resolvedPath}`);
    }
    
    // Check for circular imports (URLs use themselves as identifiers)
    if (env.isImporting(resolvedPath)) {
      throw new Error(`Circular import detected: ${resolvedPath}`);
    }
    
    try {
      env.beginImport(resolvedPath);
      
      // Fetch and parse the content
      const content = await env.fetchURL(resolvedPath);
      
      // Parse the imported content
      const parsed = parse(content);
      
      // Evaluate in a new scope
      const importEnv = env.createChildEnvironment();
      const result = await evaluate(parsed, importEnv);
      
      // Handle variable extraction...
      
      return result;
    } finally {
      env.endImport(resolvedPath);
    }
  }
  
  // Existing file import logic...
}
```

### 3. Update Embed Evaluator

The embed evaluator is simpler as it just needs to fetch and return content.

```typescript
// interpreter/eval/text.ts (or wherever embed is evaluated)

async function evaluateEmbed(node: EmbedDirective, env: Environment): Promise<string> {
  const { path, url, allowURLs = false } = node;
  
  const targetPath = url || path;
  
  if (env.isURL(targetPath)) {
    if (!allowURLs) {
      throw new Error(`URL embedding requires allowURLs=true: ${targetPath}`);
    }
    
    // Fetch the content
    const content = await env.fetchURL(targetPath);
    
    // Apply any section extraction or transformations...
    
    return content;
  }
  
  // Existing file embed logic...
}
```

### 4. Update Path Evaluator

Path assignments can reference URLs for later use.

```typescript
// interpreter/eval/path.ts

async function evaluatePath(node: PathDirective, env: Environment): Promise<string> {
  const { identifier, path, allowURLs = false } = node;
  
  // Resolve the path value
  const resolvedPath = await resolvePath(path, env);
  
  // Validate URL if needed
  if (env.isURL(resolvedPath) && !allowURLs) {
    throw new Error(`URL paths require allowURLs=true: ${resolvedPath}`);
  }
  
  // Store the path (URL or file path)
  env.setVariable(identifier, resolvedPath);
  
  return ''; // Path directives don't produce output
}
```

### 5. CLI Integration

Add CLI flags to configure URL support:

```typescript
// cli/index.ts

const cli = new Command()
  .option('--allow-urls', 'Enable URL support in directives')
  .option('--url-timeout <ms>', 'URL request timeout in milliseconds', '30000')
  .option('--url-max-size <bytes>', 'Maximum URL response size', '5242880')
  .option('--url-allowed-domains <domains>', 'Comma-separated list of allowed domains')
  .option('--url-blocked-domains <domains>', 'Comma-separated list of blocked domains');

// In the action handler:
if (options.allowUrls) {
  env.setURLOptions({
    timeout: parseInt(options.urlTimeout),
    maxResponseSize: parseInt(options.urlMaxSize),
    allowedDomains: options.urlAllowedDomains?.split(',').filter(Boolean) || [],
    blockedDomains: options.urlBlockedDomains?.split(',').filter(Boolean) || []
  });
}
```

## Testing Strategy

### 1. Unit Tests for Environment URL Methods
- Test URL detection
- Test URL validation with various security configurations
- Test caching behavior
- Mock fetch for predictable tests

### 2. Integration Tests for Evaluators
- Test import from URL
- Test embed from URL
- Test path assignment with URL
- Test error cases (blocked domains, timeouts, etc.)

### 3. E2E Tests
- Create fixtures that use real URLs (GitHub raw content)
- Test with various security configurations
- Test circular import detection with URLs

## Implementation Order

1. **Phase 1: Environment URL Support**
   - Add URL methods to Environment class
   - Add basic URL detection and fetching
   - Write unit tests

2. **Phase 2: Import Support**
   - Update import evaluator
   - Add circular import detection for URLs
   - Write tests

3. **Phase 3: Embed Support**
   - Update embed evaluator (simpler than import)
   - Write tests

4. **Phase 4: Path Support**
   - Update path evaluator
   - Ensure URLs work in variable interpolation
   - Write tests

5. **Phase 5: CLI Integration**
   - Add CLI flags
   - Document usage
   - Write E2E tests

## Security Considerations

1. **Default Deny**: URL support must be explicitly enabled with `allowURLs=true`
2. **Size Limits**: Enforce maximum response size to prevent memory issues
3. **Timeouts**: Prevent hanging on slow/unresponsive servers
4. **Domain Controls**: Allow users to restrict which domains can be accessed
5. **Protocol Limits**: Only allow HTTP/HTTPS by default

## Migration from Service Architecture

The key differences from the old service-oriented approach:

1. **No URLContentResolver Service**: URL functionality is built into Environment
2. **No Dependency Injection**: Direct method calls on Environment
3. **Simpler Error Handling**: Standard JavaScript errors instead of custom error classes
4. **Integrated Caching**: Cache is part of Environment, not a separate service
5. **Direct Evaluation**: Evaluators handle URLs directly, no delegation

## Example Usage

```mlld
// Basic URL import
@import "https://raw.githubusercontent.com/user/repo/main/config.mld"

// URL embed with section
@embed "https://example.com/docs.md#installation"

// Path assignment for API endpoint
@path apiBase = "https://api.example.com/v1"

// Using the path in a run directive
@run `curl {{apiBase}}/users`

// Complex data with URL
@data config = {
  "apiEndpoint": "{{apiBase}}/data",
  "webhookUrl": "https://webhook.site/unique-id"
}
```

## Open Questions

1. **Authentication**: Should we support basic auth or API tokens in URLs?
2. **Redirects**: Should we follow redirects? How many?
3. **Content Types**: Should we validate content types for different directives?
4. **Rate Limiting**: Should we implement rate limiting for URL requests?
5. **Proxy Support**: Should we support HTTP proxies?

These can be addressed in future iterations based on user needs.