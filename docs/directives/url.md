---
layout: docs.njk
title: "URL Support in Mlld"
---

# URL Support in Mlld

Mlld supports fetching content from remote URLs using the `@add` and `@import` directives. This allows you to incorporate external resources into your Mlld documents without needing to download them first.

## URL Functionality Overview

- **URL Embedding**: Embed content from remote URLs directly into your Mlld documents
- **URL Importing**: Import variables from remote Mlld files hosted on servers
- **Security Controls**: Configure security policies to restrict which URLs can be accessed
- **Caching**: Automatically cache URL responses for better performance
- **Error Handling**: Robust error handling for network issues and invalid URLs

## Using URLs in Mlld

URLs can be used directly in `@add` and `@path` directives:

```mlld
@add [https://example.com/content.md]
@path readme = "https://raw.githubusercontent.com/example/repo/main/README.md"
```

## URL Security and Caching

URLs in `@path` directives support TTL (Time-To-Live) and trust level options:

```mlld
@path (30m) trust verify api = "https://api.example.com/data.json"
@path (static) trust always cdn = "https://cdn.example.com/assets.zip"
```

See the [@path directive documentation](./path.md) for detailed information on URL caching and security options.

## Examples

### Basic URL Embedding

```mlld
@add [https://raw.githubusercontent.com/example/repo/main/README.md]
```

### URL with Section Extraction

```mlld
@add [https://raw.githubusercontent.com/example/repo/main/README.md # Getting Started]
```

### URL in Path Variables

```mlld
@path docs = "https://raw.githubusercontent.com/example/repo/main/docs.md"
@add [@docs]
```

### Cached URL Access

```mlld
# Cache for 1 hour
@path (1h) trust verify api = "https://api.example.com/data.json"
@add [@api]

# Always fetch fresh
@path (live) trust verify feed = "https://api.example.com/live-feed.json"
@add [@feed]
```

## Security Considerations

- Use `trust verify` (default) to only allow HTTPS URLs
- Use `trust always` only for trusted internal URLs
- Use `trust never` to explicitly block URL access
- TTL settings control how long content is cached
- HTTPS is strongly recommended for production use

## Caching

URL responses are automatically cached based on TTL settings:

```mlld
# Static content - cache indefinitely
@path (static) logo = "https://example.com/logo.png"

# Live content - always fetch fresh
@path (live) news = "https://example.com/latest-news.md"

# Time-based caching
@path (30m) api = "https://api.example.com/data.json"  # 30 minutes
@path (1h) docs = "https://docs.example.com/guide.md"  # 1 hour
@path (1d) archive = "https://example.com/archive.zip" # 1 day
```

Cache is stored in `.mlld/cache/` and managed via `mlld.lock.json`.