---
id: modules-structure
title: Module Structure
brief: Standard module format with manifest and multiple files
category: modules
updated: 2026-01-13
qa_tier: 2
---

Modules are directories with an entry point, manifest, and optional supporting files.

<structure>
```
mymodule/
├── index.mld          # Entry point
├── module.yml         # Manifest (or .yaml, .json)
├── README.md          # Documentation
└── lib/               # Optional supporting files
```
</structure>

<manifest>
module.yml format:
```yaml
name: myapp
author: alice
type: app               # library | app | command | skill
about: "Description"
version: 1.0.0
license: CC0
entry: index.mld        # Optional, defaults to index.mld
```
</manifest>

<module_types>
| Type | Purpose | Local Path | Global Path |
|------|---------|------------|-------------|
| library | Importable code | llm/lib/{name}/ | ~/.mlld/lib/{name}/ |
| app | Runnable scripts | llm/run/{name}/ | ~/.mlld/run/{name}/ |
| command | Claude slash cmd | .claude/commands/{name}/ | ~/.claude/commands/{name}/ |
| skill | Claude skill | .claude/skills/{name}/ | ~/.claude/skills/{name}/ |
</module_types>

<scaffold_commands>
```bash
mlld module app myapp              # Create app in llm/run/myapp/
mlld module library utils          # Create library in llm/lib/utils/
mlld module command review         # Create command in .claude/commands/review/
mlld module skill helper           # Create skill in .claude/skills/helper/
mlld module app myapp --global     # Create in ~/.mlld/run/myapp/
```
</scaffold_commands>

<run_apps>
```bash
mlld run myapp                     # Runs llm/run/myapp/index.mld
mlld run                           # Lists available scripts including apps
```
Entry point detection order: index.mld, main.mld, index.mld.md, main.mld.md
</run_apps>

<install_global>
```bash
mlld install @author/my-app --global    # Install to ~/.mlld/run/my-app/
mlld install @author/my-lib -g          # Install to ~/.mlld/lib/my-lib/
```
</install_global>

<packed_format>
Packed modules are single-file bundles created by `mlld pack` (future feature).
Use packed format for gist publishing; standard module format otherwise.
</packed_format>
