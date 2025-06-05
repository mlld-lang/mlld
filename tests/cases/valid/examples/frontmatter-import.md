---
title: Main Document
version: 2.0.0
---

# Frontmatter Import Example

This document has its own frontmatter:
- Title: {{fm.title}}
- Version: {{fm.version}}

## Importing Another File's Frontmatter

@import { fm as importedFm } from "frontmatter-basic.mld"

The imported document has:
- Title: {{importedFm.title}}
- Version: {{importedFm.version}}

Note how each file's frontmatter is isolated!