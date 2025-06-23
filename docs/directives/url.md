---
layout: docs.njk
title: "URL Support in mlld"
---

# URL Support in mlld

mlld supports fetching content from remote URLs using the `/add` and `/import` directives. This allows you to incorporate external resources into your mlld documents without needing to download them first.

## URL Functionality Overview

- **URL Embedding**: Embed content from remote URLs directly into your mlld documents
- **URL Importing**: Import variables from remote mlld files hosted on servers

## Using URLs in mlld

URLs can be used directly in `/add` and `/path` directives:

```mlld
/add [https://example.com/content.md]
/path @readme = "https://raw.githubusercontent.com/example/repo/main/README.md"
```
## Examples

### Basic URL Embedding

```mlld
/add [https://raw.githubusercontent.com/example/repo/main/README.md]
```

### URL in Path Variables

```mlld
/path @docs = "https://raw.githubusercontent.com/example/repo/main/docs.md"
/add [@docs]
```

