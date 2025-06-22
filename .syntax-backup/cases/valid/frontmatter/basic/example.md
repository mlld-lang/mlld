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

@add [[Title: {{fm.title}}]]
@add [[Author: {{fm.author}}]]
@add [[Date: {{fm.date}}]]

Tags:
@add [[{{fm.tags[0]}}]]
@add [[{{fm.tags[1]}}]]
@add [[{{fm.tags[2]}}]]

Settings:
@add [[Debug: {{fm.settings.debug}}]]
@add [[Version: {{fm.settings.version}}]]