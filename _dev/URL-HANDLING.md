# URL Handling in Meld

## Overview

Meld supports using URLs in place of filesystem paths in directives such as `import`, `embed`, and `path`. This allows fetching content from remote sources and incorporating it into Meld documents.

## Features

- **URL Validation**: URLs are validated for security and format
- **Caching**: URLs are cached to improve performance
- **Security Controls**: Security controls including:
  - Domain allowlists and blocklists
  - Protocol restrictions (default: http and https only)
  - Response size limits
  - Request timeouts

## Usage

To use a URL instead of a path, simply specify the URL in a directive and enable URL support:

```meld
// Import content from a URL
{%import url="https://example.com/data.json" allowURLs=true %}

// Embed content from a URL
{%embed url="https://example.com/example.md" allowURLs=true %}

// Reference a URL in a path directive
{%path myPath="https://example.com/api/data" allowURLs=true %}
```

The `allowURLs` option must be explicitly set to `true` to enable URL support.

## Security Considerations

By default, URLs have the following security restrictions:

1. Only `http:` and `https:` protocols are allowed
2. Maximum response size is 5MB
3. Request timeout is 30 seconds
4. All domains are allowed unless explicitly blocked

## Configuration Options

URL behavior can be customized using the `urlOptions` parameter:

```meld
{%import url="https://example.com/data.json" 
    allowURLs=true 
    urlOptions={
      allowedProtocols: ["https"],
      allowedDomains: ["example.com", "api.example.com"],
      blockedDomains: ["malicious-site.com"],
      maxResponseSize: 1048576,  // 1MB
      timeout: 5000  // 5 seconds
    } 
%}
```

### Available Options

| Option | Description | Default |
|--------|-------------|---------|
| `allowedProtocols` | Array of allowed protocols | `["http", "https"]` |
| `allowedDomains` | Array of allowed domains (if empty, all domains allowed unless blocklisted) | `[]` |
| `blockedDomains` | Array of blocked domains (overrides allowlist) | `[]` |
| `maxResponseSize` | Maximum response size in bytes | 5MB (5242880 bytes) |
| `timeout` | Request timeout in milliseconds | 30000 (30 seconds) |

## Architecture

URL handling is implemented in the `PathService` class and integrated into the path validation pipeline:

- `isURL(path)`: Detects if a path is a URL
- `validateURL(url, options)`: Validates URLs against security policy
- `fetchURL(url, options)`: Fetches URL content with caching

These methods are used internally by the path validation pipeline when `allowURLs=true` is specified.

### Integration with Directive Handlers

The directive handlers use the URL functionality through the `PathService`:

1. **Detection**: Handlers detect URLs via `isURL()` or explicit `url` parameter
2. **Validation**: URLs are validated with security options
3. **Fetching**: Content is fetched through `fetchURL()`
4. **Processing**: Content is processed similarly to file content

## Error Handling

URL-related errors are specialized types:

- `URLValidationError`: Invalid URL format
- `URLSecurityError`: URL blocked by security policy
- `URLFetchError`: Error fetching URL content

These errors are typically wrapped in a `PathValidationError` to maintain consistent error handling throughout the application.

## Implementation Details

URL handling is implemented directly in `PathService` rather than as a separate service to:

1. Avoid circular dependencies
2. Maintain consistent path handling
3. Keep caching self-contained
4. Simplify validation pipeline

The implementation uses the native `fetch` API for HTTP requests and includes an in-memory LRU cache to improve performance.