---
title: Test Document
author: John Doe
date: 2024-01-15
tags:
- test
- mlld
- frontmatter
settings:
  debug: true
  version: 1.0.0
---

# Frontmatter Test

This document has frontmatter that can be accessed.

/show [[Title: {{fm.title}}]]
/show [[Author: {{fm.author}}]]
/show [[Date: {{fm.date}}]]

Tags:
/show [[{{fm.tags[0]}}]]
/show [[{{fm.tags[1]}}]]
/show [[{{fm.tags[2]}}]]

Settings:
/show [[Debug: {{fm.settings.debug}}]]
/show [[Version: {{fm.settings.version}}]]