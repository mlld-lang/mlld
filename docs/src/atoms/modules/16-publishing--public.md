---
id: publishing-public
qa_tier: 2
title: Publishing Public Modules
brief: Publish to the mlld registry via PR or direct publish
category: modules
parent: publishing
tags: [modules, publishing, registry, auth]
related: [registry, versioning, ownership-permissions]
related-code: [cli/commands/publish.ts, cli/commands/auth.ts]
updated: 2026-02-25
---

## Prerequisites

1. **GitHub account** - You'll authenticate via GitHub
2. **mlld CLI** - Install via `npm install -g mlld`
3. **Module file** - Your `.mld`/`.mld.md` file with frontmatter and `needs`

## Required Metadata

```yaml
---
name: my-tool              # or use title: My Tool (name falls back from title)
author: yourname
version: 1.0.0
about: Brief description   # description: ... also supported
tags: [utils, strings]     # optional (keywords also supported)
license: CC0
---
```

Required: module name/title, author, version, and about/description. License must be CC0.
`mlld publish` now reads these frontmatter fields as metadata defaults, and CLI metadata flags override them when provided.

## Authentication

```bash
mlld auth login     # Opens GitHub OAuth flow
mlld auth status    # Check auth status
mlld auth logout    # Logout
```

Grants `gist` scope (create Gists for module source) and `public_repo` scope (create PRs to registry).

## First-Time Module (PR Workflow)

```bash
mlld publish my-tool.mld.md
```

1. **Validation** - Checks syntax, exports, metadata
2. **Source Creation** - Creates Gist or references repo
3. **PR Creation** - Opens PR to mlld-lang/registry
4. **Automated Review** - LLM reviews for no hardcoded secrets, safe operations, real utility, proper licensing
5. **Manual Review** (if needed) - Maintainer approval
6. **Merge** - Module becomes available
7. **Publish Rights** - You can update directly going forward

## Module Updates (Direct Publish)

After first module is merged:

```bash
mlld publish my-tool.mld.md
```

1. **Version Bump** - Prompts for patch/minor/major
2. **Validation** - Same checks as first-time
3. **Direct Publish** - No PR needed (if authenticated)
4. **Registry Update** - New version available immediately

Force PR workflow: `mlld publish --pr my-tool.mld.md`

## Module Source

**GitHub Repository** — If your module is in a git repo, `mlld publish` detects the repository URL, current commit SHA, module file path, and whether repo is clean. Source references the commit SHA, ensuring immutability.

**Gist** — If not in a repo, creates a GitHub Gist automatically with module content, versioned via Gist revisions.

## Validation

Your module must pass validation before publishing:

- **Syntax** - No syntax errors, no reserved word conflicts, valid directives
- **Exports** - `export` directive present, exported names exist, no duplicates
- **Imports** - Valid module references, no circular dependencies
- **Metadata** - All required fields present, author matches GitHub username, license is CC0, version follows semver

## Automated Review

LLM reviews check for no secrets, safe operations, real utility, proper licensing, accurate metadata. Review posts as PR comment with APPROVE, REQUEST_CHANGES, or COMMENT.

Push new commits to trigger re-review. Trusted authors in allowlist skip LLM review and auto-merge if CI passes.

## Direct Publish via API

```bash
mlld publish my-tool.mld.md                    # Via CLI (recommended)

curl -X POST https://registry-api.mlld.org/api/publish \
  -H "Authorization: Bearer $TOKEN" \
  -F "module=@my-tool.mld.md"                  # Via API directly
```

## Commands

```bash
mlld publish my-tool.mld.md                    # Publish to registry
mlld publish --pr my-tool.mld.md               # Force PR workflow
mlld publish --tag beta my-tool.mld.md         # Publish with tag
mlld publish --dry-run my-tool.mld.md          # Validate without publishing
mlld publish my-tool.mld.md --title "My Tool" --tags utils,strings
```
