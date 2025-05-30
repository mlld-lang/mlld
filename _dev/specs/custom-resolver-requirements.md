# Custom Public Resolver Requirements

Version: 1.0  
Last Updated: 2025-05-30

## Overview

This document specifies the requirements for URL sources to be compatible with mlld's public registry system. Any service that meets these requirements can be used as a module source.

## Core Requirements

### 1. Public Accessibility
- URL must be accessible without authentication
- HTTPS strongly recommended (HTTP allowed with warning)
- No CORS restrictions for browser-based tools

### 2. Raw Content Delivery
- Must return plain text content
- Content-Type should be `text/plain` or `text/x-mlld`
- No HTML wrapping or formatting
- UTF-8 encoding required

### 3. Stable URLs with Version Identifier
- URL must include commit hash or version identifier
- Same URL must always return same content
- Version component must be extractable from URL

### 4. Content Addressing Compatible
- Content must be deterministic (no timestamps in output)
- Same source version = same SHA-256 hash
- No dynamic content that changes hash

## URL Patterns

### Required URL Structure
```
https://domain.com/path/VERSION_ID/file.mld
                       ^^^^^^^^^^^
                       Stable version identifier
```

### Examples
```
# GitHub
https://github.com/user/repo/blob/abc123def/path/to/file.mld

# GitLab  
https://gitlab.com/user/repo/-/blob/abc123def/path/to/file.mld

# Bitbucket
https://bitbucket.org/user/repo/src/abc123def/path/to/file.mld
```

## Built-in Support

mlld includes transformers for these platforms:

### GitHub
- **Pattern**: `github.com/USER/REPO/blob/COMMIT/PATH`
- **Raw URL**: `raw.githubusercontent.com/USER/REPO/COMMIT/PATH`
- **Gists**: `gist.github.com/USER/GIST_ID`

### GitLab
- **Pattern**: `gitlab.com/USER/REPO/-/blob/COMMIT/PATH`
- **Raw URL**: `gitlab.com/USER/REPO/-/raw/COMMIT/PATH`
- **Self-hosted**: Same pattern with custom domain

### Bitbucket
- **Pattern**: `bitbucket.org/USER/REPO/src/COMMIT/PATH`
- **Raw URL**: `bitbucket.org/USER/REPO/raw/COMMIT/PATH`

### Codeberg
- **Pattern**: `codeberg.org/USER/REPO/src/commit/COMMIT/PATH`
- **Raw URL**: `codeberg.org/USER/REPO/raw/commit/COMMIT/PATH`

### Gitea (Self-hosted)
- **Pattern**: `gitea.domain/USER/REPO/src/commit/COMMIT/PATH`
- **Raw URL**: `gitea.domain/USER/REPO/raw/commit/COMMIT/PATH`

## Custom Platform Integration

To add support for a new platform:

### 1. URL Transformer
```typescript
export class MyPlatformTransformer {
  static canTransform(url: string): boolean {
    return url.includes('myplatform.com');
  }
  
  static transformToRaw(url: string): string {
    // Convert viewing URL to raw content URL
    return url.replace('/view/', '/raw/');
  }
  
  static extractVersion(url: string): string {
    // Extract version/commit from URL
    const match = url.match(/\/v\/([a-f0-9]+)\//);
    return match ? match[1] : 'unknown';
  }
}
```

### 2. DNS Registry Entry
```
alice-utils.public.mlld.ai. IN TXT "v=mlld1;url=https://myplatform.com/alice/modules/v/abc123/utils.mld"
```

### 3. Validation
Your platform must:
- Return same content for same version URL
- Include version in URL structure
- Provide raw content endpoint
- Support HTTPS

## Testing Compatibility

### Manual Test
```bash
# 1. Fetch content
curl -sL https://platform.com/path/version/file.mld > test1.mld

# 2. Verify plain text
file test1.mld  # Should show "ASCII text" or "UTF-8 text"

# 3. Fetch again and compare
curl -sL https://platform.com/path/version/file.mld > test2.mld
diff test1.mld test2.mld  # Should be identical

# 4. Check headers
curl -I https://platform.com/path/version/file.mld
# Look for Content-Type: text/plain
```

### Automated Test
```typescript
async function testResolver(url: string): Promise<boolean> {
  // Fetch content
  const response1 = await fetch(url);
  const content1 = await response1.text();
  
  // Verify text content
  if (!response1.headers.get('content-type')?.includes('text')) {
    console.error('Not text content');
    return false;
  }
  
  // Verify deterministic
  const response2 = await fetch(url);
  const content2 = await response2.text();
  
  if (content1 !== content2) {
    console.error('Content not deterministic');
    return false;
  }
  
  // Verify version in URL
  if (!url.match(/[a-f0-9]{6,}/)) {
    console.warn('No version identifier found');
  }
  
  return true;
}
```

## Platform-Specific Notes

### GitHub
- Rate limits: 60/hour unauthenticated
- Gists have no directory structure
- Private repos require auth (future)

### GitLab
- Rate limits vary by instance
- Supports subgroups in paths
- Self-hosted instances supported

### Bitbucket
- Different URL structure for Mercurial
- API more restrictive than raw access

### Generic Git Hosting
- Most Git platforms follow similar patterns
- Look for "raw" or "plain" view options
- Commit hash usually in URL

## Adding Your Platform

1. **Submit transformer**: PR to mlld-lang/mlld
2. **Document patterns**: URL structure and raw endpoint
3. **Provide examples**: Working module URLs
4. **Test suite**: Automated tests for your transformer

## Future Considerations

- **Authentication**: OAuth/token support planned
- **Version aliases**: Tags, branches as versions
- **Caching hints**: Platform-specific cache headers
- **Binary content**: WASM modules, etc.

## FAQ

### Q: Can I use a CDN?
A: Yes, if URLs include version and content is immutable

### Q: What about pastebin services?
A: Yes, if they provide stable URLs with versions

### Q: Can I use IPFS?
A: Yes! IPFS URLs are content-addressed by design

### Q: What about S3/cloud storage?
A: Yes, with versioned objects or path-based versions