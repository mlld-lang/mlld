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

/show ::Project: {{frontmatter.project}}::
/show ::Description: {{frontmatter.description}}::

Metadata:
/show ::Created: {{frontmatter.metadata.created}}::
/show ::Updated: {{frontmatter.metadata.updated}}::
/show ::Status: {{frontmatter.metadata.status}}::