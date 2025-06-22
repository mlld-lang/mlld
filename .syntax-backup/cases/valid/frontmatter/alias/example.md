---
project: mlld-grammar
description: A grammar system for dynamic content
metadata:
  created: 2024-01-01
  updated: 2024-01-15
  status: active
---

# Frontmatter Alias Test

Testing the @frontmatter.* alias for frontmatter access.

@add [[Project: {{frontmatter.project}}]]
@add [[Description: {{frontmatter.description}}]]

Metadata:
@add [[Created: {{frontmatter.metadata.created}}]]
@add [[Updated: {{frontmatter.metadata.updated}}]]
@add [[Status: {{frontmatter.metadata.status}}]]