---
id: config-files
title: Config Files
brief: Project configuration and lock files
category: configuration
parent: configuration
tags: [configuration, files, settings]
related: [config-env-vars, modules-registry]
related-code: [core/config/Config.ts, core/config/LockFile.ts]
updated: 2026-01-05
---

mlld uses dual configuration:
- `mlld-config.json` - Your project settings (edit manually)
- `mlld-lock.json` - Auto-generated locks (don't edit)
