---
layout: docs.njk
title: "URL Support in Meld"
---

# URL Support in Meld

Meld supports fetching content from remote URLs using the `@add` and `@import` directives. This allows you to incorporate external resources into your Meld documents without needing to download them first.

## URL Functionality Overview

- **URL Embedding**: Embed content from remote URLs directly into your Meld documents
- **URL Importing**: Import variables from remote Meld files hosted on servers
- **Security Controls**: Configure security policies to restrict which URLs can be accessed
- **Caching**: Automatically cache URL responses for better performance
- **Error Handling**: Robust error handling for network issues and invalid URLs

## Enabling URL Support

URL support is disabled by default and must be explicitly enabled using the `allowURLs=true` parameter:

```
@add(url="https://example.com/content.md", allowURLs=true)
@import(url="https://example.com/variables.mld", allowURLs=true)
```

## URL Parameters

Both `@add` and `@import` directives support the following URL-specific parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | The URL to fetch content from |
| `allowURLs` | boolean | Must be set to `true` to enable URL functionality |
| `urlOptions` | object | Configuration options for URL validation and fetching |

### URL Options

The `urlOptions` parameter accepts an object with the following properties:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `allowedProtocols` | string[] | `["http", "https"]` | List of allowed protocols |
| `allowedDomains` | string[] | `[]` (all domains allowed) | Domain allowlist |
| `blockedDomains` | string[] | `[]` | Domain blocklist (overrides allowlist) |
| `maxResponseSize` | number | `5242880` (5MB) | Maximum response size in bytes |
| `timeout` | number | `30000` (30s) | Request timeout in milliseconds |

## Examples

### Basic URL Embedding

```
@add(url="https://raw.githubusercontent.com/example/repo/main/README.md", allowURLs=true)
```

### URL Embedding with Security Options

```
@add(
  url="https://raw.githubusercontent.com/example/repo/main/README.md", 
  allowURLs=true, 
  urlOptions={
    allowedProtocols: ["https"],
    allowedDomains: ["raw.githubusercontent.com"],
    maxResponseSize: 1048576,  // 1MB
    timeout: 10000  // 10 seconds
  }
)
```

### Embedding a Specific Section from a URL

```
@add(
  url="https://raw.githubusercontent.com/example/repo/main/README.md", 
  allowURLs=true, 
  section="Getting Started"
)
```

### Importing Variables from a URL

```
@import(url="https://example.com/variables.mld", allowURLs=true)
```

### Using Path Parameter with URLs

For backward compatibility, you can also use the `path` parameter with URLs:

```
@add(path="https://example.com/content.md", allowURLs=true)
```

## Security Considerations

- URLs are only fetched when explicitly enabled with `allowURLs=true`
- Use `allowedDomains` to restrict which domains can be accessed
- Use `blockedDomains` to block specific domains
- Set appropriate `maxResponseSize` to prevent loading overly large files
- Configure `timeout` to prevent hanging on slow responses
- Only HTTPS is recommended for production use

## Caching

URL responses are automatically cached to improve performance and reduce network traffic. The cache uses an LRU (Least Recently Used) strategy with a default capacity of 100 entries.

To bypass the cache for a specific request, use:

```
@add(
  url="https://example.com/content.md", 
  allowURLs=true, 
  urlOptions={
    bypassCache: true
  }
)
```